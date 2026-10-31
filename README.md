# Opjour — frontend

Vanilla JS-SPA, ingen byggkedja. Tänkt för GitHub Pages + eget domännamn (TBD).

## Filer

- `index.html` — skal: CSS-tokens, `api()`, inloggning (personlig + visningsskärm),
  tvingat PIN-byte, och den delade kalender-renderaren `buildCalendar()`.
- `js/import.js` — CSV/Excel-tolkning för användarimport (inga beroenden; fungerar även i Node för tester).
- `js/settings.js` / `js/admin.js` — inställningar (namn, användarnamn, telefon, PIN) och admin (roller, import, redigera/radera användare).
- `js/stats.js` — statistikpanel (`#/stats`, admin eller användare med statistikrätt), ritad med ren HTML/CSS.
- `js/app.js` — personlig vy (`renderApp`). En sida: dagens opjour, reservtoggel (av/på),
  kalender med boka/avboka (dator: 5 veckor, mobil: innevarande vecka + nästa, stega en vecka åt gången), "mina kommande pass". Admin får en "boka åt"-väljare.
- `js/display.js` — visningsvy (`renderDisplay`). Read-only, stor "Dagens opjour: X" /
  reserver + kalendern. Auto-uppdatering var 60:e sekund.

## Logotyp och ikoner

`icons/logo.svg` är källan (kalender med skalpell, amber på skiffer). `icon-192/512.png`, `apple-touch-icon.png` och `favicon-32.png` är renderade från samma
SVG utan rundade hörn (webbläsare/OS maskerar själva). Header och inloggningssida använder `logo.svg` direkt. Förslagsjämförelsen finns i `../mockups/logo-d-forslag.html`.

## Lokalt

```bash
npx serve -l 5050 .
```

Frontend pratar med `http://localhost:8080` när den körs på localhost, annars
`https://api.CHANGE-ME.se` — byt den raden i `index.html` när domänen är bestämd.
