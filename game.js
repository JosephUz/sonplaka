// Giriş noktası: oyunu yükler, başarısız olursa kullanıcıya okunur bir mesaj gösterir.
const root = document.getElementById('son-plaka');
try {
  const { start } = await import('./src/main.js');
  await start(root);
} catch (err) {
  const el = document.createElement('div');
  el.style.cssText = 'position:fixed;inset:0;display:grid;place-items:center;background:#0b0f1a;color:#e8eefc;font:16px system-ui;padding:24px;text-align:center;z-index:100';
  // Yazı etkin dilde (src/diller/: hata.baslatma); dil modülü de yüklenemediyse Türkçe yedek.
  let yazi = 'Oyun başlatılamadı: WebGL desteğini ve yerel sunucuyu kontrol et. ';
  try { const { t } = await import('./src/dil.js'); yazi = t('hata.baslatma'); } catch { /* yedek kalır */ }
  el.textContent = yazi + (err && err.message ? err.message : '');
  root.appendChild(el);
  console.error(err);
}
