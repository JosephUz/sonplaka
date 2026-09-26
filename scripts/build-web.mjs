import { cp, mkdir, rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Android uygulaması için oyun dosyalarını dist/ klasörüne toplar (Capacitor webDir). Derleme adımı yok: sunucunun
 * verdiği dosyaların aynısı kopyalanır; /vendor/ altına three.js (three.module.js ve içe aktardığı three.core.js).
 */
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(root, 'dist');
const three = path.join(root, 'node_modules', 'three', 'build');

await rm(dist, { recursive: true, force: true });
await mkdir(path.join(dist, 'vendor'), { recursive: true });
for (const f of ['index.html', 'style.css', 'game.js']) await cp(path.join(root, f), path.join(dist, f));
await cp(path.join(root, 'src'), path.join(dist, 'src'), { recursive: true });
for (const f of ['three.module.js', 'three.core.js']) await cp(path.join(three, f), path.join(dist, 'vendor', f));
console.log('dist/ hazır');
