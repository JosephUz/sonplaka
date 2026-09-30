import { CAMERA, GOSTERI } from './config.js';
import { alive } from './actions.js';
import { clamp, distance, wrap } from './math.js';
import { isApp } from './platform.js';
import { createWorld, step } from './world.js';

/**
 * **Gösteri kipi** (`?gosteri=1`): içerik klipleri için "kendi kendine oynayan" maç. Yalnız tarayıcıda açılır, oyunun
 * normal davranışına hiç dokunmaz.
 *  - Menü ve lobi atlanır, doğrudan maç başlar: hiç insan oyuncu yoktur, on koltuğun hepsini mevcut bot yapay zekâsı
 *    oynar (world.js cmdOf: `human` işaretsiz oyuncu botInput'tan sürülür).
 *  - Kaos yüksek: geri sayım kısaltılır, on oyuncu iç halka plakalarına takımlar karışık dizilir (herkesin dibinde
 *    rakip vardır) ve oyun GOSTERI.hiz katı hızda koşar; ilk saniyede disk uçar. Botlar yalnız bu kipte daha
 *    saldırgandır (GOSTERI.bot: hızlı düşünür, sık atar, yakın dövüşür, kenardan çekinmez).
 *  - Kamera en hareketli kavgayı omuz üstünden izler (bkz. odak): savrulan, uçan, düşen ve kalabalıkta dövüşen
 *    oyuncu öne çıkar; geçişler yumuşaktır, uzağa geçerken kesme yapılır.
 *  - Arayüz gizlidir (bkz. style.css `.gosteri`): skor tabelası, yardım, düğmeler ve dokunma kontrolleri yok.
 *  - Sunucuya bağlanılmaz, "sekme açık" sinyali (main.js heartbeat) gitmez; maç bitince birkaç saniye sonra yenisi
 *    başlar, yani girdi olmadan sonsuza kadar döner.
 * Uygulamada (isApp) açılmaz: Play Store sürümüne yeni bir kip girmez.
 */
export function gosteriAcik() {
  if (isApp()) return false;
  const v = new URLSearchParams(location.search).get('gosteri');
  return v !== null && v !== '0';
}

const ADIM = 1 / 60;

