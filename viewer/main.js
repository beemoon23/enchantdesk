const { app, BrowserWindow, session } = require('electron');
const path = require('path');

app.commandLine.appendSwitch('unsafely-treat-insecure-origin-as-secure', 'http://10.0.0.52:3000');

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

  janela.loadURL('http://10.0.0.52:3000');
  janela.setMenuBarVisibility(false);

  session.defaultSession.setPermissionRequestHandler((webContents, permission, callback) => {
    callback(true);
  });

  session.defaultSession.on('will-download', (event, item) => {
    const nomeArquivo = item.getFilename();
    const caminhoDownloads = path.join(app.getPath('downloads'), nomeArquivo);
    item.setSavePath(caminhoDownloads);

    item.once('done', (event, state) => {
      if (state === 'completed') {
        console.log('Arquivo salvo em:', caminhoDownloads);
      } else {
        console.error('Download falhou:', state);
      }
    });
  });
}

app.whenReady().then(criarJanela);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) criarJanela();
});
