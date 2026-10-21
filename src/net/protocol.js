/**
 * Ağ sözlüğü: istemci ile sunucunun ortak mesaj adları. Çerçeveler JSON ({ t: <ad>, ... }). Sunucu otoriterdir: maçı
 * o koşturur; istemci yalnızca girdi yollar, durum paketi (bkz. snapshot.js) ve olay alır.
 */
export const C2S = {
  HELLO: 'hello',   // { nick, token } — bağlantı kimliği; token varsa eski koltuğa geri bağlanır
  CREATE: 'create', // { teamSize, difficulty } — oda kur, kuran odanın kuranıdır; kip: 1 herkes tek, 2-5 iki takım; bot zorluğu easy|normal|hard; oda herkese açık kurulur (private: true eski istemciler için geçerli)
  JOIN: 'join',     // { code } — kod büyük harfe çevrilir, tiresiz (KPRT4) yazılmışsa tire eklenir (normalizeCode)
  LIST: 'list',     // açık odalar listesini iste; odada değilken liste değişince yeniden gelir (S2C.ROOMS)
  QUICK: 'quick',   // { teamSize, difficulty } — hızlı katıl: boş koltuklu açık odaya otur (önce lobidekiler, sonra insanı çok olan; maçtaki oda da olur), yoksa açık oda kur
  SEAT: 'seat',     // { slot } — boş koltuğa otur (koltuk = takım × takım boyu + sıra)
  MOVE: 'move',     // { id, slot } — yalnızca kuran: oyuncuyu koltuğa taşır, koltuk doluysa ikisi yer değiştirir
  SETTINGS: 'settings', // { teamSize?, difficulty?, private? } — yalnızca kuran, lobide: kip değişince koltuklar yeniden dizilir; private: true özel oda (listede ve hızlı katılımda yok, yalnız kodla)
  START: 'start',   // yalnızca kuran
  LEAVE: 'leave',
  INPUT: 'in',      // { mv: [x, z], yaw, pitch, hold, sp (Shift), e: 'basışlar' } — bkz. EDGES
  PING: 'ping',
};
export const S2C = {
  WELCOME: 'welcome', // { id, token, nick }
  LOBBY: 'lobby',     // { code, hostId, state, private, settings: { teamSize, difficulty, private }, seats: [{ id, nick, online } | null] × oyuncu sayısı }
  ERROR: 'error',     // { msg }
  START: 'start',     // { you, teamSize, difficulty, names, humans } — maç başladı (ya da ortasına katıldın)
  SNAP: 's',          // durum paketi + o ana kadar biriken olaylar (bkz. snapshot.js)
  END: 'end',         // { score, winner (-1 berabere), stats, names }
  PONG: 'pong',
  ROOMS: 'rooms',     // { rooms: [{ code, host, teamSize, difficulty, humans, seats, state, full }] } — herkese açık odalar (dolu olanlar da; istemci DOLU yazar)
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
/** Oda kodu girişi: büyük harf, harf/rakam dışı atılır, tiresiz yazılan (KPRT4) KPRT-4 olur. */
export const normalizeCode = raw => {
  const s = String(raw || '').toLocaleUpperCase('tr').replace(/İ/g, 'I').replace(/[^A-Z0-9]/g, '');
  return s.length > 4 ? `${s.slice(0, 4)}-${s.slice(4)}` : s;
};
export const roomCode = () => {
  const A = 'ABCDEFGHJKLMNPRSTUVYZ', D = '23456789';
  let s = '';
  for (let i = 0; i < 4; i++) s += A[Math.floor(Math.random() * A.length)];
  return `${s}-${D[Math.floor(Math.random() * D.length)]}`;
};
