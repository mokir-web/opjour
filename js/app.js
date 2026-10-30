// ── Startsida: kalendern (personlig vy) ──────────────────────────────────
// Klassiskt script. Beror på index.html: api(), esc(), el(), state, buildCalendar(),
// fmtDateLong(), personLine(), setMenuForUser(). Global entry: renderApp(root).
//
// Dagar visas med prioritet bokning > intresserade > reserv. Idag markeras i kalendern
// (IDAG-märke, tjock ram) och visar vem som är aktuell + telefon direkt i dagens ruta.
// Tryck på en dag öppnar dagsvyn (sheet) där man bokar, anmäler intresse eller tar bort sin bokning.
// Inställningar och admin ligger på egna sidor (js/settings.js, js/admin.js).

let _app = null;

async function renderApp(root) {
  root.innerHTML = '<p class="muted">Laddar…</p>';
  try {
    const [cal, me] = await Promise.all([api('/calendar'), api('/me')]);
    setMenuForUser(me);
    _app = { cal, me, acting: me.userId, sheet: null };
    drawApp(root);
    // På mobil: scrolla så att dagens rad syns (äldre veckor ligger ovanför).
    if (window.matchMedia('(max-width: 640px)').matches) {
      document.querySelector('.day.today')?.scrollIntoView({ block: 'center' });
    }
  } catch (err) {
    root.innerHTML = `<p class="err">${esc(err.message)}</p>`;
  }
}

async function reloadApp() {
  const [cal, me] = await Promise.all([api('/calendar'), api('/me')]);
  _app.cal = cal; _app.me = me;
  if (!me.roster || !me.roster.some(u => u.id === _app.acting)) _app.acting = me.userId;
  drawApp(el('view'));
}

function actingUser() {
  const { me, acting } = _app;
  const self = { id: me.userId, displayName: me.displayName };
  if (acting === me.userId) return self;
  return (me.roster || []).find(u => u.id === acting) || self;
}

const hasInterests = () => !!_app.cal.interestsByDate;
const interestsFor = d => (_app.cal.interestsByDate && _app.cal.interestsByDate[d]) || [];
const claimFor = d => _app.cal.claims.find(c => c.serviceDate === d);

function drawApp(root) {
  const { cal, me } = _app;

  let adminBar = '';
  if (me.isAdmin) {
    const opts = (me.roster || []).filter(u => u.active && !u.isDisplay).map(u =>
      `<option value="${esc(u.id)}"${u.id === _app.acting ? ' selected' : ''}>${esc(u.displayName)}${u.id === me.userId ? ' (jag)' : ''}</option>`
    ).join('');
    adminBar = `<div class="card"><label for="acting" style="margin-top:0">Boka / anmäl åt</label>
      <select id="acting" onchange="_app.acting=this.value;drawApp(el('view'))">${opts}</select></div>`;
  }

  const upcoming = (me.upcoming || []).length
    ? me.upcoming.map(u =>
        `<div class="pass-card"><span>${esc(fmtDateLong(u.serviceDate))}</span>
         <button class="link-btn" data-act="remove" data-id="${esc(u.id)}" data-name="${esc(me.displayName)}" data-date="${u.serviceDate}">Ta bort</button></div>`
      ).join('')
    : '<p class="muted">Inga kommande pass.</p>';

  let interestCard = '';
  if (hasInterests() && me.interests) {
    const rows = me.interests.length
      ? me.interests.map(i => {
          const c = claimFor(i.serviceDate);
          const note = c ? `<span class="muted"> · bokad av ${esc(c.displayName)}</span>`
                         : '<span class="muted"> · ingen bokad än</span>';
          return `<div class="pass-card"><span>${esc(fmtDateLong(i.serviceDate))}${note}</span>
                  <button class="link-btn" data-act="uninterest" data-date="${i.serviceDate}">Ta bort</button></div>`;
        }).join('')
      : '<p class="muted">Inga intresseanmälningar.</p>';
    interestCard = `<div class="card"><h2>Mina intresseanmälningar</h2>${rows}</div>`;
  }

  root.innerHTML = `
    ${adminBar}

    <div class="card">
      <h2>Kalender</h2>
      <p class="muted" style="margin-top:-4px;font-size:13px">
        Tryck på en dag för att boka${hasInterests() ? ' eller anmäla intresse' : ''}.
        Passerade dagar är låsta.
      </p>
      ${buildCalendar(cal, {
        interactive: true,
        todayDetail: true,
        actingId: _app.acting,
        isMine: c => c.userId === _app.acting
      })}
    </div>

    <div class="card">
      <h2>Mina kommande pass</h2>
      ${upcoming}
    </div>
    ${interestCard}
  `;

  root.querySelectorAll('[data-act]').forEach(node => node.addEventListener('click', onAction));
  drawSheet();
}

