import { DIFFICULTIES, DIFFICULTY_LABEL, MODES, TEAMS, modeLabel, teamsFor } from './config.js';

/**
 * Çok oyunculu ekranlar: giriş ekranındaki oda düğmeleri (ad, Hızlı katıl, Oda kur + Özel oda, Odaya katıl + kod, çevrim
 * içi sayısı, açık odalar listesi: boş koltuklu herkese açık odalar, satıra basınca kodsuz katılınır) ve lobi
 * (oda kodu, link, kip ve bot zorluğu seçimi, takım sütunları ve koltuklar). Kip (herkes tek, 2v2 … 5v5) ve bot zorluğu
 * oda kurulurken giriş ekranındaki seçimle gelir, lobide yalnız yönetici değiştirir; koltuklar kipe göre dizilir. Herkes boş (bot) koltuğa
 * tıklayıp oturur: karşı takımdaki boş koltuğa geçince PvP, bütün insanlar aynı takımdaysa co-op (rakipler bot).
 * Yönetici oyuncuları taşır: sürükleyip bir koltuğa bırakır ya da oyuncuya, sonra koltuğa tıklar; dolu koltukta ikisi
 * yer değiştirir. Sunucuya bağlanılamadıkça (kapalı ya da config.js → ONLINE ile kapatılmış) oda düğmeleri "Yakında"
 * yazar ve basılmaz, açık odalar listesi gizlenir.
 */