/** Gösteri kipinin sürücüsü: maçı kurar, hızlandırılmış adımlarla koşturur ve kamerayı kavgaya çevirir. */
export function createGosteri({ view }) {
  let w = null, acc = 0, bitisTimer = 0, bekliyor = false;
  let odakId = -1, taraT = 0, tutT = 0, yaw = 0, pitch = GOSTERI.kamera.egim;
  // Kameranın izlediği çapa: omuz kamerası bunun arkasına geçer (view.render → follow).
  const bak = { x: 0, y: 0, z: 0, yaw: 0, pitch: 0, id: -1 };

  /** Yeni maç: on bot, kısa geri sayım, iç halkada karışık diziliş, saldırgan bot ayarları. */
  function basla() {
    w = createWorld(1 + Math.floor(Math.random() * 1e6), { teamSize: GOSTERI.kip, difficulty: GOSTERI.zorluk });
    // İnsan koltuğu yok: 0. oyuncu da bot yapay zekâsıyla oynar.
    for (const p of w.players) { p.human = false; p.name = 'Bot-' + (p.id + 1); }
    w.bot = { ...w.bot, ...GOSTERI.bot };
    w.t = Math.min(w.t, GOSTERI.geriSayim);
    diz();
    acc = 0; bitisTimer = 0; bekliyor = false; odakId = -1; taraT = 0; tutT = 0;
    view.setWorld(w);
    odak(0);
    return w;
  }

  /**
   * İlk kavga: oyuncular iç halka plakalarına sırayla (takımlar karışık) dizilir, plaka ortasına bakar ve doğuş
   * koruması kapatılır — maç başladığı anda herkesin menzilinde bir rakip vardır.
   */
  function diz() {
    const ic = w.arena.plates.filter(pl => pl.ring === 1);
    const sayac = new Map();
    w.players.forEach((p, i) => {
      const pl = ic[i % ic.length], k = sayac.get(pl.id) || 0;
      sayac.set(pl.id, k + 1);
      const a = k * Math.PI * 2 / 3 + pl.id, r = GOSTERI.yayilma;
      Object.assign(p, {
        x: pl.x + Math.sin(a) * r, y: 0, z: pl.z + Math.cos(a) * r, vx: 0, vy: 0, vz: 0,
        ground: true, plate: pl.id, jumps: 0, knock: 0, flight: 0, freeze: 0, respawn: 0, out: false,
        padLock: 0, shield: 0, charge: 0, chargeSpent: false, throwCd: 0, barCd: 0, power: null, powerLeft: 0,
        lastHit: null, think: 0.05 + i * 0.02, bot: null, lives: GOSTERI.can,
      });
      p.yaw = Math.atan2(pl.x - p.x, pl.z - p.z); p.pitch = 0;
    });
  }

  /** Her kare: maç GOSTERI.hiz katı hızda ilerler; bittiyse birkaç saniye sonra yenisi kurulur. Güncel dünyayı döner. */
  function guncelle(dt) {
    if (w.winner !== null) {
      if (!bekliyor) { bekliyor = true; bitisTimer = GOSTERI.yenidenBasla; }
      bitisTimer -= dt;
      bosalt();
      return bitisTimer <= 0 ? basla() : w;
    }
    acc = Math.min(acc + dt * GOSTERI.hiz, GOSTERI.enFazlaAdim * ADIM);
    for (let n = 0; acc >= ADIM && n < GOSTERI.enFazlaAdim; n++) { step(w, ADIM); acc -= ADIM; }
    bosalt();
    return w;
  }

  /** Olaylar efektlere (toz, kıvılcım, iz) gider; arayüz ve ses yoktur, kuyruk her karede boşaltılır. */
  function bosalt() {
    for (const e of w.events) view.event(e);
    w.events.length = 0;
  }

  /**
   * Kamera odağı: GOSTERI.kamera.tara saniyede bir en hareketli oyuncu aranır (puan), seçilende en az `tut` saniye
   * kalınır; belirgin daha hareketli biri çıkarsa (`ustunluk` katı) ya da odak elenirse hemen geçilir. Kamera onun
   * omzundan kavgaya bakar: çapa oyuncuya, bakış en yakın rakibe doğru yumuşakça kayar; odak uzağa geçerse kesilir.
   */
  function odak(dt) {
    const K = GOSTERI.kamera;
    taraT -= dt; tutT -= dt;
    const su = odakId >= 0 ? w.players[odakId] : null;
    const suPuan = su && alive(su) ? puan(su) : -1;
    if (taraT <= 0 || suPuan < 0) {
      taraT = K.tara;
      const en = enHareketli();
      if (en && en.p.id !== odakId && (suPuan < 0 || (tutT <= 0 && en.puan > suPuan * K.ustunluk))) {
        odakId = en.p.id; tutT = K.tut;
      }
    }
    const p = odakId >= 0 ? w.players[odakId] : null;
    // Boşluğa düşen odakta uzun kalınmaz: savrulma anı görünür, düşen uzaklaşınca kamera kavgaya döner.
    if (p && alive(p) && p.y < K.bosluk) { tutT = 0; taraT = Math.min(taraT, K.dususTut); }
    if (p && alive(p)) kadraj(p, dt);
    view.face(yaw, pitch);
    return bak;
  }

  /**
   * Kadraj: çapa odak oyuncusuna, bakış onun en yakın rakibine yumuşakça oturur. Odak boşluğa düşüyorsa çapa kavganın
   * olduğu yerde durur ve kamera yalnız aşağı bakar: düşüşü plakanın kenarından izleriz, kamera arenanın altına inmez.
   */
  function kadraj(p, dt) {
    const K = GOSTERI.kamera;
    const dusuyor = !p.ground && p.y < K.bosluk;
    // Odak uzaktaysa yumuşak kaydırmak yerine kesilir: kamera boş arenada uzun uzun süzülmesin.
    const kes = dt <= 0 || Math.hypot(p.x - bak.x, p.z - bak.z) > K.kes;
    if (!dusuyor) {
      // Çapa oyuncunun biraz arkasında durur: omuz kamerası (CAMERA.back) ile birlikte kavganın iki tarafı da kadraja girer.
      const gx = p.x - Math.sin(yaw) * K.geri, gz = p.z - Math.cos(yaw) * K.geri;
      const k = kes ? 1 : 1 - Math.exp(-dt * K.yumusatma);
      bak.x += (gx - bak.x) * k; bak.y += (p.y - bak.y) * k; bak.z += (gz - bak.z) * k;
      bak.y = Math.max(bak.y, K.enAlcak);
    }
    const r = (dusuyor ? null : enYakinRakip(p)) || p;
    const dx = r.x - bak.x, dz = r.z - bak.z, dh = Math.hypot(dx, dz);
    const hedefYaw = dh > 1.2 ? Math.atan2(dx, dz) : yaw;
    const hedefPitch = clamp(Math.atan2(r.y + 1 - (bak.y + CAMERA.height), Math.max(3, dh)) + K.egim, -1.1, 0.5);
    const kd = kes ? 1 : 1 - Math.exp(-dt * K.donme);
    yaw += wrap(hedefYaw - yaw) * kd; pitch += (hedefPitch - pitch) * kd;
  }

  /** En hareketli oyuncu ve puanı (hiç ayakta oyuncu yoksa null). */
  function enHareketli() {
    let best = null, bp = -1;
    for (const p of w.players) {
      if (!alive(p)) continue;
      const s = puan(p);
      if (s > bp) { bp = s; best = p; }
    }
    return best ? { p: best, puan: bp } : null;
  }

  /**
   * Aksiyon puanı: yakındaki rakipler (yakın olan daha çok), çevrede uçuşan diskler ve oyuncunun hâli — savrulan,
   * rampadan uçan, boşluğa düşen ve ağır disk şarj eden oyuncu klibin izlenecek anıdır.
   */
  function puan(p) {
    if (!alive(p)) return -1;
    const K = GOSTERI.kamera;
    let s = 0;
    for (const t of w.players) {
      if (t.id === p.id || !alive(t)) continue;
      const d = distance(p, t);
      if (d > K.cevre) continue;
      s += (t.team === p.team ? K.dost : 1) * (1 - d / K.cevre);
    }
    for (const d of w.discs) if (Math.hypot(d.x - p.x, d.z - p.z) < K.cevre) s += K.disk;
    if (p.knock > 0) s += K.savrulma;
    if (p.flight > 0) s += K.ucus;
    if (p.charge > 0) s += K.sarj;
    // Boşluğa düşen ya da çöken plakayla inen oyuncu: kısa bir düşüş planı, sonra kamera kavgaya döner.
    if (p.y < K.bosluk) return K.dusme;
    return s;
  }

  /** Oyuncunun en yakın ayakta rakibi (yoksa null). */
  function enYakinRakip(p) {
    let best = null, bd = Infinity;
    for (const t of w.players) {
      if (t.team === p.team || !alive(t)) continue;
      const d = distance(p, t);
      if (d < bd) { bd = d; best = t; }
    }
    return best;
  }

  // `odakId` / `kamera`: gösteri kipinin testten (tests/gosteri-smoke.mjs) okunan durumu.
  return { basla, guncelle, odak, dunya: () => w, odakId: () => odakId, kamera: () => ({ x: bak.x, y: bak.y, z: bak.z, yaw, pitch }) };
}
