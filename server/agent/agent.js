const WebSocket = require('ws');
const os = require('os');
const fs = require('fs');
const path = require('path');
const http = require('http');
const { exec } = require('child_process');
const robot = require('robotjs');
const sharp = require('sharp');

const SERVIDOR = 'ws://10.0.0.52:3000';
const PORTA_LOCAL = 5757;

const PASTA_CONFIG = path.join(os.homedir(), '.enchantdesk');
const ARQUIVO_ID = path.join(PASTA_CONFIG, 'id.txt');
const ARQUIVO_HTML = path.join(PASTA_CONFIG, 'janela.html');
const PASTA_RECEBIDOS = path.join(os.homedir(), 'Desktop', 'EnchantDesk-Recebidos');

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

let estadoAtual = 'aguardando';
let resolverPendencia = null;
let ultimoArquivoRecebido = null; // { nome, ts }

function criarServidorLocal() {
  const servidor = http.createServer((req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
      res.statusCode = 204;
      res.end();
      return;
    }

    if (req.method === 'GET' && req.url === '/status') {
      res.setHeader('Content-Type', 'application/json');
      const arquivoRecente = ultimoArquivoRecebido && (Date.now() - ultimoArquivoRecebido.ts < 6000)
        ? ultimoArquivoRecebido.nome
        : null;
      res.end(JSON.stringify({ estado: estadoAtual, id: idFormatado, arquivoRecebido: arquivoRecente }));
      return;
    }

    if (req.method === 'POST' && req.url === '/responder') {
      let corpo = '';
      req.on('data', (chunk) => (corpo += chunk));
      req.on('end', () => {
        try {
          const { aceitar } = JSON.parse(corpo);
          if (resolverPendencia) {
            resolverPendencia(aceitar);
            resolverPendencia = null;
          }
        } catch (e) {}
        res.end('ok');
      });
      return;
    }

    res.statusCode = 404;
    res.end();
  });
  servidor.listen(PORTA_LOCAL, '127.0.0.1');
}

function gerarEAbrirJanela() {
  const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<title>EnchantDesk</title>
<style>
  * { box-sizing: border-box; }
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
    font-size: 13px;
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .bolinha {
    width: 8px;
    height: 8px;
    border-radius: 50%;
  }
  .pedido, .arquivo {
    margin-top: 20px;
    display: none;
    flex-direction: column;
    align-items: center;
    gap: 12px;
    padding: 16px 20px;
    border-radius: 8px;
  }
  .pedido {
    background: #152420;
    border: 1px solid #E8B657;
  }
  .arquivo {
    background: #152420;
    border: 1px solid #5FBFA0;
    font-size: 13px;
  }
  .pedido.visivel, .arquivo.visivel { display: flex; }
  .pedido p { margin: 0; font-size: 14px; text-align: center; }
  .botoes { display: flex; gap: 10px; }
  button {
    font-family: inherit;
    border: none;
    padding: 8px 20px;
    border-radius: 6px;
    cursor: pointer;
    font-size: 13px;
    font-weight: 600;
  }
  .aceitar { background: #5FBFA0; color: #0D1712; }
  .recusar { background: transparent; color: #C97B63; border: 1px solid #C97B63; }
</style>
</head>
<body>
  <div class="marca">EnchantDesk</div>
  <div class="rotulo">Este é o ID desta máquina</div>
  <div class="id">${idFormatado}</div>
  <div class="status" id="status">
    <span class="bolinha" style="background:#5FBFA0"></span>
    <span id="texto-status">Aguardando conexão</span>
  </div>
  <div class="pedido" id="pedido">
    <p>Alguém quer se conectar nesta máquina.</p>
    <div class="botoes">
      <button class="aceitar" onclick="responder(true)">Aceitar</button>
      <button class="recusar" onclick="responder(false)">Recusar</button>
    </div>
  </div>
  <div class="arquivo" id="arquivo">📁 Arquivo recebido: <span id="nome-arquivo"></span></div>

  <script>
    async function verificarStatus() {
      try {
        const resp = await fetch('http://127.0.0.1:${PORTA_LOCAL}/status');
        const data = await resp.json();
        const bolinha = document.querySelector('.bolinha');
        const texto = document.getElementById('texto-status');
        const pedido = document.getElementById('pedido');
        const arquivo = document.getElementById('arquivo');

        if (data.estado === 'pendente') {
          pedido.classList.add('visivel');
          texto.textContent = 'Solicitação recebida';
          bolinha.style.background = '#E8B657';
        } else if (data.estado === 'em_uso') {
          pedido.classList.remove('visivel');
          texto.textContent = 'Em uso — alguém está controlando esta máquina';
          bolinha.style.background = '#C97B63';
        } else {
          pedido.classList.remove('visivel');
          texto.textContent = 'Aguardando conexão';
          bolinha.style.background = '#5FBFA0';
        }

        if (data.arquivoRecebido) {
          document.getElementById('nome-arquivo').textContent = data.arquivoRecebido;
          arquivo.classList.add('visivel');
        } else {
          arquivo.classList.remove('visivel');
        }
      } catch (e) {}
    }

    async function responder(aceitar) {
      try {
        await fetch('http://127.0.0.1:${PORTA_LOCAL}/responder', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ aceitar })
        });
      } catch (e) {}
      verificarStatus();
    }

    setInterval(verificarStatus, 1000);
    verificarStatus();
  </script>
