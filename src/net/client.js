import { MOVE } from '../config.js';
import { serverUrl } from '../platform.js';
import { createWorld } from '../world.js';
import { C2S, EDGES, NET, S2C } from './protocol.js';
import { applySnapshot } from './snapshot.js';

/**
 * Çevrim içi istemci: sunucuya bağlanır, lobiyi yürütür, maç başlayınca dünyanın **kopyasını** tutar. Simülasyon
 * koşturmaz: durum paketleri kopyaya yazılır, konumlar iki paket arasında ara değerle (NET.interp geriden) çizilir.
 * Kendi oyuncun beklemesin diye yerel girdiden üretilen yumuşak bir öne kayma eklenir. Diskler kimlikle eşlenip ara
 * değerlenir. Girdi saniyede 30 kez, basışlar anında gider.
 *
 * hooks: onWelcome, onLobby, onError, onStart(msg, first), onEvents(list), onEnd(msg, world), onOnline(n), onDisconnect.
 */
export function createNetClient(hooks) {
  let ws = null, connected = false, wantReconnect = false, curNick = '';
  let world = null, buffer = [], clockOffset = 0, clockReady = false, rtt = 0.06;
  let sendTimer = 0, keepAlive = 0, edges = '', last = { mv: [0, 0], yaw: 0, pitch: 0, hold: false };
  const lead = { x: 0, z: 0 };
  const EDGE_KEY = Object.fromEntries(Object.entries(EDGES).map(([k, v]) => [v, k]));

  // Kimlik ve oda sekmeye özeldir (sessionStorage): yenilenen sayfa aynı koltuğa döner, iki sekme iki oyuncudur.
  const store = (k, v) => { try { if (v === undefined) return sessionStorage.getItem(k) || ''; if (v) sessionStorage.setItem(k, v); else sessionStorage.removeItem(k); } catch { return ''; } return v; };
  const send = obj => { if (ws && ws.readyState === 1) ws.send(JSON.stringify(obj)); };

  function connect(nick) {
    curNick = nick;
    if (ws) { try { ws.onclose = null; ws.close(); } catch { /* yok */ } }
    ws = new WebSocket(serverUrl());
    wantReconnect = true;
    ws.onopen = () => { connected = true; send({ t: C2S.HELLO, nick: curNick, token: store('sp.token') }); };
    ws.onclose = () => {
      const was = connected; connected = false;
      hooks.onDisconnect?.(was);
      if (wantReconnect) setTimeout(() => { if (wantReconnect) connect(curNick); }, client.lobby ? 1500 : 15000);
    };
    ws.onerror = () => {};
    ws.onmessage = ev => { let msg; try { msg = JSON.parse(ev.data); } catch { return; } onText(msg); };
  }

  function onText(msg) {
    switch (msg.t) {
      case S2C.WELCOME: store('sp.token', msg.token); client.id = msg.id; client.nick = msg.nick; hooks.onWelcome?.(msg); break;
      case S2C.LOBBY: client.lobby = msg; store('sp.room', msg.code); hooks.onLobby?.(msg); break;
      case S2C.ERROR: hooks.onError?.(msg.msg); break;
      case S2C.START: {
        const first = !world;
        if (first) { world = createWorld(); world.online = true; buffer = []; clockReady = false; }
        world.me = msg.you >= 0 ? msg.you : 0;
        world.players.forEach((p, i) => { p.name = msg.names[i]; p.human = msg.humans[i]; });
        hooks.onStart?.(msg, first);
        break;
      }
      case S2C.SNAP: onSnapshot(msg); break;
      case S2C.END: {
        if (world) {
          world.wins = msg.wins; world.winner = msg.winner;
          world.players.forEach((p, i) => { p.stats = msg.stats[i]; p.name = msg.names[i]; });
        }
        hooks.onEnd?.(msg, world);
        world = null; buffer = [];
        break;
      }
      case S2C.PONG: rtt = Math.max(0.01, (performance.now() - msg.at) / 1000); client.rtt = rtt; break;
      case S2C.ONLINE: client.online = msg.n; hooks.onOnline?.(msg.n); break;
      default: break;
    }
  }

  function onSnapshot(s) {
    if (!world) return;
    const arrival = performance.now() / 1000, measured = s.ts - arrival;
    if (!clockReady || Math.abs(measured - clockOffset) > NET.clockJump) { clockOffset = measured; clockReady = true; buffer = []; }
    else clockOffset += (measured - clockOffset) * NET.clockSmooth;
    applySnapshot(world, s);
    buffer.push({ ts: s.ts, p: s.p.map(r => [r[0], r[1], r[2], r[6]]), d: new Map(s.d.map(r => [r[0], [r[1], r[2], r[3]]])) });
    if (buffer.length > 12) buffer.shift();
    if (s.ev?.length) hooks.onEvents?.(s.ev);
  }

  const lerpAngle = (a, b, k) => a + Math.atan2(Math.sin(b - a), Math.cos(b - a)) * k;
  /**
   * Her kare: konumlar ara değerle; kendi oyuncuna yerel girdiden yatay öne kayma (yerdeyken ve kontrol varken).
   * move: bu karedeki yerel hareket (dünya uzayında), yoksa null.
   */
  function update(dt, move) {
    if (!world || !buffer.length) return;
    const t = performance.now() / 1000 + clockOffset - NET.interp;
    let a = buffer[0], b = buffer[buffer.length - 1];
    for (let i = buffer.length - 1; i > 0; i--) if (buffer[i - 1].ts <= t) { a = buffer[i - 1]; b = buffer[i]; break; }
    const span = b.ts - a.ts, k = span > 1e-4 ? Math.max(0, Math.min(1, (t - a.ts) / span)) : 1;
    world.players.forEach((p, i) => {
      if (p.out) return;
      const [x0, y0, z0, f0] = a.p[i], [x1, y1, z1, f1] = b.p[i];
      p.x = x0 + (x1 - x0) * k; p.y = y0 + (y1 - y0) * k; p.z = z0 + (z1 - z0) * k;
      if (i !== world.me) p.yaw = lerpAngle(f0, f1, k);
    });
    for (const d of world.discs) {
      const p0 = a.d.get(d.id), p1 = b.d.get(d.id);
      if (p0 && p1) { d.x = p0[0] + (p1[0] - p0[0]) * k; d.y = p0[1] + (p1[1] - p0[1]) * k; d.z = p0[2] + (p1[2] - p0[2]) * k; }
      else if (p1) { d.x = p1[0]; d.y = p1[1]; d.z = p1[2]; }
    }
    const me = world.players[world.me];
    const free = !me.out && me.ground && me.knock <= 0 && me.freeze <= 0 && me.flight <= 0 && world.state === 'play';
    let wx = 0, wz = 0;
    if (free && move && Math.hypot(move.x, move.z) > 0.1) {
      const d = Math.max(1, Math.hypot(move.x, move.z)), ahead = NET.interp + rtt / 2;
      wx = move.x / d * MOVE.speed * ahead; wz = move.z / d * MOVE.speed * ahead;
      const n = Math.hypot(wx, wz); if (n > NET.leadMax) { wx *= NET.leadMax / n; wz *= NET.leadMax / n; }
    }
    const s = 1 - Math.exp(-dt / NET.leadSmooth);
    lead.x += (wx - lead.x) * s; lead.z += (wz - lead.z) * s;
    me.x += lead.x; me.z += lead.z;
  }

  /** Bu karenin girdisi (input.read çıktısı): sürekli durum saniyede 30 kez, basış olunca hemen. */
  function input(cmd, dt) {
    for (const [name, key] of Object.entries(EDGE_KEY)) if (cmd[name]) edges += key;
    last = { mv: [+(cmd.x || 0).toFixed(3), +(cmd.z || 0).toFixed(3)], yaw: +(cmd.yaw || 0).toFixed(3), pitch: +(cmd.pitch || 0).toFixed(3), hold: !!cmd.hold };
    sendTimer += dt;
    if (edges || sendTimer >= NET.inputEvery) flushInput();
  }
  function flushInput() {
    sendTimer = 0;
    send({ t: C2S.INPUT, ...last, e: edges });
    edges = '';
  }

  setInterval(() => {
    keepAlive += 1;
    if (connected && (world ? keepAlive >= 2 : keepAlive >= NET.keepAlive)) { keepAlive = 0; send({ t: C2S.PING, at: performance.now() }); }
  }, 1000);

  const client = {
    id: 0, nick: '', lobby: null, online: 0, rtt: 0,
    connect, get connected() { return connected; },
    get world() { return world; },
    hello(nick) { curNick = nick; send({ t: C2S.HELLO, nick, token: store('sp.token') }); },
    create() { send({ t: C2S.CREATE }); },
    join(code) { send({ t: C2S.JOIN, code }); },
    seat(slot) { send({ t: C2S.SEAT, slot }); },
    move(id, slot) { send({ t: C2S.MOVE, id, slot }); },
    start() { send({ t: C2S.START }); },
    leave() { send({ t: C2S.LEAVE }); client.lobby = null; world = null; buffer = []; store('sp.room', null); },
    rememberedRoom() { return store('sp.room'); },
    input, update,
  };
  return client;
}
