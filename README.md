# Son Plaka

> **EN:** A first-person disc arena over a shrinking void, in the browser (Three.js): knock rivals off the falling plates and be the last one standing; free-for-all or team modes, with bots or online.
>
> **TR:** Tarayıcıda (Three.js) birinci şahıs disk arenası, daralan boşluk: rakibi düşen plakalardan at, son plakada ayakta kal; herkes tek ya da takımlı, botlarla ya da çevrim içi.

**Play / Oyna:** https://sonplaka.josephuz.com · **Source / Kaynak:** https://github.com/JosephUz/sonplaka

Three.js ile tarayıcıda çalışan, birinci şahıs **disk arenası + daralan boşluk**. Boşlukta asılı 13 plaka maç boyunca
dıştan içe düşer; diskle rakibi kenardan aşağı atarsın, rampalarla içeri kaçarsın. Can yok, mermi yok. Dış halkalar
ayaktayken düşme hakkı sınırsız; iç halka düşünce **son plaka**: doğuş kapanır ve süre bitince orada ayakta kalan kazanır.
Kipler **herkes tek** (5 kişi), **2v2 … 5v5**; boş yerleri botlar doldurur; webde **çok oyunculu** (oda, aynı kipler,
co-op ya da PvP).
Oyun fikri ve kurallar: [OYUN-FIKRI.md](OYUN-FIKRI.md).

## Başlatma

Docker Desktop açıkken `Baslat.cmd` dosyasına çift tıklayın: `docker compose up -d --build` ile konteyneri
(`sonplaka`, otomatik yeniden başlar, `/health` sağlık kontrolü) kaldırır ve http://localhost:5187 adresini açar. Docker yoksa
aynı dosya Node ile açar (`npm install` + `node server.mjs`). Kaynak değişince yalnızca `Baslat.cmd` (ya da
`docker compose up -d --build`) yeter; `docker compose down` kapatır, `docker compose logs -f` oda kayıtlarını izler.

Geliştirme için Docker'sız: `npm install` ve `npm start`, ardından http://127.0.0.1:5187 (önce aynı porttaki konteyneri durdur).
Port değiştirmek için `PORT=5188 docker compose up -d` ya da PowerShell'de `$env:PORT=5188; npm start`.
Sunucu oyun dosyalarını `no-store` ile verir; `/health` yanıtındaki `surum` alanı ayakta olan yapının damgasıdır.

**Yayın**: oyun dosyaları Cloudflare Worker'da statik site olarak durur (`npm run deploy:web`, `wrangler.jsonc` →
sonplaka.josephuz.com). Evdeki PC yalnızca çevrim içi sunucudur (WebSocket odaları, çevrim içi sayısı).

**Cloudflare Tunnel (sonplaka-sunucu.josephuz.com)**: `.env.example` dosyasını `.env` olarak kopyalayıp `TUNNEL_TOKEN=...` yaz ve
`docker compose --profile tunnel up -d --build` (`Baslat.cmd` `.env` doluysa bunu kendisi yapar). Tünel konteyneri oyunun ağ
alanını paylaşır, bu yüzden oyun konteyneri **profilsiz** `docker compose up -d --build` ile yenilenirse tünel silinen
konteynerin ağında kalır ve dış adres 530 verir: kaynak değişince hep profille kaldır; Zero Trust → Networks →
Tunnels → tünel → **Published application routes** içindeki rota `sonplaka-sunucu.josephuz.com` → `http://localhost:5187`.

**Testler**: `npm test` kural, oda ve görünür alan testlerini (Node, tarayıcısız) koşar. Tarayıcı dumanı testi çalışan
sunucuya bağlanır: `npm run test:browser`. Telefon görünümü (ana ekran + oda kurulmuş lobi, iki çubuk senaryosu ve
yakınlaştırma): `npm run test:mobil`. Gösteri kipi için `node tests/gosteri-smoke.mjs`. Oyun içi müzik için
`npm run test:muzik` (`?muzik=1` ile; `audio.currentTime` / `paused` ölçülür, tarayıcı sesi kısık). Playwright
projeye kuruludur; ilk kez `npx playwright install chromium` ile kendi başsız Chromium'unu indirir (kullanıcının
Chrome'una ve faresine dokunmaz). Ekran görüntüleri `artifacts/`.

