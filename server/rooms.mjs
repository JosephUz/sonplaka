import { randomBytes } from 'node:crypto';
import { DIFFICULTIES, MATCH, MODES, playersFor, teamsFor } from '../src/config.js';
import { createWorld, step } from '../src/world.js';
import { encodeSnapshot } from '../src/net/snapshot.js';
import { C2S, EDGES, NET, S2C, normalizeCode, roomCode } from '../src/net/protocol.js';

/**
 * Odalar (josephuz oda standardı: josephuz/docs/oda-standardi.md): kur / katıl / lobi / başlat / maç / bitiş (bitince
 * oda lobiye döner, kuran yeniden başlatır). Kip (`settings.teamSize`: 1 herkes tek, 2-5 iki takım) kuranın ana ekran
 * seçimiyle başlar, kuran lobide değiştirir; koltuk sayısı kipe göredir (koltuk = takım × takım boyu + sıra). Herkes
 * istediği boş koltuğa oturur (karşı takıma geçince PvP, hepsi aynı takımdaysa co-op: rakipler bot), kuran oyuncuları
 * koltuktan koltuğa taşır (dolu koltuğa taşırsa ikisi yer değiştirir). Boş koltukları botlar doldurur. Maç sürerken de
 * odaya katılınır (bir botun koltuğu devralınır). Kuran çıkarsa kuranlık sıradaki (bağlı) insana geçer.
 *
 * Açık odalar: oda herkese açık kurulur (`settings.private` false); kuran lobide özele çevirebilir. Özel oda listede ve
 * hızlı katılımda yoktur, yalnız kod / linkle girilir. Listeyi isteyen (`list`) ve odada olmayan bağlantılar
 * izleyicidir: liste değişince (en çok 250 ms'de bir, yalnız içerik farklıysa) onlara yeniden yollanır. Dolu açık oda
 * da listede durur (istemci DOLU yazar). Hızlı katıl: boş koltuğu olan açık odalardan önce lobidekine, sonra insanı çok
 * olana (eşitse aynı kipe) oturur, maçtaki oda da olur; yoksa onun seçimiyle yeni açık oda kurulur ve kuranı o olur.
 *
 * Sunucu otoriterdir: her oda kendi dünyasını saniyede 60 adım koşturur (world.js, tarayıcıdakiyle aynı kurallar),
 * saniyede 30 durum paketi ve biriken olayları yayar. Hesap yok: bağlantı `token` ile tanınır, kopan oyuncu aynı
 * token'la koltuğuna geri döner; kopukken koltuğunu bot oynar. Oda bağlı kimse kalmayınca kapanır.
 */
