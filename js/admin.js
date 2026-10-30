// ── Admin (#/admin) ──────────────────────────────────────────────────────
// Klassiskt script. Beror på index.html: api(), esc(), el(), setMenuForUser() och js/import.js (OpjourImport).
// Endast för admin (annars skickas man till startsidan). Hantera klinikens användare:
// lägg till (en och en eller via fil), ändra namn/telefon, reservstatus, admin, aktiv/inaktiv och återställ PIN.
// Roller: Användare, Admin och Visning (väggskärmen — loggar in som vilket konto som helst men ser bara kalendern).
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

const ROLE_LABEL = { user: 'Användare', admin: 'Admin', display: 'Visning' };

async function renderAdmin(root) {
  root.innerHTML = '<p class="muted">Laddar…</p>';
  try {
    const me = await api('/me');
    setMenuForUser(me);
    if (!me.isAdmin) { location.hash = '#/'; return; }
    _admin = { me, open: new Set(), notice: null, pin: randomPin(), userTouched: false, plan: null };
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
    u.isDisplay ? '<span class="tagchip admin">Visning</span>' : '',
    u.isAdmin ? '<span class="tagchip admin">Admin</span>' : '',
    !u.active ? '<span class="tagchip off">Inaktiv</span>' : '',
    u.active && u.availableReserve && !u.isDisplay ? '<span class="tagchip">Reserv</span>' : ''
  ].join(' ');
}

function sw(attrs, checked, disabled) {
  return `<span class="switch"><input type="checkbox" role="switch" ${attrs} ${checked ? 'checked' : ''} ${disabled ? 'disabled' : ''}><span class="track"><span class="knob"></span></span></span>`;
}

