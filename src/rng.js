// Maç için tekrarlanabilir rastgelelik: aynı tohum aynı bot kararlarını verir. Görsel efektler Math.random kullanır.
export function createRng(seed) {
  let s = seed >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}
