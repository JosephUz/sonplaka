import * as T from 'three';
import { TEAMS } from '../config.js';
import { box } from './builders.js';

/**
 * Parçacıklar: isabette takım rengi kıvılcım, keskin diskte kırmızı patlama, düşüşte kenarda büyük saçılma, levyede
 * beyaz çakım, zıplama plakasında yeşil (kapanınca kırmızı) püskürtü, sekmede küçük kıvılcım, güç diskinde altın
 * yağmuru. Plaka çökünce çökme noktasında geniş bir şok halkası yayılır, raund biterken kazanan renginde konfeti.
 * Küçük kutular fırlayıp yerçekimiyle boşluğa düşer ve ömürleri bitince sahneden kalkar.
 */
const BURSTS = {
  hit: { count: 12, color: e => (e.kind === 'sharp' ? '#ff3b3b' : '#fff1b8') },
  swing: { count: 6, color: () => '#ffffff', spread: 4 },
  fall: { count: 34, size: 0.2, spread: 12, up: [4, 12], life: 1.4, color: (e, i) => ['#ff7a2e', '#ffffff', '#ffd35c'][i % 3] },
  pad: { count: 10, color: () => '#7dff9a', spread: 4, up: [4, 9] },
  bounce: { count: 4, color: () => '#bff6ff', spread: 3, size: 0.09 },
  pickup: { count: 22, color: () => '#ffd35c', spread: 5, up: [4, 9], life: 1 },
  jump: { count: 3, color: () => '#c9d8ff', spread: 2, size: 0.08, life: 0.4 },
  land: { count: 5, color: () => '#c9d8ff', spread: 4, size: 0.08, life: 0.4, up: [1, 3] },
  roundEnd: { count: 90, size: 0.25, spread: 18, up: [8, 18], life: 2.2, color: (e, i) => [TEAMS.colors[e.team ?? 0], '#ffffff', '#ffd35c'][i % 3] },
};
const ringGeo = new T.RingGeometry(0.85, 1, 64);

export function createEffects(scene) {
  const live = [], waves = [];
  const flash = new T.PointLight('#ffffff', 0, 60, 1.5);
  scene.add(flash);
  let flashLife = 0;

  return {
    spawn(e) {
      const kind = BURSTS[e.type];
      if (kind) {
        const x = e.x || 0, y = e.y ?? 0.7, z = e.z || 0, size = kind.size || 0.13, spread = kind.spread || 7, [upMin, upMax] = kind.up || [3, 7];
        for (let i = 0; i < kind.count; i++) {
          const mesh = box(scene, size, size, size, kind.color(e, i), x, y, z);
          mesh.castShadow = false;
          const a = Math.random() * Math.PI * 2, s = Math.random() * spread;
          live.push({ mesh, vx: Math.sin(a) * s, vz: Math.cos(a) * s, vy: upMin + Math.random() * (upMax - upMin), spin: (Math.random() - 0.5) * 12, life: (kind.life || 0.7) * (0.6 + Math.random() * 0.4) });
        }
      }
      if (e.type === 'collapse' || e.type === 'roundEnd' || e.type === 'hit' && e.kind === 'sharp') {
        const color = new T.Color(e.type === 'roundEnd' ? TEAMS.colors[e.team ?? 0] : e.type === 'collapse' ? '#ff9a50' : '#ff3b3b');
        const mesh = new T.Mesh(ringGeo, new T.MeshBasicMaterial({ color, transparent: true, opacity: 0.9, side: T.DoubleSide, depthWrite: false }));
        mesh.rotation.x = -Math.PI / 2; mesh.position.set(e.x || 0, (e.y ?? 0) + 0.15, e.z || 0); mesh.scale.setScalar(0.01);
        scene.add(mesh);
        waves.push({ mesh, t: 0, radius: e.type === 'collapse' ? 60 : 14, time: e.type === 'collapse' ? 1.4 : 0.7 });
        flash.color.copy(color).lerp(new T.Color('#ffffff'), 0.4);
        flash.position.set(e.x || 0, (e.y ?? 0) + 4, e.z || 0);
        flashLife = 0.6;
      }
    },
    update(dt) {
      for (let i = live.length - 1; i >= 0; i--) {
        const e = live[i];
        e.life -= dt; e.vy -= dt * 14;
        e.mesh.position.x += e.vx * dt; e.mesh.position.y += e.vy * dt; e.mesh.position.z += e.vz * dt;
        if (e.spin) { e.mesh.rotation.x += e.spin * dt; e.mesh.rotation.z += e.spin * dt; }
        if (e.life <= 0) { scene.remove(e.mesh); e.mesh.geometry.dispose(); live.splice(i, 1); }
      }
      for (let i = waves.length - 1; i >= 0; i--) {
        const w = waves[i];
        w.t += dt;
        const k = w.t / w.time;
        w.mesh.scale.setScalar(0.5 + k * w.radius);
        w.mesh.material.opacity = Math.max(0, 0.9 * (1 - k));
        if (k >= 1) { scene.remove(w.mesh); w.mesh.material.dispose(); waves.splice(i, 1); }
      }
      flashLife = Math.max(0, flashLife - dt);
      flash.intensity = flashLife > 0 ? 300 * (flashLife / 0.6) ** 2 : 0;
    },
  };
}
