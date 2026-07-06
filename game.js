/* Pipes — a minimal rotate-the-pipes puzzle.
 *
 * Directions: 0 = North, 1 = East, 2 = South, 3 = West (clockwise).
 * Each cell stores `base` (its solved pipe directions) and `rot`
 * (quarter-turns applied clockwise). The rendered pipe direction set is
 * `base` rotated by `rot`. Puzzles are generated as a random spanning tree
 * over the grid, so a fully connected, loop-free solution always exists.
 */

const DR = [-1, 0, 1, 0];
const DC = [0, 1, 0, -1];
const opposite = (d) => (d + 2) % 4;

const boardEl = document.getElementById('board');
const boardWrap = document.querySelector('.board-wrap');
const timeEl = document.getElementById('time');
const timeStat = document.getElementById('time-stat');
const movesEl = document.getElementById('moves');
const progressEl = document.getElementById('progress');
const progressStat = document.getElementById('progress-stat');
const checkBtn = document.getElementById('check-btn');
const winEl = document.getElementById('win');
const winDetailEl = document.getElementById('win-detail');
const hintText = document.getElementById('hint-text');

/* ---------------- Settings ---------------- */

const SETTINGS = [
  { key: 'hideControls',    label: 'Spielsteuerung ausblenden' },
  { key: 'stickyToolbar',   label: 'Feste Werkzeugleiste (experimentell)' },
  { key: 'autoSubmit',      label: 'Automatisch prüfen', default: true },
  { key: 'showCheckpoints', label: 'Fortschritt anzeigen' },
  { key: 'showCoords',      label: 'Koordinaten anzeigen' },
  { key: 'hideTimer',       label: 'Timer ausblenden' },
  { key: 'personalTimer',   label: 'Persönlicher Timer (pausierbar)', sub: true },
  { key: 'nightMode',       label: 'Nachtmodus', type: 'night' },
  { key: 'highlightLast',   label: 'Letzte Änderung hervorheben' },
  { key: 'highlightErrors', label: 'Fehler hervorheben', default: true },
  { key: 'animateRotation', label: 'Drehung animieren', default: true },
  { key: 'invertRotation',  label: 'Drehrichtung umkehren' },
  { key: 'longPressPin',    label: 'Langes Drücken zum Sperren' },
  { key: 'rightClickRotate', label: 'Rechtsklick dreht (statt zu sperren)' },
  { key: 'visualizeFlood',  label: 'Fluss visualisieren (langsamer bei großen Rätseln)', default: true },
  { key: 'floodCurrent',    label: 'Fluss ab aktueller Zelle' },
  { key: 'rotateBoard',     label: 'Brett drehen' },
  { key: 'pinDrag',         label: 'Beim Ziehen mehrere Kacheln anheften' },
];

const LS_KEY = 'pipes.settings';
const S = {};

function loadSettings() {
  let stored = {};
  try { stored = JSON.parse(localStorage.getItem(LS_KEY)) || {}; } catch (e) { stored = {}; }
  const systemDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
  for (const s of SETTINGS) {
    if (s.key in stored) S[s.key] = !!stored[s.key];
    else if (s.key === 'nightMode') S[s.key] = !!systemDark;
    else S[s.key] = !!s.default;
  }
}

function saveSettings() {
  const out = {};
  for (const s of SETTINGS) out[s.key] = S[s.key];
  try { localStorage.setItem(LS_KEY, JSON.stringify(out)); } catch (e) { /* ignore */ }
}

function applySettings() {
  document.documentElement.setAttribute('data-theme', S.nightMode ? 'dark' : 'light');
  document.body.classList.toggle('hide-controls', S.hideControls);
  document.body.classList.toggle('hide-timer', S.hideTimer);
  document.body.classList.toggle('no-anim', !S.animateRotation);
  document.body.classList.toggle('sticky-toolbar', S.stickyToolbar);
  document.body.classList.toggle('visualize-flood', S.visualizeFlood);
  boardEl.classList.toggle('rotate-board', S.rotateBoard);
  boardWrap.classList.toggle('has-coords', S.showCoords);
  progressStat.hidden = !S.showCheckpoints;
  timeStat.classList.toggle('personal', S.personalTimer && !S.hideTimer);
  if (!(S.personalTimer && !S.hideTimer)) { paused = false; timeStat.classList.remove('paused'); }

  updateCheckButton();
  updateHint();

  if (cells.length) { renderCoords(); updateBoard(); }
}

