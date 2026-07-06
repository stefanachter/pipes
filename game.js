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
const timeEl = document.getElementById('time');
const movesEl = document.getElementById('moves');
const winEl = document.getElementById('win');
const winDetailEl = document.getElementById('win-detail');

let N = 7;
let cells = [];        // flat array of cell objects
let source = 0;        // index of source cell
let moves = 0;
let solved = false;

let startTime = 0;
let timerId = null;

/* ---------------- Puzzle generation ---------------- */

function idx(r, c) { return r * N + c; }

function generate() {
  cells = [];
  for (let i = 0; i < N * N; i++) {
    cells.push({ base: new Set(), rot: 0, el: null, pipeEl: null });
  }

  source = idx((N / 2) | 0, (N / 2) | 0);

  // Randomized Prim's algorithm builds a spanning tree (nice branching).
  const inTree = new Array(N * N).fill(false);
  const frontier = []; // edges {from, dir}
  const start = source;
  inTree[start] = true;
  addEdges(start, frontier);

  while (frontier.length) {
    const pick = (Math.random() * frontier.length) | 0;
    const { from, dir } = frontier.splice(pick, 1)[0];
    const r = (from / N) | 0, c = from % N;
    const nr = r + DR[dir], nc = c + DC[dir];
    const to = idx(nr, nc);
    if (inTree[to]) continue;

    inTree[to] = true;
    cells[from].base.add(dir);
    cells[to].base.add(opposite(dir));
    addEdges(to, frontier);
  }

  // Scramble: random rotation per cell, ensuring not already solved.
  do {
    for (const cell of cells) cell.rot = (Math.random() * 4) | 0;
  } while (isSolved());
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

/* Marks every cell reachable from the source through matched pipe ends.
 * Returns the count of connected cells. */
function computeActive() {
  const dirCache = cells.map(dirsOf);
  const active = new Array(N * N).fill(false);
  const stack = [source];
  active[source] = true;
  let count = 1;

  while (stack.length) {
    const cur = stack.pop();
    const r = (cur / N) | 0, c = cur % N;
    for (const d of dirCache[cur]) {
      const nr = r + DR[d], nc = c + DC[d];
      if (nr < 0 || nr >= N || nc < 0 || nc >= N) continue;
      const nb = idx(nr, nc);
      if (!dirCache[nb].has(opposite(d))) continue; // ends must match
      if (!active[nb]) { active[nb] = true; count++; stack.push(nb); }
    }
  }
  return { active, count, dirCache };
}

function isSolved() {
  const { count, dirCache } = computeActive();
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

/* ---------------- Rendering ---------------- */

function buildSvg(cell, isSource) {
  const dirs = [...cell.base];
  const C = 50;
  const tip = { 0: [50, 12], 1: [88, 50], 2: [50, 88], 3: [12, 50] };
  const edge = { 0: [50, 4], 1: [96, 50], 2: [50, 96], 3: [4, 50] };

  let svg = `<svg viewBox="0 0 100 100" fill="none">`;
  svg += `<g stroke-width="11" stroke-linecap="round">`;

  for (const d of dirs) {
    const [ex, ey] = edge[d];
    svg += `<line class="wire" x1="${C}" y1="${C}" x2="${ex}" y2="${ey}" />`;
  }

  // End caps for degree-1 pieces get a little plug.
  if (dirs.length === 1) {
    const [tx, ty] = tip[dirs[0]];
    svg += `<circle class="plug" cx="${tx}" cy="${ty}" r="8.5" stroke-width="4" />`;
  }

  svg += `</g>`;

  if (isSource) {
    svg += `<circle class="hub" cx="50" cy="50" r="15" />`;
    svg += `<circle class="core" cx="50" cy="50" r="6.5" fill="#fff" />`;
  } else {
    svg += `<circle class="hub" cx="50" cy="50" r="8" />`;
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

    btn.addEventListener('click', () => rotate(i, 1));
    btn.addEventListener('contextmenu', (e) => { e.preventDefault(); rotate(i, -1); });
  }

  updateActive();
}

function rotate(i, dir) {
  if (solved) return;
  const cell = cells[i];
  cell.rot += dir;
  cell.pipeEl.style.transform = `rotate(${cell.rot * 90}deg)`;

  moves++;
  movesEl.textContent = moves;
  if (!timerId) startTimer();

  updateActive();

  if (isSolved()) onSolved();
}

function updateActive() {
  const { active } = computeActive();
  for (let i = 0; i < cells.length; i++) {
    cells[i].el.classList.toggle('active', active[i]);
  }
}

/* ---------------- Win / timer ---------------- */

function onSolved() {
  solved = true;
  stopTimer();
  boardEl.classList.add('solved');
  winDetailEl.textContent = `Gelöst in ${formatTime(elapsed())} · ${moves} Züge`;
  setTimeout(() => { winEl.hidden = false; }, 650);
}

function elapsed() {
  return startTime ? Math.floor((performance.now() - startTime) / 1000) : 0;
}

function formatTime(s) {
  const m = (s / 60) | 0;
  return `${m}:${String(s % 60).padStart(2, '0')}`;
}

function startTimer() {
  startTime = performance.now();
  timerId = setInterval(() => { timeEl.textContent = formatTime(elapsed()); }, 250);
}

function stopTimer() {
  clearInterval(timerId);
  timerId = null;
}

/* ---------------- New game ---------------- */

function newGame() {
  stopTimer();
  solved = false;
  moves = 0;
  startTime = 0;
  movesEl.textContent = '0';
  timeEl.textContent = '0:00';
  winEl.hidden = true;
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

// Prevent long-press context menu from interfering on the board (mobile).
boardEl.addEventListener('contextmenu', (e) => e.preventDefault());

newGame();
