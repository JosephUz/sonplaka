// Küçük yardımcılar: sınırlama, zemin (x, z) düzleminde uzaklık, açı farkı.
export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const distance = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
export const angleTo = (from, to) => Math.atan2(to.x - from.x, to.z - from.z);
export const wrap = a => Math.atan2(Math.sin(a), Math.cos(a));