function updateHint() {
  const dir = S.invertRotation ? 'gegen den Uhrzeigersinn' : 'im Uhrzeigersinn';
  const bits = [`Linksklick dreht ${dir}`];
  if (S.rightClickRotate) {
    bits.push('Rechtsklick dreht rückwärts', 'Strg-Klick sperrt');
  } else {
    bits.push('Rechtsklick sperrt eine Kachel');
  }
  if (S.longPressPin) bits.push('langes Drücken sperrt');
  hintText.textContent = bits.join(' · ');
}

function updateCheckButton() {
  checkBtn.hidden = S.autoSubmit;
  if (S.autoSubmit) checkBtn.classList.remove('ready');
}

/* ---------------- State ---------------- */

let N = 7;
let cells = [];        // flat array of cell objects
let source = 0;        // index of source cell
let lastCell = -1;     // last interacted cell
let moves = 0;
let solved = false;

let timerRunning = false;
let startTime = 0;
let elapsedBase = 0;   // seconds accumulated before current running segment
let timerId = null;
let paused = false;

/* ---------------- Puzzle generation ---------------- */

function idx(r, c) { return r * N + c; }

function generate() {
  cells = [];
  for (let i = 0; i < N * N; i++) {
    cells.push({ base: new Set(), rot: 0, pinned: false, el: null, pipeEl: null });
  }

  source = idx((N / 2) | 0, (N / 2) | 0);

  // Randomized Prim's algorithm builds a spanning tree (nice branching).
  const inTree = new Array(N * N).fill(false);
  const frontier = []; // edges {from, dir}
  inTree[source] = true;
  addEdges(source, frontier);

  while (frontier.length) {
    const pick = (Math.random() * frontier.length) | 0;
    const { from, dir } = frontier.splice(pick, 1)[0];
    const r = (from / N) | 0, c = from % N;
    const to = idx(r + DR[dir], c + DC[dir]);
    if (inTree[to]) continue;

    inTree[to] = true;
    cells[from].base.add(dir);
    cells[to].base.add(opposite(dir));
    addEdges(to, frontier);
  }

  // Scramble: random rotation per cell, ensuring not already solved.
  let guard = 0;
  do {
    for (const cell of cells) cell.rot = (Math.random() * 4) | 0;
  } while (isSolved() && ++guard < 20);
}

function addEdges(from, frontier) {
  const r = (from / N) | 0, c = from % N;
  for (let d = 0; d < 4; d++) {
    const nr = r + DR[d], nc = c + DC[d];
    if (nr < 0 || nr >= N || nc < 0 || nc >= N) continue;
    frontier.push({ from, dir: d });
  }
}

/* Current (rotated) direction set of a cell. */
function dirsOf(cell) {
  const out = new Set();
  for (const d of cell.base) out.add((d + cell.rot) % 4);
  return out;
}

/* ---------------- Solve / connectivity ---------------- */

/* BFS from `origin` through matched pipe ends. Returns per-cell reachability
 * and flood depth (distance from origin). */
function computeActive(origin) {
  const dirCache = cells.map(dirsOf);
  const active = new Array(N * N).fill(false);
  const depth = new Array(N * N).fill(-1);
  const q = [origin];
  active[origin] = true;
  depth[origin] = 0;
  let count = 1, head = 0;

  while (head < q.length) {
    const cur = q[head++];
    const r = (cur / N) | 0, c = cur % N;
    for (const d of dirCache[cur]) {
      const nr = r + DR[d], nc = c + DC[d];
      if (nr < 0 || nr >= N || nc < 0 || nc >= N) continue;
      const nb = idx(nr, nc);
      if (!dirCache[nb].has(opposite(d))) continue; // ends must match
      if (!active[nb]) { active[nb] = true; depth[nb] = depth[cur] + 1; count++; q.push(nb); }
    }
  }
  return { active, count, depth, dirCache };
}