function userBlock(u, selfId) {
  const isSelf = u.id === selfId;
  const bookings = u.claimCount ? ` · ${u.claimCount} bokning${u.claimCount === 1 ? '' : 'ar'}` : '';
  return `
    <details data-id="${esc(u.id)}"${_admin.open.has(u.id) ? ' open' : ''}>
      <summary>
        <span class="uname">${esc(u.displayName)}${isSelf ? ' <span class="muted">(du)</span>' : ''}</span>
        <span class="uuser">${esc(u.username || '')}${bookings}</span> ${adminChips(u)}
      </summary>
      <div class="body">
        <div class="field-row">
          <div><label>${u.isDisplay ? 'Namn (kontonamn)' : 'Fullständigt namn'}</label><input type="text" data-f="name" value="${esc(u.displayName)}" maxlength="60"></div>
          <div><label>Användarnamn</label><input type="text" data-f="username" value="${esc(u.username || '')}" maxlength="60" autocapitalize="none" spellcheck="false"></div>
          ${u.isDisplay ? '' : `<div><label>Telefon</label><input type="tel" data-f="phone" value="${esc(u.phone || '')}" maxlength="30" inputmode="tel" placeholder="070-123 45 67"></div>`}
        </div>
        <div class="row" style="margin-top:10px"><button class="btn" data-a="save">Spara</button></div>
        ${u.isDisplay ? '<p class="hint">Visningskonto: loggar in som alla andra men ser bara kalendern (ingen bokning, ingen reserv).</p>' : `
        <div class="opt-row" style="margin-top:12px"><span>Tillgänglig som reserv</span>${sw('data-a="reserve"', u.availableReserve)}</div>
        <div class="opt-row"><span>Admin</span>${sw('data-a="admin"', u.isAdmin, isSelf)}</div>`}
        <div class="opt-row"><span>Aktiv <span class="muted">(kan logga in)</span></span>${sw('data-a="active"', u.active, isSelf)}</div>
        ${isSelf ? '<p class="hint">Du kan inte inaktivera, ta bort eller degradera dig själv.</p>' : ''}
        <div class="row" style="margin-top:12px;gap:8px">
          <button class="btn-ghost" data-a="resetpin">Återställ PIN…</button>
          ${isSelf ? '' : '<button class="btn-ghost" style="color:var(--danger);border-color:#e3b3ab" data-a="delete">Radera användare…</button>'}
        </div>
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
      <div class="row" style="margin-top:8px">
        ${notice.csv ? '<button class="btn-ghost" onclick="downloadPinList()">Ladda ner PIN-lista (CSV)</button>' : ''}
        <button class="link-btn" style="color:var(--ink-soft)" onclick="_admin.notice=null;_admin.created=null;drawAdmin(el('view'))">Stäng</button>
      </div>
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
          <div><label for="au-role">Roll</label>
            <select id="au-role" onchange="onAuRole(this.value)">
              <option value="user">Användare</option>
              <option value="admin">Admin</option>
              <option value="display">Visning (väggskärm)</option>
            </select></div>
          <div id="au-phone-wrap"><label for="au-phone">Telefon (valfritt)</label>
            <input type="tel" id="au-phone" maxlength="30" inputmode="tel" placeholder="070-123 45 67"></div>
        </div>
        <div class="field-row">
          <div><label for="au-pin">Tillfällig PIN</label>
            <div class="row" style="flex-wrap:nowrap">
              <input type="text" id="au-pin" inputmode="numeric" maxlength="4" value="${esc(_admin.pin)}" style="max-width:120px" required>
              <button type="button" class="btn-ghost" onclick="el('au-pin').value=randomPin()">Slumpa</button>
            </div></div>
        </div>
        <div class="row" style="margin-top:12px"><button type="submit" class="btn">Lägg till</button></div>
        <div id="au-status" class="status err"></div>
      </form>
    </div>

    <div class="card">
      <h2>Importera användare</h2>
      <p class="hint" style="margin-top:0">Ladda upp en lista som CSV eller Excel (.xlsx). Kolumner: <strong>Fullständigt namn</strong> (obligatorisk), Användarnamn, Telefon, Roll och Reserv. Filen läses i din webbläsare; en förhandsvisning visas innan något skapas. Befintliga användarnamn hoppas över.</p>
      <div class="row" style="margin-top:10px">
        <button class="btn-ghost" onclick="downloadImportTemplate()">Ladda ner mall (CSV)</button>
        <input type="file" id="imp-file" accept=".csv,.txt,.xlsx" onchange="onImportFile(this.files[0])">
      </div>
      <div id="imp-out"></div>
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
  if (_admin.plan) drawImportPlan();
}

function onAuName(v) {
  if (!_admin.userTouched) el('au-user').value = suggestUsername(v);
}
function onAuRole(role) {
  el('au-phone-wrap').classList.toggle('hidden', role === 'display');
}

async function addUser(e) {
  e.preventDefault();
  const st = el('au-status'); st.textContent = '';
  const body = {
    displayName: el('au-name').value.trim(),
    username: el('au-user').value.trim(),
    phone: el('au-phone').value,
    tempPin: el('au-pin').value.trim(),
    role: el('au-role').value
  };
  try {
    await api('/admin/users', { method: 'POST', body });
    _admin.notice = { tone: 'ok', html:
      `${esc(ROLE_LABEL[body.role])}skonto skapat: <strong>${esc(body.displayName)}</strong><br>`
      + `Användarnamn <strong>${esc(body.username)}</strong> · PIN <strong>${esc(body.tempPin)}</strong><br>`
      + `<span class="muted">Visas bara nu. ${body.role === 'display' ? 'Logga in på skärmen med dessa uppgifter.' : 'Personen väljer en egen PIN vid första inloggningen.'}</span>` };
    _admin.pin = randomPin(); _admin.userTouched = false;
    await reloadAdmin();
    window.scrollTo(0, 0);
  } catch (err) { st.textContent = err.message; }
  return false;
}

// ── Import ────────────────────────────────────────────────────────────────
function downloadFile(name, text, type = 'text/csv;charset=utf-8') {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = Object.assign(document.createElement('a'), { href: url, download: name });
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function downloadImportTemplate() { downloadFile('opjour-importmall.csv', OpjourImport.templateCsv()); }

async function onImportFile(file) {
  const out = el('imp-out');
  if (!file) return;
  out.innerHTML = '<p class="muted">Läser filen…</p>';
  try {
    const { rows, lines } = OpjourImport.rowsFromTable(await OpjourImport.readTable(file));
    if (!rows.length) { out.innerHTML = '<p class="err">Filen innehåller inga rader att importera (bara rubriker/kommentarer).</p>'; return; }
    const plan = await api('/admin/users/import', { method: 'POST', body: { rows, dryRun: true } });
    _admin.plan = { rows, lines, items: plan.items, counts: plan.counts, fileName: file.name };
    drawImportPlan();
  } catch (err) {
    _admin.plan = null;
    out.innerHTML = `<p class="err">${esc(err.message)}</p>`;
  }
}

function drawImportPlan() {
  const out = el('imp-out'), p = _admin.plan;
  const label = { ok: '<span class="tagchip" style="color:var(--ok)">Ny</span>', exists: '<span class="tagchip">Finns redan</span>', error: '<span class="tagchip off">Fel</span>' };
  out.innerHTML = `
    <p style="margin:14px 0 6px"><strong>${esc(p.fileName)}</strong>: ${p.counts.ok} nya · ${p.counts.exists} finns redan · ${p.counts.error} med fel</p>
    <div style="overflow-x:auto"><table class="imp-table">
      <tr><th>Rad</th><th>Namn</th><th>Användarnamn</th><th>Roll</th><th>Telefon</th><th>Status</th></tr>
      ${p.items.map((it, i) => `<tr class="${it.status}">
        <td>${p.lines[i]}</td><td>${esc(it.displayName)}</td><td>${esc(it.username)}</td><td>${esc(ROLE_LABEL[it.role] || '')}${it.reserve ? ' · reserv' : ''}</td>
        <td>${esc(it.phone || '')}</td><td>${label[it.status]} ${esc(it.error || '')}</td></tr>`).join('')}
    </table></div>
    <div class="row" style="margin-top:12px">
      ${p.counts.ok ? `<button class="btn" onclick="confirmImport()">Importera ${p.counts.ok} användare</button>` : ''}
      <button class="btn-ghost" onclick="_admin.plan=null;el('imp-file').value='';el('imp-out').innerHTML=''">Avbryt</button>
    </div>
    ${p.counts.error ? '<p class="hint">Rader med fel hoppas över. Rätta filen och ladda upp den igen om de ska med.</p>' : ''}
    <div id="imp-status" class="status err"></div>`;
}

async function confirmImport() {
  const st = el('imp-status'); st.textContent = '';
  try {
    const r = await api('/admin/users/import', { method: 'POST', body: { rows: _admin.plan.rows } });
    _admin.created = r.created;
    _admin.plan = null;
    _admin.notice = { tone: 'ok', csv: true, html:
      `<strong>${r.created.length} användare skapade.</strong> Dela ut användarnamn och tillfällig PIN — de visas bara nu.`
      + `<div style="overflow-x:auto;margin-top:8px"><table class="imp-table"><tr><th>Namn</th><th>Användarnamn</th><th>Roll</th><th>PIN</th></tr>`
      + r.created.map(c => `<tr><td>${esc(c.displayName)}</td><td>${esc(c.username)}</td><td>${esc(ROLE_LABEL[c.role])}</td><td><strong>${esc(c.pin)}</strong></td></tr>`).join('')
      + `</table></div>` };
    await reloadAdmin();
    window.scrollTo(0, 0);
  } catch (err) { st.textContent = err.message; }
}

function downloadPinList() {
  const rows = [['Namn', 'Användarnamn', 'Roll', 'Tillfällig PIN'], ...(_admin.created || []).map(c => [c.displayName, c.username, ROLE_LABEL[c.role], c.pin])];
  downloadFile('opjour-pin-lista.csv', OpjourImport.toCsv(rows));
}

// ── Användarlista ─────────────────────────────────────────────────────────
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
    _admin.open.add(id);
    await reloadAdmin().catch(() => {});   // återställ kryssrutor som inte gick igenom
    const again = document.querySelector(`.ulist details[data-id="${CSS.escape(id)}"]`);
    userStatus(again || detailsEl, err.message, false);
  }
}

function onUserClick(e) {
  const btn = e.target.closest('button[data-a]');
  if (!btn) return;
  const d = btn.closest('details');
  const u = (_admin.me.roster || []).find(x => x.id === d.dataset.id);
  if (btn.dataset.a === 'save') {
    userAction(d, id => {
      const body = { userId: id, displayName: d.querySelector('[data-f="name"]').value, username: d.querySelector('[data-f="username"]').value };
      const phone = d.querySelector('[data-f="phone"]');
      if (phone) body.phone = phone.value;
      return api('/profile', { method: 'PUT', body });
    }, 'Sparat.');
  } else if (btn.dataset.a === 'delete') {
    const n = u.claimCount || 0, f = u.futureClaimCount || 0;
    const warn = n
      ? `\n\n${u.displayName} har ${n} bokning${n === 1 ? '' : 'ar'}${f ? ` (varav ${f} kommande)` : ''} som också raderas ur kalendern och statistiken. Vill du behålla historiken ska du i stället stänga av "Aktiv".`
      : '';
    if (!confirm(`Radera ${u.displayName} (${u.username}) PERMANENT?${warn}\n\nDet går inte att ångra.`)) return;
    userAction(d, async id => {
      const r = await api('/admin/users/' + encodeURIComponent(id), { method: 'DELETE' });
      _admin.notice = { tone: 'warn', html: `<strong>${esc(r.deleted)}</strong> är raderad${r.claimsRemoved ? ` (${r.claimsRemoved} bokning${r.claimsRemoved === 1 ? '' : 'ar'} togs bort)` : ''}.` };
    });
  } else if (btn.dataset.a === 'resetpin') {
    if (!confirm(`Återställa PIN för ${u.displayName}? Den gamla slutar gälla${u.isDisplay ? '' : ' och personen måste välja en ny vid nästa inloggning'}.`)) return;
    const pin = randomPin();
    userAction(d, async id => {
      await api('/admin/users/' + encodeURIComponent(id), { method: 'PATCH', body: { newTempPin: pin } });
      _admin.notice = { tone: 'warn', html: `Ny ${u.isDisplay ? '' : 'tillfällig '}PIN för <strong>${esc(u.displayName)}</strong> (${esc(u.username || '')}): <strong>${pin}</strong><br><span class="muted">Visas bara nu.</span>` };
    });
  }
}

function onUserChange(e) {
  const box = e.target.closest('input[type=checkbox][data-a]');
  if (!box) return;
  const d = box.closest('details');
  const u = (_admin.me.roster || []).find(x => x.id === d.dataset.id);
  const a = box.dataset.a, on = box.checked;
  if (a === 'active' && !on && !confirm(`Inaktivera ${u.displayName}? Kontot kan inte längre logga in. Befintliga bokningar ligger kvar i kalendern.`)) { box.checked = true; return; }
  userAction(d, id => {
    if (a === 'reserve') return api('/reserve', { method: 'PUT', body: { available: on, userId: id } });
    if (a === 'admin') return api('/admin/users/' + encodeURIComponent(id), { method: 'PATCH', body: { isAdmin: on } });
    return api('/admin/users/' + encodeURIComponent(id), { method: 'PATCH', body: { active: on } });
  }, 'Sparat.');
}
