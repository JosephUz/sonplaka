// Tüm ayar sayıları tek yerde. Uzunluk birimi arena birimi, hız birim/sn, süreler saniye.

/**
 * Arena: boşlukta asılı yuvarlak plakalar. Merkez plaka + iç halka (4 plaka) + dış halka (8 plaka). Açı: x = uzaklık·sin(a),
 * z = uzaklık·cos(a). Dış halka takımlara ardışık dilimler hâlinde doğuş plakası olarak paylaştırılır (arena.js).
 * `bound` disklerin sektiği görünmez silindir sınır; `fallDepth` altına düşen elenir. Düşen plaka `fallAccel` ile hızlanır,
 * `gone` altına inince yok olur. Kolonlar (`pillarR`, `pillarH`) diskleri sektirir, oyuncuyu durdurur; siper olmasın ve
 * oyun sürekli hareket istesin diye kapalı (`center.pillars` 0, `ring1.pillar` false): diskler yalnız sınırdan seker.
 * Plakalar arası tek geçiş **zıplama plakaları**: plaka kenarından `padInset` içeride, `padR` yarıçaplı; hedef plakada
 * kenardan `landInset` içeriye indirir.
 */
export const ARENA = {
  bound: 54,
  center: { r: 10, pillars: 0, pillarDist: 5.5 },
  ring1: { n: 4, dist: 24, r: 7, angle0: Math.PI / 4, pillar: false },
  ring2: { n: 8, dist: 42, r: 6, angle0: Math.PI / 8 },
  fallDepth: -30, gone: -70, fallAccel: 14,
  pillarR: 1.1, pillarH: 3.4,
  padR: 1.5, padInset: 1.3, landInset: 4.2,
};

/**
 * Maç akışı (saniye, oyun saatine göre): `start` saniye geri sayım (kimse kıpırdamaz); dış halka `ring2At`'te, iç halka
 * `ring1At`'te düşer; her düşüşten `tremble` saniye önce plaka titrer. Dış halka düşene kadar düşen `respawn` saniye
 * sonra kendi dış plakasında, sonra iç halkada doğar. İç halka düşünce **son plaka** evresi: yalnız merkez kalır ve
 * **doğuş kapanır**. Merkez `shrinkAt`'ten başlayarak `shrinkTime` saniyede `minR` yarıçapına küçülür; itiş sürsün
 * diye o kadar daralır ve orada kalır — **merkez hiç düşmez**. `endAt`'te süre biter ve **o an son plakada ayakta
 * kalan kazanır**: ayakta oyuncusu en çok olan takım, eşitse en çok düşüren, o da eşitse berabere. Rakip takımların
 * kimsesi kalmayınca maç zaten hemen biter.
 */
export const ROUND = { start: 3, tremble: 5, ring2At: 40, ring1At: 80, shrinkAt: 100, shrinkTime: 30, minR: 5.5, endAt: 145, respawn: 4 };

/**
 * Maç kipi: takım başı oyuncu `teamSize` — 1 ise **herkes tek** (`ffaTeams` oyuncu, herkes ayrı takım), 2–5 ise iki
 * takım (2v2 … 5v5); boş yerleri botlar doldurur. `seed` bot kararlarının tohumu (testler buna dayanır).
 */
export const MATCH = { teamSize: 5, ffaTeams: 5, seed: 61 };
export const MODES = [1, 2, 3, 4, 5];
export const modeLabel = n => (n === 1 ? 'HERKES TEK' : `${n}v${n}`);
export const teamsFor = n => (n === 1 ? MATCH.ffaTeams : 2);
export const playersFor = n => teamsFor(n) * n;

/** Yürüme hızı, Shift ile hızlı koşu çarpanı, yerde ve havada hedef hıza yaklaşma katsayısı (1/sn), yerde savrulma sürtünmesi. */
export const MOVE = { speed: 7.5, sprint: 1.45, accel: 18, air: 5, friction: 6 };

/** Zıplama: kalkış hızı, yerçekimi, havadaki ikinci zıplama (çift zıplama) ve ikinci zıplamanın gücü. */
export const JUMP = { vy: 9.5, gravity: 24, double: 1, secondMult: 0.9 };

/**
 * Rampa (zıplama plakası): iki plaka arası uçuş `speed` hızıyla hesaplanır, süre `min`-`max` arasına sıkışır. Uçuşta
 * yön verilmez (disk atılabilir). Rampa hiçbir koşulda kapanmaz: basan her zaman uçar.
 */
export const PAD = { speed: 20, min: 0.9, max: 1.5 };

/**
 * Disk: elde en çok `max`, `regen` saniyede bir yenilenir. Düz uçar (`speed`), sınırdan ve kolonlardan `bounces` kez
 * seker, `life` saniye yaşar. İsabet hasar vermez: vurulan disk yönünde `knock` hızıyla savrulur, `lift` kadar havalanır,
 * `knockTime` saniye kontrolsüzdür. Sol tık `heavyCharge` saniye basılıyken bırakılırsa **ağır disk**: yavaş
 * (`heavySpeed`), parlak, `heavyKnock` / `heavyLift` kat sert savurur; o da elemez, eleme yalnız düşmeyle. `cooldown` iki atış arası. Üçlü disk `spread` radyan yelpazeyle çıkar.
 */
