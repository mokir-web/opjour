// ── Inläsning av användarlista (CSV / Excel .xlsx) ───────────────────────
// Klassiskt script utan beroenden. Allt sker i webbläsaren — filen laddas aldrig upp, bara de tolkade
// raderna skickas till backend (POST /admin/users/import). Fungerar även i Node (för tester).
//
// .xlsx är en zip med XML: vi läser zippens innehållsförteckning, packar upp med DecompressionStream
// och plockar celler ur första kalkylbladet. Stöder inte gamla .xls, krypterade eller zip64-filer.
(function (root) {
  'use strict';

  // ── CSV ────────────────────────────────────────────────────────────────
  function detectDelimiter(text) {
    const line = text.split(/\r?\n/).find(l => l.trim()) || '';
    const count = ch => line.split(ch).length - 1;
    const best = [[';', count(';')], ['\t', count('\t')], [',', count(',')]].sort((a, b) => b[1] - a[1])[0];
    return best[1] > 0 ? best[0] : ';';
  }

  function parseCsv(text) {
    text = text.replace(/^﻿/, '');
    const delim = detectDelimiter(text);
    const rows = [];
    let row = [], field = '', inQ = false;
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (inQ) {
        if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else inQ = false; }
        else field += c;
      } else if (c === '"' && field === '') {
        inQ = true;
      } else if (c === delim) {
        row.push(field); field = '';
      } else if (c === '\n' || c === '\r') {
        if (c === '\r' && text[i + 1] === '\n') i++;
        row.push(field); rows.push(row); row = []; field = '';
      } else {
        field += c;
      }
    }
    if (field !== '' || row.length) { row.push(field); rows.push(row); }
    return rows.filter(r => r.some(c => String(c).trim() !== ''));
  }

  // ── XLSX ───────────────────────────────────────────────────────────────
  async function inflateRaw(bytes) {
    const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
    return new Uint8Array(await new Response(stream).arrayBuffer());
  }

  function zipEntries(buf) {
    const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
    let i = buf.length - 22;
    while (i >= 0 && dv.getUint32(i, true) !== 0x06054b50) i--;
    if (i < 0) throw new Error('Filen är ingen giltig .xlsx-fil.');
    const count = dv.getUint16(i + 10, true);
    let p = dv.getUint32(i + 16, true);
    const entries = {};
    for (let n = 0; n < count; n++) {
      if (dv.getUint32(p, true) !== 0x02014b50) throw new Error('Filen är ingen giltig .xlsx-fil.');
      const nameLen = dv.getUint16(p + 28, true), extraLen = dv.getUint16(p + 30, true), commentLen = dv.getUint16(p + 32, true);
      const entry = { method: dv.getUint16(p + 10, true), csize: dv.getUint32(p + 20, true), lho: dv.getUint32(p + 42, true) };
      if (entry.csize === 0xFFFFFFFF) throw new Error('Filen är för stor eller använder zip64 — spara om den som vanlig .xlsx eller CSV.');
      entries[new TextDecoder().decode(buf.subarray(p + 46, p + 46 + nameLen))] = entry;
      p += 46 + nameLen + extraLen + commentLen;
    }
    return entries;
  }

  async function zipText(buf, entries, name) {
    const e = entries[name];
    if (!e) return null;
    const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
    if (dv.getUint32(e.lho, true) !== 0x04034b50) throw new Error('Filen är skadad.');
    const start = e.lho + 30 + dv.getUint16(e.lho + 26, true) + dv.getUint16(e.lho + 28, true);
    const data = buf.subarray(start, start + e.csize);
    if (e.method === 0) return new TextDecoder().decode(data);
    if (e.method === 8) return new TextDecoder().decode(await inflateRaw(data));
    throw new Error('Filen använder en komprimering som inte stöds — spara om den som vanlig .xlsx eller CSV.');
  }

  function decodeXml(s) {
    return s.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos);/gi, (m, e) => {
      if (e[0] === '#') return String.fromCodePoint(e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10));
      return { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" }[e.toLowerCase()];
    });
  }

  const textOf = xml => {
    let out = '';
    const re = /<t\b[^>]*>([\s\S]*?)<\/t>/g;
    let m;
    while ((m = re.exec(xml.replace(/<rPh\b[\s\S]*?<\/rPh>/g, '')))) out += decodeXml(m[1]);
    return out;
  };

  function colIndex(ref) {
    let n = 0;
    for (const ch of ref.replace(/\d/g, '')) n = n * 26 + (ch.charCodeAt(0) - 64);
    return n - 1;
  }

  async function parseXlsx(buf) {
    buf = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
    const entries = zipEntries(buf);

    // Första kalkylbladet: workbook.xml → relation → fil (med standardnamn som reserv).
    let sheetPath = 'xl/worksheets/sheet1.xml';
    const wb = await zipText(buf, entries, 'xl/workbook.xml');
    const rels = await zipText(buf, entries, 'xl/_rels/workbook.xml.rels');
    if (wb && rels) {
      const rid = (wb.match(/<sheet\b[^>]*\br:id="([^"]+)"/) || [])[1];
      const rel = rid && [...rels.matchAll(/<Relationship\b[^>]*>/g)].map(m => m[0]).find(t => t.includes(`Id="${rid}"`));
      const target = rel && (rel.match(/Target="([^"]+)"/) || [])[1];
      if (target) sheetPath = target.startsWith('/') ? target.slice(1) : 'xl/' + target;
    }
    const sheet = await zipText(buf, entries, sheetPath);
    if (!sheet) throw new Error('Hittar inget kalkylblad i filen.');

    const sstXml = await zipText(buf, entries, 'xl/sharedStrings.xml');
    const shared = sstXml ? [...sstXml.matchAll(/<si\b[^>]*>([\s\S]*?)<\/si>/g)].map(m => textOf(m[1])) : [];

    const grid = [];
    const cellRe = /<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g;
    let m;
    while ((m = cellRe.exec(sheet))) {
      const attrs = m[1], inner = m[2] || '';
      const ref = (attrs.match(/\br="([A-Z]+)(\d+)"/) || []);
      if (!ref[1]) continue;
      const type = (attrs.match(/\bt="([^"]+)"/) || [])[1];
      const v = (inner.match(/<v>([\s\S]*?)<\/v>/) || [])[1];
      let value = '';
      if (type === 's') value = shared[Number(v)] ?? '';
      else if (type === 'inlineStr') value = textOf(inner);
      else if (type === 'b') value = v === '1' ? 'TRUE' : 'FALSE';
      else if (v != null) {
        value = decodeXml(v);
        if (/e/i.test(value) && !Number.isNaN(Number(value))) value = String(Number(value)); // 7.0E8 → 700000000
      }
      const r = Number(ref[2]) - 1, c = colIndex(ref[1]);
      (grid[r] = grid[r] || [])[c] = value;
    }
    return Array.from(grid, r => Array.from(r || [], c => c ?? '')).filter(r => r.some(c => String(c).trim() !== ''));
  }

  // ── Fil → tabell ───────────────────────────────────────────────────────
  async function readTable(file) {
    const name = String(file.name || '').toLowerCase();
    const buf = new Uint8Array(await file.arrayBuffer());
    if (/\.xlsx$|\.xlsm$/.test(name)) return parseXlsx(buf);
    if (/\.xls$/.test(name)) throw new Error('Gamla .xls-filer stöds inte — spara filen som .xlsx eller CSV i Excel.');
    let text;
    try { text = new TextDecoder('utf-8', { fatal: true }).decode(buf); }
    catch { text = new TextDecoder('windows-1252').decode(buf); }   // Excels "CSV" på svenska är ofta Windows-1252
    return parseCsv(text);
  }

  // ── Tabell → importrader ───────────────────────────────────────────────
  const HEADERS = {
    displayName: ['fullständigt namn', 'fullstandigt namn', 'namn', 'name', 'för- och efternamn'],
    username: ['användarnamn', 'anvandarnamn', 'användare', 'username', 'login'],
    phone: ['telefon', 'telefonnummer', 'mobil', 'mobilnummer', 'phone', 'tel'],
    role: ['roll', 'role'],
    reserve: ['reserv', 'reserve', 'tillgänglig som reserv']
  };
  const norm = s => String(s ?? '').trim().toLowerCase();

  // Returnerar { rows: [{displayName, username, phone, role, reserve}], lines: [radnummer i filen] }.
  // Rader vars första cell börjar med # är kommentarer och hoppas över (mallen använder det).
  function rowsFromTable(table) {
    const hIdx = table.findIndex(r => r.some(c => HEADERS.displayName.includes(norm(c))));
    if (hIdx < 0) throw new Error('Hittar ingen kolumn som heter "Fullständigt namn" (eller "Namn") på någon rad. Använd mallen.');
    const cols = {};
    table[hIdx].forEach((c, i) => {
      for (const [key, names] of Object.entries(HEADERS)) if (names.includes(norm(c)) && cols[key] === undefined) cols[key] = i;
    });
    const rows = [], lines = [];
    table.slice(hIdx + 1).forEach((r, k) => {
      const first = String(r.find(c => String(c).trim() !== '') ?? '').trim();
      if (!first || first.startsWith('#')) return;
      const get = key => (cols[key] === undefined ? '' : String(r[cols[key]] ?? '').trim());
      let phone = get('phone');
      if (/^7\d{8}$/.test(phone)) phone = '0' + phone;           // Excel äter inledande 0 i nummerceller
      rows.push({ displayName: get('displayName'), username: get('username'), phone, role: get('role'), reserve: get('reserve') });
      lines.push(hIdx + 2 + k);
    });
    return { rows, lines };
  }

  // ── Mall och nedladdningar ─────────────────────────────────────────────
  function toCsv(rows, delim = ';') {
    const q = v => { const s = String(v ?? ''); return /[";\n\r]/.test(s) || s.includes(delim) ? '"' + s.replace(/"/g, '""') + '"' : s; };
    return '﻿' + rows.map(r => r.map(q).join(delim)).join('\r\n') + '\r\n';
  }

  function templateCsv() {
    return toCsv([
      ['Fullständigt namn', 'Användarnamn', 'Telefon', 'Roll', 'Reserv'],
      ['#Rader som börjar med # hoppas över. Bara Fullständigt namn är obligatoriskt.'],
      ['#Användarnamn: lämna tomt så skapas det (anna.a). Roll: Användare, Admin eller Visning. Reserv: Ja eller Nej.'],
      ['#Exempel →', '', '', '', ''],
      ['#Anna Andersson', 'anna.a', '070-123 45 67', 'Användare', 'Ja']
    ]);
  }

  const api = { parseCsv, parseXlsx, readTable, rowsFromTable, toCsv, templateCsv };
  root.OpjourImport = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
