const express = require('express');
const { WebSocketServer } = require('ws');
const http = require('http');

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

const agentes = {};
const assistindo = {};

wss.on('connection', (ws) => {
  let nomeAgente = null;
  let assistindoAgente = null;

  enviarListaPara(ws);

  ws.on('message', (msg, isBinary) => {
    if (isBinary && nomeAgente) {
      const viewers = assistindo[nomeAgente];
      if (viewers) {
        viewers.forEach((viewerWs) => {
          if (viewerWs.readyState === 1) viewerWs.send(msg, { binary: true });
        });
      }
      return;
    }

    let data;
    try {
      data = JSON.parse(msg);
    } catch (e) {
      console.error('Mensagem inválida:', e);
      return;
    }

    if (data.tipo === 'anuncio') {
      nomeAgente = data.nome;
      agentes[nomeAgente] = { ws, ip: data.ip };
      console.log(`[+] ${nomeAgente} online (${data.ip})`);
      broadcastLista();
    }

    if (data.tipo === 'conectar') {
      const agente = agentes[data.agente];
      if (!agente) return;

      assistindoAgente = data.agente;
      if (!assistindo[data.agente]) assistindo[data.agente] = new Set();
      assistindo[data.agente].add(ws);

      if (assistindo[data.agente].size === 1) {
        agente.ws.send(JSON.stringify({ tipo: 'iniciar_stream' }));
      }
      console.log(`[👁] Viewer conectou em ${data.agente}`);
    }

    if (data.tipo === 'desconectar') {
      pararDeAssistir(data.agente, ws);
    }

    if (data.tipo === 'input' && assistindoAgente) {
      const agente = agentes[assistindoAgente];
      if (agente) agente.ws.send(JSON.stringify(data));
    }
  });

  ws.on('close', () => {
    if (nomeAgente && agentes[nomeAgente]) {
      delete agentes[nomeAgente];
      console.log(`[-] ${nomeAgente} offline`);
      broadcastLista();
    }
    if (assistindoAgente) {
      pararDeAssistir(assistindoAgente, ws);
    }
  });
});

function pararDeAssistir(nomeAgente, viewerWs) {
  const viewers = assistindo[nomeAgente];
  if (!viewers) return;
  viewers.delete(viewerWs);

  if (viewers.size === 0) {
    delete assistindo[nomeAgente];
    const agente = agentes[nomeAgente];
    if (agente) agente.ws.send(JSON.stringify({ tipo: 'parar_stream' }));
    console.log(`[👁] Ninguém mais assistindo ${nomeAgente}, parando captura`);
  }
}

function listaAtual() {
  return Object.entries(agentes).map(([nome, info]) => ({ nome, ip: info.ip }));
}

function enviarListaPara(ws) {
  ws.send(JSON.stringify({ tipo: 'lista', agentes: listaAtual() }));
}

function broadcastLista() {
  const msg = JSON.stringify({ tipo: 'lista', agentes: listaAtual() });
  wss.clients.forEach((client) => {
    if (client.readyState === 1) client.send(msg);
  });
}

app.use(express.static('public'));

const PORTA = 3000;
server.listen(PORTA, () => {
  console.log(`EnchantDesk server rodando na porta ${PORTA}`);
});
