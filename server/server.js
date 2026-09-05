const express = require('express');
const { WebSocketServer } = require('ws');
const http = require('http');

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

const agentes = {}; // chave: id
const assistindo = {}; // chave: id do agente -> Set de viewers

wss.on('connection', (ws) => {
  let idAgente = null;
  let assistindoId = null;

  ws.on('message', (msg, isBinary) => {
    if (isBinary && idAgente) {
      const viewers = assistindo[idAgente];
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
      idAgente = data.id;
      agentes[idAgente] = { ws };
      console.log(`[+] ${idAgente} online`);
    }

    if (data.tipo === 'conectar') {
      const agente = agentes[data.id];
      if (!agente) {
        ws.send(JSON.stringify({ tipo: 'erro', mensagem: 'ID não encontrado ou máquina offline.' }));
        return;
      }

      assistindoId = data.id;
      if (!assistindo[data.id]) assistindo[data.id] = new Set();
      assistindo[data.id].add(ws);

      if (assistindo[data.id].size === 1) {
        agente.ws.send(JSON.stringify({ tipo: 'iniciar_stream' }));
      }
      console.log(`[👁] Viewer conectou em ${data.id}`);
    }

    if (data.tipo === 'desconectar') {
      pararDeAssistir(data.id, ws);
    }

    if (data.tipo === 'input' && assistindoId) {
      const agente = agentes[assistindoId];
      if (agente) agente.ws.send(JSON.stringify(data));
    }
  });

  ws.on('close', () => {
    if (idAgente && agentes[idAgente]) {
      delete agentes[idAgente];
      console.log(`[-] ${idAgente} offline`);
    }
    if (assistindoId) {
      pararDeAssistir(assistindoId, ws);
    }
  });
});

function pararDeAssistir(id, viewerWs) {
  const viewers = assistindo[id];
  if (!viewers) return;
  viewers.delete(viewerWs);

  if (viewers.size === 0) {
    delete assistindo[id];
    const agente = agentes[id];
    if (agente) agente.ws.send(JSON.stringify({ tipo: 'parar_stream' }));
    console.log(`[👁] Ninguém mais assistindo ${id}, parando captura`);
  }
}

app.use(express.static('public'));

const PORTA = 3000;
server.listen(PORTA, () => {
  console.log(`EnchantDesk server rodando na porta ${PORTA}`);
});