**Telefonda üst kısım**: oyun kökü `src/gorunur-alan.js` ile tarayıcının **gerçekten görünen** alanına kilitlenir
(`--vv-h` / `--vv-top`, style.css → `html.vv`), böylece üst çubuk ve oda kodu tarayıcı çubuğunun altında kalmaz. Üç
ayrı durum var ve her birini farklı parça çözer: çubuk görünümü kısaltıyorsa `--vv-h` (mobilde `100vh` çubuksuz
görünümdür, gerçek alandan uzundur), sayfa kaymışsa (iOS) `basaAl()`, görünür alan düzen görünümünün içinde aşağı
inmişse (iOS çubuk geri gelirken, klavye) `--vv-top`. Ayrıntı ve sınırlar dosyanın başındaki açıklamada.
**Yakınlaştırmada kilit kapanır**: kullanıcı yakınlaştırdığı yeri kaybetmesin diye CSS yedeğine (`100dvh`) dönülür.

## Müzik ve standart araç çubuğu

**Şu an oyunda müzik yok** (4 Ekim 2026, Yusuf: "diğer oyunlardaki müzikleri şimdilik kaldıralım"). Sakin sürümler
birbirine çok benzer ve temasız bulundu; bütün parçalar `muzik/archive/` altında saklanıyor (silinmedi, bkz.
`muzik/archive/NOT.txt`), yayına ve uygulamaya girmez. `src/muzik.js` içindeki `SAHNELER` listeleri boş: hiçbir dosya
istenmez, hiçbir şey çalmaz, Müzik düğmeleri (üst çubuk ve mola menüsü) gizlenir (`MUZIK_VAR` / `muzik.parcaVar`).
Müzik testlerinin parça gerektiren bölümleri "müzik yok: atlandı" diye atlanır. Yeni parçalar `muzik/` altına konup
`SAHNELER`'e yazılınca düğmeler ve testler kendiliğinden geri gelir. Aşağısı eski (ve yeniden kurulacak) düzendir.

Oyun içi müzik `muzik/` altındaki parçalardır (kendi bestemiz; 128 kbps, ~2 MB, lisans notu `muzik/LISANS.txt`).
Sahneyi `src/muzik.js` seçer, geçişler 1,8 saniye çapraz süzülmedir; dosyalar gerektiğinde iner (menüde yalnız sakin
parça), yollar görelidir (Capacitor'da da çalışır, sonraki APK'ya kendiliğinden girer).

| Sahne | Parça (eski düzen, şu an arşivde) | Nerede |
| --- | --- | --- |
| sakin | `son-6-son-isik` · *Boşlukta* | Giriş ekranı, lobi, mola, maç sonu karnesi |
| mac | `son-5-sifir-yercekimi` · *Hızlı Aksiyon* | Maç sürerken (doğuş açık) |
| doruk | `son-4-yorunge` · *Son Plaka Düşüyor* ↔ *Hızlı Aksiyon* | Son plaka evresi: iç halka düştü, doğuş kapandı (`respawnOpen` false); parça bitince sırayla |

Müzik ses düzeyi efektlerin altındadır (varsayılan %35). Açık / kapalı ve düzey tarayıcıda saklanır (`sp.muzik`,
`sp.muzik.ses`); efekt sesinden (`sp.sound`) **bağımsızdır**. Müzik ilk kullanıcı dokunuşundan sonra başlar, sekme
gizlenince durur. Gösteri kiplerinde (`?gosteri=...`) ve otomatik tarayıcılarda hiç `<audio>` kurulmaz — video betiği
müziğini kendi ekler; `?muzik=1` müziği elle açar (testler bunu kullanır), `?muzik=0` kapatır.

Düzeyi normalde `<audio>.volume` verir. **iOS Safari'de `volume` salt okunurdur** (atama yutulur, değer 1 kalır):
orada varsayılan %35, sürgü ve çapraz geçiş çalışmaz, müzik efektlerin üstüne çıkardı. Bu yüzden `src/muzik.js`
ilk parçada düzeyin gerçekten uygulanıp uygulanmadığını **ölçer** (`yolSec`); uygulanmıyorsa parçaları Web Audio'ya
bağlayıp düzeyi kazançla verir (`MediaElementSource → GainNode → çıkış`, `durum().sesYolu` `'oge'` / `'gain'`).
Masaüstü ve Android'de Web Audio hiç kurulmaz. Sürgü dibe çekilince sessizlik **duraklatmayla** sağlanır (parça
kaldığı yerde bekler), böylece düzeyi hiç uygulayamayan bir tarayıcıda da gerçekten susar.

