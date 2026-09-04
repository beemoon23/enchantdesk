const WebSocket = require('ws');
const os = require('os');

// CONFIGURAÇÃO — troque pelo IP do servidor Linux
const SERVIDOR = 'ws://10.0.0.52:3000';
const NOME_DESTE_PC = 'Recepção'; // troque pelo nome de cada PC

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

  ws.on('close', () => {
    console.log('Desconectado. Tentando reconectar em 5s...');
    setTimeout(conectar, 5000);
  });

  ws.on('error', (err) => {
    console.error('Erro de conexão:', err.message);
  });
}

conectar();