export const DISC = { max: 3, regen: 1.5, speed: 26, heavySpeed: 17, radius: 0.55, life: 4, bounces: 3, knock: 15, lift: 5, knockTime: 0.45, heavyCharge: 1.5, heavyKnock: 1.8, heavyLift: 1.5, cooldown: 0.25, spread: 0.22 };

/** Levye (sağ tık): `range` içinde ve bakış konisinde (`cone`: kosinüs) rakibi kendinden uzağa `knock` ile iter. */
export const CROWBAR = { range: 2.6, cone: 0.5, knock: 22, lift: 6, cooldown: 0.8 };

/** Dondurucu disk: vurulan `time` saniye donar (kıpırdayamaz, atamaz; itilirse kayar). */
export const FREEZE = { time: 2 };

/**
 * Güç diskleri: merkez plakada ve iç halka plakalarında doğar, alınınca `respawn` saniye sonra sırayla başka tür
 * gelir. `triple`: sonraki `shots` atış üç disk; `freeze`: sonraki `shots` atış dondurur. Raund başında iç halkadakiler
 * hazırdır, merkezdeki `first` saniye sonra gelir.
 */
export const PICKUP = { respawn: 20, radius: 1.4, first: 15, kinds: ['triple', 'freeze'], shots: 3 };

/** Düşürme sayılır: düşen oyuncuya son `credit` saniyede vuran rakip düşürmüş sayılır (karnede "düşürme"). */
export const CREDIT = 4;

/**
 * Bot kararları: `think` + rastgele `thinkJitter` aralıkla plan yapar. Düelloda hedefe `range` uzaklıkta durur, `close`
 * altına inince geri açılır, `strafe` saniyede bir yan yön değiştirir; plaka kenarına `edge`'den yakın durmaz. Disk
 * `fireRange` içindeki hedefe `fireEvery` + rastgele aralıkla atılır, nişan `aimError` radyan sapar; `heavyChance` ile
 * ağır disk hazırlar. Yaklaşan diski `dodgeChance` ile zıplayarak savuşturur. Başka plakadaki rakibe `crossChance` ile
 * uzaktan atar; aksi halde zıplama plakasıyla ona (ya da merkeze) gider. Yeni indiği plakada `stay` saniye kalır.
 */
export const BOT = { think: 0.3, thinkJitter: 0.25, range: 11, close: 5, strafe: 1.1, edge: 2.2, fireRange: 30, fireEvery: 0.7, fireJitter: 0.9, aimError: 0.08, heavyChance: 0.12, dodgeChance: 0.5, crossChance: 0.25, stay: 4 };

/**
 * Kamera: masaüstünde **birinci şahıs** (göz `eye` yükseklikte), telefonda omuz üstü (`back` geride, `side` sağda,
 * `height` yukarıda); V ya da 🎥 ile geçilir. Fare hassasiyeti `yawSpeed` / `pitchSpeed`, eğim sınırları radyan.
 * Savrulunca kamera `knockShake` kadar sarsılır. Elenince kamera `fallView` saniye boyunca düştüğün yerde alçalarak
 * (`fallSink` birim/sn) yukarıdaki arenaya bakar, sonra takım arkadaşına geçer.
 */
export const CAMERA = { fov: 78, far: 260, eye: 1.55, back: 4.2, side: 0.7, height: 2.4, pitchMin: -1.15, pitchMax: 1.15, yawSpeed: 0.0028, pitchSpeed: 0.0022, knockShake: 0.45, fallView: 1.6, fallSink: 7 };

/**
 * Dokunmatik kontroller (telefon / tablet): sol yarıda parmağın değdiği yerde beliren joystick (yarıçap `stick` px,
 * `dead` altı yok sayılır); sağ yarıda parmak kaydırmak bakıştır (`look` px çarpanı). Mobilde görüntü hafifler.
 */
export const TOUCH = { stick: 60, dead: 0.14, look: 2.2, pixelRatio: 1.35, shadow: 1024 };

/** Takım adları ve renkleri: iki takımlı kiplerde ilk ikisi, herkes tek kipinde beşi de kullanılır. */
export const TEAMS = { names: ['MAVİ', 'TURUNCU', 'YEŞİL', 'MOR', 'PEMBE'], colors: ['#39c2cf', '#f5825b', '#7dff9a', '#c08bff', '#ff7ab8'] };

/**
 * Çok oyunculu özellikler hangi platformda açık: tarayıcıda (web) açık; Android uygulamasında (app) kapalı, giriş
 * ekranında oda düğmeleri "Yakında" yazar. Webde de sunucuya bağlanılamazsa (evdeki PC ya da tünel kapalı) "Yakında".
 */
export const ONLINE = Object.freeze({ web: true, app: false });
/**
 * Çevrim içi oyun sunucusu (WebSocket, Cloudflare Tunnel ile evdeki PC). Oyun dosyaları Cloudflare'deki statik siteden
 * (sonplaka.josephuz.com) gelir; sayfa sunucunun kendisinden açıldıysa (yerelde, Docker, aynı ağ) aynı adres kullanılır.
 */
export const SERVER = 'sonplaka-sunucu.josephuz.com';
