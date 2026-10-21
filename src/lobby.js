import { DIFFICULTIES, DIFFICULTY_LABEL, MODES, TEAMS, modeLabel, teamsFor } from './config.js';
import { normalizeCode } from './net/protocol.js';

/**
 * Çok oyunculu ekranlar; josephuz oda standardına uyar (josephuz/docs/oda-standardi.md: sıra, davranış ve yazılar
 * bütün oyunlarda aynı).
 *
 * Giriş ekranı: ADIN (en üstte), tek başına seçimleri, ÇEVRİM İÇİ bölümü (`● N çevrim içi`, HIZLI KATIL →, ODA KUR,
 * ODAYA KATIL → kod satırı + KATIL, durum satırı) ve AÇIK ODALAR listesi (kuranın adı, `<kip> · Bot <zorluk> · n/max
 * oyuncu`, LOBİDE / MAÇTA, KATIL → ya da DOLU). Oda kur ve hızlı katıl ana ekrandaki kip ve bot zorluğuyla, herkese
 * açık oda kurar. Sunucuya bağlanılamadıkça (kapalı ya da config.js → ONLINE ile kapatılmış: Android uygulaması) üç
 * düğme kapalıdır, YAKINDA yazar, açık odalar listesi gizlenir.
 *
 * Bekleme odası: `ODA · <özet>`, büyük kod, Linki kopyala, görünürlük etiketi; takım sütunları ve koltuklar (`kuran`,
 * `sen`, `koptu`; boş koltuk `Bot · boş koltuk`, üstüne gelince `Buraya otur`). Herkes boş koltuğa tıklayıp oturur:
 * karşı takımdaki boş koltuğa geçince PvP, bütün insanlar aynı takımdaysa co-op (rakipler bot). Kuran oyuncuları
 * taşır (sürükle-bırak ya da oyuncuya, sonra koltuğa tıkla; dolu koltukta yer değiştirirler) ve ayarları (KAÇA KAÇ,
 * BOT, ODA: Herkese açık / Özel) değiştirir; ötekilerde ayarlar kapalı görünür.
 */