export function createLobby(root, app) {
  const $ = id => root.querySelector('#sp-' + id);
  const el = {
    nick: $('nick'), quick: $('quick'), create: $('create'), priv: $('private'), join: $('join'), joinRow: $('joinrow'), code: $('code'), joinGo: $('join-go'),
    online: $('online'), status: $('home-status'), rooms: $('rooms'), roomsList: $('rooms-list'), roomsCount: $('rooms-count'),
    lobbyCode: $('lobby-code'), title: $('lobby-title'), mode: $('lobby-mode'), diff: $('lobby-diff'), teams: $('lobby-teams'), hint: $('lobby-hint'),
    lobbyStatus: $('lobby-status'), start: $('lobby-start'),
  };
  const store = (k, v) => { try { if (v === undefined) return localStorage.getItem(k); localStorage.setItem(k, v); } catch { return null; } return v; };
  const defaultNick = () => `Oyuncu-${Math.floor(1000 + Math.random() * 9000)}`;
  el.nick.value = store('sp.nick') || defaultNick();
  const nick = () => { const v = el.nick.value.trim().slice(0, 16) || defaultNick(); el.nick.value = v; store('sp.nick', v); return v; };
  let lobby = null, picked = null, serverUp = false;

  function setServer(up) {
    serverUp = up;
    el.priv.disabled = !up; el.rooms.hidden = !up;
    for (const b of [el.quick, el.create, el.join, el.joinGo]) {
      b.disabled = !up; b.classList.toggle('soon', !up); b.title = up ? '' : 'Çok oyunculu yakında';
      const tag = b.querySelector('.soon-tag');
      if (b === el.joinGo) continue;
      if (!up && !tag) b.insertAdjacentHTML('beforeend', '<em class="soon-tag">YAKINDA</em>'); else if (up) tag?.remove();
    }
    if (!up) { el.joinRow.hidden = true; el.online.textContent = ''; }
  }
  setServer(false);

  el.quick.onclick = () => { el.status.textContent = 'Oda aranıyor…'; app.quick(nick(), app.settingsChoice()); };
  el.create.onclick = () => { el.status.textContent = 'Oda kuruluyor…'; app.create(nick(), { ...app.settingsChoice(), private: el.priv.checked }); };
  el.join.onclick = () => { el.joinRow.hidden = !el.joinRow.hidden; if (!el.joinRow.hidden) el.code.focus(); };
  const joinGo = () => {
    const code = el.code.value.trim().toUpperCase();
    if (code.length < 4) { el.status.textContent = 'Oda kodunu yaz'; return; }
    el.status.textContent = 'Bağlanıyor…'; app.join(nick(), code);
  };
  el.joinGo.onclick = joinGo;
  el.code.addEventListener('keydown', e => { if (e.key === 'Enter') joinGo(); });
  el.nick.addEventListener('change', nick);
  for (const i of [el.nick, el.code]) i.addEventListener('keydown', e => e.stopPropagation());

  $('lobby-copy').onclick = () => {
    const url = `${location.origin}${location.pathname}?oda=${encodeURIComponent(lobby?.code || '')}`;
    const done = () => { el.lobbyStatus.textContent = 'Link kopyalandı'; setTimeout(() => render(lobby), 1500); };
    try { navigator.clipboard.writeText(url).then(done, () => { el.lobbyStatus.textContent = url; }); } catch { el.lobbyStatus.textContent = url; }
  };
  el.start.onclick = () => app.start();
  $('lobby-leave').onclick = () => app.leave();
  el.mode.innerHTML = MODES.map(n => `<option value="${n}">${modeLabel(n)}</option>`).join('');
  el.mode.onchange = () => app.settings({ teamSize: Number(el.mode.value) });
  el.diff.innerHTML = DIFFICULTIES.map(d => `<option value="${d}">${DIFFICULTY_LABEL[d]}</option>`).join('');
  el.diff.onchange = () => app.settings({ difficulty: el.diff.value });

  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  /** Açık odalar: her satırda yöneticinin adı, kip ve bot zorluğu, insan / koltuk, durum ve KATIL; kod gösterilmez. */
  function setRooms(list) {
    el.roomsCount.textContent = list.length ? String(list.length) : '';
    if (!list.length) { el.roomsList.innerHTML = '<div class="rooms-empty">Şu an açık oda yok. Hızlı katıl yeni bir oda kurar.</div>'; return; }
    el.roomsList.innerHTML = list.map(r => {
      const playing = r.state === 'playing';
      return `<button class="room${playing ? ' playing' : ''}" data-code="${esc(r.code)}" title="${playing ? 'Maç sürüyor: boş koltuğa oturup oyuna girersin' : 'Lobide, yöneticinin başlatması bekleniyor'}">`
        + `<span><b>${esc(r.host)}</b><small>${modeLabel(r.teamSize)} · ${r.humans}/${r.seats} oyuncu · bot ${(DIFFICULTY_LABEL[r.difficulty] || '').toLocaleLowerCase('tr')}</small></span>`
        + `<span class="room-go"><i>${playing ? 'MAÇTA' : 'LOBİDE'}</i><em>KATIL →</em></span></button>`;
    }).join('');
    for (const b of el.roomsList.querySelectorAll('.room')) b.onclick = () => { if (!serverUp) return; el.status.textContent = 'Bağlanıyor…'; app.join(nick(), b.dataset.code); };
  }
  setRooms([]);

  function render(next) {
    lobby = next; if (!lobby) return;
    const me = app.id(), host = lobby.hostId === me, mine = lobby.seats.findIndex(s => s && s.id === me);
    const n = lobby.settings?.teamSize || 5, teams = teamsFor(n), diff = lobby.settings?.difficulty || 'normal';
    el.lobbyCode.textContent = lobby.code;
    el.title.textContent = `ODA · ${modeLabel(n)} · BOT ${DIFFICULTY_LABEL[diff] || diff}${lobby.private ? ' · ÖZEL (yalnız kodla)' : ''}`;
    el.mode.value = String(n); el.mode.disabled = !host || lobby.state === 'playing';
    el.diff.value = diff; el.diff.disabled = !host || lobby.state === 'playing';
    if (picked != null && !lobby.seats.some(s => s && s.id === picked)) picked = null;
    el.teams.style.setProperty('--cols', teams);
    el.teams.innerHTML = Array.from({ length: teams }, (_, team) => {
      const seats = Array.from({ length: n }, (_, k) => {
        const slot = team * n + k, s = lobby.seats[slot];
        const cls = ['seat', s ? 'taken' : 'free', s && s.id === me ? 'me' : '', s && !s.online ? 'off' : '', s && s.id === picked ? 'picked' : ''].filter(Boolean).join(' ');
        const who = s ? `${esc(s.nick)}${s.id === lobby.hostId ? ' <small>yönetici</small>' : ''}${s.online ? '' : ' <small>koptu</small>'}` : `Bot <small>${mine === slot ? '' : 'otur'}</small>`;
        return `<li class="${cls}" data-slot="${slot}"${s ? ` data-id="${s.id}"` : ''}${host && s ? ' draggable="true"' : ''}>${n > 1 ? `<em>Koltuk ${k + 1}</em>` : ''}<span>${who}</span></li>`;
      }).join('');
      return `<div class="lobby-team" style="--tc:${TEAMS.colors[team]}"><b>${TEAMS.names[team]}</b><ol>${seats}</ol></div>`;
    }).join('');
    for (const li of root.querySelectorAll('#sp-lobby .seat')) wire(li, host);
    const playing = lobby.state === 'playing';
    const humanTeams = new Set(lobby.seats.map((s, i) => (s ? Math.floor(i / n) : -1)).filter(t => t >= 0));
    const kind = n === 1 ? 'Herkes tek: herkes herkese karşı, boş koltuklar bot.' : humanTeams.size > 1 ? 'PvP: birden çok takımda insan var; boş koltuklar bot.' : 'Co-op: bütün insanlar aynı takımda, rakipler bot. Karşı takımdaki boş koltuğa tıklayıp PvP yapabilirsin.';
    el.hint.textContent = kind + ' ' + (playing ? 'Maç sürüyor: boş bir koltuğa oturunca oyuna girersin.' : '')
      + (host ? ' Yönetici olarak kipi değiştirir, oyuncuları sürükleyip bırakırsın (ya da oyuncuya, sonra koltuğa tıkla); dolu koltukta yer değiştirirler.' : '');
    el.start.hidden = !host || playing;
    el.lobbyStatus.textContent = host ? (picked != null ? 'Taşınacak koltuğa tıkla' : '') : playing ? '' : 'Yöneticinin başlatması bekleniyor';
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
    urlCode() {
      const c = new URLSearchParams(location.search).get('oda');
      if (c) el.code.value = c.toUpperCase();
      return c ? c.toUpperCase() : null;
    },
    showJoin() { el.joinRow.hidden = false; },
  };
}
