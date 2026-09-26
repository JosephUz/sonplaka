import * as T from 'three';

/**
 * Sahne yapı taşları: renk başına tek malzeme, gölgeli kutu ve silindir, yere yatık çizgi ve halka, yazılı tabela.
 * Hepsi ilk parametre olarak ebeveyni (sahne ya da grup) alır.
 */
const materials = new Map();
export function mat(color) {
  if (!materials.has(color)) materials.set(color, new T.MeshStandardMaterial({ color, roughness: 0.9 }));
  return materials.get(color);
}

export function box(parent, w, h, d, color, x = 0, y = 0, z = 0) {
  const mesh = new T.Mesh(new T.BoxGeometry(w, h, d), mat(color));
  mesh.position.set(x, y, z); mesh.castShadow = true; mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}

export function cyl(parent, r, h, color, x, y, z) {
  const mesh = new T.Mesh(new T.CylinderGeometry(r, r, h, 8), mat(color));
  mesh.position.set(x, y, z); mesh.castShadow = true;
  parent.add(mesh);
  return mesh;
}

/** Zemine boyalı kırık çizgi: [[x, z], ...] noktalarını ince kutularla birleştirir. */
export function line(parent, points, color = '#e9e0bb', width = 0.08) {
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1], b = points[i], length = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const m = box(parent, width, 0.025, length, color, (a[0] + b[0]) / 2, 0.07, (a[1] + b[1]) / 2);
    m.rotation.y = Math.atan2(b[0] - a[0], b[1] - a[1]); m.castShadow = false;
  }
}

export function ring(parent, radius, color, x = 0, z = 0) {
  const points = [];
  for (let i = 0; i <= 64; i++) { const a = i * Math.PI / 32; points.push([x + Math.sin(a) * radius, z + Math.cos(a) * radius]); }
  line(parent, points, color, 0.08);
}

/** Tabela: tuvale yazılmış tek satır metin, iki yüzü görünen düzlem. */
export function sign(text, width, height, bg, fg) {
  const canvas = document.createElement('canvas');
  canvas.width = 768; canvas.height = 192;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = bg; ctx.fillRect(0, 0, 768, 192);
  ctx.fillStyle = fg; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.font = '900 66px Arial';
  ctx.fillText(text, 384, 100, 720);
  const texture = new T.CanvasTexture(canvas);
  texture.colorSpace = T.SRGBColorSpace;
  return new T.Mesh(new T.PlaneGeometry(width, height), new T.MeshBasicMaterial({ map: texture, side: T.DoubleSide }));
}
