const WebSocket = require('ws');
const os = require('os');
const robot = require('robotjs');
const sharp = require('sharp');

const SERVIDOR = 'ws://10.0.0.52:3000';
const NOME_DESTE_PC = 'Recepção';

let capturando = false;
let intervalId = null;
let capturaEmAndamento = false;

function pegarIP() {
  const interfaces = os.networkInterfaces();
  for (const nome in interfaces) {
    for (const iface of interfaces[nome]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        return iface.address;
      }
    }
  }
  return '0.0.0.0';
}

function converterBGRAparaRGBA(buffer) {
  const out = Buffer.from(buffer);
  for (let i = 0; i < out.length; i += 4) {
    const b = out[i];
    const r = out[i + 2];
    out[i] = r;
    out[i + 2] = b;
  }
  return out;
}

function montarPacoteFrame(largura, altura, jpegBuffer) {
  const header = Buffer.alloc(5);
  header.writeUInt8(1, 0);
  header.writeUInt16BE(largura, 1);
  header.writeUInt16BE(altura, 3);
  return Buffer.concat([header, jpegBuffer]);
}

function iniciarCaptura(ws) {
  if (capturando) return;
  capturando = true;
  console.log('Iniciando captura de tela...');

  intervalId = setInterval(async () => {
    if (capturaEmAndamento) return;
    capturaEmAndamento = true;
    const inicio = Date.now();
    try {
      const bitmap = robot.screen.capture();
      const raw = converterBGRAparaRGBA(bitmap.image);

      const jpegBuffer = await sharp(raw, {
        raw: { width: bitmap.width, height: bitmap.height, channels: 4 }
      })
        .jpeg({ quality: 70 })
        .toBuffer();

      const pacote = montarPacoteFrame(bitmap.width, bitmap.height, jpegBuffer);
      ws.send(pacote, { binary: true });

      console.log(`Frame processado em ${Date.now() - inicio}ms (${bitmap.width}x${bitmap.height}, ${jpegBuffer.length} bytes)`);
    } catch (e) {
      console.error('Erro ao capturar tela:', e.message);
    } finally {
      capturaEmAndamento = false;
    }
  }, 40);
}

function pararCaptura() {
  if (!capturando) return;
  capturando = false;
  clearInterval(intervalId);
  console.log('Captura de tela parada.');
}

const TECLAS_ESPECIAIS = {
  'Enter': 'enter',
  'Backspace': 'backspace',
  'Delete': 'delete',
  'Tab': 'tab',
  'Escape': 'escape',
  'ArrowUp': 'up',
  'ArrowDown': 'down',
  'ArrowLeft': 'left',
  'ArrowRight': 'right',
  ' ': 'space'
};

const TECLAS_IGNORAR = ['Shift', 'Control', 'Alt', 'Meta', 'CapsLock'];

function processarInput(data) {
  try {
    if (data.acao === 'mousemove') {
      robot.moveMouse(data.x, data.y);
    } else if (data.acao === 'mousedown') {
      robot.moveMouse(data.x, data.y);
      robot.mouseToggle('down', data.botao || 'left');
    } else if (data.acao === 'mouseup') {
      robot.moveMouse(data.x, data.y);
      robot.mouseToggle('up', data.botao || 'left');
    } else if (data.acao === 'keydown') {
      const tecla = data.tecla;
      if (TECLAS_IGNORAR.includes(tecla)) return;
      if (TECLAS_ESPECIAIS[tecla]) {
        robot.keyTap(TECLAS_ESPECIAIS[tecla]);
      } else if (tecla.length === 1) {
        robot.typeString(tecla);
      }
    }
  } catch (e) {
    console.error('Erro ao processar input:', e.message);
  }
}

function conectar() {
  const ws = new WebSocket(SERVIDOR);

  ws.on('open', () => {
    console.log('Conectado ao servidor EnchantDesk');
    ws.send(JSON.stringify({
      tipo: 'anuncio',
      nome: NOME_DESTE_PC,
      ip: pegarIP()
    }));
  });

  ws.on('message', (msg, isBinary) => {
    if (isBinary) return;
    try {
      const data = JSON.parse(msg);
      if (data.tipo === 'iniciar_stream') {
        iniciarCaptura(ws);
      } else if (data.tipo === 'parar_stream') {
        pararCaptura();
      } else if (data.tipo === 'input') {
        processarInput(data);
      }
    } catch (e) {
      console.error('Mensagem inválida:', e);
    }
  });

  ws.on('close', () => {
    pararCaptura();
    console.log('Desconectado. Tentando reconectar em 5s...');
    setTimeout(conectar, 5000);
  });

  ws.on('error', (err) => {
    console.error('Erro de conexão:', err.message);
  });
}

conectar();