export function createRooms({ log = console.log, presence = () => 0 } = {}) {
  const rooms = new Map();
  const conns = new Set();
  const byToken = new Map();

  const send = (conn, obj) => { if (conn.ws && conn.ws.readyState === 1) conn.ws.send(JSON.stringify(obj)); };
  // `kod`: dil bağımsız anahtar (josephuz/docs/dil-standardi.md); istemci t('sunucu.' + kod, d) gösterir, yoksa `msg`.
  const error = (conn, msg, kod, d) => send(conn, { t: S2C.ERROR, msg, ...(kod ? { kod } : {}), ...(d ? { d } : {}) });

  const online = () => conns.size + presence();
  let onlineSent = -1;
  function broadcastOnline() {
    const n = online();
    if (n === onlineSent) return;
    onlineSent = n;
    for (const c of conns) if (!c.room || c.room.state !== 'playing') send(c, { t: S2C.ONLINE, n });
  }
  const onlineTimer = setInterval(broadcastOnline, 2000);
  onlineTimer.unref?.();

  function lobbyMsg(room) {
    return { t: S2C.LOBBY, code: room.code, hostId: room.hostId, state: room.state, settings: { ...room.settings }, private: room.settings.private,
      seats: room.seats.map(c => (c ? { id: c.id, nick: c.nick, online: Boolean(c.ws) } : null)) };
  }
  const members = room => room.seats.filter(Boolean);
  const broadcast = (room, obj) => { for (const c of members(room)) send(c, obj); };
  const broadcastLobby = room => broadcast(room, lobbyMsg(room));
  /** Ayarlar: geçersiz ya da eksik alan `base`'den (oda kurulurken varsayılanlardan) gelir. */
  const sanitize = (msg, base = { teamSize: MATCH.teamSize, difficulty: MATCH.difficulty }) => {
    const n = Math.round(+msg?.teamSize), d = String(msg?.difficulty || '');
    return { teamSize: MODES.includes(n) ? n : base.teamSize, difficulty: DIFFICULTIES.includes(d) ? d : base.difficulty };
  };
  /** İlk boş koltuk, takımlara dağıtarak (önce her takımın 1. koltuğu, sonra 2. ...); yoksa -1. */
  function freeSeat(room) {
    const n = room.settings.teamSize, teams = teamsFor(n);
    for (let k = 0; k < n; k++) for (let t = 0; t < teams; t++) if (!room.seats[t * n + k]) return t * n + k;
    return -1;
  }
  /** Kip değişince (lobide) koltuklar yeni sayıya göre kurulur, insanlar sırayla dağıtılarak oturur. Sığmazsa false. */
  function relayout(room, teamSize) {
    const people = members(room);
    if (people.length > playersFor(teamSize)) return false;
    room.settings.teamSize = teamSize;
    room.seats = Array(playersFor(teamSize)).fill(null);
    for (const c of people) room.seats[freeSeat(room)] = c;
    return true;
  }

  // ---------- Açık odalar listesi ----------
  /** Listede görünen oda: herkese açık, bağlı en az bir insan (dolu da olur). Lobide bekleyenler önce, sonra kalabalık olan. */
  const listable = r => !r.settings.private && members(r).some(c => c.ws);
  const hostOf = r => members(r).find(c => c.id === r.hostId) || members(r)[0];
  function roomList() {
    const list = [...rooms.values()].filter(listable)
      .sort((a, b) => (a.state === 'lobby' ? 0 : 1) - (b.state === 'lobby' ? 0 : 1) || members(b).length - members(a).length)
      .slice(0, NET.listMax)
      .map(r => ({ code: r.code, host: hostOf(r).nick, teamSize: r.settings.teamSize,
        difficulty: r.settings.difficulty, humans: members(r).length, seats: r.seats.length, state: r.state, full: freeSeat(r) < 0 }));
    return { t: S2C.ROOMS, rooms: list };
  }
  let listSent = '', listTimer = null;
  /** Oda kuruldu / değişti / kapandı: izleyicilere kısa gecikmeyle (art arda değişiklikler tek paket) yolla. */
  function roomsChanged() {
    if (listTimer) return;
    listTimer = setTimeout(() => {
      listTimer = null;
      const msg = JSON.stringify(roomList());
      if (msg === listSent) return;
      listSent = msg;
      for (const c of conns) if (c.watch && !c.room && c.ws && c.ws.readyState === 1) c.ws.send(msg);
    }, 250);
    listTimer.unref?.();
  }
  /** Hızlı katılım adayı: boş koltuklu açık oda; önce lobidekiler, sonra insanı çok olan, eşitse oyuncunun seçtiği kip. */
  function quickPick(teamSize) {
    return [...rooms.values()].filter(r => listable(r) && freeSeat(r) >= 0)
      .sort((a, b) => (a.state === 'lobby' ? 0 : 1) - (b.state === 'lobby' ? 0 : 1) || members(b).length - members(a).length
        || (b.settings.teamSize === teamSize) - (a.settings.teamSize === teamSize))[0] || null;
  }
  /** Kuranlık: önce bağlı insana, yoksa odadaki ilk kişiye. */
  const nextHost = room => (members(room).find(c => c.ws) || members(room)[0]).id;

  function seat(room, conn, slot) {
    const old = room.seats.indexOf(conn);
    if (old >= 0) room.seats[old] = null;
    room.seats[slot] = conn;
    if (room.world) syncHumans(room);
  }
  function syncHumans(room) {
    room.world.players.forEach((p, i) => {
      const c = room.seats[i];
      p.human = Boolean(c && c.ws && !c.left);
      p.name = c ? c.nick : 'Bot-' + i;
    });
  }
  const startMsg = (room, conn) => ({ t: S2C.START, you: room.seats.indexOf(conn), teamSize: room.world.teamSize, difficulty: room.world.difficulty, names: room.world.players.map(p => p.name), humans: room.world.players.map(p => p.human) });
  function roster(room) { syncHumans(room); for (const c of members(room)) send(c, startMsg(room, c)); }

  function leaveRoom(conn) {
    const room = conn.room; if (!room) return;
    const i = room.seats.indexOf(conn);
    if (i >= 0) room.seats[i] = null;
    conn.room = null; conn.input = blankInput();
    if (!members(room).length) { closeRoom(room, 'boşaldı'); return; }
    if (room.hostId === conn.id) room.hostId = nextHost(room);
    if (room.world) roster(room);
    broadcastLobby(room);
  }
  function closeRoom(room, why) {
    stopRoom(room); rooms.delete(room.code); log(`oda kapandı ${room.code} (${why})`); roomsChanged();
    for (const c of members(room)) c.room = null;
  }
  function closeIfEmpty(room) {
    if (members(room).some(c => c.ws)) return false;
    closeRoom(room, 'bağlı kimse kalmadı');
    return true;
  }
  function stopRoom(room) { if (room.timer) { clearInterval(room.timer); room.timer = null; } }

  // ---------- Maç ----------
  const blankInput = () => ({ cmd: { x: 0, z: 0, yaw: 0, pitch: 0, hold: false }, edges: {} });

  function startGame(room) {
    const seed = 1 + Math.floor(Math.random() * 1e6);
    room.world = createWorld(seed, { teamSize: room.settings.teamSize, difficulty: room.settings.difficulty });
    room.state = 'playing'; room.acc = 0; room.clock = 0; room.stepNo = 0; room.events = [];
    room.last = performance.now();
    for (const c of members(room)) c.input = blankInput();
    syncHumans(room);
    for (const c of members(room)) send(c, startMsg(room, c));
    room.timer = setInterval(() => tick(room), 1000 / 60);
    const n = room.settings.teamSize, teams = new Set(room.seats.map((c, i) => (c ? Math.floor(i / n) : -1)).filter(t => t >= 0));
    log(`başladı ${room.code}: kip ${n === 1 ? 'herkes tek' : `${n}v${n}`}, ${members(room).length} insan${teams.size > 1 ? ' (PvP)' : ' (co-op)'}`);
  }

  /** Bu adımın insan girdileri: sürekli durum + birikmiş basışlar (bir kez tüketilir). */
  function inputs(room) {
    const players = {};
    room.seats.forEach((c, i) => {
      if (!c || !c.ws) return;
      players[i] = { ...c.input.cmd, ...c.input.edges };
      c.input.edges = {};
    });
    return { players };
  }

  function tick(room) {
    const now = performance.now(), dt = Math.min(0.1, (now - room.last) / 1000);
    room.last = now; room.clock += dt;
    const w = room.world;
    room.acc += dt;
    for (let n = 0; room.acc >= NET.step && n < 6; n++) {
      step(w, NET.step, inputs(room));
      room.acc -= NET.step;
      for (const e of w.events) room.events.push(e);
      w.events.length = 0;
    }
    if (++room.stepNo % NET.snapshotEvery === 0) flush(room);
    if (w.winner !== null) endGame(room);
    else closeIfEmpty(room);
  }

  function flush(room) {
    const snap = encodeSnapshot(room.world, room.clock, room.events.map(compactEvent));
    room.events = [];
    const msg = JSON.stringify({ t: S2C.SNAP, ...snap });
    for (const c of members(room)) if (c.ws && c.ws.readyState === 1) c.ws.send(msg);
  }
  const compactEvent = e => {
    const o = {};
    for (const [k, v] of Object.entries(e)) o[k] = typeof v === 'number' ? Math.round(v * 100) / 100 : v;
    return o;
  };

  function endGame(room) {
    const w = room.world;
    flush(room);
    broadcast(room, { t: S2C.END, score: w.score, winner: w.winner, stats: w.players.map(p => p.stats), names: w.players.map(p => p.name) });
    stopRoom(room);
    room.state = 'lobby'; room.world = null; roomsChanged();
    log(`bitti ${room.code}: ${w.score.join('-')}${w.winner < 0 ? ' (berabere)' : ''}`);
    broadcastLobby(room);
  }

  // ---------- Mesajlar ----------
  const finite = v => (Number.isFinite(+v) ? +v : 0);
  function readInput(conn, msg) {
    const [x, z] = Array.isArray(msg.mv) ? msg.mv.map(finite) : [0, 0];
    const d = Math.hypot(x, z), k = d > 1 ? 1 / d : 1;
    conn.input.cmd = { x: x * k, z: z * k, yaw: finite(msg.yaw), pitch: Math.max(-1.3, Math.min(1.3, finite(msg.pitch))), hold: Boolean(msg.hold), sprint: Boolean(msg.sp) };
    for (const ch of String(msg.e || '').slice(0, 12)) {
      const name = EDGES[ch];
      if (name) conn.input.edges[name] = true;
    }
  }

  function createRoom(conn, msg) {
    if (conn.room) leaveRoom(conn);
    let code = roomCode(); while (rooms.has(code)) code = roomCode();
    const settings = sanitize(msg);
    settings.private = msg.private === true;
    const r = { code, hostId: conn.id, settings, seats: Array(playersFor(settings.teamSize)).fill(null), state: 'lobby', world: null, timer: null, events: [] };
    r.seats[0] = conn;
    rooms.set(code, r); conn.room = r;
    broadcastLobby(r); log(`oda kuruldu ${code} (${conn.nick}, kip ${settings.teamSize}, bot ${settings.difficulty}${settings.private ? ', özel' : ''})`);
  }

  function onMessage(conn, data) {
    let msg; try { msg = JSON.parse(data.toString()); } catch { return; }
    if (!msg || typeof msg.t !== 'string') return;
    const room = conn.room;
    // Girdi ve ping dışındaki mesajlar odaları değiştirebilir; liste yalnız içeriği farklıysa gider.
    if (msg.t !== C2S.INPUT && msg.t !== C2S.PING) roomsChanged();
    switch (msg.t) {
      case C2S.HELLO: {
        conn.nick = String(msg.nick || '').trim().slice(0, 16) || `Oyuncu-${Math.floor(1000 + Math.random() * 9000)}`;
        const old = msg.token && byToken.get(msg.token);
        if (old && old !== conn && old.room) {
          conn.id = old.id; conn.token = old.token; conn.room = old.room;
          const r = old.room, i = r.seats.indexOf(old); if (i >= 0) r.seats[i] = conn;
          if (r.hostId === old.id) r.hostId = conn.id;
          byToken.set(conn.token, conn); conns.delete(old); old.room = null;
          send(conn, { t: S2C.WELCOME, id: conn.id, token: conn.token, nick: conn.nick });
          if (r.world) { syncHumans(r); send(conn, startMsg(r, conn)); }
          broadcastLobby(r);
          log(`geri bağlandı ${conn.nick} (${r.code})`);
          return;
        }
        conn.token = conn.token || randomBytes(12).toString('base64url');
        byToken.set(conn.token, conn);
        send(conn, { t: S2C.WELCOME, id: conn.id, token: conn.token, nick: conn.nick });
        send(conn, { t: S2C.ONLINE, n: online() });
        return;
      }
      case C2S.CREATE: { createRoom(conn, msg); return; }
      case C2S.LIST: { conn.watch = true; send(conn, roomList()); return; }
      case C2S.QUICK: {
        if (room) leaveRoom(conn);
        const r = quickPick(sanitize(msg).teamSize);
        if (!r) { createRoom(conn, { ...msg, private: false }); log(`hızlı katıl: uygun oda yok, ${conn.nick} kurdu`); return; }
        conn.input = blankInput();
        seat(r, conn, freeSeat(r)); conn.room = r;
        broadcastLobby(r);
        if (r.world) roster(r);
        log(`hızlı katıldı ${conn.nick} -> ${r.code}`);
        return;
      }
      case C2S.SETTINGS: {
        if (!room || room.hostId !== conn.id || room.state !== 'lobby') return;
        const { teamSize, difficulty } = sanitize(msg, room.settings);
        room.settings.difficulty = difficulty;
        if (typeof msg.private === 'boolean') room.settings.private = msg.private;
        if (teamSize !== room.settings.teamSize && !relayout(room, teamSize)) return error(conn, `Bu kip için oda kalabalık: ${members(room).length} kişi, ${playersFor(teamSize)} koltuk`, 'oda.kalabalik', { kisi: members(room).length, koltuk: playersFor(teamSize) });
        broadcastLobby(room);
        return;
      }
      case C2S.JOIN: {
        const code = normalizeCode(msg.code);
        const r = rooms.get(code);
        if (!r) return error(conn, 'Böyle bir oda yok', 'oda.yok');
        if (r.seats.includes(conn)) { broadcastLobby(r); if (r.world) send(conn, startMsg(r, conn)); return; }
        const slot = freeSeat(r);
        if (slot < 0) return error(conn, 'Oda dolu', 'oda.dolu');
        if (room) leaveRoom(conn);
        conn.input = blankInput();
        seat(r, conn, slot); conn.room = r;
        broadcastLobby(r);
        if (r.world) roster(r);
        log(`katıldı ${conn.nick} -> ${code}`);
        return;
      }
      case C2S.SEAT: {
        const slot = Math.round(+msg.slot);
        if (!room || !(slot >= 0 && slot < room.seats.length)) return;
        if (room.seats[slot]) return error(conn, 'Koltuk dolu: kuran yerini değiştirebilir', 'koltuk.dolu');
        seat(room, conn, slot);
        broadcastLobby(room);
        if (room.world) roster(room);
        return;
      }
      case C2S.MOVE: {
        const slot = Math.round(+msg.slot);
        if (!room || room.hostId !== conn.id || !(slot >= 0 && slot < room.seats.length)) return;
        const from = room.seats.findIndex(c => c && c.id === msg.id);
        if (from < 0 || from === slot) return;
        [room.seats[from], room.seats[slot]] = [room.seats[slot], room.seats[from]];
        if (room.world) roster(room);
        broadcastLobby(room);
        return;
      }
      case C2S.START: {
        if (!room || room.hostId !== conn.id || room.state !== 'lobby') return;
        startGame(room); return;
      }
      case C2S.LEAVE: { if (room) leaveRoom(conn); send(conn, { t: S2C.ONLINE, n: online() }); return; }
      case C2S.INPUT: { if (room && room.world) readInput(conn, msg); return; }
      case C2S.PING: { send(conn, { t: S2C.PONG, at: msg.at }); return; }
      default: return;
    }
  }

  let nextId = 1;
  return {
    attach(ws) {
      const conn = { id: nextId++, token: null, nick: '', ws, room: null, input: blankInput() };
      conns.add(conn); broadcastOnline();
      ws.on('message', data => { try { onMessage(conn, data); } catch (err) { log('mesaj hatası', err); } });
      ws.on('close', () => {
        conns.delete(conn); conn.ws = null; broadcastOnline(); roomsChanged();
        const r = conn.room; if (!r) return;
        if (r.world) {
          syncHumans(r);
          if (r.hostId === conn.id) r.hostId = nextHost(r);
          broadcastLobby(r); log(`koptu ${conn.nick} (${r.code})`); closeIfEmpty(r);
        }
        else leaveRoom(conn);
      });
      ws.on('error', () => {});
    },
    rooms,
    online: broadcastOnline,
    stats() { let inRoom = 0; for (const c of conns) if (c.room) inRoom++; return { rooms: rooms.size, online: online(), inRoom }; },
    close() { clearInterval(onlineTimer); clearTimeout(listTimer); for (const r of rooms.values()) stopRoom(r); },
  };
}
