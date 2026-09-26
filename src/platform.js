import { ONLINE, SERVER } from './config.js';

/**
 * Android uygulaması mı (Capacitor, oyun dosyaları uygulamanın içinden açılır) yoksa tarayıcı mı. `?app` ile tarayıcıda
 * da uygulama kipi denenir (testler).
 */
export const isApp = () => !!window.Capacitor?.isNativePlatform?.() || new URLSearchParams(location.search).has('app');
/** Çevrim içi özellikler bu platformda açık mı (config.js → ONLINE). */
export const onlineEnabled = () => (isApp() ? ONLINE.app : ONLINE.web);
/** Sayfa sunucunun kendisinden mi açıldı (localhost, IP adresi, doğrudan sunucu adresi). */
export const selfHosted = () => {
  const h = location.hostname;
  return !isApp() && (h === SERVER || h === 'localhost' || /^[\d.]+$|^\[/.test(h));
};
/** Sunucunun HTTP kökü (çevrim içi sayısı sinyali) ve WebSocket adresi. */
export const serverHttp = () => (selfHosted() ? '' : 'https://' + SERVER);
export const serverUrl = () => (selfHosted() ? `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}` : 'wss://' + SERVER);
