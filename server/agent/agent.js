const WebSocket = require('ws');
const os = require('os');
const screenshot = require('screenshot-desktop');
const robot = require('robotjs');

const SERVIDOR = 'ws://10.0.0.52:3000';
const NOME_DESTE_PC = 'Recepção';

let capturando = false;
let intervalId = null;

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

function iniciarCaptura(ws) {
  if (capturando) return;
  capturando = true;
  console.log('Iniciando captura de tela...');

  const tela = robot.getScreenSize();

  intervalId = setInterval(async () => {
    try {
      const img = await screenshot({ format: 'jpg' });
      ws.send(JSON.stringify({
        tipo: 'frame',
        dados: img.toString('base64'),
        largura: tela.width,
        altura: tela.height
      }));
    } catch (e) {
      console.error('Erro ao capturar tela:', e.message);
    }
  }, 100);
}

function pararCaptura() {
  if (!capturando) return;
  capturando = false;
  clearInterval(intervalId);
  console.log('Captura de tela parada.');
}

// Só as teclas que realmente precisam de um "tap" especial.
// Qualquer outro caractere (letras, números, acentos, símbolos) é digitado
// diretamente via robot.typeString(), que lida certo com maiúsculas e acentos.
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

// Teclas modificadoras que não devem gerar nenhuma ação sozinhas
// (elas só importam combinadas, e o navegador já manda o caractere certo
// já com maiúscula/acento aplicado em e.key)
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

      if (TECLAS_IGNORAR.includes(tecla)) {
        return; // não faz nada, é só modificador sozinho
      }

      if (TECLAS_ESPECIAIS[tecla]) {
        robot.keyTap(TECLAS_ESPECIAIS[tecla]);
      } else if (tecla.length === 1) {
        // Caractere normal: letra (maiúscula/minúscula), número, acento, símbolo
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

  ws.on('message', (msg) => {
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
