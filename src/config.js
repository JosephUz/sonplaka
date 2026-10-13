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
 * Düşme hakkı ve doğuş koruması: her oyuncunun `lives` düşme hakkı vardır; beşinci düşüşte doğuş açık olsa da elenir.
 * Yeni doğan `shield` saniye korunur: disk ve levye onu savuramaz, botlar onu hedef almaz; ilk atış ya da levye
 * korumayı bitirir.
 */
export const LIFE = { lives: 5, shield: 2 };

/**
 * Maç kipi: takım başı oyuncu `teamSize` — 1 ise **herkes tek** (`ffaTeams` oyuncu, herkes ayrı takım), 2–5 ise iki
 * takım (2v2 … 5v5); boş yerleri botlar doldurur. `difficulty` bot zorluğu (bkz. BOT_LEVELS). `seed` bot kararlarının
 * tohumu (testler buna dayanır).
 */
export const MATCH = { teamSize: 5, ffaTeams: 5, difficulty: 'normal', seed: 61 };
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
export const DISC = { max: 5, regen: 1.5, speed: 26, heavySpeed: 17, radius: 0.55, life: 4, bounces: 3, knock: 15, lift: 5, knockTime: 0.45, heavyCharge: 1.5, heavyKnock: 1.8, heavyLift: 1.5, cooldown: 0.25, spread: 0.22 };

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
 * Doğduktan sonra `spawnWait` saniye atmaz; nişanda hedefin hızını `lead` katsayısıyla önden alır.
 *
 * Zorluk (`BOT_LEVELS`): **zor** = bu değerler (tepki hızlı, nişan isabetli); **normal** ve **kolay** daha seyrek plan
 * yapar, daha seyrek ve daha sapmalı atar, diskten daha az kaçar, doğduktan sonra daha uzun bekler. Tek başına oyunda
 * giriş ekranında, odada yönetici seçer (her iki takımın botları için).
 */
export const BOT = { think: 0.3, thinkJitter: 0.25, range: 11, close: 5, strafe: 1.1, edge: 2.2, fireRange: 30, fireEvery: 0.7, fireJitter: 0.9, aimError: 0.08, heavyChance: 0.12, dodgeChance: 0.5, crossChance: 0.25, stay: 4, spawnWait: 1.5, lead: 1 };
export const BOT_LEVELS = {
  hard: {},
  normal: { think: 0.55, thinkJitter: 0.4, fireEvery: 1.3, fireJitter: 1.2, aimError: 0.18, heavyChance: 0.08, dodgeChance: 0.3, spawnWait: 2.5, lead: 0.6 },
  easy: { think: 0.9, thinkJitter: 0.6, fireEvery: 2.2, fireJitter: 1.6, aimError: 0.3, heavyChance: 0.04, dodgeChance: 0.12, spawnWait: 3.5, lead: 0.3 },
};
export const DIFFICULTIES = ['easy', 'normal', 'hard'];
export const DIFFICULTY_LABEL = { easy: 'KOLAY', normal: 'NORMAL', hard: 'ZOR' };
export const botParams = difficulty => ({ ...BOT, ...(BOT_LEVELS[difficulty] || BOT_LEVELS.normal) });

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

