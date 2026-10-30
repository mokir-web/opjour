// ── Inställningar (#/settings) ───────────────────────────────────────────
// Klassiskt script. Beror på index.html: api(), esc(), el(), setMenuForUser().
// Egna uppgifter: reservstatus, kontaktuppgifter (telefon; namn ändras bara av admin) och byte av PIN.
// Admin ändrar andras uppgifter på Admin-sidan.

let _settings = null;

async function renderSettings(root) {
  root.innerHTML = '<p class="muted">Laddar…</p>';
  try {
    const me = await api('/me');
    setMenuForUser(me);
    _settings = { me };
    root.innerHTML = `
      <h1 class="page">Inställningar</h1>

      <div class="card">
        <h2>Reservstatus</h2>
        <label class="check" style="margin-top:0">
          <input type="checkbox" id="st-reserve" ${me.availableReserve ? 'checked' : ''} onchange="setReserve(this.checked)">
          Jag är tillgänglig som reserv
        </label>
        <p class="hint">Reserven rullar dag för dag bland dem som är tillgängliga. Är du markerad förväntas du kunna ta jouren om ingen annan skrivit upp sig — avmarkera hellre om du är otillgänglig.</p>
        <div id="st-reserve-status" class="status"></div>
      </div>

      <div class="card">
        <h2>Kontaktuppgifter</h2>
        ${me.isAdmin
          ? `<label for="st-name" style="margin-top:0">Fullständigt namn</label>
             <input type="text" id="st-name" value="${esc(me.displayName)}" maxlength="60">`
          : `<label style="margin-top:0">Namn</label><div>${esc(me.displayName)} <span class="muted">(ändras av admin)</span></div>`}
        <label for="st-phone">Telefonnummer</label>
        <input type="tel" id="st-phone" value="${esc(me.phone || '')}" placeholder="070-123 45 67" maxlength="30" inputmode="tel" autocomplete="tel">
        <p class="hint">Numret visas bara för den som är dagens opjour (eller intresserad/reserv när ingen är uppskriven) — aldrig i övrigt.</p>
        <div class="row" style="margin-top:10px"><button class="btn" onclick="saveContact()">Spara</button></div>
        <div id="st-contact-status" class="status"></div>
      </div>

      <div class="card">
        <h2>Byt PIN</h2>
        <label for="st-pin-cur" style="margin-top:0">Nuvarande PIN</label>
        <input type="password" id="st-pin-cur" inputmode="numeric" maxlength="4" autocomplete="current-password">
        <label for="st-pin-new">Ny PIN (4 siffror)</label>
        <input type="password" id="st-pin-new" inputmode="numeric" maxlength="4" autocomplete="new-password">
        <label for="st-pin-rep">Upprepa ny PIN</label>
        <input type="password" id="st-pin-rep" inputmode="numeric" maxlength="4" autocomplete="new-password">
        <div class="row" style="margin-top:10px"><button class="btn" onclick="savePin()">Byt PIN</button></div>
        <div id="st-pin-status" class="status"></div>
      </div>`;
  } catch (err) {
    root.innerHTML = `<p class="err">${esc(err.message)}</p>`;
  }
}

function stStatus(id, text, ok) {
  const box = el(id); if (!box) return;
  box.textContent = text; box.className = 'status ' + (ok ? 'ok' : 'err');
}

async function setReserve(available) {
  try {
    await api('/reserve', { method: 'PUT', body: { available } });
    stStatus('st-reserve-status', available ? 'Du är nu tillgänglig som reserv.' : 'Du är inte längre reserv.', true);
  } catch (err) {
    stStatus('st-reserve-status', err.message, false);
    el('st-reserve').checked = !available;
  }
}

async function saveContact() {
  try {
    const body = { phone: el('st-phone').value };
    if (_settings.me.isAdmin) body.displayName = el('st-name').value;
    await api('/profile', { method: 'PUT', body });
    stStatus('st-contact-status', 'Sparat.', true);
  } catch (err) { stStatus('st-contact-status', err.message, false); }
}

async function savePin() {
  const cur = el('st-pin-cur').value, a = el('st-pin-new').value, b = el('st-pin-rep').value;
  if (a !== b) return stStatus('st-pin-status', 'De nya PIN-koderna matchar inte.', false);
  try {
    await api('/auth/change-pin', { method: 'POST', body: { currentPin: cur, newPin: a } });
    el('st-pin-cur').value = el('st-pin-new').value = el('st-pin-rep').value = '';
    stStatus('st-pin-status', 'PIN ändrad.', true);
  } catch (err) { stStatus('st-pin-status', err.message, false); }
}
