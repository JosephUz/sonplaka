import { NET } from './net/protocol.js';

/**
 * Çok oyunculu ekranlar: giriş ekranındaki oda düğmeleri (ad, Oda kur, Odaya katıl + kod, çevrim içi sayısı) ve lobi
 * (oda kodu, link, iki takımın beşer koltuğu). Herkes boş (bot) koltuğa tıklayıp oturur. Yönetici oyuncuları taşır:
 * sürükleyip bir koltuğa bırakır ya da oyuncuya, sonra koltuğa tıklar; dolu koltukta ikisi yer değiştirir.
 * Sunucuya bağlanılamadıkça (kapalı ya da config.js → ONLINE ile kapatılmış) oda düğmeleri "Yakında" yazar ve basılmaz.
 */
export function createLobby(root, app) {
  const $ = id => root.querySelector('#sp-' + id);
  const el = {
    nick: $('nick'), create: $('create'), join: $('join'), joinRow: $('joinrow'), code: $('code'), joinGo: $('join-go'),
    online: $('online'), status: $('home-status'),
    lobbyCode: $('lobby-code'), seats: [$('seats-0'), $('seats-1')], hint: $('lobby-hint'), lobbyStatus: $('lobby-status'), start: $('lobby-start'),
  };
  const store = (k, v) => { try { if (v === undefined) return localStorage.getItem(k); localStorage.setItem(k, v); } catch { return null; } return v; };
  const defaultNick = () => `Oyuncu-${Math.floor(1000 + Math.random() * 9000)}`;
  el.nick.value = store('sp.nick') || defaultNick();
  const nick = () => { const v = el.nick.value.trim().slice(0, 16) || defaultNick(); el.nick.value = v; store('sp.nick', v); return v; };
  let lobby = null, picked = null;

  function setServer(up) {
    for (const b of [el.create, el.join, el.joinGo]) {
      b.disabled = !up; b.classList.toggle('soon', !up); b.title = up ? '' : 'Çok oyunculu yakında';
      const tag = b.querySelector('.soon-tag');
      if (b === el.joinGo) continue;
      if (!up && !tag) b.insertAdjacentHTML('beforeend', '<em class="soon-tag">YAKINDA</em>'); else if (up) tag?.remove();
    }
    if (!up) { el.joinRow.hidden = true; el.online.textContent = ''; }
  }
  setServer(false);

  el.create.onclick = () => { el.status.textContent = 'Oda kuruluyor…'; app.create(nick()); };
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

  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const roleName = slot => 'Oyuncu ' + (slot % 5 + 1);

  function render(next) {
    lobby = next; if (!lobby) return;
    const me = app.id(), host = lobby.hostId === me, mine = lobby.seats.findIndex(s => s && s.id === me);
    el.lobbyCode.textContent = lobby.code;
    if (picked != null && !lobby.seats.some(s => s && s.id === picked)) picked = null;
    for (const team of [0, 1]) {
      el.seats[team].innerHTML = Array.from({ length: NET.seats / 2 }, (_, k) => {
        const slot = team * 5 + k, s = lobby.seats[slot];
        const cls = ['seat', s ? 'taken' : 'free', s && s.id === me ? 'me' : '', s && !s.online ? 'off' : '', s && s.id === picked ? 'picked' : ''].filter(Boolean).join(' ');
        const who = s ? `${esc(s.nick)}${s.id === lobby.hostId ? ' <small>yönetici</small>' : ''}${s.online ? '' : ' <small>koptu</small>'}` : `Bot <small>${mine === slot ? '' : 'otur'}</small>`;
        return `<li class="${cls}" data-slot="${slot}"${s ? ` data-id="${s.id}"` : ''}${host && s ? ' draggable="true"' : ''}><em>${roleName(slot)}</em><span>${who}</span></li>`;
      }).join('');
    }
    for (const li of root.querySelectorAll('#sp-lobby .seat')) wire(li, host);
    const playing = lobby.state === 'playing';
    el.hint.textContent = (playing ? 'Maç sürüyor: boş bir koltuğa oturunca oyuna girersin. ' : 'Boş koltuğa tıklayıp otur; boş kalanları botlar oynar. ')
      + (host ? 'Yönetici olarak oyuncuları sürükleyip bırak (ya da oyuncuya, sonra koltuğa tıkla); dolu koltukta yer değiştirirler.' : '');
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
    nick, setServer, render,
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
