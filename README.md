# Opjour — frontend

Vanilla JS-SPA, ingen byggkedja. Tänkt för GitHub Pages + eget domännamn (TBD).

## Filer

- `index.html` — skal: CSS-tokens, `api()`, inloggning (personlig + visningsskärm),
  tvingat PIN-byte, och den delade kalender-renderaren `buildCalendar()`.
- `js/import.js` — CSV/Excel-tolkning för användarimport (inga beroenden; fungerar även i Node för tester).
- `js/settings.js` / `js/admin.js` — inställningar och admin (roller, import).
- `js/app.js` — personlig vy (`renderApp`). En sida: dagens opjour, reservtoggle,
  5-veckorskalender med boka/avboka, "mina kommande pass". Admin får en "boka åt"-väljare.
- `js/display.js` — visningsvy (`renderDisplay`). Read-only, stor "Dagens opjour: X" /
  reserver + kalendern. Auto-uppdatering var 60:e sekund.

## Lokalt

```bash
npx serve -l 5050 .
```

Frontend pratar med `http://localhost:8080` när den körs på localhost, annars
`https://api.CHANGE-ME.se` — byt den raden i `index.html` när domänen är bestämd.

## Att göra härnäst

- Riktiga PWA-ikoner (`icons/icon-192.png`, `icons/icon-512.png` saknas).
- Vertikal listvy för kalendern på små skärmar (nu: 7-kolumnsrutnät som scrollar i sidled).
- Admin-vy för att lägga till/ändra användare (backend har `/admin/users` redan).