/**
 * **Gösteri kipi** (yalnız web, `?gosteri=1`; bkz. src/gosteri.js): içerik klipleri için botların kendi kendine
 * oynadığı maç. Menü ve lobi atlanır, on koltuğu da bot yapay zekâsı oynar, arayüz gizlenir, sunucuya bağlanılmaz.
 * Uygulamada (isApp) açılmaz ve **normal oyun bu ayarlardan hiç etkilenmez**.
 * - `kip` takım başı oyuncu (5 → 5v5, on oyuncu), `zorluk` bot seviyesi, `hiz` oyun hızı çarpanı (1,5 = bir buçuk kat),
 *   `geriSayim` maç başındaki bekleme (normalde ROUND.start = 3 sn), `yenidenBasla` maç bitince yeni maça kalan süre,
 *   `yayilma` başlangıçta oyuncuların plaka ortasına uzaklığı, `enFazlaAdim` bir karede atılacak en çok simülasyon adımı,
 *   `can` gösterideki düşme hakkı (normalde LIFE.lives = 5): saldırgan botlar çok düşürdüğü için maç halkaların
 *   çökmesine ve merkez düellosuna kadar sürsün diye yüksek tutulur.
 * - `bot` yalnız bu kipte botun üstüne yazılan ayarlar (bkz. BOT): hızlı düşünür, sık ve isabetli atar, yakın dövüşür,
 *   kenardan çekinmez, doğar doğmaz atar ve rakibin plakasına daha çok geçer.
 * - `kamera`: `tara` saniyede bir en hareketli oyuncu aranır, seçilende en az `tut` saniye kalınır (yenisi `ustunluk`
 *   katı hareketliyse hemen geçilir), `yumusatma` / `donme` çapanın ve bakışın yumuşaklığı (1/sn), `geri` çapanın
 *   oyuncunun arkasına düştüğü pay (omuz kamerasını biraz geri çeker), `kes` bu uzaklıktan öteye geçişte kesme yapılır,
 *   `egim` kadrajın sabit eğimi. Düşüş: `bosluk` yüksekliğinin altındaki oyuncu "düşüyor" sayılır (kamera yerinde kalıp
 *   aşağı bakar ve en geç `dususTut` saniye içinde kavgaya döner), `enAlcak` çapanın inebileceği en alt nokta — kamera
 *   arenanın altına geçmez. Puan ağırlıkları: `cevre` aksiyonun sayıldığı yarıçap, `dost` takım arkadaşının katkısı
 *   (rakip 1), `uzakRakip` uzaktaki en yakın rakibin küçük çekimi (kimse temasta değilken kamerayı yaklaşan kavgaya
 *   çevirir), `disk` çevredeki her disk, `savrulma` / `ucus` / `sarj` oyuncunun hâli, `dusme` düşmekte olan oyuncunun
 *   (kısa tutulan) puanı.
 */
/**
 * **Otopilot** (yalnız web, `?otopilot=1`; bkz. src/otopilot.js): içerik videoları için gerçek bir maç, ama senin
 * oyuncunu da bot oynar. Gösteriden farkı maçın **normal** kurallar, zorluk, hız ve bot ayarlarıyla koşmasıdır;
 * burada yalnız maç sonrası bekleme ayarlanır.
 */
export const OTOPILOT = {
  /** Maç bitince yeni maç kurulana kadar beklenen saniye (karne ekranı hiç açılmaz). */
  yenidenBasla: 2,
};

