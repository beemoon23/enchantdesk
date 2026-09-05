const express = require('express');
const { WebSocketServer } = require('ws');
const http = require('http');

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

const agentes = {};
const assistindo = {};
const pendentes = {};

const TIPOS_ENCAMINHAR_PARA_AGENTE = ['input', 'arquivo_inicio', 'arquivo_chunk', 'arquivo_fim'];

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

    if (data.tipo === 'permitir_stream' && idAgente) {
      const viewerPendente = pendentes[idAgente];
      if (viewerPendente) {
        if (!assistindo[idAgente]) assistindo[idAgente] = new Set();
        assistindo[idAgente].add(viewerPendente);
        delete pendentes[idAgente];
        console.log(`[👁] Conexão aceita em ${idAgente}`);
      }
    }

    if (data.tipo === 'negar_conexao' && idAgente) {
      const viewerPendente = pendentes[idAgente];
      if (viewerPendente && viewerPendente.readyState === 1) {
        viewerPendente.send(JSON.stringify({
          tipo: 'erro',
          mensagem: 'Conexão recusada pela pessoa na máquina remota.'
        }));
      }
      delete pendentes[idAgente];
      console.log(`[🚫] Conexão recusada em ${idAgente}`);
    }

    if (data.tipo === 'conectar') {
      const agente = agentes[data.id];
      if (!agente) {
        ws.send(JSON.stringify({ tipo: 'erro', mensagem: 'ID não encontrado ou máquina offline.' }));
        return;
      }

      assistindoId = data.id;

      const jaTemViewersAtivos = assistindo[data.id] && assistindo[data.id].size > 0;
      if (jaTemViewersAtivos) {
        assistindo[data.id].add(ws);
        return;
      }

      pendentes[data.id] = ws;
      agente.ws.send(JSON.stringify({ tipo: 'solicitar_conexao' }));
    }

    if (data.tipo === 'desconectar') {
      pararDeAssistir(data.id, ws);
    }

    if (TIPOS_ENCAMINHAR_PARA_AGENTE.includes(data.tipo) && assistindoId) {
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
