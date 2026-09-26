import { ARENA, PAD } from './config.js';

/**
 * Arena geometrisi (DOM ve three.js yok; simülasyon, botlar ve görünüm aynı veriyi okur). Plakalar: 0 merkez, 1-4 iç
 * halka, 5-12 dış halka. Her plaka: konum, yarıçap, halka numarası (0 merkez, 1 iç, 2 dış), kolonları ve üstündeki
 * zıplama plakaları. Zıplama plakası (pad) iki plakayı bağlar: plakanın kenarına yakın durur, üstüne basan hedef
 * plakanın kenarından biraz içeriye uçar; karşı plakada geri getiren eşi vardır (`back`).
 * Güç diski noktaları: merkez plakanın ortası ve iç halka plakalarında merkeze bakan taraf.
 */
export function buildArena() {
  const plates = [], pads = [], pickups = [];
  const add = (x, z, r, ring) => { plates.push({ id: plates.length, x, z, r, ring, pillars: [], pads: [] }); return plates[plates.length - 1]; };
  const center = add(0, 0, ARENA.center.r, 0);
  for (let i = 0; i < ARENA.center.pillars; i++) {
    const a = i * Math.PI * 2 / ARENA.center.pillars;
    center.pillars.push({ x: Math.sin(a) * ARENA.center.pillarDist, z: Math.cos(a) * ARENA.center.pillarDist });
  }
  pickups.push({ plate: 0, x: 0, z: 0 });
  const r1 = [], r2 = [];
  for (let i = 0; i < ARENA.ring1.n; i++) {
    const a = ARENA.ring1.angle0 + i * Math.PI * 2 / ARENA.ring1.n;
    const p = add(Math.sin(a) * ARENA.ring1.dist, Math.cos(a) * ARENA.ring1.dist, ARENA.ring1.r, 1);
    p.pillars.push({ x: p.x, z: p.z });
    pickups.push({ plate: p.id, x: p.x - Math.sin(a) * 3.2, z: p.z - Math.cos(a) * 3.2 });
    r1.push(p);
  }
  for (let i = 0; i < ARENA.ring2.n; i++) {
    const a = ARENA.ring2.angle0 + i * Math.PI * 2 / ARENA.ring2.n;
    r2.push(add(Math.sin(a) * ARENA.ring2.dist, Math.cos(a) * ARENA.ring2.dist, ARENA.ring2.r, 2));
  }
  /** İki plakayı karşılıklı zıplama plakalarıyla bağlar. */
  function link(a, b) {
    const dx = b.x - a.x, dz = b.z - a.z, d = Math.hypot(dx, dz), ux = dx / d, uz = dz / d;
    const pa = { id: pads.length, plate: a.id, to: b.id, x: a.x + ux * (a.r - ARENA.padInset), z: a.z + uz * (a.r - ARENA.padInset), land: { x: b.x - ux * (b.r - ARENA.landInset), z: b.z - uz * (b.r - ARENA.landInset) }, back: pads.length + 1 };
    const pb = { id: pads.length + 1, plate: b.id, to: a.id, x: b.x - ux * (b.r - ARENA.padInset), z: b.z - uz * (b.r - ARENA.padInset), land: { x: a.x + ux * (a.r - ARENA.landInset), z: a.z + uz * (a.r - ARENA.landInset) }, back: pads.length };
    for (const p of [pa, pb]) {
      const fd = Math.hypot(p.land.x - p.x, p.land.z - p.z);
      p.time = Math.max(PAD.min, Math.min(PAD.max, fd / PAD.speed));
      p.dir = Math.atan2(p.land.x - p.x, p.land.z - p.z);
      pads.push(p); plates[p.plate].pads.push(p.id);
    }
  }
  for (let j = 0; j < r1.length; j++) {
    link(center, r1[j]);
    link(r1[j], r2[2 * j]); link(r1[j], r2[2 * j + 1]);
  }
  for (let k = 0; k < r2.length; k++) link(r2[k], r2[(k + 1) % r2.length]);
  /** Takımların doğuş plakaları: dış halkanın +z yarısı mavi, -z yarısı turuncu (merkezden uzaklığa göre sıralı). */
  const spawns = [r2.filter(p => p.z > 0).map(p => p.id), r2.filter(p => p.z < 0).map(p => p.id)];
  return { plates, pads, pickups, spawns };
}

/** Bütün plakaların en dış yarıçapı (görünüm ve sınır için). */
export const outerRadius = () => ARENA.ring2.dist + ARENA.ring2.r;