/**
 * **"İbo" gösteri sahnesi** (yalnız web, `?gosteri=ibo`; bkz. src/gosteri-ibo.js): komik short için sahnelenmiş
 * tek bir düşüş. Bir maç değildir: saniyeleri bir ses kaydına kilitlidir, kamera serbesttir, ekranda altyazı durur.
 * Uzunluklar arena birimi, süreler saniye; konumlar merkez ile 1 numaralı iç halka plakasını birleştiren köşegen
 * eksen üstünde `r` (merkeze uzaklık) ve `yan` (eksenin sağına kayma) ile verilir.
 * - `tohum` dünyanın tohumu (sahne rastgelelik kullanmaz, yalnız createWorld istiyor), `derinlik` İbo'yu yakalayan
 *   alttaki plakanın yüksekliği — bu sahnenin tek sahneleme hamlesi: merkez plaka ayakta kalır, yalnız aşağıdadır.
 * - `ibo`: `baslangic` ilk durduğu uzaklık, `rampaBasi` rampanın gerisinde beklediği uzaklık (rampaya basmaz),
 *   `carpmaR` çarpmanın beklenen uzaklığı (tekrar kamerası için yedek), `sersem` sersem yürüyüşün girdi büyüklüğü,
 *   `sersemR` / `sersemYan` o yürüyüşün hedefi ve yalpası.
 * - `cokmeHizi` çöken plakanın ilk (aşağı) hızı: sıfırdan hızlansa üstündeki oyuncuyla birkaç kare birlikte iner.
 * - `savrulma` çöken plakanın İbo'ya verdiği atış: `hiz` yatay, `kalk` ilk yukarı atış (plakanın üstünden kurtulup
 *   boşluğa çıkması için şart — yoksa çöken plakaya hemen geri iner), `temizR` plakanın kenarını geçtiği uzaklık ve
 *   `dalis` orada verilen aşağı hız (çöken plakanın altından kayması). `sekme` çarpmanın onu havaya sektirmesi,
 *   `ikinciSavrulma` ikinci çöküşteki atış. Hepsi oyunun kendi `knock`undan geçer.
 * - Canlı düşüşte ağır çekim **yoktur**: sahne sesin saniyelerine kilitli (18,5 çöküş → 20,36 "yürüyor lan"),
 *   düşüşü yavaşlatmak ya düşüşü sığlaştırır ya da sekmeyi o saniyenin ötesine iter. Ağır çekim tekrarlardadır.
 * - `kayit` tekrar için kaydedilen aralık; `tekrar` iki tekrar açısı (`bas`/`bit` çarpma anına göre kayıttan
 *   oynatılan aralık, `kamera` çarpma noktasına göre kameranın yeri, `fov` görüş açısı).
 * - `kamera`: `takip` bakışın İbo'ya oturma hızı (1/sn), `titresim` elde çekim nefesi, `sarsinma` çöküş/çarpma
 *   sarsıntısının büyüklüğü, `sarsinmaSonum` sönme hızı (1/sn).
 */
export const GOSTERI_IBO = {
  tohum: 2266,
  derinlik: -14.7,
  ibo: { baslangic: 26, rampaBasi: 20.6, carpmaR: 4.7, sersem: 0.24, sersemR: 4.6, sersemYan: 2.2 },
  cokmeHizi: -6,
  savrulma: { hiz: 15.2, kalk: 4.5, temizR: 16.5, dalis: -10 },
  sekme: { hiz: 2.5, kalk: 8 },
  ikinciSavrulma: { hiz: 9, dikey: 5 },
  kayit: { bas: 18.3, bit: 21.6 },
  kamera: { takip: 7, titresim: 0.012, sarsinma: 0.055, sarsinmaSonum: 6 },
  tekrar: {
    bir: { bas: -0.3, bit: 0.5, fov: 50, kamera: { r: 11, yan: 7, y: 7 } },
    iki: { bas: -0.08, bit: 0.9, fov: 48, kamera: { r: -3, yan: -7, y: 0.8 } },
  },
};

export const GOSTERI = {
  kip: 5, zorluk: 'hard', hiz: 1.5, geriSayim: 0.5, yenidenBasla: 1.5, yayilma: 3.2, enFazlaAdim: 12, can: 12,
  bot: { think: 0.18, thinkJitter: 0.12, range: 7, close: 3, strafe: 0.8, edge: 1.2, fireEvery: 0.45, fireJitter: 0.4, aimError: 0.06, heavyChance: 0.2, dodgeChance: 0.35, crossChance: 0.7, stay: 1.5, spawnWait: 0 },
  kamera: { tara: 0.6, tut: 3.5, ustunluk: 1.35, yumusatma: 3.5, donme: 4, kes: 26, egim: -0.1, geri: 2.5, bosluk: -1.5, dususTut: 0.35, enAlcak: -2, cevre: 14, dost: 0.35, uzakRakip: 2, disk: 0.25, savrulma: 1.5, ucus: 0.8, sarj: 0.3, dusme: 0.4 },
};
