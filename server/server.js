const express = require('express');
const { WebSocketServer } = require('ws');
const http = require('http');

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

// Guarda os agentes conectados: { nome: { ws, ip, conectadoEm } }
const agentes = {};

wss.on('connection', (ws) => {
  let nomeAgente = null;

  // Manda a lista atual assim que alguém conecta (navegador ou agente)
  const listaAtual = Object.entries(agentes).map(([nome, info]) => ({
    nome,
    ip: info.ip
  }));
  ws.send(JSON.stringify({ tipo: 'lista', agentes: listaAtual }));

  ws.on('message', (msg) => {
    try {
      const data = JSON.parse(msg);

      if (data.tipo === 'anuncio') {
        nomeAgente = data.nome;
        agentes[nomeAgente] = {
          ws,
          ip: data.ip,
          conectadoEm: new Date()
        };
        console.log(`[+] ${nomeAgente} online (${data.ip})`);
        broadcastLista();
      }
    } catch (e) {
      console.error('Mensagem inválida:', e);
    }
  });

  ws.on('close', () => {
    if (nomeAgente && agentes[nomeAgente]) {
      delete agentes[nomeAgente];
      console.log(`[-] ${nomeAgente} offline`);
      broadcastLista();
    }
  });
});

function broadcastLista() {
  const lista = Object.entries(agentes).map(([nome, info]) => ({
    nome,
    ip: info.ip
  }));

  const msg = JSON.stringify({ tipo: 'lista', agentes: lista });

  // Manda a lista atualizada pra todo mundo conectado (agentes e viewers)
  wss.clients.forEach((client) => {
    if (client.readyState === 1) client.send(msg);
  });
}

app.use(express.static('public'));

const PORTA = 3000;
server.listen(PORTA, () => {
  console.log(`EnchantDesk server rodando na porta ${PORTA}`);
});
