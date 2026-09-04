const WebSocket = require('ws');
const os = require('os');
const screenshot = require('screenshot-desktop');

// CONFIGURAÇÃO — troque pelo IP do servidor Linux
const SERVIDOR = 'ws://10.0.0.52:3000';
const NOME_DESTE_PC = 'Recepção'; // troque pelo nome de cada PC

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

  intervalId = setInterval(async () => {
    try {
      const img = await screenshot({ format: 'jpg' });
      ws.send(JSON.stringify({
        tipo: 'frame',
        dados: img.toString('base64')
      }));
    } catch (e) {
      console.error('Erro ao capturar tela:', e.message);
    }
  }, 100); // ~10 fps
}

function pararCaptura() {
  if (!capturando) return;
  capturando = false;
  clearInterval(intervalId);
  console.log('Captura de tela parada.');
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
