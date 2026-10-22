// JosephUz dil standardı (josephuz/docs/dil-standardi.md): Türkçe + İngilizce. Bu dosya bütün oyunlarda AYNIDIR;
// oyun yalnız kendi sözlüklerini (src/diller/tr.js, en.js) yazar. Değiştirirsen josephuz/docs/dil/dil.js'i de güncelle.
//
// Seçim sırası: adres (?dil=en / ?lang=en) → ortak çerez (josephuz_dil, .josephuz.com: bir oyunda seçilen dil
// bütün josephuz.com oyunlarında geçerli) → bu sitenin localStorage'ı (itch.io, Android uygulaması) → tarayıcı dili
// (tr ise Türkçe, değilse İngilizce).
import tr from './diller/tr.js';
import en from './diller/en.js';

export const DILLER = { tr, en };
const ANAHTAR = 'josephuz_dil', gecerli = d => (d === 'tr' || d === 'en' ? d : null);

function cerezOku() { try { return gecerli(/(?:^|;\s*)josephuz_dil=(tr|en)/.exec(document.cookie)?.[1]); } catch { return null; } }
function seciliDil() {
  try { const q = new URLSearchParams(location.search); const d = gecerli(q.get('dil') ?? q.get('lang')); if (d) return d; } catch {}
  const c = cerezOku(); if (c) return c;
  try { const s = gecerli(localStorage.getItem(ANAHTAR)); if (s) return s; } catch {}
  return /^tr\b/i.test(navigator.language || '') ? 'tr' : 'en';
}

/** Etkin dil: 'tr' | 'en'. Sayfa açılışında bir kez belirlenir; değiştirmek sayfayı yeniden yükler. */
export const DIL = seciliDil();
const sozluk = DILLER[DIL];

/**
 * Çeviri: t('ana.oyna') ya da t('skor.les', { n: 3 }). Metinde {n} gibi yer tutucular değiştirilir.
 * Değer işlevse (çoğul, cinsiyet gibi kurallar için) değişkenlerle çağrılır: n => n === 1 ? '1 kill' : `${n} kills`.
 * Etkin dilde anahtar yoksa Türkçesi, o da yoksa anahtarın kendisi döner (konsola bir kez uyarı).
 */
const eksikler = new Set();
export function t(anahtar, d = {}) {
  let v = sozluk[anahtar] ?? tr[anahtar];
  if (v === undefined) { if (!eksikler.has(anahtar)) { eksikler.add(anahtar); console.warn('[dil] eksik anahtar:', anahtar); } return anahtar; }
  if (typeof v === 'function') return String(v(d));
  return String(v).replace(/\{(\w+)\}/g, (m, k) => (k in d ? d[k] : m));
}

/** Sayı biçimi etkin dile göre (1.250 / 1,250). */
export const sayi = (n, s) => Number(n).toLocaleString(DIL === 'tr' ? 'tr-TR' : 'en-US', s);

/**
 * HTML'deki işaretli öğeleri çevirir (kök verilmezse bütün sayfa). İşaretler:
 *   data-i18n="anahtar"              → textContent
 *   data-i18n-html="anahtar"         → innerHTML (sözlükte <b>, <kbd>, <br> gibi biçim varsa)
 *   data-i18n-title / -placeholder / -aria-label / -content="anahtar" → ilgili öznitelik
 * Ayrıca <html lang> ve (sözlükte varsa) 'sayfa.baslik' → document.title, 'sayfa.aciklama' → meta description.
 */
export function dilUygula(kok = document) {
  for (const el of kok.querySelectorAll('[data-i18n]')) el.textContent = t(el.dataset.i18n);
  for (const el of kok.querySelectorAll('[data-i18n-html]')) el.innerHTML = t(el.dataset.i18nHtml);
  for (const ad of ['title', 'placeholder', 'aria-label', 'content'])
    for (const el of kok.querySelectorAll(`[data-i18n-${ad}]`)) el.setAttribute(ad, t(el.getAttribute(`data-i18n-${ad}`)));
  if (kok === document) {
    document.documentElement.lang = DIL;
    if (sozluk['sayfa.baslik'] ?? tr['sayfa.baslik']) document.title = t('sayfa.baslik');
    const m = document.querySelector('meta[name="description"]'); if (m && (sozluk['sayfa.aciklama'] ?? tr['sayfa.aciklama'])) m.content = t('sayfa.aciklama');
  }
}

/** Dili kaydeder (ortak çerez + localStorage) ve sayfayı yeniden yükler (adresteki ?dil= kaldırılır). */
export function dilSec(d) {
  if (!gecerli(d)) return;
  try { const h = location.hostname, alan = h === 'josephuz.com' || h.endsWith('.josephuz.com') ? '; domain=.josephuz.com' : ''; document.cookie = `${ANAHTAR}=${d}; path=/; max-age=31536000; SameSite=Lax${alan}`; } catch {}
  try { localStorage.setItem(ANAHTAR, d); } catch {}
  try { const u = new URL(location.href); u.searchParams.delete('dil'); u.searchParams.delete('lang'); location.replace(u.href); } catch { location.reload(); }
}

/**
 * Standart dil düğmesi: üst araç çubuğunun sonunda (Kontroller F1'den sonra), Esc menüsünde ses düğmelerinin altında.
 * Düğme öbür dili gösterir: Türkçedeyken "EN", İngilizcedeyken "TR"; title "English" / "Türkçe".
 * Oyun içinde (maç sürerken) tıklanırsa önce onay sorulmaz ama sayfa yeniden yüklenir; o yüzden oyunlar düğmeyi
 * maç sırasında Esc menüsünde göstermez, yalnız ana ekranda ve lobide gösterir.
 */
export function dilDugmesi(el) {
  const obur = DIL === 'tr' ? 'en' : 'tr';
  el.textContent = obur.toUpperCase(); el.title = obur === 'en' ? 'English' : 'Türkçe'; el.setAttribute('aria-label', el.title); el.lang = obur;
  el.addEventListener('click', () => dilSec(obur));
  return el;
}
