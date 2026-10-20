/**
 * Ağ sözlüğü: istemci ile sunucunun ortak mesaj adları. Çerçeveler JSON ({ t: <ad>, ... }). Sunucu otoriterdir: maçı
 * o koşturur; istemci yalnızca girdi yollar, durum paketi (bkz. snapshot.js) ve olay alır.
 */
export const C2S = {
  HELLO: 'hello',   // { nick, token } — bağlantı kimliği; token varsa eski koltuğa geri bağlanır
  CREATE: 'create', // { teamSize, difficulty, private } — oda kur (kuran odanın yöneticisidir); kip: 1 herkes tek, 2-5 iki takım; bot zorluğu easy|normal|hard; private: true ise oda listede ve hızlı katılımda görünmez, yalnız kodla girilir
  JOIN: 'join',     // { code }
  LIST: 'list',     // açık odalar listesini iste; odada değilken liste değişince yeniden gelir (S2C.ROOMS)
  QUICK: 'quick',   // { teamSize, difficulty } — hızlı katıl: lobide bekleyen boş koltuklu açık odaya otur, yoksa açık oda kur
  SEAT: 'seat',     // { slot } — boş koltuğa otur (koltuk = takım × takım boyu + sıra)
  MOVE: 'move',     // { id, slot } — yalnızca yönetici: oyuncuyu koltuğa taşır, koltuk doluysa ikisi yer değiştirir
  SETTINGS: 'settings', // { teamSize?, difficulty? } — yalnızca yönetici, lobide: kip değişince koltuklar yeniden dizilir
  START: 'start',   // yalnızca yönetici
  LEAVE: 'leave',
  INPUT: 'in',      // { mv: [x, z], yaw, pitch, hold, sp (Shift), e: 'basışlar' } — bkz. EDGES
  PING: 'ping',
};
export const S2C = {
  WELCOME: 'welcome', // { id, token, nick }
  LOBBY: 'lobby',     // { code, hostId, state, private, settings: { teamSize, difficulty }, seats: [{ id, nick, online } | null] × oyuncu sayısı }
  ERROR: 'error',     // { msg }
  START: 'start',     // { you, teamSize, difficulty, names, humans } — maç başladı (ya da ortasına katıldın)
  SNAP: 's',          // durum paketi + o ana kadar biriken olaylar (bkz. snapshot.js)
  END: 'end',         // { score, winner (-1 berabere), stats, names }
  PONG: 'pong',
  ROOMS: 'rooms',     // { rooms: [{ code, host, teamSize, difficulty, humans, seats, state }] } — boş koltuklu açık odalar
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
  /** Oda en çok 10 kişi (5v5); koltuk sayısı kipe göre daha az olabilir. */
  seats: 10,
  /** Açık odalar listesinde en çok bu kadar oda (lobide bekleyenler ve kalabalık olanlar önce). */
  listMax: 20,
};
export const roomCode = () => {
  const A = 'ABCDEFGHJKLMNPRSTUVYZ', D = '23456789';
  let s = '';
  for (let i = 0; i < 4; i++) s += A[Math.floor(Math.random() * A.length)];
  return `${s}-${D[Math.floor(Math.random() * D.length)]}`;
};
