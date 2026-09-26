import * as T from 'three';
import { DISC, TEAMS } from '../config.js';

/**
 * Uçan diskler: kimliğe göre havuz; takım renginde yassı silindir, keskin disk kırmızı ve daha parlak, dondurucu
 * camgöbeği. Hepsi döner; keskin diskin çevresinde ince bir halka. Paketten (ya da simülasyondan) gelmeyen disk
 * havuzdan kalkar.
 */
const geo = new T.CylinderGeometry(DISC.radius, DISC.radius, 0.12, 22);
const ringGeo = new T.TorusGeometry(DISC.radius + 0.22, 0.05, 6, 32);
const COLORS = { sharp: '#ff3b3b', freeze: '#8ff3ff' };

export function createDiscs(scene) {
  const live = new Map();
  const spawn = d => {
    const color = COLORS[d.kind] || TEAMS.colors[d.team];
    const material = new T.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: d.kind === 'sharp' ? 2.2 : 1.1, roughness: 0.35 });
    const mesh = new T.Mesh(geo, material); mesh.castShadow = true; scene.add(mesh);
    let ring = null;
    if (d.kind !== 'normal') { ring = new T.Mesh(ringGeo, new T.MeshBasicMaterial({ color })); ring.rotation.x = Math.PI / 2; mesh.add(ring); }
    return { mesh, material, ring };
  };
  return {
    sync(discs, time) {
      const seen = new Set();
      for (const d of discs) {
        seen.add(d.id);
        let v = live.get(d.id);
        if (!v) { v = spawn(d); live.set(d.id, v); }
        v.mesh.position.set(d.x, d.y, d.z);
        v.mesh.rotation.y = time * (d.kind === 'sharp' ? 26 : 16);
        v.mesh.rotation.z = Math.atan2(d.vy, Math.hypot(d.vx, d.vz)) * 0.5;
      }
      for (const [id, v] of live) {
        if (seen.has(id)) continue;
        scene.remove(v.mesh); v.material.dispose(); if (v.ring) v.ring.material.dispose();
        live.delete(id);
      }
    },
  };
}
