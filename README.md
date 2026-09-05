# 🌟 EnchantDesk

Ferramenta de suporte remoto caseira, feita sob medida para o Vale Encantado Eco Park & Hotel. Funciona como o AnyDesk/RustDesk: um técnico controla remotamente qualquer PC da rede interna, com consentimento explícito de quem está na máquina.

## Como funciona

```
┌──────────────┐         ┌───────────────────┐         ┌──────────────────┐
│    Agente    │ ◄─────► │  Servidor (hub)    │ ◄─────► │   Visualizador   │
│  (PC remoto) │   WS    │  Linux, sempre     │   WS    │ (quem controla)  │
│ .exe + .vbs  │         │  ligado            │         │  app Electron    │
└──────────────┘         └───────────────────┘         └──────────────────┘
```

- **Agente**: roda na máquina que pode ser controlada (Recepção, ADM, etc). Gera um **ID único de 9 dígitos** na primeira execução (salvo permanentemente). Captura a tela, aceita comandos de mouse/teclado, recebe arquivos.
- **Servidor**: roda no servidor Linux, é o intermediário. Sabe quem está online e repassa vídeo/comandos entre agente e visualizador.
- **Visualizador**: app de desktop (Electron) onde você digita o ID da máquina que quer acessar e conecta.

## Features

- Conexão por ID único (estilo AnyDesk), persistente por máquina
- Captura de tela em tempo real (streaming de frames JPEG via WebSocket binário)
- Controle de mouse e teclado
- **Consentimento obrigatório**: quem está na máquina remota precisa clicar "Aceitar" antes de qualquer captura começar
- Status ao vivo na janela do agente (aguardando / pedido pendente / em uso)
- Transferência de arquivo (visualizador → máquina remota), salvo em `Desktop\EnchantDesk-Recebidos`
- Agente roda sem janela de console visível (via lançador `.vbs`)
- Servidor rodando como serviço systemd (reinicia sozinho se cair)

## Estrutura do repositório

```
enchantdesk/
├── server/
│   ├── server.js          # Hub central (roda no Linux)
│   ├── public/
│   │   └── index.html     # Mantido por histórico (não usado mais via navegador)
│   └── agent/
│       └── agent.js       # Código-fonte do agente
└── viewer/
    ├── main.js             # App Electron (visualizador)
    └── package.json
```

## Setup do servidor (Linux)

```bash
cd /opt/enchantdesk/server
npm install express ws
node server.js
```

Pra rodar como serviço permanente (recomendado):

```bash
sudo nano /etc/systemd/system/enchantdesk.service
```

```ini
[Unit]
Description=EnchantDesk Server
After=network.target

[Service]
Type=simple
User=info
WorkingDirectory=/opt/enchantdesk/server
ExecStart=/usr/bin/node /opt/enchantdesk/server/server.js
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable enchantdesk
sudo systemctl start enchantdesk
```

Pra atualizar o servidor depois de mudanças no código:

```bash
cd /opt/enchantdesk
git pull
sudo systemctl restart enchantdesk
```

**Importante**: o IP do servidor está hardcoded em `agent.js` (`const SERVIDOR = 'ws://10.0.0.52:3000'`) e em `viewer/main.js` (`janela.loadURL(...)`). Se o IP do servidor mudar, precisa atualizar nos dois lugares e gerar os executáveis de novo.

## Gerando o agente (.exe) — Windows

Precisa ser feito **num PC Windows** (não dá pra gerar pelo Mac/Linux, por causa das bibliotecas nativas `robotjs` e `sharp`).

```bash
cd server/agent
npm install
npm install -g pkg@5.8.1
pkg agent.js --target node18-win-x64 --output EnchantDesk-Agente.exe
```

⚠️ Se aparecer erro sobre versão do Node exigida pelo `sharp`, use a versão antiga da lib, compatível com Node 18:

```bash
npm uninstall sharp
npm install sharp@0.32.6
```

### Esconder a janela de console

Cria um arquivo `Iniciar-EnchantDesk.vbs` na mesma pasta:

```vbscript
Set objShell = CreateObject("WScript.Shell")
Set objFSO = CreateObject("Scripting.FileSystemObject")
strPasta = objFSO.GetParentFolderName(WScript.ScriptFullName)
objShell.Run """" & strPasta & "\EnchantDesk-Agente.exe""", 0, False
```