function isSolved() {
  const { count, dirCache } = computeActive(source);
  if (count !== N * N) return false;
  // No loose ends: every pipe end points to a matching neighbour.
  for (let i = 0; i < cells.length; i++) {
    const r = (i / N) | 0, c = i % N;
    for (const d of dirCache[i]) {
      const nr = r + DR[d], nc = c + DC[d];
      if (nr < 0 || nr >= N || nc < 0 || nc >= N) return false;
      if (!dirCache[idx(nr, nc)].has(opposite(d))) return false;
    }
  }
  return true;
}

/* A cell is an "error" when one of its pipe ends points off the board. */
function hasWallEnd(i) {
  const r = (i / N) | 0, c = i % N;
  for (const d of dirsOf(cells[i])) {
    const nr = r + DR[d], nc = c + DC[d];
    if (nr < 0 || nr >= N || nc < 0 || nc >= N) return true;
  }
  return false;
}

/* ---------------- Rendering ---------------- */

function buildSvg(cell, isSource) {
  const dirs = [...cell.base];
  const C = 50;
  const edge = { 0: [50, 0], 1: [100, 50], 2: [50, 100], 3: [0, 50] };

  let svg = `<svg viewBox="0 0 100 100" fill="none">`;
  svg += `<g stroke-width="9" stroke-linecap="round">`;

  for (const d of dirs) {
    const [ex, ey] = edge[d];
    svg += `<line class="wire" x1="${C}" y1="${C}" x2="${ex}" y2="${ey}" />`;
  }

  svg += `</g>`;

  if (isSource) {
    svg += `<circle class="hub" cx="50" cy="50" r="16" />`;
    svg += `<circle class="core" cx="50" cy="50" r="7" fill="#fff" />`;
  } else {
    svg += `<circle class="hub" cx="50" cy="50" r="11" />`;
  }
  svg += `</svg>`;
  return svg;
}

function render() {
  boardEl.style.setProperty('--n', N);
  boardEl.classList.remove('solved');
  boardEl.innerHTML = '';

  for (let i = 0; i < cells.length; i++) {
    const cell = cells[i];
    const isSource = i === source;

    const btn = document.createElement('button');
    btn.className = 'cell' + (isSource ? ' source' : '');
    btn.setAttribute('aria-label', 'Rohr drehen');

    const pipe = document.createElement('div');
    pipe.className = 'pipe';
    pipe.innerHTML = buildSvg(cell, isSource);
    pipe.style.transform = `rotate(${cell.rot * 90}deg)`;

    btn.appendChild(pipe);
    boardEl.appendChild(btn);

    cell.el = btn;
    cell.pipeEl = pipe;

    attachCellEvents(btn, i);
  }

  renderCoords();
  updateBoard();
}

function renderCoords() {
  boardWrap.querySelectorAll('.coords').forEach((e) => e.remove());
  if (!S.showCoords) return;

  const top = document.createElement('div');
  top.className = 'coords coords-top';
  for (let c = 0; c < N; c++) {
    const s = document.createElement('span');
    s.textContent = String.fromCharCode(65 + c);
    top.appendChild(s);
  }
  const left = document.createElement('div');
  left.className = 'coords coords-left';
  for (let r = 0; r < N; r++) {
    const s = document.createElement('span');
    s.textContent = String(r + 1);
    left.appendChild(s);
  }
  boardWrap.appendChild(top);
  boardWrap.appendChild(left);
}

/* Recompute connectivity, flood delays, errors and last-change highlight. */
function updateBoard() {
  const origin = (S.floodCurrent && lastCell >= 0) ? lastCell : source;
  const { active, depth } = computeActive(origin);
  let connected = 0;

  for (let i = 0; i < cells.length; i++) {
    const el = cells[i].el;
    if (active[i]) connected++;
    el.classList.toggle('active', active[i]);

    if (S.visualizeFlood) {
      const d = active[i] && depth[i] > 0 ? depth[i] : 0;
      el.style.setProperty('--flood-delay', Math.min(d * 28, 700) + 'ms');
    } else {
      el.style.removeProperty('--flood-delay');
    }

    el.classList.toggle('error', S.highlightErrors && hasWallEnd(i));
    el.classList.toggle('last', S.highlightLast && i === lastCell && !solved);
    el.classList.toggle('pinned', cells[i].pinned);
  }

  if (S.showCheckpoints) progressEl.textContent = `${connected} / ${cells.length}`;
}

