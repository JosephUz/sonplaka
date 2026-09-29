# Son Plaka

Three.js ile tarayıcıda çalışan, birinci şahıs **5v5 disk arenası + daralan boşluk**. Boşlukta asılı 13 plaka raund
boyunca dıştan içe düşer; diskle rakibi kenardan aşağı atarsın, zıplama plakalarıyla içeri kaçarsın. Can yok, mermi yok.
Bir insan ve dört takım botu, beş rakip bota karşı; webde **çok oyunculu** (oda, on koltuk, boş koltukta bot).
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
`docker compose --profile tunnel up -d --build`. Tünel konteyneri oyunun ağ alanını paylaşır; Zero Trust → Networks →
Tunnels → tünel → **Published application routes** içindeki rota `sonplaka-sunucu.josephuz.com` → `http://localhost:5187`.

**Testler**: `npm test` kural ve oda testlerini (Node, tarayıcısız) koşar. Tarayıcı dumanı testi çalışan sunucuya bağlanır:
`npm run test:browser`. Playwright projeye kuruludur; ilk kez `npx playwright install chromium` ile kendi başsız
Chromium'unu indirir (kullanıcının Chrome'una ve faresine dokunmaz). Ekran görüntüleri `artifacts/`.

## Kurallar

- **Disk** (sol tık): elde 3, 1,5 sn'de bir yenilenir. Görünmez sınırdan 3 kez seker. İsabet hasar vermez:
  vurulan disk yönünde savrulur ve havalanır; kenara yakın olan boşluğa düşer.
- **Ağır disk**: sol tık 1,5 sn basılı (nişangahta halka dolar, turuncuya döner), bırakınca çıkar. Yavaş, parlak;
  değdiğini çok daha sert savurur. Hiçbir disk elemez: eleme yalnız boşluğa düşmekle olur.
- **Levye** (sağ tık / F): yakın ve önündeki rakibi uzağa iter.
- **Zıplama** (Boşluk): havada bir kez daha. Uçuşta ve savrulurken yön verilmez.
- **Rampalar**: plakalar arası tek geçiş; plaka kenarındaki rampaya koş, okun gösterdiği plakaya uçarsın. Rampa hiç kapanmaz.
- **Hızlı koşu** (Shift; telefonda joystick sonuna kadar): 1,45 kat hız.
- **Daralma**: 40. sn dış halka düşer, **doğuş kapanır**; 80. sn iç halka; 100-130. sn merkez küçülür; 145. sn merkez düşer.
  Düşmeden 5 sn önce plaka titrer ve ekranda uyarı çıkar.
- **Raund**: doğuş kapandıktan sonra bir takımın kimsesi kalmayınca biter. 3 raund alan maçı kazanır. Elenen takım
  arkadaşını izler. Doğuş açıkken düşen 4 sn sonra kendi dış plakasında doğar.
- **Güç diskleri**: merkezde ve iç halkada; üçlü (3 atış yelpaze) ve dondurucu (3 atış, 2 sn donma).

Maç sonunda karne: düşürme, düşme, isabet, atış, güç diski, zıplama plakası.

## Kısayollar

| Tuş | İşlev |
|---|---|
| WASD / oklar | Bakışa göre hareket |
| Fare | Bak / nişan (birinci şahıs) |
| Sol tık | Disk; 1,5 sn tut: ağır disk |
| Sağ tık / F | Levye |
| Shift | Hızlı koş |
| Boşluk | Zıpla, havada tekrar |
| V | Kamera: birinci şahıs ↔ omuz |
| F1 / Esc | Nasıl oynanır / mola |

## Telefon

Dokunmatik ekran algılanınca (masaüstünde `?touch`) omuz kamerasıyla başlar; sol yarıda joystick, sağ yarıda parmak
kaydırarak bakış, sağ altta **AT** (basılı tut: ağır), **LEVYE**, **ZIPLA**. Ekran yataydır.

## Çok oyunculu

Giriş ekranında ad yazılır, **Oda kur** ya da **Odaya katıl** (kod ya da `?oda=KOD` linki). Lobide iki takımın beşer
koltuğu vardır; herkes boş koltuğa oturur, yönetici oyuncuları taşır. Maçı sunucu koşturur (`server/rooms.mjs`,
tarayıcıdakiyle aynı `src/world.js`), sayfa girdiyi (hareket, bakış, basışlar) yollar, gelen durumu ara değerle çizer ve
kendi oyuncunu gecikmesiz göstermek için yerel girdiden kısa bir öne kayma ekler (`src/net/`). Kopan oyuncunun
koltuğunu bot oynar, aynı sekmeyle geri dönünce yerine oturur. Sunucu kapalıysa oda düğmeleri **Yakında** olur.
Android uygulamasında çok oyunculu kapalıdır (`src/config.js` → `ONLINE`).

## Dosyalar

Dosya düzeni Yakar Gol ile aynıdır: kökte `index.html`, `style.css`, `game.js` (giriş noktası) ve `server.mjs`; sunucu
odaları `server/`, oyun kodu `src/` altındadır. three.js npm paketinden `/vendor/` yolundan sunulur.

| Dosya | İçerik |
|---|---|
| `src/config.js` | Bütün ayar sayıları (arena, raund takvimi, disk, levye, bot, kamera) |
| `src/arena.js` | Plakalar, kolonlar, zıplama plakaları, güç diski noktaları (paylaşımlı geometri) |
| `src/world.js` | Simülasyon: raund akışı, plaka çöküşü, fizik, diskler, eleme |
| `src/actions.js` | Zıplama, disk, levye, savurma, güç diski |
| `src/ai.js` | Bot kararları ve plakalar arası yol |
| `src/net/` | Protokol, durum paketi, istemci |
| `src/view/` | Sahne, arena görünümü, oyuncular, diskler, efektler, kamera |
| `src/ui.js`, `src/input.js`, `src/touch.js`, `src/lobby.js` | Arayüz, klavye / fare, dokunmatik, lobi |
| `tests/` | Kural testleri, oda testleri, tarayıcı dumanı |
