'use strict';

// 물 정렬: 화면·입력·흐름. 판 규칙은 logic.js (LOGIC) 에 있다.
(() => {
const L = LOGIC;
const { CAP } = L;

// ---------- 모양 ----------
const W = 400, H = 680;
const TW = 46, UNIT = 34, TH = UNIT * CAP + 14;          // 병 너비, 물 한 칸 높이, 병 높이
const ROW_H = 176, AREA_TOP = 64, AREA_BOTTOM = H - 92;  // 병 놓는 영역 (위 안내줄 아래 ~ 아래 버튼줄 위)
const INK = '#2b1d52';
const FONT = '"Jua", "Apple SD Gothic Neo", sans-serif';
const EMOJI = '"Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif';

const POUR_T = 0.3, LIFT = 18;
const HINTS = 3, EXTRA_TUBES = 1;
const SAVE_KEY = 'watersortLevel', BEST_KEY = 'watersortBest';

// 물 색: 서로 뚜렷하게 구분되는 12가지 (위는 밝게, 아래는 진하게 그려진다)
const COLORS = [
  '#ff4d6d', '#ff9f1c', '#ffd23f', '#5fd36e', '#1fb5a6', '#3fa9ff',
  '#6b5cff', '#c56cff', '#ff8ac0', '#a0522d', '#9aa5b1', '#2b2f77',
];
const shade = (hex, amt) => {
  const n = parseInt(hex.slice(1), 16), cl = (v) => Math.max(0, Math.min(255, v));
  return `rgb(${cl((n >> 16) + amt)},${cl(((n >> 8) & 255) + amt)},${cl((n & 255) + amt)})`;
};

const BTN = [
  { id: 'undo', x: 13, w: 86 }, { id: 'restart', x: 109, w: 86 }, { id: 'extra', x: 205, w: 86 }, { id: 'hint', x: 301, w: 86 },
];
const BTN_Y = H - 76, BTN_H = 52;

// ---------- 캔버스 ----------
const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const $ = (id) => document.getElementById(id);

function fit() {
  const hudH = 62;
  const scale = Math.min((innerWidth - 24) / W, (innerHeight - 28 - hudH) / H);
  const cssW = Math.floor(W * scale), cssH = Math.floor(H * scale);
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.style.width = cssW + 'px';
  canvas.style.height = cssH + 'px';
  canvas.width = Math.round(cssW * dpr);
  canvas.height = Math.round(cssH * dpr);
  ctx.setTransform(canvas.width / W, 0, 0, canvas.height / H, 0, 0);
  $('col').style.width = Math.max(cssW, Math.min(innerWidth - 20, 340)) + 'px';
  $('wrap').style.width = cssW + 'px';
  $('wrap').style.margin = '0 auto';
}
addEventListener('resize', fit);

function roundRect(c, x, y, w, h, r) {
  r = Math.min(r, w / 2, h / 2);
  c.beginPath();
  c.moveTo(x + r, y);
  c.arcTo(x + w, y, x + w, y + h, r);
  c.arcTo(x + w, y + h, x, y + h, r);
  c.arcTo(x, y + h, x, y, r);
  c.arcTo(x, y, x + w, y, r);
  c.closePath();
}

// ---------- 저장·소리 ----------
const store = {
  get(k) { try { return localStorage.getItem(k); } catch (_) { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch (_) {} },
};
let muted = store.get('watersortMuted') === '1';
let audio = null;
function tone(freq, dur, type = 'sine', vol = 0.12, slide = 0) {
  if (muted) return;
  try {
    audio = audio || new (window.AudioContext || window.webkitAudioContext)();
    const t = audio.currentTime, o = audio.createOscillator(), g = audio.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(40, freq + slide), t + dur);
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g).connect(audio.destination); o.start(t); o.stop(t + dur);
  } catch (_) {}
}
const sfx = {
  pick: () => tone(640, 0.05, 'triangle', 0.07, 120),
  drop: () => tone(300, 0.04, 'triangle', 0.05, -60),
  pour: (n) => tone(420 + n * 60, 0.22, 'sine', 0.1, 300),
  done: () => [784, 988, 1175].forEach((f, i) => setTimeout(() => tone(f, 0.1, 'triangle', 0.09), i * 70)),
  nope: () => tone(170, 0.1, 'square', 0.05, -40),
  undo: () => tone(500, 0.1, 'triangle', 0.08, -200),
  hint: () => [660, 880].forEach((f, i) => setTimeout(() => tone(f, 0.1, 'sine', 0.09), i * 70)),
  win: () => [523, 659, 784, 1047, 1319].forEach((f, i) => setTimeout(() => tone(f, 0.16, 'triangle', 0.1), i * 100)),
};

// ---------- 상태 ----------
let state = 'menu';           // menu | play | paused | won
let level = Math.max(1, Number(store.get(SAVE_KEY)) || 1);
let best = Number(store.get(BEST_KEY)) || 0;
let start = [], tubes = [], history = [];
let sel = -1, moves = 0;
let hintsLeft = HINTS, extraLeft = EXTRA_TUBES;
let hint = null, hintT = 0;                 // { a, b } 잠깐 반짝이는 힌트
let anims = new Map();                      // 병 번호 → { kind:'in'|'out', color, n, t }
let streams = [];                           // 붓는 물줄기 { from, to, color, t }
let doneSet = new Set();                    // 이미 다 찬 병 (효과를 한 번만)
let particles = [], banner = null;
let clock = 0;

// 병 자리 계산: 6개 이하 한 줄, 12개 이하 두 줄, 그 이상 세 줄
function layout() {
  const n = tubes.length, rows = n <= 6 ? 1 : n <= 12 ? 2 : 3, per = Math.ceil(n / rows);
  const gap = Math.min(16, (W - 20 - per * TW) / Math.max(1, per - 1));
  const usable = AREA_BOTTOM - AREA_TOP, blockH = rows * ROW_H;
  const y0 = AREA_TOP + Math.max(0, (usable - blockH) / 2);
  return tubes.map((_, i) => {
    const r = Math.floor(i / per), c = i % per, inRow = Math.min(per, n - r * per);
    const rowW = inRow * TW + (inRow - 1) * gap;
    return { x: (W - rowW) / 2 + c * (TW + gap), y: y0 + r * ROW_H + (ROW_H - TH) / 2 + 10 };
  });
}
let pos = [];

function newLevel(n, same = false) {
  level = n; store.set(SAVE_KEY, String(n));
  if (!same) start = L.generate(n);
  tubes = start.map((t) => t.slice());
  history = []; sel = -1; moves = 0; hintsLeft = HINTS; extraLeft = EXTRA_TUBES; hint = null;
  anims.clear(); streams = []; particles = []; doneSet = new Set(); banner = { text: `레벨 ${n}`, t: 0 };
  tubes.forEach((t, i) => { if (L.isDone(t)) doneSet.add(i); });
  pos = layout();
  state = 'play';
  hideOverlay();
  updateHud();
}

// ---------- 흐름 ----------
function select(i) {
  if (state !== 'play') return;
  hint = null;
  if (sel < 0) {
    if (!tubes[i].length) return;                      // 빈 병은 고를 수 없다
    sel = i; sfx.pick();
    return;
  }
  if (sel === i) { sel = -1; sfx.drop(); return; }
  if (L.canPour(tubes, sel, i)) return doPour(sel, i);
  // 부을 수 없으면 다른 병을 새로 고른 것으로 본다
  if (tubes[i].length) { sel = i; sfx.pick(); } else { sel = -1; }
  if (!tubes[i].length || L.isFull(tubes[i])) sfx.nope();
}

function doPour(a, b) {
  history.push(tubes.map((t) => t.slice()));
  const { color, n } = L.pour(tubes, a, b);
  moves++;
  sel = -1;
  anims.set(a, { kind: 'out', color, n, t: 0 });
  anims.set(b, { kind: 'in', color, n, t: 0 });
  streams.push({ from: a, to: b, color, t: 0 });
  sfx.pour(n);
  if (L.isDone(tubes[b]) && !doneSet.has(b)) {
    doneSet.add(b);
    setTimeout(() => { sfx.done(); burst(pos[b].x + TW / 2, pos[b].y + 20, COLORS[color]); }, POUR_T * 700);
  }
  updateHud();
  if (L.solved(tubes)) return win();
  if (L.isStuck(tubes)) banner = { text: '막혔어요! ↩ 되돌려요', t: 0, small: true };
}

function undo() {
  if (state !== 'play' || !history.length) return;
  tubes = history.pop();
  moves = Math.max(0, moves - 1);
  sel = -1; hint = null; anims.clear(); streams = [];
  doneSet = new Set(); tubes.forEach((t, i) => { if (L.isDone(t)) doneSet.add(i); });
  pos = layout();
  sfx.undo();
  updateHud();
}

function addTube() {
  if (state !== 'play' || extraLeft <= 0) return;
  extraLeft--;
  history.push(tubes.map((t) => t.slice()));       // 되돌리면 빈 병도 사라진다
  tubes.push([]);
  pos = layout();
  sfx.drop();
}

function useHint() {
  if (state !== 'play' || hintsLeft <= 0) return;
  const path = L.solve(tubes.map((t) => t.slice()));
  if (!path || !path.length) { banner = { text: '막혔어요! ↩ 되돌려요', t: 0, small: true }; sfx.nope(); return; }
  hintsLeft--;
  hint = { a: path[0][0], b: path[0][1] }; hintT = 0; sel = -1;
  sfx.hint();
}

function burst(x, y, col) {
  for (let i = 0; i < 10; i++) {
    const a = Math.random() * Math.PI * 2, s = 60 + Math.random() * 120;
    particles.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 70, life: 0.6, col });
  }
}