/* ---------------- Interaction ---------------- */

let longPressTimer = null;
let longPressFired = false;
let dragPin = null;
let downIndex = -1;

function attachCellEvents(btn, i) {
  btn.addEventListener('pointerdown', (e) => onDown(i, e));
  btn.addEventListener('pointerup', (e) => onUp(i, e));
  btn.addEventListener('pointerenter', (e) => onEnter(i, e));
  btn.addEventListener('pointercancel', cancelGesture);
  btn.addEventListener('contextmenu', (e) => { e.preventDefault(); onRightClick(i); });
}

function cancelGesture() {
  clearTimeout(longPressTimer);
  longPressTimer = null;
  dragPin = null;
  downIndex = -1;
}

function onDown(i, e) {
  if (e.button !== 0 && e.pointerType === 'mouse') return; // right button → contextmenu
  downIndex = i;
  longPressFired = false;

  if (S.longPressPin && !solved) {
    longPressTimer = setTimeout(() => { longPressFired = true; togglePin(i); }, 450);
  }
  if (S.pinDrag && !solved) {
    dragPin = { setTo: !cells[i].pinned, active: false };
  }
}

function onEnter(i, e) {
  if (dragPin && (e.buttons & 1)) {
    if (!dragPin.active) { dragPin.active = true; setPin(downIndex, dragPin.setTo); }
    setPin(i, dragPin.setTo);
    clearTimeout(longPressTimer);
  }
}

function onUp(i, e) {
  clearTimeout(longPressTimer);
  const wasLong = longPressFired;
  const wasDrag = dragPin && dragPin.active;
  dragPin = null;
  longPressFired = false;

  if (wasLong || wasDrag) { downIndex = -1; return; }
  if (e.button !== 0) { downIndex = -1; return; }

  if (S.rightClickRotate && (e.ctrlKey || e.metaKey)) { togglePin(i); downIndex = -1; return; }

  if (i === downIndex) rotate(i, S.invertRotation ? -1 : 1);
  downIndex = -1;
}

function onRightClick(i) {
  if (S.rightClickRotate) rotate(i, S.invertRotation ? 1 : -1);
  else togglePin(i);   // right mouse button locks a tile
}

/* ---------------- Moves ---------------- */

function rotate(i, dir) {
  if (solved) return;
  const cell = cells[i];
  if (cell.pinned) return;

  cell.rot += dir;
  cell.pipeEl.style.transform = `rotate(${cell.rot * 90}deg)`;
  lastCell = i;

  moves++;
  movesEl.textContent = moves;
  if (!timerRunning && !paused) startTimer();

  updateBoard();
  evaluate();
}

function togglePin(i) {
  if (solved) return;
  setPin(i, !cells[i].pinned);
}

function setPin(i, val) {
  cells[i].pinned = val;
  cells[i].el.classList.toggle('pinned', val);
}

/* Check completion and react per the auto-submit setting. */
function evaluate() {
  const done = isSolved();
  boardEl.classList.toggle('solved', done);
  if (done) {
    if (S.autoSubmit) onSolved();
    else checkBtn.classList.add('ready');
  } else {
    checkBtn.classList.remove('ready');
  }
}

/* ---------------- Win / timer ---------------- */

function onSolved() {
  solved = true;
  pauseTimer();
  boardEl.classList.add('solved');
  // clear transient highlights
  cells.forEach((c) => c.el.classList.remove('last', 'error'));
  winDetailEl.textContent = `Gelöst in ${formatTime(elapsed())} · ${moves} Züge`;
  setTimeout(() => { winEl.hidden = false; }, 650);
}

function elapsed() {
  return Math.floor(elapsedBase + (timerRunning ? (performance.now() - startTime) / 1000 : 0));
}

function formatTime(s) {
  const m = (s / 60) | 0;
  return `${m}:${String(s % 60).padStart(2, '0')}`;
}

function startTimer() {
  if (timerRunning || paused) return;
  startTime = performance.now();
  timerRunning = true;
  timerId = setInterval(() => { timeEl.textContent = formatTime(elapsed()); }, 250);
}