**Arka plandan dönüş.** Sekme gizlenince süren çapraz geçişler o anda bitirilir ve **çalan her parça** duraklatılır
(yalnız aktif olan değil: geçişin ortasında gizlenen sayfada susmakta olan parça arka planda çalmayı sürdürüyordu,
üstelik `setInterval` arka planda yavaşladığı için uzun süre). iOS arka planda ayrıca Web Audio bağlamını `suspended`
ya da `interrupted` bırakır ve öğeyi duraklatır; bunlar yalnız **gerçek bir kullanıcı hareketinin içinden** onarılabilir
(`visibilitychange` içinden yapılan `resume()` sayılmaz). Bu yüzden dokunuş dinleyicisi ilk dokunuştan sonra da
çalışır: her dokunuşta bağlam `running` değilse sürdürülür ve beklenmedik şekilde duraklamış parça yeniden başlatılır.

**Standart üst araç çubuğu** (bütün JosephUz oyunlarında aynı sıra ve aynı yazılar):
`← josephuz.com` · `Ses: açık/kapalı` · `Müzik: açık/kapalı` · `Kontroller F1`. Oyuna özgü düğmeler (`Duraklat Esc`,
`🎥 Kamera`) bu dörtlünün ardına gelir. Telefonda düğmeler simgeye döner; maç sırasında müzik düğmesi çubuktan
çekilir (skor tabelasına yer açılsın diye) ve ☰ duraklatma menüsünden açılıp kapatılır.

**Standart duraklatma (Esc) menüsü**: `DEVAM ET →` · `Kontroller F1` · `Ses: …` · `Müzik: …` (altında müzik ses
sürgüsü) · `Yeniden başlat` (çevrimdışı) · `Ana menü` / çevrim içinde `Odadan çık` · `josephuz.com'a dön`.

## Kurallar

- **Disk** (sol tık): tek saldırı (levye yok). Elde 5, her saniye bir disk yenilenir. Görünmez sınırdan 3 kez seker. İsabet hasar vermez:
  vurulan disk yönünde savrulur ve havalanır; kenara yakın olan boşluğa düşer.
- **Ağır disk**: sol tık 1,5 sn basılı (nişangahta halka dolar, turuncuya döner), bırakınca çıkar. Yavaş, parlak;
  değdiğini çok daha sert savurur. Hiçbir disk elemez: eleme yalnız boşluğa düşmekle olur.
- **Zıplama** (Boşluk): havada bir kez daha. Uçuşta ve savrulurken yön verilmez.
- **Rampalar**: plakalar arası tek geçiş; plaka kenarındaki rampaya koş, okun gösterdiği plakaya uçarsın. Rampa hiç kapanmaz.
- **Hızlı koşu** (Shift; telefonda joystick sonuna kadar): 1,45 kat hız.
- **Daralma**: 40. sn dış halka düşer; 80. sn iç halka (**doğuş kapanır**); 100-130. sn merkez yarıçap 10'dan 5,5'e
  küçülür ve orada durur — itiş sürsün diye daha fazla daralmaz. **Merkez plaka hiç düşmez**; 145. sn süre biter.
  Düşmeden 5 sn önce plaka titrer, kenarı kırmızı yanıp söner ve ekranda uyarı çıkar. Diskle vurulunca ekran kenarı
  kırmızı parlar ve vuranın adı çıkar.
- **Isınma**: dış halka düşene kadar (40. sn) düşmek hak götürmez, yalnız doğuş beklenir; kendi kendine düşmek
  rakibe puan yazmaz (yalnız son 4 sn içinde vuran rakip düşürmüş sayılır, `CREDIT`).
- **Düşme hakkı ve koruma**: ısınmadan sonra herkesin **5 düşme hakkı** var (`LIFE.lives`); beşinci düşüşte doğuş açık olsa da elenir,
  hakkı biten sayılmaz (bir takımın herkesinin hakkı biterse maç biter). Yeni doğan 2 sn korunur (`LIFE.shield`):
  disk işlemez, botlar hedef almaz; ilk atış korumayı bitirir. Botlar doğduktan sonra bir süre atmaz.
- **Bot zorluğu** (giriş ekranında Kolay / Normal / Zor, odada kuran seçer; `BOT_LEVELS`): Zor = hızlı tepki, isabetli
  nişan; Normal ve Kolay daha seyrek plan yapar, daha seyrek ve sapmalı atar, diskten daha az kaçar, doğunca daha uzun bekler.
