# Son Plaka

Ricochet'nin (Valve, 2000) disk arenası ile battle royale'in daralan alanı birleşir; ama alan iki boyutlu bir çember değil, **ayağının altındaki plakaların kendisidir**: boşlukta asılı 13 yuvarlak plaka maç boyunca dıştan içe teker teker düşer. Can barı yok, mermi yok. Rakibi vurmazsın, **kenardan aşağı atarsın**. Dış halkalar ayaktayken düşme hakkı sınırsız; son plakada doğuş kapanır ve süre bitince orada ayakta kalan kazanır.

Kipler: **herkes tek** (5 oyuncu, herkes ayrı takım), **2v2**, **3v3**, **4v4**, **5v5**. Tek başına oyunda sen ve botlar; çevrim içinde aynı kipler (koltuk sayısı kipe göre, boş koltuklar bot; insanlar aynı takımdaysa co-op, karşı takıma geçince PvP). Masaüstünde birinci şahıs, telefonda omuz üstü kamera.

## Arena

Merkez plaka (yarıçap 10) + iç halka (4 plaka, yarıçap 7) + dış halka (8 plaka, yarıçap 6). Kolon yok: siper yok, sürekli hareket. Dış halka takımlara ardışık dilimler hâlinde doğuş plakası olarak paylaştırılır (iki takım: 4'er; herkes tek: 2-2-1-2-1). Plakalar arası tek geçiş **rampalar** (zıplama plakaları): plaka kenarındaki rampaya basan karşı plakanın kenarından içeriye uçar (uçuşta yön verilmez, disk atılabilir). 40 zıplama plakası: dış halka komşuları, dış ↔ iç, iç ↔ merkez. Görünmez silindir sınır diskleri sektirir.

## Eylemler

- **Disk** (sol tık): elde en çok 5, 1,5 saniyede bir yenilenir. Düz uçar, 3 kez seker, 4 saniye yaşar. İsabet hasar vermez: vurulan disk yönünde savrulur, havalanır, yarım saniye kontrolsüzdür. Kenara yakın olan boşluğa gider.
- **Ağır disk** (sol tık 1,5 sn basılı): yavaş ve parlak, herkes görür; değdiğini çok daha sert savurur. Hiçbir disk elemez, eleme yalnız düşmeyle.
- **Levye** (sağ tık / F): bakış konisindeki yakın rakibi kendinden uzağa savurur. Kenar düellosunun silahı.
- **Zıplama** (Boşluk): çift zıplama. Havada vurulursan düşersin.
- **Hızlı koşu** (Shift): 1,45 kat hız; rampaya yetişmek ve diskten kaçmak için. Rampalar hiç kapanmaz.

## Daralma

Oyun saatine göre: 35. saniyede dış halka titrer, 40. saniyede düşer; 75-80. saniyede iç halka ve **doğuş kapanır**; 100. saniyeden sonra merkez plaka 30 saniyede yarıçap 5,5'e küçülür ve orada durur — itiş sürsün diye daha fazla daralmaz. **Merkez plaka hiç düşmez**: 145. saniyede süre biter ve maç o an son plakada kimler kaldıysa onlarla biter. Düşen plakanın üstündeki onunla gider.

## Doğuş, son plaka ve kazanan

Herkesin **5 düşme hakkı** vardır. Dış ve iç halka ayaktayken düşen 4 saniye sonra ayakta bir plakada doğar (kendi takımının dış plakası; düştüyse iç halka); beşinci düşüşte doğuş açık olsa da elenir, hakkı biten sayılmaz. Yeni doğan 2 saniye korunur: disk ve levye ona işlemez, botlar onu hedef almaz; ilk atışı ya da levyesi korumayı bitirir. Düşen oyuncuya son 4 saniyede vuran rakip "düşürme" alır ve takımına 1 puan yazılır. İç halka düşünce **son plaka** evresi: yalnız merkez kalır, doğuş kapanır, elenen elenir. Rakip takımların kimsesi kalmayınca (ayakta ya da doğmayı bekleyen) ayakta kalan takım hemen kazanır.

**Süre bitince son plakada kalan kazanır**: merkez düşmez, 145. saniyede maç biter ve o an merkezde ayakta kalanlara bakılır — ayakta oyuncusu en çok olan takım kazanır; eşitse düşürme puanı çok olan; o da eşitse berabere. Herkes tek kipinde merkezde kalan tek kişi kazanır, birden fazla kişi kaldıysa aralarında en çok düşüren. Son evre boyunca ekranda kalan süre ve "SÜRE BİTİNCE SON PLAKADA KALAN KAZANIR" yazısı durur. Elenen, maç bitene kadar takım arkadaşını izler.

## Güç diskleri

Merkez plakada ve iç halka plakalarında doğar, alınınca 20 saniye sonra sıradaki tür gelir: **üçlü** (3 atış yelpaze) ve **dondurucu** (3 atış; vurulan 2 saniye donar, itilirse kayar).

## Botlar

Her 0,3 saniyede plan: plakası titriyorsa içeri götüren zıplama plakasına kaçar; plakasında güç diski varsa alır; rakiple aynı plakadaysa mesafeyi koruyup yanlara kayarak atar ve yakınsa levye sallar; rakip başka plakadaysa menzildeyse çoğunlukla yerinde kalıp uzaktan atar, değilse zıplama plakalarıyla ona ya da merkeze gider (genişlik öncelikli yol; kapalı ve düşmüş plakalar yok). **Son plaka evresinde** (doğuş kapalı, süre bitince orada kalan kazanır) merkezde değilse oraya gider, merkezdeyse geri açılmaz: rakibin üstüne gidip kenara doğru iter. Levye diski beklemez, menzile giren rakibe her zaman sallanır. Yaklaşan diski görünce zıplayarak kaçınır. Ara sıra ağır disk hazırlar. Doğduktan sonra bir süre atmaz, korumalı rakibi hedef almaz.

**Zorluk** (giriş ekranında Kolay / Normal / Zor; odada yönetici seçer, iki takımın botları için): Zor = yukarıdaki değerler (0,3 sn plan, 0,7 sn'de bir atış, küçük nişan sapması, diskten yarı yarıya kaçış, doğunca 1,5 sn bekleme). Normal 0,55 sn plan, 1,3 sn'de bir atış, daha büyük sapma, %30 kaçış, 2,5 sn bekleme. Kolay 0,9 sn plan, 2,2 sn'de bir atış, büyük sapma, %12 kaçış, 3,5 sn bekleme; hedefin hızını daha az önden alır.

## Sonraki adımlar

Mıknatıs ve bumerang diskleri, uzun zıplama modülü, ikinci harita, Android uygulaması (Capacitor boru hattı Yakar Gol'den taşınır), josephuz.com'a oyun kartı.
