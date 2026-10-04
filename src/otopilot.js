import { OTOPILOT as O } from './config.js';
import { isApp } from './platform.js';

/**
 * **Otopilot** (`?otopilot=1`, yalnız tarayıcı): içerik videoları için **gerçek bir maç**, ama senin oyuncunu da bir
 * bot oynar. `?gosteri=1`den (gosteri.js) farkı, bunun bir klip sahnesi değil **oyunun kendisi** olmasıdır:
 *  - Maç normal kurallarla, normal zorlukla, normal hızda ve **normal bot ayarlarıyla** kurulur (gösterinin
 *    hızlandırılmış adımları, kısaltılmış geri sayımı ve saldırganlaştırılmış botları burada yoktur).
 *  - Senin koltuğunu (`w.me`) da aynı bot yapay zekâsı oynar: `p.human` işareti kalkar, world.js `cmdOf` o koltuğu da
 *    botInput ile sürer — yürür, nişan alır, plaka atar, zıplar, kaçınır. Simülasyonda hiçbir ayrıcalığı yoktur.
 *  - **Kamera senin oyuncundadır** (normal oyun kamerası, omuz üstü). Bakışı fare yerine otopilot verir: botun o
 *    adımda nişan aldığı yön (`p.yaw` / `p.pitch`) kameraya yazılır, yani ekrandaki artı nişan nereye bakıyorsa
 *    plaka da oraya gider — bir oyuncunun fareyle yaptığının aynısı.
 *  - Arayüz normal oyundaki gibi durur; menü, lobi, Kontroller perdesi, mola ve karne ekranı hiç açılmaz. Maç
 *    bitince `yenidenBasla` saniye sonra yeni maç kurulur.
 *  - Ölçüm ve ağ bağlantısı yoktur, fare kilidi istenmez. Uygulamada (isApp) hiç açılmaz.
 * Normal oyun ve gösteri kipi bu dosyadan hiç etkilenmez.
 */
export function otopilotAcik() {
  if (isApp()) return false;
  const v = new URLSearchParams(location.search).get('otopilot');
  return v !== null && v !== '0';
}

export function createOtopilot() {
  let bitisTimer = 0;

  /** Yeni maç kurulduğunda: senin koltuğun da bota verilir. Maçın kuralları normal oyunun aynısıdır. */
  function kur(w) {
    w.otopilot = true;
    // human işareti kalkınca world.js cmdOf bu koltuğu da botInput ile sürer (bkz. ai.js). w.me değişmez: arayüz,
    // kamera ve karne hâlâ senin oyuncunu gösterir, yalnız tuşlara basan sen değilsin.
    const me = w.players[w.me];
    if (me) me.human = false;
    bitisTimer = 0;
  }

  /**
   * Kameranın bakışı: otopilotun "faresi". Botun o adımda nişan aldığı yön doğrudan kameraya yazılır — nişan ile
   * kadraj ayrışmasın (ekran ortasındaki artı gerçekten atışın gideceği yeri göstersin). Oyuncu ölüyken /
   * düşerken kamera zaten izleyici kipindedir (bkz. main.js followTarget), bakışa karışılmaz.
   */
  function bakis(w, view) {
    const p = w.players[w.me];
    if (!p || p.out || p.respawn > 0) return;
    view.face(p.yaw, p.pitch);
  }

  /** Maç bitince karne açılmaz: `yenidenBasla` saniye sonra yeni maç kurulur, kip girdisiz döner. */
  function guncelle(dt, w, begin) {
    if (w.winner === null) { bitisTimer = 0; return; }
    bitisTimer += dt;
    if (bitisTimer >= O.yenidenBasla) { bitisTimer = 0; begin(); }
  }

  return { kur, bakis, guncelle };
}