- **Doğuş ve kazanan**: dış ve iç halka ayaktayken düşen 4 sn sonra ayakta bir plakada doğar (kendi dış plakası;
  düştüyse iç halka). İç halka düşünce yalnız merkez kalır ve doğuş kapanır: rakip takımların kimsesi kalmayınca
  ayakta kalan takım hemen kazanır. **145. sn süre bitince son plakada (merkezde) ayakta kalan kazanır**: ayakta
  oyuncusu en çok olan takım, eşitse en çok düşüren (`score`), o da eşitse berabere; herkes tek kipinde merkezde
  kalan tek kişi, birden fazlaysa en çok düşüren. Son evre boyunca ekranda kalan süre ve "SÜRE BİTİNCE SON PLAKADA
  KALAN KAZANIR" şeridi durur. Düşen, doğana (ya da maç bitene) kadar düşüşünü ve takım arkadaşını izler.
- **Kipler** (giriş ekranında seçilir, hatırlanır): **herkes tek** (5 oyuncu, herkes ayrı takım), **2v2**, **3v3**,
  **4v4**, **5v5**. Boş yerler bot.
- **Güç diskleri**: merkezde ve iç halkada; üçlü (3 atış yelpaze) ve dondurucu (3 atış, 2 sn donma).

Maç sonunda karne: düşürme, düşme, isabet, atış, güç diski, zıplama plakası.

## Kısayollar

| Tuş | İşlev |
|---|---|
| WASD / oklar | Bakışa göre hareket |
| Fare | Bak / nişan (birinci şahıs) |
| Sol tık | Disk; 1,5 sn tut: ağır disk |
| Shift | Hızlı koş |
| Boşluk | Zıpla, havada tekrar |
| V | Kamera: birinci şahıs ↔ omuz |
| F1 / Esc | Kontroller / mola |

## Telefon

Dokunmatik ekran algılanınca (masaüstünde `?touch`) omuz kamerasıyla başlar; sol yarıda joystick, sağ yarıda parmak
kaydırarak bakış, sağ altta **AT** (basılı tut: ağır) ve **ZIPLA**. Ekran yataydır.

## Çok oyunculu

Oda akışı bütün josephuz oyunlarında aynıdır (`josephuz/docs/oda-standardi.md`). Giriş ekranı sırası: **ADIN**, tek
başına seçimleri (kip, bot zorluğu) ve **TEK BAŞINA ↗**, sonra **ÇEVRİM İÇİ** (`● N çevrim içi`): **HIZLI KATIL →**,
**ODA KUR**, **ODAYA KATIL** (kod kutusu + **KATIL**; `KPRT4` yazılırsa `KPRT-4` olur), durum satırı ve **AÇIK ODALAR**
listesi (kuranın adı, `5v5 · Bot Normal · 2/10 oyuncu`, LOBİDE / MAÇTA, **KATIL →** ya da **DOLU**). Liste odada
değilken sunucudan değiştikçe gelir. **ODA KUR** ana ekrandaki kip ve zorlukla hemen herkese açık oda kurar; **HIZLI
KATIL** boş koltuklu açık odaya (önce lobidekiler, sonra insanı çok olan; maçtaki oda da olur) oturtur, yoksa aynı
ayarlarla açık oda kurar. Davet linki `?oda=KOD` açılınca odaya kendiliğinden girilir; odadayken adres çubuğunda
`?oda=KOD` durur, çıkınca silinir; sayfa yenilenirse aynı koltuğa dönülür.

Bekleme odasında `ODA · <özet>`, kod, **Linki kopyala**, görünürlük (`AÇIK ODA · listede görünür` / `ÖZEL ODA · yalnız
kodla`), takım sütunları (herkes tek: 5 tekil koltuk; 2v2 … 5v5: iki takım sütunu) ve `N insan · M bot` durur. Kuran
**KAÇA KAÇ**, **BOT** ve **ODA: Herkese açık / Özel** ayarlarını değiştirir (özel oda listede ve hızlı katılımda çıkmaz),
oyuncuları sürükleyip taşır ve **MAÇI BAŞLAT ↗** der; ötekiler `Kuranın başlatması bekleniyor` görür. Herkes boş
koltuğa (`Bot · boş koltuk` → `Buraya otur`) oturur: bütün insanlar aynı takımdaysa **co-op** (rakipler bot), karşı
takımdaki boş koltuğa geçen olursa **PvP**. Kuran çıkarsa kuranlık sıradaki insana geçer. Maç sürerken gelen doğrudan
maça girer (bir botun koltuğunu alır); maçta Esc menüsünde **Odadan çık**, maç sonunda **LOBİYE DÖN**. Maçı sunucu koşturur (`server/rooms.mjs`,
tarayıcıdakiyle aynı `src/world.js`), sayfa girdiyi (hareket, bakış, basışlar) yollar, gelen durumu ara değerle çizer ve
kendi oyuncunu gecikmesiz göstermek için yerel girdiden kısa bir öne kayma ekler (`src/net/`). Kopan oyuncunun
koltuğunu bot oynar, aynı sekmeyle geri dönünce yerine oturur. Sunucu kapalıysa oda düğmeleri **YAKINDA** olur, açık odalar gizlenir.
Android uygulamasında çok oyunculu kapalıdır (`src/config.js` → `ONLINE`).

