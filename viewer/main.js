const { app, BrowserWindow, clipboard } = require('electron');

let janelaGlobal = null;
let ultimoClipboardViewer = '';
let ignorarProximaLeituraClipboard = false;

function criarJanela() {
  const janela = new BrowserWindow({
    width: 1100,
    height: 750,
    title: 'EnchantDesk',
    backgroundColor: '#0D1712',
    webPreferences: {
      contextIsolation: true
    }
  });

  janelaGlobal = janela;
  janela.loadURL('http://10.0.0.52:3000');
  janela.setMenuBarVisibility(false);

  setInterval(() => {
    const atual = clipboard.readText();
    if (atual !== ultimoClipboardViewer) {
      ultimoClipboardViewer = atual;
      if (ignorarProximaLeituraClipboard) {
        ignorarProximaLeituraClipboard = false;
        return;
      }
      if (atual && atual.length < 100000) {
        janela.webContents.send('clipboard-mudou', atual);
      }
    }
  }, 1000);
}

app.whenReady().then(criarJanela);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) criarJanela();
});
