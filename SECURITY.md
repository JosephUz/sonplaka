# Güvenlik

Son Plaka çevrim içi odaları olan bir oyun. Bulduğun bir açık başka oyuncuları ya da sunucuyu etkileyebilir.

## Açık bildirme

Lütfen güvenlik açıklarını herkese açık issue olarak açma. GitHub'da bu deponun **Security → Report a vulnerability** sayfasından ya da Instagram'da [@josephuz.ju](https://www.instagram.com/josephuz.ju/) hesabına özel mesajla bildir.

Bildirimde şunlar yardımcı olur: açığın ne olduğu ve nerede (dosya, mesaj türü), nasıl tekrarlanacağı ve etkisi.

Canlı sunucuda deneme yaparken başka oyuncuların oyununa zarar verme. Mümkünse kendi yerel sunucunda (`npm start`) dene.

## Kapsam

- **Kapsamda:** `server.mjs`, `server/` ve `src/` altındaki oyun kodu; sonplaka.josephuz.com ve sonplaka-sunucu.josephuz.com.
- **Kapsam dışı:** Cloudflare altyapısının kendisi; hizmeti yalnız yük bindirerek düşürme (DoS) denemeleri.

> **In English:** Please do not report vulnerabilities in public issues. Use **Security → Report a vulnerability** on this repository, or send a private message to [@josephuz.ju](https://www.instagram.com/josephuz.ju/) on Instagram.