// ── Dagsvy ─────────────────────────────────────────────────────────────────
function drawSheet() {
  let root = el('sheet-root');
  if (!root) { root = document.createElement('div'); root.id = 'sheet-root'; document.body.appendChild(root); }
  const d = _app.sheet;
  if (!d) { root.innerHTML = ''; return; }

  const { cal, me } = _app;
  const acting = actingUser();
  const isSelf = acting.id === me.userId;
  const isPast = d < cal.todayISO;
  const claim = claimFor(d);
  const ints = interestsFor(d);
  const iAmInterested = ints.some(i => i.userId === acting.id);

  let body = '';
  if (claim) {
    const phone = d === cal.todayISO && cal.opjourToday ? cal.opjourToday.phone : '';
    body += `<p style="font-size:20px;margin:4px 0">Opjour: ${personLine(claim.displayName, phone)}</p>`;
    if (claim.createdByAdmin) body += '<p class="hint">Bokad av admin.</p>';
  } else {
    body += '<p style="font-size:18px;margin:4px 0">Ingen uppskriven.</p>';
    if (hasInterests()) {
      body += `<h3>Intresserade${ints.length ? ` (${ints.length})` : ''}</h3>`;
      if (!ints.length) body += '<p class="muted" style="margin:0">Ingen har anmält intresse.</p>';
      else {
        body += d === cal.todayISO
          ? `<ul class="plist">${ints.map(i => `<li>${personLine(i.displayName, i.phone)}${i.userId === acting.id ? ' <span class="muted">(du)</span>' : ''}</li>`).join('')}</ul>`
          : ints.map(i => `<span class="chip${i.userId === acting.id ? ' me' : ''}">${esc(i.displayName)}</span>`).join('');
        body += '<p class="hint">Kom överens med varandra — sedan bokar en av er.</p>';
      }
    }
    const res = (cal.reservesByDate && cal.reservesByDate[d]) || [];
    if (!isPast && !ints.length && res.length) {
      const withPhone = d === cal.todayISO ? cal.reservesToday : [];
      body += `<h3>Reserv</h3><ul class="plist">${res.map((r, i) => `<li>${personLine(r.displayName, (withPhone.find(x => x.id === r.id) || {}).phone, `${i + 1}. `)}</li>`).join('')}</ul>`;
    }
  }

  let actions = '';
  if (isPast) {
    actions = '<p class="hint">Passerade dagar är låsta.</p>';
  } else if (!claim) {
    actions += `<button class="btn btn-block" data-sheet="book">${isSelf ? 'Ta opjour' : 'Boka åt ' + esc(acting.displayName)}</button>`;
    if (hasInterests()) {
      actions += iAmInterested
        ? `<button class="btn btn-ghost btn-block" data-sheet="uninterest">${isSelf ? 'Ta bort mitt intresse' : 'Ta bort ' + esc(acting.displayName) + 's intresse'}</button>`
        : `<button class="btn btn-interest btn-block" data-sheet="interest">${isSelf ? 'Anmäl intresse' : 'Anmäl intresse åt ' + esc(acting.displayName)}</button>`;
    }
  } else if (claim.userId === me.userId || me.isAdmin) {
    actions += `<button class="btn btn-danger btn-block" data-sheet="unbook" data-id="${esc(claim.id)}">Ta bort bokningen</button>`;
  }

  root.innerHTML = `
    <div class="overlay" data-sheet="close">
      <div class="sheet" role="dialog" aria-label="Dag">
        <h2>${esc(fmtDateLong(d))} <button class="link-btn" style="color:var(--ink-soft);text-decoration:none;font-size:22px" data-sheet="close" aria-label="Stäng">✕</button></h2>
        ${body}
        <div style="margin-top:16px">${actions}</div>
        <div id="sheet-err" class="status err"></div>
      </div>
    </div>`;
  root.querySelectorAll('[data-sheet]').forEach(node => node.addEventListener('click', onSheetAction));
}

async function onSheetAction(e) {
  const kind = e.currentTarget.dataset.sheet;
  if (kind === 'close') {
    // Klick på bakgrunden stänger; klick inne i sheet:en (bubblar) ska inte göra det.
    if (e.currentTarget.classList.contains('overlay') && e.target !== e.currentTarget) return;
    _app.sheet = null; drawSheet(); return;
  }
  e.stopPropagation();
  const d = _app.sheet;
  const who = actingUser();
  const forOther = who.id !== _app.me.userId ? { userId: who.id } : {};
  try {
    if (kind === 'book') {
      await api('/bookings', { method: 'POST', body: { serviceDate: d, ...forOther } });
      _app.sheet = null;
    } else if (kind === 'unbook') {
      await api('/bookings/' + encodeURIComponent(e.currentTarget.dataset.id), { method: 'DELETE' });
    } else if (kind === 'interest' || kind === 'uninterest') {
      await api('/interests', { method: 'PUT', body: { serviceDate: d, interested: kind === 'interest', ...forOther } });
    }
    await reloadApp();
  } catch (err) {
    const box = el('sheet-err'); if (box) box.textContent = err.message;
  }
}

// ── Övriga klick (kalendercell, kort) ──────────────────────────────────────
async function onAction(e) {
  const b = e.currentTarget;
  const act = b.dataset.act;
  try {
    if (act === 'day') {
      _app.sheet = b.dataset.date; drawSheet();
    } else if (act === 'remove') {
      if (!confirm(`Ta bort ${b.dataset.name}s opjour ${fmtDateLong(b.dataset.date)}?`)) return;
      await api('/bookings/' + encodeURIComponent(b.dataset.id), { method: 'DELETE' });
      await reloadApp();
    } else if (act === 'uninterest') {
      await api('/interests', { method: 'PUT', body: { serviceDate: b.dataset.date, interested: false } });
      await reloadApp();
    }
  } catch (err) {
    alert(err.message);
  }
}