export function createLobby(root, app) {
  const $ = id => root.querySelector('#sp-' + id);
  const el = {
    nick: $('nick'), quick: $('quick'), create: $('create'), join: $('join'), joinRow: $('joinrow'), code: $('code'), joinGo: $('join-go'),
    online: $('online'), status: $('home-status'), rooms: $('rooms'), roomsList: $('rooms-list'), roomsCount: $('rooms-count'),
    lobbyCode: $('lobby-code'), title: $('lobby-title'), vis: $('lobby-vis'), mode: $('lobby-mode'), diff: $('lobby-diff'), priv: $('lobby-private'),
    teams: $('lobby-teams'), hint: $('lobby-hint'), lobbyStatus: $('lobby-status'), start: $('lobby-start'), copy: $('lobby-copy'),
  };
  const store = (k, v) => { try { if (v === undefined) return localStorage.getItem(k); localStorage.setItem(k, v); } catch { return null; } return v; };
  const defaultNick = () => `Oyuncu-${Math.floor(1000 + Math.random() * 9000)}`;
  el.nick.value = store('sp.nick') || defaultNick();
  const nick = () => { const v = el.nick.value.trim().slice(0, 16) || defaultNick(); el.nick.value = v; store('sp.nick', v); return v; };
  let lobby = null, picked = null, serverUp = false, copied = 0;

  function setServer(up) {
    serverUp = up;
    el.rooms.hidden = !up;
    for (const b of [el.quick, el.create, el.join, el.joinGo]) {
      b.disabled = !up; b.classList.toggle('soon', !up); b.title = up ? '' : 'Çok oyunculu yakında';
      if (b === el.joinGo) continue;
      const tag = b.querySelector('.soon-tag');
      if (!up && !tag) b.insertAdjacentHTML('beforeend', '<em class="soon-tag">YAKINDA</em>'); else if (up) tag?.remove();
    }
    if (!up) { el.joinRow.hidden = true; el.online.textContent = ''; }
  }
  setServer(false);

  el.quick.onclick = () => { el.status.textContent = 'Oda aranıyor…'; app.quick(nick(), app.settingsChoice()); };
  el.create.onclick = () => { el.status.textContent = 'Oda kuruluyor…'; app.create(nick(), app.settingsChoice()); };
  el.join.onclick = () => { el.joinRow.hidden = !el.joinRow.hidden; if (!el.joinRow.hidden) el.code.focus(); };
  const joinGo = () => {
    const code = normalizeCode(el.code.value);
    el.code.value = code;
    if (code.replace('-', '').length < 4) { el.status.textContent = 'Oda kodunu yaz'; return; }
    el.status.textContent = 'Odaya bağlanıyor…'; app.join(nick(), code);
  };
  el.joinGo.onclick = joinGo;
  el.code.addEventListener('keydown', e => { if (e.key === 'Enter') joinGo(); });
  el.nick.addEventListener('change', nick);
  for (const i of [el.nick, el.code]) i.addEventListener('keydown', e => e.stopPropagation());

  el.copy.onclick = () => {
    const url = `${location.origin}${location.pathname}?oda=${encodeURIComponent(lobby?.code || '')}`;
    const done = () => { el.copy.textContent = 'Link kopyalandı'; clearTimeout(copied); copied = setTimeout(() => { el.copy.textContent = 'Linki kopyala'; }, 1500); };
    try { navigator.clipboard.writeText(url).then(done, () => { el.lobbyStatus.textContent = url; }); } catch { el.lobbyStatus.textContent = url; }
  };
  el.start.onclick = () => app.start();
  $('lobby-leave').onclick = () => app.leave();
  el.mode.innerHTML = MODES.map(n => `<option value="${n}">${modeLabel(n)}</option>`).join('');
  el.mode.onchange = () => app.settings({ teamSize: Number(el.mode.value) });
  el.diff.innerHTML = DIFFICULTIES.map(d => `<option value="${d}">${DIFFICULTY_LABEL[d]}</option>`).join('');
  el.diff.onchange = () => app.settings({ difficulty: el.diff.value });
  el.priv.onchange = () => app.settings({ private: el.priv.value === '1' });

  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  /** Ayar özeti: `5v5 · Bot Normal` (herkes tekte `Herkes tek · Bot Zor`). */
  const diffName = d => { const l = DIFFICULTY_LABEL[d] || DIFFICULTY_LABEL.normal; return l[0] + l.slice(1).toLocaleLowerCase('tr'); };
  const summary = (n, d) => `${n === 1 ? 'Herkes tek' : modeLabel(n)} · Bot ${diffName(d)}`;

  /** Açık odalar: kuranın adı, ayar özeti ve n/max oyuncu, LOBİDE / MAÇTA, KATIL → ya da DOLU; kod gösterilmez. */
  function setRooms(list) {
    el.roomsCount.textContent = String(list.length);
    if (!list.length) { el.roomsList.innerHTML = '<div class="rooms-empty">Şu an açık oda yok. Hızlı katıl yeni bir oda kurar.</div>'; return; }
    el.roomsList.innerHTML = list.map(r => {
      const playing = r.state === 'playing', full = r.full ?? r.humans >= r.seats;
      return `<button class="room${playing ? ' playing' : ''}" data-code="${esc(r.code)}"${full ? ' disabled' : ''}>`
        + `<span><b>${esc(r.host)}</b><small>${summary(r.teamSize, r.difficulty)} · ${r.humans}/${r.seats} oyuncu</small></span>`
        + `<span class="room-go"><i>${playing ? 'MAÇTA' : 'LOBİDE'}</i><em>${full ? 'DOLU' : 'KATIL →'}</em></span></button>`;
    }).join('');
    for (const b of el.roomsList.querySelectorAll('.room')) b.onclick = () => { if (!serverUp || b.disabled) return; el.status.textContent = 'Odaya bağlanıyor…'; app.join(nick(), b.dataset.code); };
  }
  setRooms([]);

  function render(next) {
    lobby = next; if (!lobby) return;
    const me = app.id(), host = lobby.hostId === me, playing = lobby.state === 'playing';
    const n = lobby.settings?.teamSize || 5, teams = teamsFor(n), diff = lobby.settings?.difficulty || 'normal';
    const priv = Boolean(lobby.settings?.private ?? lobby.private);
    el.lobbyCode.textContent = lobby.code;
    el.title.textContent = `ODA · ${summary(n, diff)}`;
    el.vis.textContent = priv ? 'ÖZEL ODA · yalnız kodla' : 'AÇIK ODA · listede görünür';
    for (const s of [el.mode, el.diff, el.priv]) s.disabled = !host || playing;
    el.mode.value = String(n); el.diff.value = diff; el.priv.value = priv ? '1' : '0';
    if (picked != null && !lobby.seats.some(s => s && s.id === picked)) picked = null;
    el.teams.style.setProperty('--cols', teams);
    el.teams.innerHTML = Array.from({ length: teams }, (_, team) => {
      const seats = Array.from({ length: n }, (_, k) => {
        const slot = team * n + k, s = lobby.seats[slot];
        const cls = ['seat', s ? 'taken' : 'free', s && s.id === me ? 'me' : '', s && !s.online ? 'off' : '', s && s.id === picked ? 'picked' : ''].filter(Boolean).join(' ');
        const who = s
          ? `${esc(s.nick)}${s.id === lobby.hostId ? ' <small>kuran</small>' : ''}${s.id === me ? ' <small class="tag-me">sen</small>' : ''}${s.online ? '' : ' <small>koptu</small>'}`
          : 'Bot · boş koltuk <small class="sit">Buraya otur</small>';
        return `<li class="${cls}" data-slot="${slot}"${s ? ` data-id="${s.id}"` : ''}${host && s ? ' draggable="true"' : ''}>${n > 1 ? `<em>Koltuk ${k + 1}</em>` : ''}<span>${who}</span></li>`;
      }).join('');
      return `<div class="lobby-team" style="--tc:${TEAMS.colors[team]}"><b>${TEAMS.names[team]}</b><ol>${seats}</ol></div>`;
    }).join('');
    for (const li of root.querySelectorAll('#sp-lobby .seat')) wire(li, host);
    const humans = lobby.seats.filter(Boolean).length, bots = lobby.seats.length - humans;
    const humanTeams = new Set(lobby.seats.map((s, i) => (s ? Math.floor(i / n) : -1)).filter(t => t >= 0));
    const kind = n === 1 ? 'Herkes tek' : humanTeams.size > 1 ? 'PvP' : 'Co-op: rakipler bot';
    el.hint.textContent = `${humans} insan · ${bots} bot · ${kind}${playing ? ' · Maç sürüyor: boş koltuğa oturunca oyuna girersin' : ''}`;
    el.start.hidden = playing;
    el.start.disabled = !host;
    el.start.innerHTML = host ? 'MAÇI BAŞLAT <span>↗</span>' : 'Kuranın başlatması bekleniyor';
    el.lobbyStatus.textContent = host && picked != null ? 'Taşınacak koltuğa tıkla' : '';
  }

  function wire(li, host) {
    const slot = Number(li.dataset.slot), id = li.dataset.id ? Number(li.dataset.id) : null;
    li.onclick = () => {
      if (host && picked != null) { if (picked !== id) app.move(picked, slot); picked = null; render(lobby); return; }
      if (host && id != null) { picked = id; render(lobby); return; }
      if (id == null) app.seat(slot);
    };
    if (!host) return;
    li.ondragstart = e => { if (id == null) return; e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', String(id)); li.classList.add('dragging'); };
    li.ondragend = () => { li.classList.remove('dragging'); for (const x of root.querySelectorAll('#sp-lobby .drop')) x.classList.remove('drop'); };
    li.ondragover = e => { e.preventDefault(); li.classList.add('drop'); };
    li.ondragleave = () => li.classList.remove('drop');
    li.ondrop = e => { e.preventDefault(); li.classList.remove('drop'); const from = Number(e.dataTransfer.getData('text/plain')); if (from && from !== id) app.move(from, slot); };
  }

  return {
    nick, setServer, render, setRooms,
    setOnline(n) { el.online.textContent = n > 0 ? `● ${n} çevrim içi` : ''; el.online.title = 'Oyunu şu an açık tutan sekme sayısı'; },
    status(text) { el.status.textContent = text; el.lobbyStatus.textContent = text; },
    /** Davet linki: `?oda=KPRT-4` (tiresiz de olur). */
    urlCode() {
      const raw = new URLSearchParams(location.search).get('oda');
      const c = raw ? normalizeCode(raw) : null;
      if (c) el.code.value = c;
      return c || null;
    },
    /** Odadayken adres çubuğu `?oda=KOD`; odadan çıkınca `?oda` silinir (öbür parametreler kalır). */
    setUrlCode(code) {
      try {
        const u = new URL(location.href);
        if (code) u.searchParams.set('oda', code); else u.searchParams.delete('oda');
        if (u.href !== location.href) history.replaceState(history.state, '', u.pathname + u.search + u.hash);
      } catch { /* yok */ }
    },
    showJoin() { el.joinRow.hidden = false; },
  };
}
