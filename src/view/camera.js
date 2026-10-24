import * as T from 'three';
import { CAMERA } from '../config.js';
import { clamp, wrap } from '../math.js';

/**
 * Kamera (tek kamera, iki kip): **birinci şahıs** (masaüstünde varsayılan; göz oyuncunun başında, gövde çizilmez) ve
 * **omuz üstü** (telefonda varsayılan; oyuncunun arkasında ve biraz sağında). Yatay bakış (yaw) ve dikey eğim (pitch,
 * yukarı pozitif) fareyle döner; disk bakış yönüne gider, hareket bakış yönüne göredir. Elenip takım arkadaşını
 * izlerken (spectate) bakış onun bakışına yumuşakça bağlanır. Savrulunca sarsılır.
 */
export function createCamera() {
  const camera = new T.PerspectiveCamera(CAMERA.fov, 1, 0.1, CAMERA.far);
  // Çizim alanının ölçüsü (pencere değil: telefonda oyun kökü görünür alana kilitlenir); etiketlerin ekran konumu
  // bununla hesaplanır.
  let mode = 'fps', yaw = 0, pitch = 0, shake = 0, viewW = 1, viewH = 1;
  const forward = () => { const c = Math.cos(pitch); return { x: Math.sin(yaw) * c, y: Math.sin(pitch), z: Math.cos(yaw) * c }; };

  return {
    camera,
    get yaw() { return yaw; },
    get pitch() { return pitch; },
    get mode() { return mode; },
    /** 'fps' | 'shoulder' */
    setMode(next) { mode = next === 'shoulder' ? 'shoulder' : 'fps'; },
    /** Bakışı verilen yöne kurar (doğuşta merkeze bakar). */
    face(y, p = 0) { yaw = y; pitch = p; },
    look(dx, dy) {
      yaw -= dx * CAMERA.yawSpeed;
      pitch = clamp(pitch - dy * CAMERA.pitchSpeed, CAMERA.pitchMin, CAMERA.pitchMax);
    },
    shake(power) { shake = Math.max(shake, power); },
    resize(width, height) { viewW = width || 1; viewH = height || 1; camera.aspect = viewW / viewH; camera.updateProjectionMatrix(); },
    follow(p, dt = 0, spectate = false) {
      if (spectate) { const k = Math.min(1, dt * 6); yaw += wrap(p.yaw - yaw) * k; pitch += (p.pitch - pitch) * k; }
      const f = forward(), sx = Math.sin(yaw), cz = Math.cos(yaw);
      if (mode === 'fps' && !spectate) camera.position.set(p.x, p.y + CAMERA.eye, p.z);
      else camera.position.set(p.x - sx * CAMERA.back - cz * CAMERA.side, p.y + CAMERA.height, p.z - cz * CAMERA.back + sx * CAMERA.side);
      if (shake > 0) {
        camera.position.x += (Math.random() - 0.5) * shake; camera.position.y += (Math.random() - 0.5) * shake;
        shake = Math.max(0, shake - dt * 1.4);
      }
      camera.lookAt(camera.position.x + f.x * 20, camera.position.y + f.y * 20, camera.position.z + f.z * 20);
      camera.updateMatrixWorld();
    },
    /** Ekran yönlü hareket girdisini (x sağ, z geri) bakış yönlü zemin vektörüne çevirir. */
    movement(x, z) {
      // İleri (sin yaw, cos yaw); sağ = ileri × yukarı = (-fz, fx).
      const fx = Math.sin(yaw), fz = Math.cos(yaw);
      return { x: -fz * x - fx * z, z: fx * x - fz * z };
    },
    /** Dünya noktasının ekran konumu; behind: kameranın arkasında (etiket gizlenir). */
    project(x, y, z) {
      const v = new T.Vector3(x, y, z).project(camera);
      return { x: (v.x + 1) * viewW / 2, y: (1 - v.y) * viewH / 2, behind: v.z > 1 };
    },
  };
}