function win() {
  state = 'won';
  if (level > best) { best = level; store.set(BEST_KEY, String(best)); }
  store.set(SAVE_KEY, String(level + 1));
  sfx.win();
  updateHud();
  setTimeout(() => showOverlay(`
    <h2 class="inked">레벨 ${level} 클리어!</h2>
    <div class="big inked">${moves}</div>
    <span class="tag">번 만에 정리했어요</span>
    <div class="card"><dl class="stats">
      <dt>다음 레벨</dt><dd>${level + 1}</dd>
      <dt>색 종류</dt><dd>${L.levelSpec(level + 1).colors}가지</dd>
      <dt>최고 레벨</dt><dd>${best}</dd>
    </dl></div>
    <button data-act="next">다음 레벨</button>
    <button class="sub" data-act="menu">← 처음으로</button>`), 900);
}

function update(dt) {
  clock += dt;
  for (const p of particles) { p.life -= dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 500 * dt; }
  particles = particles.filter((p) => p.life > 0);
  for (const [i, a] of anims) { a.t += dt; if (a.t >= POUR_T) anims.delete(i); }
  for (const s of streams) s.t += dt;
  streams = streams.filter((s) => s.t < POUR_T);
  if (banner) { banner.t += dt; if (banner.t > 1.3) banner = null; }
  if (hint) { hintT += dt; if (hintT > 3) hint = null; }
}

