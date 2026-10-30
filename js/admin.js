// ── Admin (#/admin) ──────────────────────────────────────────────────────
// Klassiskt script. Beror på index.html: api(), esc(), el(), setMenuForUser().
// Endast för admin (annars skickas man till startsidan). Hantera klinikens användare:
// lägg till, ändra namn/telefon, reservstatus, admin, aktiv/inaktiv och återställ PIN.
// Backend skyddar allt (admin-krav, egen klinik, ingen självinaktivering) — detta är bara UI:t.

let _admin = null;

const randomPin = () => String(crypto.getRandomValues(new Uint32Array(1))[0] % 10000).padStart(4, '0');

// "Arvid Lindgren" → "arvid.l" (samma mönster som de migrerade användarna). Admin kan ändra.
function suggestUsername(name) {
  const parts = name.trim().toLowerCase().replace(/[åä]/g, 'a').replace(/ö/g, 'o').replace(/[éè]/g, 'e')
    .split(/\s+/).map(p => p.replace(/[^a-z0-9]+/g, '.').replace(/^\.+|\.+$/g, '')).filter(Boolean);
  if (!parts.length) return '';
  return parts.length === 1 ? parts[0] : parts[0] + '.' + parts[parts.length - 1][0];
}

async function renderAdmin(root) {
  root.innerHTML = '<p class="muted">Laddar…</p>';
  try {
    const me = await api('/me');
    setMenuForUser(me);
    if (!me.isAdmin) { location.hash = '#/'; return; }
    _admin = { me, open: new Set(), notice: null, pin: randomPin(), userTouched: false };
    drawAdmin(root);
  } catch (err) {
    root.innerHTML = `<p class="err">${esc(err.message)}</p>`;
  }
}

async function reloadAdmin() {
  _admin.me = await api('/me');
  drawAdmin(el('view'));
}

function adminChips(u) {
  return [
    u.isAdmin ? '<span class="tagchip admin">Admin</span>' : '',
    !u.active ? '<span class="tagchip off">Inaktiv</span>' : '',
    u.active && u.availableReserve ? '<span class="tagchip">Reserv</span>' : ''
  ].join(' ');
}

function userBlock(u, selfId) {
  const isSelf = u.id === selfId;
  return `
    <details data-id="${esc(u.id)}"${_admin.open.has(u.id) ? ' open' : ''}>
      <summary>
        <span class="uname">${esc(u.displayName)}${isSelf ? ' <span class="muted">(du)</span>' : ''}</span>
        <span class="uuser">${esc(u.username || '')}</span> ${adminChips(u)}
      </summary>
      <div class="body">
        <div class="field-row">
          <div><label>Fullständigt namn</label><input type="text" data-f="name" value="${esc(u.displayName)}" maxlength="60"></div>
          <div><label>Telefon</label><input type="tel" data-f="phone" value="${esc(u.phone || '')}" maxlength="30" inputmode="tel" placeholder="070-123 45 67"></div>
        </div>
        <div class="row" style="margin-top:10px"><button class="btn" data-a="save">Spara</button></div>
        <label class="check"><input type="checkbox" data-a="reserve" ${u.availableReserve ? 'checked' : ''}> Tillgänglig som reserv</label>
        <label class="check"><input type="checkbox" data-a="admin" ${u.isAdmin ? 'checked' : ''} ${isSelf ? 'disabled' : ''}> Admin</label>
        <label class="check"><input type="checkbox" data-a="active" ${u.active ? 'checked' : ''} ${isSelf ? 'disabled' : ''}> Aktiv (kan logga in)</label>
        ${isSelf ? '<p class="hint">Du kan inte inaktivera dig själv eller ta bort din egen adminrätt.</p>' : ''}
        <div class="row" style="margin-top:12px"><button class="btn-ghost" data-a="resetpin">Återställ PIN…</button></div>
        <div class="status" data-s></div>
      </div>
    </details>`;
}

