// ── Inställningar (#/settings) ───────────────────────────────────────────
// Klassiskt script. Beror på index.html: api(), esc(), el(), setMenuForUser(), state, APP_VERSION.
// Alla kan ändra alla sina egna uppgifter — namn, användarnamn och telefon — och byta PIN. Det enda man inte kan
// ändra är kliniktillhörigheten. (Reservtoggeln finns på startsidan; admin hanterar andras uppgifter på Admin-sidan.)

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
        <h2>Mina uppgifter</h2>
        <label for="st-name" style="margin-top:0">Fullständigt namn</label>
        <input type="text" id="st-name" value="${esc(me.displayName)}" maxlength="60" autocomplete="name">
        <label for="st-user">Användarnamn</label>
        <input type="text" id="st-user" value="${esc(me.username || '')}" maxlength="60" autocapitalize="none" spellcheck="false" autocomplete="username">
        <label for="st-phone">Telefonnummer</label>
        <input type="tel" id="st-phone" value="${esc(me.phone || '')}" placeholder="070-123 45 67" maxlength="30" inputmode="tel" autocomplete="tel">
        <label style="margin-top:14px">Klinik</label>
        <div>${esc(me.clinicName || state.clinicName)} <span class="muted">(ändras inte här)</span></div>
        <p class="hint">Ditt namn och telefonnummer syns för alla som är inloggade på kliniken, i kalendern, så att man kan nå dig när du har jour eller är reserv. Byter du användarnamn loggar du in med det nya nästa gång.</p>
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
      </div>

      <p class="muted" style="font-size:12px;text-align:center">Opjour ${esc(APP_VERSION)}</p>`;
  } catch (err) {
    root.innerHTML = `<p class="err">${esc(err.message)}</p>`;
  }
}

function stStatus(id, text, ok) {
  const box = el(id); if (!box) return;
  box.textContent = text; box.className = 'status ' + (ok ? 'ok' : 'err');
}

async function saveContact() {
  try {
    const r = await api('/profile', { method: 'PUT', body: {
      displayName: el('st-name').value, username: el('st-user').value, phone: el('st-phone').value
    } });
    stStatus('st-contact-status', r.username !== _settings.me.username ? `Sparat. Nästa gång loggar du in som "${r.username}".` : 'Sparat.', true);
    _settings.me.username = r.username;
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