// ---------- 그리기 ----------
function label(text, x, y, size, fill = '#fff', align = 'center') {
  ctx.font = `${size}px ${FONT}`;
  ctx.textAlign = align; ctx.textBaseline = 'middle'; ctx.lineJoin = 'round';
  ctx.lineWidth = Math.max(3, size * 0.2); ctx.strokeStyle = INK; ctx.strokeText(text, x, y);
  ctx.fillStyle = fill; ctx.fillText(text, x, y);
}
function panel(x, y, w, h, r, fill, lift = 4) {
  ctx.fillStyle = INK; roundRect(ctx, x, y + lift, w, h, r); ctx.fill();
  ctx.fillStyle = fill; roundRect(ctx, x, y, w, h, r); ctx.fill();
  ctx.lineWidth = 3; ctx.strokeStyle = INK; roundRect(ctx, x, y, w, h, r); ctx.stroke();
}

// 병 안쪽 모양 (아래는 둥글고 위는 열려 있다)
function tubePath(x, y, w, h) {
  const r = w / 2 - 1;
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x, y + h - r);
  ctx.arc(x + w / 2, y + h - r, w / 2, Math.PI, 0, true);
  ctx.lineTo(x + w, y);
}

function drawLiquid(x, yBottom, color, from, to) {
  // from ~ to: 병 바닥에서 위로 잰 높이(픽셀). 위쪽은 밝게, 아래쪽은 진하게
  const yTop = yBottom - to, h = to - from;
  if (h <= 0) return;
  const g = ctx.createLinearGradient(0, yTop, 0, yBottom - from);
  g.addColorStop(0, shade(color, 26)); g.addColorStop(0.3, color); g.addColorStop(1, shade(color, -28));
  ctx.fillStyle = g;
  ctx.fillRect(x - 2, yTop, TW + 4, h + 1);
  ctx.fillStyle = 'rgba(43,29,82,.35)';
  if (from > 0) ctx.fillRect(x - 2, yBottom - from - 1, TW + 4, 2);         // 칸 사이 가는 선
}

