const WebSocket = require('ws');
const os = require('os');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const robot = require('robotjs');
const sharp = require('sharp');

const SERVIDOR = 'ws://10.0.0.52:3000';

const PASTA_CONFIG = path.join(os.homedir(), '.enchantdesk');
const ARQUIVO_ID = path.join(PASTA_CONFIG, 'id.txt');
const ARQUIVO_HTML = path.join(PASTA_CONFIG, 'janela.html');

function obterOuCriarId() {
  if (!fs.existsSync(PASTA_CONFIG)) {
    fs.mkdirSync(PASTA_CONFIG, { recursive: true });
  }
  if (fs.existsSync(ARQUIVO_ID)) {
    return fs.readFileSync(ARQUIVO_ID, 'utf-8').trim();
  }
  const novoId = String(Math.floor(100000000 + Math.random() * 900000000));
  fs.writeFileSync(ARQUIVO_ID, novoId);
  return novoId;
}

const MEU_ID = obterOuCriarId();
const idFormatado = MEU_ID.match(/.{1,3}/g).join(' ');

function gerarEAbrirJanela() {
  const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<title>EnchantDesk</title>
<style>
  body {
    margin: 0;
    height: 100vh;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    background: #0D1712;
    font-family: -apple-system, sans-serif;
    color: #EDE8DA;
  }
  .marca {
    font-family: Georgia, serif;
    font-style: italic;
    font-size: 22px;
    color: #E8B657;
    margin-bottom: 30px;
  }
  .rotulo {
    font-size: 13px;
    color: #8FA396;
    margin-bottom: 8px;
  }
  .id {
    font-family: 'Courier New', monospace;
    font-size: 32px;
    letter-spacing: 3px;
    color: #EDE8DA;
    background: #152420;
    border: 1px solid #24382F;
    padding: 14px 24px;
    border-radius: 8px;
  }
  .status {
    margin-top: 24px;
    font-size: 12px;
    color: #5FBFA0;
  }
</style>
</head>
<body>
  <div class="marca">EnchantDesk</div>
  <div class="rotulo">Este é o ID desta máquina</div>
  <div class="id">${idFormatado}</div>
  <div class="status">● Aguardando conexão</div>
</body>
</html>`;

  fs.writeFileSync(ARQUIVO_HTML, html);

  const caminhoFileUrl = 'file:///' + ARQUIVO_HTML.replace(/\\/g, '/');
  const comando = `start msedge --app="${caminhoFileUrl}" --window-size=380,320`;

  exec(comando, (erro) => {
    if (erro) {
      console.log('Não foi possível abrir a janela automática. Seu ID é: ' + idFormatado);
    }
  });
}

let capturando = false;
let intervalId = null;
let capturaEmAndamento = false;

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
    console.log('Conectado ao servidor EnchantDesk. Seu ID: ' + idFormatado);
    ws.send(JSON.stringify({
      tipo: 'anuncio',
      id: MEU_ID
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

gerarEAbrirJanela();
conectar();
