'use strict';

// 물 정렬: 규칙만 모아 둔 파일 (그리기·입력 없음). 브라우저와 테스트(Node)가 같이 쓴다.
//
// 병(tube)은 색 번호 배열, 아래 → 위 순서. 한 병에 CAP 칸까지 담긴다.
// 위에 있는 같은 색 덩어리를 옆 병에 붓는다. 병마다 한 가지 색으로 가득 차면 끝.
const CAP = 4;
const MAX_COLORS = 12;

const topOf = (t) => t[t.length - 1];
const isFull = (t) => t.length === CAP;
const isUniform = (t) => t.length > 0 && t.every((c) => c === t[0]);
const isDone = (t) => isFull(t) && isUniform(t);
const solved = (tubes) => tubes.every((t) => t.length === 0 || isDone(t));

// 맨 위에서 이어진 같은 색 칸 수
function runLen(t) {
  let n = 0;
  for (let i = t.length - 1; i >= 0 && t[i] === topOf(t); i--) n++;
  return n;
}

// a → b 로 부을 수 있는가 (게임 규칙)
function canPour(tubes, a, b) {
  const A = tubes[a], B = tubes[b];
  return a !== b && A.length > 0 && B.length < CAP && (B.length === 0 || topOf(B) === topOf(A));
}
// 몇 칸이 넘어가는가
const pourCount = (tubes, a, b) => Math.min(runLen(tubes[a]), CAP - tubes[b].length);

// 붓는다. 병을 직접 고치고 { color, n } 을 돌려준다
function pour(tubes, a, b) {
  const n = pourCount(tubes, a, b), color = topOf(tubes[a]);
  for (let i = 0; i < n; i++) tubes[b].push(tubes[a].pop());
  return { color, n };
}

// 풀이기·"막힘" 판정에서 뜻이 있는 수만: 한 색으로 찬 병을 빈 병으로 옮기거나, 다 찬 병에서 꺼내는 건 헛수
function usefulMoves(tubes) {
  const out = [];
  for (let a = 0; a < tubes.length; a++) {
    if (!tubes[a].length || isDone(tubes[a])) continue;
    for (let b = 0; b < tubes.length; b++) {
      if (!canPour(tubes, a, b)) continue;
      if (isUniform(tubes[a]) && tubes[b].length === 0) continue;
      out.push([a, b]);
    }
  }
  return out;
}
const isStuck = (tubes) => !solved(tubes) && usefulMoves(tubes).length === 0;

// ---------- 풀이 ----------
// 병 순서를 가리지 않는 상태 이름 (같은 모양이면 같은 상태)
const keyOf = (tubes) => tubes.map((t) => t.join('')).sort().join('|');
// 얼마나 남았는지 어림값: 색이 끊긴 덩어리 수 (색 하나당 한 덩어리가 되면 0)
function estimate(tubes) {
  let blocks = 0;
  const colors = new Set();
  for (const t of tubes) {
    for (let i = 0; i < t.length; i++) {
      colors.add(t[i]);
      if (i === 0 || t[i] !== t[i - 1]) blocks++;
    }
  }
  return blocks - colors.size;
}

class Heap {
  constructor() { this.a = []; }
  get size() { return this.a.length; }
  push(item) {
    const a = this.a; a.push(item);
    let i = a.length - 1;
    while (i > 0) { const p = (i - 1) >> 1; if (a[p].f <= a[i].f) break; [a[p], a[i]] = [a[i], a[p]]; i = p; }
  }
  pop() {
    const a = this.a, first = a[0], last = a.pop();
    if (a.length) {
      a[0] = last;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1, r = l + 1; let m = i;
        if (l < a.length && a[l].f < a[m].f) m = l;
        if (r < a.length && a[r].f < a[m].f) m = r;
        if (m === i) break;
        [a[m], a[i]] = [a[i], a[m]]; i = m;
      }
    }
    return first;
  }
}

// 지금 상태에서 끝까지 가는 수 목록 [[a,b],...]. 못 찾으면 null (탐색 한도 안에서)
function solve(start, maxNodes = 40000) {
  if (solved(start)) return [];
  const seen = new Set([keyOf(start)]);
  const heap = new Heap();
  heap.push({ f: estimate(start) * 10, tubes: start, path: null, depth: 0 });
  let nodes = 0;
  while (heap.size && nodes++ < maxNodes) {
    const cur = heap.pop();
    for (const [a, b] of usefulMoves(cur.tubes)) {
      const next = cur.tubes.map((t) => t.slice());
      pour(next, a, b);
      const k = keyOf(next);
      if (seen.has(k)) continue;
      seen.add(k);
      const node = { tubes: next, path: { move: [a, b], prev: cur.path }, depth: cur.depth + 1 };
      if (solved(next)) {
        const moves = [];
        for (let p = node.path; p; p = p.prev) moves.push(p.move);
        return moves.reverse();
      }
      node.f = estimate(next) * 10 + node.depth;
      heap.push(node);
    }
  }
  return null;
}

// ---------- 레벨 ----------
// 레벨이 오를수록 색이 늘어난다 (빈 병은 늘 2개). 병 수 = 색 수 + 2
function levelSpec(n) {
  const colors = Math.min(MAX_COLORS, 3 + Math.floor((n - 1) / 2));
  return { colors, tubes: colors + 2 };
}

function shuffled(arr, rng) {
  for (let i = arr.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [arr[i], arr[j]] = [arr[j], arr[i]]; }
  return arr;
}

// 새 판: 색 칸을 무작위로 섞어 채운 뒤, 풀 수 있는 판만 쓴다 (한 병이 처음부터 다 찬 판은 버린다)
function generate(n, rng = Math.random) {
  const { colors, tubes: count } = levelSpec(n);
  for (;;) {
    const units = [];
    for (let c = 0; c < colors; c++) for (let i = 0; i < CAP; i++) units.push(c);
    shuffled(units, rng);
    const tubes = [];
    for (let i = 0; i < colors; i++) tubes.push(units.slice(i * CAP, (i + 1) * CAP));
    while (tubes.length < count) tubes.push([]);
    if (tubes.some(isUniform)) continue;
    if (solve(tubes.map((t) => t.slice())) !== null) return tubes;
  }
}

const LOGIC = { CAP, MAX_COLORS, isDone, isFull, isUniform, solved, canPour, pourCount, pour, usefulMoves, isStuck, solve, levelSpec, generate };
if (typeof module !== 'undefined') module.exports = LOGIC;