function drawTube(i) {
  const t = tubes[i], p = pos[i], a = anims.get(i);
  const isSel = sel === i;
  const lift = isSel ? LIFT + Math.sin(clock * 8) * 1.5 : 0;
  const x = p.x, y = p.y - lift, w = TW, h = TH;
  const bottom = y + h - 5;                                       // 물이 닿는 바닥 y

  // 아래 그림자 + 선택 시 받침 빛
  ctx.fillStyle = 'rgba(43,29,82,.28)';
  ctx.beginPath(); ctx.ellipse(x + w / 2, p.y + h + 1, w * 0.55, 6, 0, 0, Math.PI * 2); ctx.fill();
  if (isSel) { ctx.fillStyle = 'rgba(255,230,80,.6)'; ctx.beginPath(); ctx.ellipse(x + w / 2, p.y + h + 1, w * 0.75, 9, 0, 0, Math.PI * 2); ctx.fill(); }

  // 유리
  ctx.save();
  tubePath(x, y, w, h); ctx.lineTo(x + w, y); ctx.closePath();
  ctx.fillStyle = 'rgba(255,255,255,.55)'; ctx.fill();
  ctx.clip();

  // 물: 아래 칸부터. 붓는 중인 칸은 높이가 부드럽게 변한다
  let lower = 0;
  const stable = a && a.kind === 'in' ? t.length - a.n : t.length;
  for (let k = 0; k < stable; k++) { drawLiquid(x, bottom, COLORS[t[k]], k * UNIT, (k + 1) * UNIT); lower = (k + 1) * UNIT; }
  if (a) {
    const k = Math.min(1, a.t / POUR_T), e = a.kind === 'in' ? k : 1 - k;
    drawLiquid(x, bottom, COLORS[a.color], lower, lower + a.n * UNIT * e);
  }
  // 유리 반사광
  ctx.fillStyle = 'rgba(255,255,255,.5)';
  roundRect(ctx, x + 7, y + 10, 5, h - 30, 3); ctx.fill();
  ctx.restore();

  // 테두리 + 위 입구 테
  tubePath(x, y, w, h);
  ctx.lineWidth = 3.5; ctx.strokeStyle = INK; ctx.lineJoin = 'round'; ctx.lineCap = 'round'; ctx.stroke();
  ctx.fillStyle = '#fff'; roundRect(ctx, x - 4, y - 5, w + 8, 9, 4); ctx.fill();
  ctx.lineWidth = 3; ctx.strokeStyle = INK; roundRect(ctx, x - 4, y - 5, w + 8, 9, 4); ctx.stroke();

  // 다 찬 병: 반짝이는 별
  if (doneSet.has(i) && L.isDone(t)) {
    ctx.font = `20px ${EMOJI}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = '#000';
    ctx.globalAlpha = 0.75 + Math.sin(clock * 5 + i) * 0.25;
    ctx.fillText('✨', x + w / 2, y - 16);
    ctx.globalAlpha = 1;
  }
  // 힌트: 붓는 병은 깜빡이는 노란 화살, 받는 병은 분홍 테
  if (hint && Math.sin(hintT * 9) > -0.2) {
    if (hint.a === i) { ctx.fillStyle = '#ffd23f'; ctx.strokeStyle = INK; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(x + w / 2, y - 12); ctx.lineTo(x + w / 2 - 11, y - 30); ctx.lineTo(x + w / 2 + 11, y - 30); ctx.closePath(); ctx.fill(); ctx.stroke(); }
    if (hint.b === i) { ctx.strokeStyle = '#ff5fa2'; ctx.lineWidth = 5; ctx.setLineDash([7, 6]); roundRect(ctx, x - 7, y - 8, w + 14, h + 12, 20); ctx.stroke(); ctx.setLineDash([]); }
  }
}

function drawStreams() {
  for (const s of streams) {
    const k = s.t / POUR_T, fa = pos[s.from], fb = pos[s.to];
    const ax = fa.x + TW / 2, ay = fa.y - LIFT, bx = fb.x + TW / 2, by = fb.y + 8;
    // 시작 → 끝으로 휘어지는 물줄기: 앞쪽 끝이 먼저 가고 뒤쪽 끝이 따라간다
    const head = Math.min(1, k * 2.2), tail = Math.max(0, (k - 0.35) * 1.6);
    const pt = (u) => ({ x: ax + (bx - ax) * u, y: ay + (by - ay) * u * u + Math.sin(u * Math.PI) * -22 });
    ctx.lineCap = 'round';
    for (const [lw, col] of [[10, INK], [6, COLORS[s.color]]]) {
      ctx.lineWidth = lw; ctx.strokeStyle = col; ctx.beginPath();
      for (let n = 0; n <= 12; n++) { const q = pt(tail + (head - tail) * (n / 12)); n ? ctx.lineTo(q.x, q.y) : ctx.moveTo(q.x, q.y); }
      ctx.stroke();
    }
  }
}

function draw() {
  ctx.clearRect(0, 0, W, H);
  label(`레벨 ${level}`, 14, 30, 26, '#ffd23f', 'left');
  label(`${moves}번 부음`, W - 14, 30, 18, '#fff', 'right');

  for (let i = 0; i < tubes.length; i++) if (i !== sel) drawTube(i);
  if (sel >= 0) drawTube(sel);                                    // 든 병을 맨 위에 그린다
  drawStreams();

  for (const p of particles) {
    ctx.globalAlpha = Math.min(1, p.life * 3);
    ctx.fillStyle = INK; ctx.beginPath(); ctx.arc(p.x, p.y + 1, 5, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = p.col; ctx.beginPath(); ctx.arc(p.x, p.y, 4, 0, Math.PI * 2); ctx.fill();
  }
  ctx.globalAlpha = 1;

  // 아래 버튼 줄
  const labels = { undo: '↩', restart: '🔄', extra: `➕ ${extraLeft}`, hint: `💡 ${hintsLeft}` };
  const enabled = { undo: history.length > 0, restart: true, extra: extraLeft > 0, hint: hintsLeft > 0 };
  for (const b of BTN) {
    const on = enabled[b.id] && state === 'play';
    panel(b.x, BTN_Y, b.w, BTN_H, 26, on ? '#ffd23f' : '#d9d3ea', 5);
    ctx.globalAlpha = on ? 1 : 0.55;
    label(labels[b.id], b.x + b.w / 2, BTN_Y + BTN_H / 2 + 1, b.id === 'undo' ? 30 : 22, on ? '#fff' : '#b5acd0');
    ctx.globalAlpha = 1;
  }

  if (banner && state === 'play') {
    const s = 1 + Math.max(0, 0.25 - banner.t) * 1.6;
    ctx.save(); ctx.globalAlpha = Math.min(1, (1.3 - banner.t) * 3);
    ctx.translate(W / 2, banner.small ? BTN_Y - 30 : H / 2 - 40); ctx.scale(s, s);
    label(banner.text, 0, 0, banner.small ? 22 : 44, banner.small ? '#ff9ecb' : '#ffd23f');
    ctx.restore();
  }
}

function updateHud() {
  $('level').textContent = String(level);
  $('best').textContent = String(best);
}

// ---------- 루프 ----------
let last = performance.now();
function frame(now) {
  const dt = Math.max(0, Math.min(0.05, (now - last) / 1000));
  last = now;
  if (state !== 'paused') update(dt);
  draw();
  requestAnimationFrame(frame);
}

// ---------- 오버레이 ----------
function showOverlay(html) { const o = $('overlay'); o.innerHTML = html; o.classList.remove('hidden'); }
function hideOverlay() { $('overlay').classList.add('hidden'); }

function showMenu() {
  state = 'menu';
  showOverlay(`
    <h1>물 <span class="p">정렬</span></h1>
    <p>같은 색끼리 한 병에 모아요<br>병이 <b>가득 찬 한 가지 색</b>이 되면 성공!</p>
    <button data-act="play">${level > 1 ? `레벨 ${level} 이어서` : '시작하기'}</button>
    ${level > 1 ? '<button class="sub" data-act="reset">처음부터</button>' : ''}
    <div class="card">
      👆 병을 누르고, 물을 부을 병을 누르기<br>
      🎨 맨 위 색이 같거나 빈 병에만 부을 수 있어요<br>
      ↩ 되돌리기는 마음껏, ➕ 빈 병은 한 판에 ${EXTRA_TUBES}번<br>
      💡 막히면 힌트! 한 판에 ${HINTS}번
    </div>`);
}

$('overlay').addEventListener('click', (e) => {
  const btn = e.target.closest('button');
  if (!btn) return;
  const act = btn.dataset.act;
  if (act === 'play') newLevel(level);
  else if (act === 'reset') { level = 1; store.set(SAVE_KEY, '1'); newLevel(1); }
  else if (act === 'next') newLevel(level + 1);
  else if (act === 'menu') { level = Math.max(1, Number(store.get(SAVE_KEY)) || 1); showMenu(); }
  else if (act === 'continue') resume();
});
function pause() {
  if (state !== 'play') return;
  state = 'paused';
  showOverlay(`<h2 class="inked">일시정지</h2><button data-act="continue">계속하기</button>
    <button class="sub" data-act="menu">← 그만하기</button>`);
}
function resume() { if (state !== 'paused') return; state = 'play'; hideOverlay(); }

// ---------- 입력 ----------
// 누르는 순간 바로 반응한다 (떼기를 기다리지 않아서 아이폰에서 탭이 씹히지 않는다)
function toLogical(e) {
  const rect = canvas.getBoundingClientRect();
  return { x: (e.clientX - rect.left) * (W / rect.width), y: (e.clientY - rect.top) * (H / rect.height) };
}
canvas.addEventListener('pointerdown', (e) => {
  if (state !== 'play') return;
  const p = toLogical(e);
  if (p.y >= BTN_Y - 4) {
    const b = BTN.find((x) => p.x >= x.x - 4 && p.x <= x.x + x.w + 4);
    if (!b) return;
    if (b.id === 'undo') undo();
    else if (b.id === 'restart') newLevel(level, true);
    else if (b.id === 'extra') addTube();
    else useHint();
    return;
  }
  // 가장 가까운 병 (손가락이 굵으니 병 사이 빈틈도 가까운 쪽으로)
  let best = -1, bd = 1e9;
  pos.forEach((q, i) => {
    const cx = q.x + TW / 2, cy = q.y + TH / 2 - (sel === i ? LIFT : 0);
    const dx = Math.abs(p.x - cx), dy = Math.abs(p.y - cy);
    if (dx > TW * 0.8 || dy > TH / 2 + 18) return;
    const d = dx * dx + dy * dy;
    if (d < bd) { bd = d; best = i; }
  });
  if (best >= 0) select(best);
  else if (sel >= 0) { sel = -1; sfx.drop(); }
});
canvas.addEventListener('touchstart', (e) => e.preventDefault(), { passive: false });

addEventListener('keydown', (e) => {
  if (e.key === 'Escape' || e.key === 'p' || e.key === 'P') { state === 'paused' ? resume() : pause(); return; }
  if (e.key === 'm' || e.key === 'M') { toggleMute(); return; }
  if (state !== 'play') return;
  if (e.key === 'z' || e.key === 'Z') undo();
  else if (e.key === 'h' || e.key === 'H') useHint();
  else if (e.key >= '1' && e.key <= '9') { const i = Number(e.key) - 1; if (i < tubes.length) select(i); }
  else if (e.key === '0') { if (tubes.length >= 10) select(9); }
});
addEventListener('blur', pause);
document.addEventListener('visibilitychange', () => { if (document.hidden) pause(); });

function toggleMute() {
  muted = !muted;
  store.set('watersortMuted', muted ? '1' : '0');
  $('muteBtn').textContent = muted ? '🔇' : '🔊';
}
$('muteBtn').onclick = (e) => { e.currentTarget.blur(); toggleMute(); };
$('pauseBtn').onclick = (e) => { e.currentTarget.blur(); state === 'paused' ? resume() : pause(); };
$('muteBtn').textContent = muted ? '🔇' : '🔊';

// 첫 화면 뒤에 흐릿하게 보일 병들
start = L.generate(Math.max(1, level)); tubes = start.map((t) => t.slice()); pos = layout();
updateHud();
showMenu();
fit();
requestAnimationFrame(frame);

// 테스트용
window.__ws = { get state() { return state; }, get tubes() { return tubes; }, get sel() { return sel; }, get level() { return level; }, get moves() { return moves; },
  get hintsLeft() { return hintsLeft; }, get extraLeft() { return extraLeft; }, get history() { return history; }, get start() { return start; }, get pos() { return pos; },
  select, undo, addTube, useHint, newLevel, update, draw, showMenu, W, H, TW, TH, BTN, BTN_Y };
})();