## Dosyalar

Dosya düzeni Yakar Gol ile aynıdır: kökte `index.html`, `style.css`, `game.js` (giriş noktası) ve `server.mjs`; sunucu
odaları `server/`, oyun kodu `src/` altındadır. three.js npm paketinden `/vendor/` yolundan sunulur.

| Dosya | İçerik |
|---|---|
| `src/config.js` | Bütün ayar sayıları (arena, maç takvimi ve kipler, disk, bot, kamera) |
| `src/arena.js` | Plakalar, kolonlar, zıplama plakaları, güç diski noktaları (paylaşımlı geometri) |
| `src/world.js` | Simülasyon: kipler, maç akışı, plaka çöküşü, fizik, diskler, düşme ve doğuş, son plaka ve kazanan |
| `src/actions.js` | Zıplama, disk, savurma, güç diski |
| `src/ai.js` | Bot kararları ve plakalar arası yol |
| `src/net/` | Protokol, durum paketi, istemci |
| `src/view/` | Sahne, arena görünümü, oyuncular, diskler, efektler, kamera |
| `src/ui.js`, `src/input.js`, `src/touch.js`, `src/lobby.js` | Arayüz, klavye / fare, dokunmatik, lobi |
| `src/muzik.js`, `muzik/` | Oyun içi müzik: sahne seçimi, çapraz geçiş (şu an parça yok; eskiler `muzik/archive/`) ve lisans notu |
| `tests/` | Kural testleri, oda testleri, tarayıcı dumanı |
| `tests/muzik.test.mjs`, `tests/muzik-smoke.mjs` | Müzik ve standart araç çubuğu testleri (tarayıcısız kural testi; tarayıcıda ölçüm) |

## Lisans / License

- **Kod:** [MIT](LICENSE), Copyright (c) 2026 JosephUz. Kodu kullanabilir, değiştirebilir, dağıtabilirsin.
- **MIT dışında, tüm hakları saklıdır:** "Son Plaka" ve "JosephUz" adları; `muzik/` altındaki müzikler. Ayrıntı: [TRADEMARKS.md](TRADEMARKS.md). Müzik için `muzik/LISANS.txt`.
- **Fork'lar** başka bir ad ve logo kullanmalı, resmî sürüm olduğunu ima etmemeli.
- **Üçüncü taraf:** [three.js](https://github.com/mrdoob/three.js) ve [ws](https://github.com/websockets/ws) npm bağımlılığıdır (ikisi de MIT), depoda değil, kendi lisanslarıyla gelir. Müziklerdeki enstrüman örnekleri VSCO 2 Community Edition (CC0).

> **In English:** The code is licensed under [MIT](LICENSE). The name "Son Plaka", the name "JosephUz", the music in `muzik/` are **not** covered by MIT and are all rights reserved; see [TRADEMARKS.md](TRADEMARKS.md). Forks must use a different name and logo.

## Katkı / Contributing

Hata bildirimi, öneri ve pull request'e açığız. Büyük bir değişiklikten önce bir [issue](https://github.com/JosephUz/sonplaka/issues) açıp konuşalım; oyunun dengesi ve yönü JosephUz'da. Kod ve oyun Türkçe: değişken, işlev ve mesaj adları Türkçe, çevresindeki kodun düzenine uy; `npm test` geçmeli. Gönderdiğin katkı bu deponun MIT lisansıyla yayımlanır. Müzik, ses ya da görsel eklemeden önce issue'da sor. Güvenlik açıklarını issue yerine [SECURITY.md](SECURITY.md)'deki yoldan bildir.

> **In English:** Issues and pull requests are welcome; please open an issue before large changes. Contributions are accepted under the MIT license of this repository. Report security issues privately as described in [SECURITY.md](SECURITY.md).