**Atenção ao salvar pelo Bloco de Notas**: o Windows esconde extensões por padrão, e é fácil salvar sem querer como `.vbs.txt`. Confirme com `dir` no terminal se o nome ficou exatamente `Iniciar-EnchantDesk.vbs`.

### Pacote de instalação (.zip)

Compacte estes três itens juntos:

- `EnchantDesk-Agente.exe`
- `Iniciar-EnchantDesk.vbs`
- pasta `node_modules\` (necessária — o `sharp` não empacota 100% dentro do `.exe`)

## Instalando o agente numa máquina nova

1. Extrai o `.zip` numa pasta fixa (ex: `C:\EnchantDesk\`)
2. Testa dando duplo clique em `Iniciar-EnchantDesk.vbs` (deve abrir só a janelinha bonita, sem console)
3. Anota o ID gerado (aparece na janelinha)
4. Pra rodar sozinho ao ligar o PC: copia o `.vbs` (Ctrl+C, Ctrl+V) pra pasta de Inicialização — digite `shell:startup` na barra de endereço do Explorer pra abrir essa pasta

⚠️ Se for notebook, configure pra não suspender com a tampa fechada (`Configurações → Sistema → Energia`), senão o agente para de responder quando o Windows dorme.

## Gerando o visualizador (instalador) — por plataforma

**Para Windows** (gera `.exe`, precisa rodar num PC Windows):

```bash
cd viewer
npm install
set CSC_IDENTITY_AUTO_DISCOVERY=false
npm run build
```

Gera `dist/EnchantDesk Setup 1.0.0.exe` — arquivo único, sem dependências extra.

⚠️ Se der erro de "privilégio necessário" ao extrair `winCodeSign`, rode o terminal **como Administrador**.

**Para Mac**: rodar os mesmos passos num Mac deve gerar um `.dmg` (ainda não testado em produção — ajustar `build.mac` no `package.json` se necessário).

Pra testar sem gerar instalador (modo desenvolvimento):

```bash
cd viewer
npm install
npm start
```

## Fluxo de uso do dia a dia

1. Pessoa relata problema num PC (ex: Recepção)
2. Se o agente ainda não estiver instalado lá, instala uma vez (ver seção acima)
3. Você abre o EnchantDesk (visualizador) no seu computador
4. Digita o ID da máquina, clica "Conectar"
5. Na máquina remota aparece um pedido de permissão — a pessoa clica "Aceitar"
6. Você já vê a tela e pode controlar mouse/teclado
7. Pra mandar um arquivo: clica "Enviar arquivo" na barra superior durante a sessão

## Decisões técnicas (para referência futura)

- **Não usamos vídeo H.264/WebRTC real** — decidido conscientemente para evitar dependência de `ffmpeg` embutido no agente. Em vez disso, streaming de frames JPEG via WebSocket binário (~20-25 FPS na LAN), suficiente para tarefas de suporte técnico.
- **Não usamos extensão de navegador** — extensões não conseguem controlar mouse/teclado do sistema operacional nem capturar tela sem interação manual da pessoa a cada vez.
- **Captura de tela**: usa `robot.screen.capture()` (nativo, via `robotjs`) em vez de `screenshot-desktop` (que chama processo externo do SO a cada frame — muito mais lento).
- **Performance**: testes mostraram que macOS tem captura de tela nativa notoriamente mais lenta (~200ms/frame via API antiga `CGDisplayCreateImage`) que Windows (~50-80ms/frame). Isso é uma limitação do sistema operacional, não do código.
- **pkg vs @yao-pkg/pkg**: o projeto `vercel/pkg` original foi descontinuado e só suporta até Node 18. Usamos a versão `5.8.1` dele (não o fork `@yao-pkg`) porque o fork tenta buscar versões de patch do Node que nem sempre têm binário pré-compilado, travando em ambientes Windows sem a ferramenta `patch` do Unix.

## Possíveis melhorias futuras

- [ ] Atualização automática do agente (hoje precisa reinstalar manualmente em cada máquina a cada mudança)
- [ ] Ícone próprio no instalador (hoje usa o ícone padrão do Electron)
- [ ] Suporte a múltiplos monitores na máquina remota
- [ ] Área de transferência compartilhada (copiar/colar entre máquinas)
- [ ] Log de quem conectou em qual máquina e quando
- [ ] Transferência de arquivo no sentido inverso (remoto → visualizador)
