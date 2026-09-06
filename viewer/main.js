const { app, BrowserWindow } = require('electron');

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
}

app.whenReady().then(criarJanela);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) criarJanela();
});