function drawAdmin(root) {
  // Behåll vilka användare som är uppfällda över omritning.
  const openNow = [...document.querySelectorAll('.ulist details[open]')].map(d => d.dataset.id);
  if (openNow.length || document.querySelector('.ulist')) _admin.open = new Set(openNow);

  const { me, notice } = _admin;
  const roster = [...(me.roster || [])].sort((a, b) => a.displayName.localeCompare(b.displayName, 'sv'));
  const active = roster.filter(u => u.active), inactive = roster.filter(u => !u.active);

  root.innerHTML = `
    <h1 class="page">Admin</h1>

    ${notice ? `<div class="card notice ${notice.tone === 'warn' ? 'warn' : ''}">
      <div>${notice.html}</div>
      <div class="row" style="margin-top:8px"><button class="link-btn" style="color:var(--ink-soft)" onclick="_admin.notice=null;drawAdmin(el('view'))">Stäng</button></div>
    </div>` : ''}

    <div class="card">
      <h2>Lägg till användare</h2>
      <form id="au-form" onsubmit="return addUser(event)">
        <div class="field-row">
          <div><label for="au-name" style="margin-top:0">Fullständigt namn</label>
            <input type="text" id="au-name" maxlength="60" required oninput="onAuName(this.value)"></div>
          <div><label for="au-user" style="margin-top:0">Användarnamn</label>
            <input type="text" id="au-user" autocapitalize="none" spellcheck="false" required oninput="_admin.userTouched=true"></div>
        </div>
        <div class="field-row">
          <div><label for="au-phone">Telefon (valfritt)</label>
            <input type="tel" id="au-phone" maxlength="30" inputmode="tel" placeholder="070-123 45 67"></div>
          <div><label for="au-pin">Tillfällig PIN</label>
            <div class="row" style="flex-wrap:nowrap">
              <input type="text" id="au-pin" inputmode="numeric" maxlength="4" value="${esc(_admin.pin)}" style="max-width:120px" required>
              <button type="button" class="btn-ghost" onclick="el('au-pin').value=randomPin()">Slumpa</button>
            </div></div>
        </div>
        <label class="check"><input type="checkbox" id="au-admin"> Admin</label>
        <div class="row" style="margin-top:12px"><button type="submit" class="btn">Lägg till</button></div>
        <div id="au-status" class="status err"></div>
      </form>
    </div>

    <div class="card">
      <h2>Användare (${active.length})</h2>
      <div class="ulist" id="ulist-active">${active.map(u => userBlock(u, me.userId)).join('') || '<p class="muted">Inga användare.</p>'}</div>
    </div>

    ${inactive.length ? `<div class="card">
      <h2>Inaktiva (${inactive.length})</h2>
      <div class="ulist" id="ulist-inactive">${inactive.map(u => userBlock(u, me.userId)).join('')}</div>
    </div>` : ''}
  `;

  root.querySelectorAll('.ulist').forEach(list => {
    list.addEventListener('click', onUserClick);
    list.addEventListener('change', onUserChange);
  });
}

function onAuName(v) {
  if (!_admin.userTouched) el('au-user').value = suggestUsername(v);
}

async function addUser(e) {
  e.preventDefault();
  const st = el('au-status'); st.textContent = '';
  const body = {
    displayName: el('au-name').value.trim(),
    username: el('au-user').value.trim(),
    phone: el('au-phone').value,
    tempPin: el('au-pin').value.trim(),
    isAdmin: el('au-admin').checked
  };
  try {
    await api('/admin/users', { method: 'POST', body });
    _admin.notice = { tone: 'ok', html:
      `Användare skapad: <strong>${esc(body.displayName)}</strong><br>`
      + `Användarnamn <strong>${esc(body.username)}</strong> · tillfällig PIN <strong>${esc(body.tempPin)}</strong><br>`
      + `<span class="muted">Visas bara nu. Personen väljer en egen PIN vid första inloggningen.</span>` };
    _admin.pin = randomPin(); _admin.userTouched = false;
    await reloadAdmin();
    window.scrollTo(0, 0);
  } catch (err) { st.textContent = err.message; }
  return false;
}

function userStatus(detailsEl, text, ok) {
  const box = detailsEl.querySelector('[data-s]'); if (!box) return;
  box.textContent = text; box.className = 'status ' + (ok ? 'ok' : 'err');
}

async function userAction(detailsEl, fn, okText) {
  const id = detailsEl.dataset.id;
  try {
    await fn(id);
    _admin.open.add(id);
    await reloadAdmin();
    const again = document.querySelector(`.ulist details[data-id="${CSS.escape(id)}"]`);
    if (again && okText) userStatus(again, okText, true);
  } catch (err) {
    userStatus(detailsEl, err.message, false);
    await reloadAdmin().catch(() => {});   // återställ kryssrutor som inte gick igenom
  }
}

function onUserClick(e) {
  const btn = e.target.closest('button[data-a]');
  if (!btn) return;
  const d = btn.closest('details');
  const u = (_admin.me.roster || []).find(x => x.id === d.dataset.id);
  if (btn.dataset.a === 'save') {
    userAction(d, id => api('/profile', { method: 'PUT', body: {
      userId: id, displayName: d.querySelector('[data-f="name"]').value, phone: d.querySelector('[data-f="phone"]').value
    } }), 'Sparat.');
  } else if (btn.dataset.a === 'resetpin') {
    if (!confirm(`Återställa PIN för ${u.displayName}? Den gamla slutar gälla och personen måste välja en ny vid nästa inloggning.`)) return;
    const pin = randomPin();
    userAction(d, async id => {
      await api('/admin/users/' + encodeURIComponent(id), { method: 'PATCH', body: { newTempPin: pin } });
      _admin.notice = { tone: 'warn', html: `Ny tillfällig PIN för <strong>${esc(u.displayName)}</strong> (${esc(u.username || '')}): <strong>${pin}</strong><br><span class="muted">Visas bara nu.</span>` };
    });
  }
}

function onUserChange(e) {
  const box = e.target.closest('input[type=checkbox][data-a]');
  if (!box) return;
  const d = box.closest('details');
  const u = (_admin.me.roster || []).find(x => x.id === d.dataset.id);
  const a = box.dataset.a, on = box.checked;
  if (a === 'active' && !on && !confirm(`Inaktivera ${u.displayName}? Personen kan inte längre logga in. Befintliga bokningar ligger kvar i kalendern.`)) { box.checked = true; return; }
  userAction(d, id => {
    if (a === 'reserve') return api('/reserve', { method: 'PUT', body: { available: on, userId: id } });
    if (a === 'admin') return api('/admin/users/' + encodeURIComponent(id), { method: 'PATCH', body: { isAdmin: on } });
    return api('/admin/users/' + encodeURIComponent(id), { method: 'PATCH', body: { active: on } });
  }, 'Sparat.');
}
