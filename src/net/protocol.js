/**
 * Ağ sözlüğü: istemci ile sunucunun ortak mesaj adları. Çerçeveler JSON ({ t: <ad>, ... }). Sunucu otoriterdir: maçı
 * o koşturur; istemci yalnızca girdi yollar, durum paketi (bkz. snapshot.js) ve olay alır.
 */
export const C2S = {
  HELLO: 'hello',   // { nick, token } — bağlantı kimliği; token varsa eski koltuğa geri bağlanır
  CREATE: 'create', // oda kur (kuran odanın yöneticisidir)
  JOIN: 'join',     // { code }
  SEAT: 'seat',     // { slot } — boş koltuğa otur (0-4 mavi, 5-9 turuncu)
  MOVE: 'move',     // { id, slot } — yalnızca yönetici: oyuncuyu koltuğa taşır, koltuk doluysa ikisi yer değiştirir
  START: 'start',   // yalnızca yönetici
  LEAVE: 'leave',
  INPUT: 'in',      // { mv: [x, z], yaw, pitch, hold, e: 'basışlar' } — bkz. EDGES
  PING: 'ping',
};
export const S2C = {
  WELCOME: 'welcome', // { id, token, nick }
  LOBBY: 'lobby',     // { code, hostId, state, seats: [{ id, nick, online } | null] x10 }
  ERROR: 'error',     // { msg }
  START: 'start',     // { you, names: [..10], humans: [..10] } — maç başladı (ya da ortasına katıldın)
  SNAP: 's',          // durum paketi + o ana kadar biriken olaylar (bkz. snapshot.js)
  END: 'end',         // { wins, winner, stats: [..10], names }
  PONG: 'pong',
  ONLINE: 'on',       // { n } — çevrim içi (açık sekme) sayısı, değişince
};
/** Tek harfle gönderilen basışlar (girdi paketindeki e alanı): sol tık bas / bırak, levye, zıplama. */
export const EDGES = { t: 'tap', r: 'release', s: 'secondary', j: 'jump' };
export const NET = {
  /** Simülasyon adımı (sn) ve kaç adımda bir durum paketi (2 → saniyede 30). */
  step: 1 / 60, snapshotEvery: 2,
  /** Görüntü sunucunun bu kadar gerisinden, iki paket arası ara değerle çizilir (sn). */
  interp: 0.1,
  /** Kendi oyuncun beklemesin: yerel girdiden üretilen öne kayma (en çok leadMax birim), yumuşatma süresi (sn). */
  leadMax: 1.2, leadSmooth: 0.08,
  /** Girdi gönderim aralığı (sn); basış olunca beklemeden gider. */
  inputEvery: 1 / 30,
  /** Sunucu saatinin yumuşatması (paket titremesi çizime yansımasın); fark clockJump'ı aşarsa doğrudan kurulur. */
  clockSmooth: 0.1, clockJump: 0.5,
  /** Cloudflare boşta bağlantıyı kapatmasın: bu aralıkta ping (sn). */
  keepAlive: 20,
  /** Oda en çok 10 kişi (5v5); koltuk sayısı. */
  seats: 10,
};
export const roomCode = () => {
  const A = 'ABCDEFGHJKLMNPRSTUVYZ', D = '23456789';
  let s = '';
  for (let i = 0; i < 4; i++) s += A[Math.floor(Math.random() * A.length)];
  return `${s}-${D[Math.floor(Math.random() * D.length)]}`;
};