</body>
</html>`;

  fs.writeFileSync(ARQUIVO_HTML, html);

  const caminhoFileUrl = 'file:///' + ARQUIVO_HTML.replace(/\\/g, '/');
  const comando = `start msedge --app="${caminhoFileUrl}" --window-size=380,400`;

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

// --- Recebimento de arquivo ---
let arquivoAtual = null; // { nome, stream }

function nomeSeguro(nomeOriginal) {
  if (!fs.existsSync(PASTA_RECEBIDOS)) {
    fs.mkdirSync(PASTA_RECEBIDOS, { recursive: true });
  }
  let caminho = path.join(PASTA_RECEBIDOS, nomeOriginal);
  let contador = 1;
  const ext = path.extname(nomeOriginal);
  const base = path.basename(nomeOriginal, ext);
  while (fs.existsSync(caminho)) {
    caminho = path.join(PASTA_RECEBIDOS, `${base} (${contador})${ext}`);
    contador++;
  }
  return caminho;
}

function processarArquivo(data) {
  if (data.tipo === 'arquivo_inicio') {
    const caminho = nomeSeguro(data.nome);
    arquivoAtual = { nome: path.basename(caminho), stream: fs.createWriteStream(caminho) };
  } else if (data.tipo === 'arquivo_chunk' && arquivoAtual) {
    arquivoAtual.stream.write(Buffer.from(data.dados, 'base64'));
  } else if (data.tipo === 'arquivo_fim' && arquivoAtual) {
    arquivoAtual.stream.end();
    ultimoArquivoRecebido = { nome: arquivoAtual.nome, ts: Date.now() };
    arquivoAtual = null;
  }
}

function conectar() {
  const ws = new WebSocket(SERVIDOR);

  ws.on('open', () => {
    console.log('Conectado ao servidor EnchantDesk. Seu ID: ' + idFormatado);
    ws.send(JSON.stringify({ tipo: 'anuncio', id: MEU_ID }));
  });

  ws.on('message', async (msg, isBinary) => {
    if (isBinary) return;
    try {
      const data = JSON.parse(msg);

      if (data.tipo === 'solicitar_conexao') {
        estadoAtual = 'pendente';
        const aceitou = await new Promise((resolve) => {
          resolverPendencia = resolve;
        });

        if (aceitou) {
          estadoAtual = 'em_uso';
          ws.send(JSON.stringify({ tipo: 'permitir_stream' }));
          iniciarCaptura(ws);
        } else {
          estadoAtual = 'aguardando';
          ws.send(JSON.stringify({ tipo: 'negar_conexao' }));
        }
      } else if (data.tipo === 'parar_stream') {
        pararCaptura();
        estadoAtual = 'aguardando';
      } else if (data.tipo === 'input') {
        processarInput(data);
      } else if (data.tipo === 'arquivo_inicio' || data.tipo === 'arquivo_chunk' || data.tipo === 'arquivo_fim') {
        processarArquivo(data);
      }
    } catch (e) {
      console.error('Mensagem inválida:', e);
    }
  });

  ws.on('close', () => {
    pararCaptura();
    estadoAtual = 'aguardando';
    console.log('Desconectado. Tentando reconectar em 5s...');
    setTimeout(conectar, 5000);
  });

  ws.on('error', (err) => {
    console.error('Erro de conexão:', err.message);
  });
}

criarServidorLocal();
gerarEAbrirJanela();
conectar();
