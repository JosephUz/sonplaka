// Dil denetimi (josephuz/docs/dil-standardi.md). Oyunun kökünde: node scripts/dil-denetim.mjs
// 1) tr.js ve en.js aynı anahtarlara sahip; değerler boş değil.
// 2) index.html ve src/**/*.js içindeki data-i18n* ve t('…') anahtarlarının hepsi sözlükte var.
// 3) Çevrilmemiş Türkçe kalıntı: src/**/*.js ve index.html'de (yorumlar ve diller/ hariç) Türkçe harf içeren dize ve
//    HTML metni. İzinli olanlar (özel adlar: oyun adı, karakter adları) scripts/dil-izin.json'a yazılır: ["Tetik Meydanı", …].
// Çıkış kodu: sorun varsa 1.
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const kok = process.cwd(), src = path.join(kok, 'src');
const tr = (await import(pathToFileURL(path.join(src, 'diller', 'tr.js')).href)).default;
const en = (await import(pathToFileURL(path.join(src, 'diller', 'en.js')).href)).default;
const izin = (() => { try { return JSON.parse(fs.readFileSync(path.join(kok, 'scripts', 'dil-izin.json'), 'utf8')); } catch { return []; } })();
const sorun = [];

for (const k of Object.keys(tr)) if (!(k in en)) sorun.push(`en.js'te yok: ${k}`);
for (const k of Object.keys(en)) if (!(k in tr)) sorun.push(`tr.js'te yok: ${k}`);
for (const [ad, s] of [['tr', tr], ['en', en]]) for (const [k, v] of Object.entries(s)) if (v === '' || v == null) sorun.push(`${ad}.js boş: ${k}`);

const gez = d => fs.readdirSync(d, { withFileTypes: true }).flatMap(e => e.isDirectory() ? (e.name === 'diller' ? [] : gez(path.join(d, e.name))) : e.name.endsWith('.js') ? [path.join(d, e.name)] : []);
const dosyalar = [path.join(kok, 'index.html'), ...gez(src)].filter(f => fs.existsSync(f) && !f.endsWith(path.join('src', 'dil.js')));
const TURKCE = /[çğıöşüÇĞİÖŞÜ]/;
const yorumsuz = (s, html) => html ? s.replace(/<!--[\s\S]*?-->/g, m => m.replace(/[^\n]/g, ' ')) : s.replace(/\/\*[\s\S]*?\*\//g, m => m.replace(/[^\n]/g, ' ')).replace(/(^|[^:'"`\\])\/\/.*$/gm, (m, a) => a + ' '.repeat(m.length - a.length));
const izinUzun = [...izin].sort((a, b) => b.length - a.length); // uzun ad önce: 'Çiftçi Rıza', 'Çiftçi'den önce silinir
const izinli = m => izin.some(i => m.includes(i)) && !TURKCE.test(izinUzun.reduce((s, i) => s.split(i).join(''), m));

for (const f of dosyalar) {
  const html = f.endsWith('.html'), ham = fs.readFileSync(f, 'utf8'), rel = path.relative(kok, f);
  let s = yorumsuz(ham, html);
  // HTML: data-i18n taşıyan öğenin hemen ardındaki metin ve data-i18n-<öznitelik> taşıyan öğenin o özniteliği denetime girmez.
  if (html) s = s.replace(/(<[^>]*\sdata-i18n(?:-html)?="[^"]+"[^>]*>)([^<]*)/g, (m, a, b) => a + b.replace(/[^\n]/g, ' '))
    .replace(/<[^>]*>/g, tag => tag.replace(/\s(title|placeholder|aria-label|content|alt)="[^"]*"/g, (m, ad) => tag.includes(`data-i18n-${ad}=`) ? ` ${ad}=""` : m));
  for (const m of s.matchAll(/data-i18n(?:-[a-z-]+)?="([^"]+)"/g)) if (!(m[1] in tr)) sorun.push(`${rel}: sözlükte yok: ${m[1]}`);
  // t('silah.' + id) gibi değişken anahtar (nokta ile biten önek) aranmaz.
  for (const m of s.matchAll(/\bt\(\s*['"`]([\w.-]+)['"`]/g)) if (!m[1].endsWith('.') && !(m[1] in tr)) sorun.push(`${rel}: sözlükte yok: ${m[1]}`);
  const satirlar = s.split('\n');
  satirlar.forEach((satir, i) => {
    const adaylar = html
      ? [...satir.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/g, '').matchAll(/>([^<>]*[çğıöşüÇĞİÖŞÜ][^<>]*)</g)].map(m => m[1]).concat([...satir.matchAll(/(?:title|placeholder|aria-label|content|alt)="([^"]*[çğıöşüÇĞİÖŞÜ][^"]*)"/g)].map(m => m[1]))
      : [...satir.matchAll(/(['"`])((?:\\.|(?!\1).)*?[çğıöşüÇĞİÖŞÜ](?:\\.|(?!\1).)*?)\1/g)].map(m => m[2]);
    for (const a of adaylar) if (!izinli(a) && !/^\s*$/.test(a)) sorun.push(`${rel}:${i + 1}: çevrilmemiş: ${a.trim().slice(0, 80)}`);
  });
}
const sonuc = sorun;
for (const s of sonuc) console.log(s);
console.log(sonuc.length ? `\n${sonuc.length} sorun` : `dil denetimi temiz: ${Object.keys(tr).length} anahtar`);
process.exit(sonuc.length ? 1 : 0);
