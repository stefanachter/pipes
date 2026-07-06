# Pipes

Ein minimalistisches Pipes-Puzzle (nach dem Vorbild von [puzzle-pipes.com](https://www.puzzle-pipes.com/)) — Teil einer Sammlung von Minispielen.

Drehe die Rohre, bis alle mit der zentralen Quelle verbunden sind, ohne lose Enden.

## Spielen

Reine statische Website ohne Build-Schritt. Einfach `index.html` im Browser öffnen — oder lokal einen kleinen Server starten:

```bash
node serve.js
# http://localhost:4321
```

## Bedienung

- **Linksklick** – Rohr im Uhrzeigersinn drehen
- **Rechtsklick** – gegen den Uhrzeigersinn drehen
- Schwierigkeit: Leicht (5×5), Mittel (7×7), Schwer (9×9), Experte (11×11)

## Technik

- Vanilla HTML / CSS / JavaScript, keine Abhängigkeiten
- Rätsel werden als zufälliger Spannbaum erzeugt → immer lösbar, keine Schleifen
- Automatischer Hell-/Dunkelmodus

## Aufbau

| Datei | Inhalt |
|-------|--------|
| `index.html` | Struktur |
| `styles.css` | Design |
| `game.js` | Spiellogik |
| `serve.js` | Lokaler Vorschau-Server |
