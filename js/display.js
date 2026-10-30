// ── Visningsvy (EN sida, read-only) ──────────────────────────────────────
// Klassiskt script. Beror på index.html: api(), esc(), state, buildCalendar().
// Global entry: renderDisplay(root). Auto-uppdaterar var 60:e sekund.
// Prioritet: bokning > intresserade > reserv.

let _displayTimer = null;

async function renderDisplay(root) {
  await drawDisplay(root);
  clearInterval(_displayTimer);
  _displayTimer = setInterval(() => drawDisplay(root), 60000);
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) drawDisplay(root);
  });
}

async function drawDisplay(root) {
  let cal;
  try {
    cal = await api('/calendar');
  } catch (err) {
    if (!root.dataset.loaded) root.innerHTML = `<p class="err">${esc(err.message)}</p>`;
    return;
  }
  root.dataset.loaded = '1';

  const ints = (cal.interestsByDate && cal.interestsByDate[cal.todayISO]) || [];
  let banner;
  if (cal.opjourToday) {
    banner = `<div class="label">Dagens opjour</div><div class="name">${esc(cal.opjourToday.displayName)}</div>`
           + (cal.opjourToday.phone ? `<div class="phone-big">${phoneLink(cal.opjourToday.phone)}</div>` : '');
  } else if (ints.length) {
    banner = `<div class="label">Ingen uppskriven — intresserade</div>
      <ul class="plist">${ints.map(i => `<li>${personLine(i.displayName, i.phone)}</li>`).join('')}</ul>`;
  } else if (cal.reservesToday.length) {
    banner = `<div class="label">Ingen uppskriven — reserv</div>
      <ul class="plist">${cal.reservesToday.map((r, i) => `<li>${personLine(r.displayName, r.phone, `${i + 1}. `)}</li>`).join('')}</ul>`;
  } else {
    banner = `<div class="label">Dagens opjour</div><div class="name" style="font-size:24px;color:var(--ink-soft)">Ingen uppskriven</div>`;
  }

  root.innerHTML = `
    <div class="card big-today">${banner}
      <div class="muted" style="margin-top:12px;font-size:13px">${esc(cal.clinicName)} · ${cal.todayISO}</div>
    </div>
    <div class="card">
      ${buildCalendar(cal, { interactive: false })}
    </div>
  `;
}