function pauseTimer() {
  if (!timerRunning) return;
  elapsedBase += (performance.now() - startTime) / 1000;
  timerRunning = false;
  clearInterval(timerId);
  timerId = null;
}

function resetTimer() {
  pauseTimer();
  elapsedBase = 0;
  paused = false;
  timeStat.classList.remove('paused');
  timeEl.textContent = '0:00';
}

/* ---------------- New game ---------------- */

function newGame() {
  resetTimer();
  solved = false;
  moves = 0;
  lastCell = -1;
  movesEl.textContent = '0';
  winEl.hidden = true;
  checkBtn.classList.remove('ready');
  generate();
  render();
}

/* ---------------- Controls wiring ---------------- */

document.querySelectorAll('.seg').forEach((seg) => {
  seg.addEventListener('click', () => {
    document.querySelectorAll('.seg').forEach((s) => {
      s.classList.remove('is-active');
      s.setAttribute('aria-checked', 'false');
    });
    seg.classList.add('is-active');
    seg.setAttribute('aria-checked', 'true');
    N = parseInt(seg.dataset.size, 10);
    newGame();
  });
});

document.getElementById('new-game').addEventListener('click', newGame);
document.getElementById('win-again').addEventListener('click', newGame);

checkBtn.addEventListener('click', () => {
  if (isSolved()) onSolved();
  else {
    checkBtn.classList.remove('ready');
    checkBtn.animate(
      [{ transform: 'translateX(0)' }, { transform: 'translateX(-5px)' },
       { transform: 'translateX(5px)' }, { transform: 'translateX(0)' }],
      { duration: 260 }
    );
  }
});

// Pausable personal timer: click the timer to pause/resume.
timeStat.addEventListener('click', () => {
  if (!S.personalTimer || S.hideTimer || solved) return;
  if (timerRunning) { pauseTimer(); paused = true; timeStat.classList.add('paused'); }
  else { paused = false; timeStat.classList.remove('paused'); startTimer(); }
});

// Prevent long-press context menu from interfering on the board (mobile).
boardEl.addEventListener('contextmenu', (e) => e.preventDefault());

/* ---------------- Settings panel ---------------- */

const overlay = document.getElementById('settings-overlay');
const settingsList = document.getElementById('settings-list');
const MOON = '<svg viewBox="0 0 24 24" width="13" height="13" fill="currentColor"><path d="M12.7 2.3a1 1 0 0 0-1.1 1.4A7 7 0 1 0 20.3 12.4a1 1 0 0 0-1.4-1.1 5 5 0 0 1-6.2-6.2 1 1 0 0 0 0-2.8z"/></svg>';

function buildSettingsPanel() {
  settingsList.innerHTML = '';
  for (const s of SETTINGS) {
    const row = document.createElement('div');
    row.className = 'set-row' + (s.sub ? ' sub' : '');

    const label = document.createElement('span');
    label.className = 'set-label';
    label.textContent = s.label;

    const tgl = document.createElement('button');
    tgl.className = 'tgl' + (s.type === 'night' ? ' night' : '');
    tgl.setAttribute('role', 'switch');
    tgl.setAttribute('aria-checked', String(!!S[s.key]));
    tgl.setAttribute('aria-label', s.label);
    tgl.innerHTML = s.type === 'night'
      ? `<span class="tgl-knob"></span><span class="moon">${MOON}</span>`
      : `<span class="tgl-mark off">×</span><span class="tgl-mark on">✓</span><span class="tgl-knob"></span>`;

    tgl.addEventListener('click', () => {
      S[s.key] = !S[s.key];
      tgl.setAttribute('aria-checked', String(S[s.key]));
      saveSettings();
      applySettings();
    });

    row.appendChild(label);
    row.appendChild(tgl);
    settingsList.appendChild(row);
  }
}

function openSettings() { overlay.hidden = false; }
function closeSettings() { overlay.hidden = true; }

document.getElementById('open-settings').addEventListener('click', openSettings);
document.getElementById('close-settings').addEventListener('click', closeSettings);
overlay.addEventListener('click', (e) => { if (e.target === overlay) closeSettings(); });
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !overlay.hidden) closeSettings(); });

/* ---------------- Boot ---------------- */

loadSettings();
buildSettingsPanel();
applySettings();
newGame();
