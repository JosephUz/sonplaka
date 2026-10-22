import { t } from './dil.js';

/**
 * Arayüzdeki ad ve etiketler etkin dilde (bkz. src/dil.js, src/diller/). config.js sunucuyla ortak olduğu için
 * kullanıcıya görünen adlar orada değil burada durur. Anahtarlar açıkça yazılır (npm run dil hepsini denetler).
 */
const TAKIM = ['takim.0', 'takim.1', 'takim.2', 'takim.3', 'takim.4'];
const ZORLUK = { easy: 'zorluk.easy', normal: 'zorluk.normal', hard: 'zorluk.hard' };
const ZORLUK_KUCUK = { easy: 'oda.zorluk.easy', normal: 'oda.zorluk.normal', hard: 'oda.zorluk.hard' };

/** Takım adı: MAVİ, TURUNCU, YEŞİL, MOR, PEMBE (sıra TEAMS.colors ile aynı). */
export const takimAdi = i => t(TAKIM[i]);
/** Kip etiketi: herkes tek ya da 2v2 … 5v5. */
export const kipAdi = n => (n === 1 ? t('kip.herkesTek') : `${n}v${n}`);
/** Bot zorluğu, büyük harf: KOLAY / NORMAL / ZOR. */
export const zorlukAdi = d => t(ZORLUK[d] || ZORLUK.normal);
/** Bot zorluğu, ilk harfi büyük (oda özeti): Kolay / Normal / Zor. */
export const zorlukKucuk = d => t(ZORLUK_KUCUK[d] || ZORLUK_KUCUK.normal);
