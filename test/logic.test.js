'use strict';
// 물 정렬 규칙 시험. 실행: node test/logic.test.js
const test = require('node:test');
const assert = require('node:assert');
const L = require('../logic.js');

function rng(seed) {                                   // mulberry32 (시험용 고정 난수)
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// 풀이를 게임 규칙 그대로(canPour 로 확인하며) 처음부터 붓는다
function replay(tubes, moves) {
  const t = tubes.map((x) => x.slice());
  for (const [a, b] of moves) { assert.ok(L.canPour(t, a, b), `move ${a}→${b}`); L.pour(t, a, b); }
  return t;
}

test('pouring: same colour on top or an empty tube, as much as fits', () => {
  const t = [[0, 1, 1], [2, 1], [], [0, 0, 0, 0], [1, 2, 2, 2]];
  assert.ok(L.canPour(t, 0, 1));                       // 1 위에 1
  assert.ok(L.canPour(t, 0, 2));                       // 빈 병
  assert.ok(!L.canPour(t, 0, 3), 'full tube');
  assert.ok(!L.canPour(t, 1, 4), 'full tube');
  assert.ok(!L.canPour(t, 2, 0), 'empty source');
  assert.ok(!L.canPour(t, 0, 0));
  assert.strictEqual(L.pourCount(t, 0, 1), 2);          // 위의 1 두 칸, 자리 두 칸
  assert.deepStrictEqual(L.pour(t, 0, 1), { color: 1, n: 2 });
  assert.deepStrictEqual(t[0], [0]);
  assert.deepStrictEqual(t[1], [2, 1, 1, 1]);
  const u = [[1, 1, 1], [0, 0, 1]];
  assert.strictEqual(L.pourCount(u, 0, 1), 1, 'only one space left');
});

test('done, solved, useful moves and stuck', () => {
  assert.ok(L.isDone([3, 3, 3, 3]) && !L.isDone([3, 3, 3]) && !L.isDone([3, 3, 1, 3]));
  assert.ok(L.solved([[1, 1, 1, 1], [], [2, 2, 2, 2]]));
  assert.ok(!L.solved([[1, 1, 1], [1], [2, 2, 2, 2]]));
  // 한 색만 든 병을 빈 병으로 옮기는 건 헛수, 다 찬 병에서 꺼내는 것도 헛수
  assert.deepStrictEqual(L.usefulMoves([[1, 1], [], [2, 2, 2, 2]]), []);
  const stuck = [[0, 1, 0, 1], [1, 0, 1, 0], [2, 3, 2, 3], [3, 2, 3, 2]];
  assert.ok(L.isStuck(stuck));
  assert.ok(!L.isStuck([[0, 1, 0, 1], [1, 0, 1, 0], []]));
});

test('level sizes: one more colour every two levels, always two spare tubes, at most 12 colours', () => {
  assert.deepStrictEqual(L.levelSpec(1), { colors: 3, tubes: 5 });
  assert.deepStrictEqual(L.levelSpec(3), { colors: 4, tubes: 6 });
  assert.deepStrictEqual(L.levelSpec(100), { colors: 12, tubes: 14 });
});

test('every generated level is solvable: the solver\'s answer replays to a win with the game rules', () => {
  for (let level = 1; level <= 21; level += 2) {
    for (let s = 1; s <= 3; s++) {
      const tubes = L.generate(level, rng(level * 10 + s));
      const { colors, tubes: count } = L.levelSpec(level);
      assert.strictEqual(tubes.length, count);
      const units = new Map();
      for (const t of tubes) for (const c of t) units.set(c, (units.get(c) || 0) + 1);
      assert.strictEqual(units.size, colors);
      for (const n of units.values()) assert.strictEqual(n, L.CAP);
      assert.ok(!tubes.some((t) => t.length && L.isUniform(t)), 'no tube starts already sorted');
      assert.strictEqual(tubes.filter((t) => !t.length).length, 2);
      const moves = L.solve(tubes.map((t) => t.slice()), 200000);
      assert.ok(moves, `level ${level} seed ${s}`);
      assert.ok(L.solved(replay(tubes, moves)));
    }
  }
});

test('the solver works from the middle of a game too (hint after a few moves)', () => {
  const tubes = L.generate(9, rng(4));
  const moves = L.solve(tubes.map((t) => t.slice()));
  const mid = replay(tubes, moves.slice(0, Math.floor(moves.length / 2)));
  const rest = L.solve(mid.map((t) => t.slice()));
  assert.ok(rest);
  assert.ok(L.solved(replay(mid, rest)));
  assert.deepStrictEqual(L.solve([[1, 1, 1, 1], []]), []);
});
