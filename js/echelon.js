// Classification of matrices (row echelon / reduced row echelon / neither),
// the reason behind each classification, and random practice matrices.
// The answer of every practice card comes from MatrixOps' checks, never from
// the way the card was generated.
(function (root) {
  'use strict';
  const Fraction = root.Fraction || (typeof require !== 'undefined' ? require('./fraction.js') : null);
  const Ops = root.MatrixOps || (typeof require !== 'undefined' ? require('./matrix.js') : null);

  // Rows are 0-based here; the interface adds 1.
  // kind: 'rref' | 'ref' | 'none'
  // reason (for 'ref' and 'none'): the first condition that fails.
  function diagnose(M) {
    let last = -1, zeroRow = -1;
    for (let r = 0; r < M.length; r++) {
      const p = Ops.pivotCol(M[r]);
      if (p === -1) { if (zeroRow === -1) zeroRow = r; continue; }
      if (zeroRow !== -1) return { kind: 'none', reason: { type: 'zeroAbove', zeroRow, row: r } };
      if (p <= last) return { kind: 'none', reason: { type: 'pivotNotRight', row: r, prev: r - 1 } };
      last = p;
    }
    for (let r = 0; r < M.length; r++) {
      const p = Ops.pivotCol(M[r]);
      if (p !== -1 && !M[r][p].isOne()) return { kind: 'ref', reason: { type: 'pivotNotOne', row: r, col: p } };
    }
    for (let r = 0; r < M.length; r++) {
      const p = Ops.pivotCol(M[r]);
      if (p === -1) continue;
      for (let s = 0; s < M.length; s++) {
        if (s !== r && !M[s][p].isZero()) return { kind: 'ref', reason: { type: 'nonzeroInPivotCol', row: r, col: p, other: s } };
      }
    }
    return { kind: 'rref', reason: null };
  }

  function pivots(M) {
    const out = [];
    M.forEach((row, r) => { const p = Ops.pivotCol(row); if (p !== -1) out.push([r, p]); });
    return out;
  }

  // ---------------- Random matrices ----------------
  const randInt = (a, b, rnd) => a + Math.floor(rnd() * (b - a + 1));
  const nonzero = (a, b, rnd) => { let x; do { x = randInt(a, b, rnd); } while (x === 0); return x; };
  function entry(rnd) {
    // Mostly small integers, sometimes a simple fraction.
    if (rnd() < 0.12) return new Fraction(nonzero(-5, 5, rnd), randInt(2, 4, rnd));
    return new Fraction(randInt(-6, 6, rnd));
  }
  const zeros = (m, n) => Array.from({ length: m }, () => Array.from({ length: n }, () => Fraction.ZERO));

  // A matrix in row echelon form with rank r. If reduced, it is in reduced form.
  function randomEchelon(m, n, reduced, rnd) {
    const rank = randInt(1, Math.min(m, n), rnd);
    const cols = [];
    const pool = Array.from({ length: n }, (_, c) => c);
    while (cols.length < rank) cols.push(pool.splice(randInt(0, pool.length - 1, rnd), 1)[0]);
    cols.sort((a, b) => a - b);
    const M = zeros(m, n);
    cols.forEach((p, r) => {
      M[r][p] = reduced ? Fraction.ONE : new Fraction(nonzero(-6, 6, rnd));
      for (let c = p + 1; c < n; c++) {
        if (reduced && cols.includes(c)) continue;
        M[r][c] = entry(rnd);
      }
    });
    return M;
  }

  function spoil(M, rnd, wantREF) {
    const R = M.map((row) => row.slice());
    const piv = pivots(R);
    const m = R.length;
    if (wantREF) {
      // Keep the staircase, break the "reduced" conditions.
      if (rnd() < 0.5 || piv.length < 2) {
        const [r] = piv[randInt(0, piv.length - 1, rnd)];
        const ks = [2, 3, -1, -2, 4, -3];
        const k = new Fraction(ks[randInt(0, ks.length - 1, rnd)]);
        R[r] = R[r].map((x) => x.mul(k));
      } else {
        const idx = randInt(1, piv.length - 1, rnd);
        const [, p] = piv[idx];
        const above = randInt(0, piv[idx][0] - 1, rnd);
        R[above][p] = new Fraction(nonzero(-5, 5, rnd));
      }
      return R;
    }
    // Break the staircase itself.
    const choice = rnd();
    if (choice < 0.35 && m >= 2) {
      const a = randInt(0, m - 1, rnd);
      let b; do { b = randInt(0, m - 1, rnd); } while (b === a);
      [R[a], R[b]] = [R[b], R[a]];
    } else if (choice < 0.75 && piv.length) {
      // a nonzero entry below (or level with) a pivot
      const [r, p] = piv[randInt(0, piv.length - 1, rnd)];
      if (r + 1 < m) {
        const below = randInt(r + 1, m - 1, rnd);
        const c = randInt(0, p, rnd);
        R[below][c] = new Fraction(nonzero(-5, 5, rnd));
      }
    } else {
      // a zero row above a nonzero row
      const zr = R.findIndex((row) => row.every((x) => x.isZero()));
      if (zr > 0) { const a = randInt(0, zr - 1, rnd); [R[a], R[zr]] = [R[zr], R[a]]; }
      else if (m >= 2) { const a = randInt(0, m - 2, rnd); R[a] = R[a].map(() => Fraction.ZERO); }
    }
    return R;
  }

  // A practice card: { M, kind, reason }. Each kind is equally likely.
  function practiceCard(rnd = Math.random) {
    const target = ['rref', 'ref', 'none'][randInt(0, 2, rnd)];
    for (let tries = 0; tries < 200; tries++) {
      const m = randInt(2, 4, rnd), n = randInt(2, 5, rnd);
      let M = randomEchelon(m, n, target === 'rref' || rnd() < 0.5, rnd);
      if (target === 'ref') M = spoil(M, rnd, true);
      if (target === 'none') M = spoil(M, rnd, false);
      if (M.every((row) => row.every((x) => x.isZero()))) continue;
      const d = diagnose(M);
      if (d.kind === target) return { M, kind: d.kind, reason: d.reason };
    }
    // Fallback (practically never reached)
    const M = randomEchelon(3, 3, true, rnd);
    return Object.assign({ M }, diagnose(M));
  }


  // The four checks of the tutorial, in the order they are taught:
  // 1. zero rows at the bottom; 2. pivots strictly to the right of the one above;
  // 3. pivots equal to 1; 4. each pivot is the only nonzero entry of its column.
  // Each check returns { ok, ... } with what to highlight.
  function checkSteps(M) {
    const piv = M.map((row) => Ops.pivotCol(row));
    const zeroRows = piv.map((p, r) => (p === -1 ? r : -1)).filter((r) => r >= 0);
    // 1
    let s1 = { ok: true, zeroRows };
    for (const z of zeroRows) {
      const below = piv.findIndex((p, r) => r > z && p !== -1);
      if (below !== -1) { s1 = { ok: false, zeroRows, zeroRow: z, row: below }; break; }
    }
    // 2 (on the nonzero rows, in order)
    const pivots = piv.map((p, r) => [r, p]).filter(([, p]) => p !== -1);
    let s2 = { ok: true, pivots };
    for (let k = 1; k < pivots.length; k++) {
      if (pivots[k][1] <= pivots[k - 1][1]) { s2 = { ok: false, pivots, row: pivots[k][0], prev: pivots[k - 1][0] }; break; }
    }
    // 3
    const notOne = pivots.filter(([r, p]) => !M[r][p].isOne()).map(([r]) => r);
    const s3 = { ok: notOne.length === 0, pivots, notOne };
    // 4
    const bad = []; // [row, col] entries that should be zero
    pivots.forEach(([r, p]) => M.forEach((row, s) => { if (s !== r && !row[p].isZero()) bad.push([s, p, r]); }));
    const s4 = { ok: bad.length === 0, pivots, bad };
    return [s1, s2, s3, s4];
  }

  // Tutorial examples: each one stops at a different check (verified in tests/test.js).
  const TUTORIAL = [
    [['1', '2', '0'], ['0', '0', '0'], ['0', '3', '1']],              // fails 1
    [['2', '1', '3'], ['0', '0', '5'], ['0', '4', '1']],              // fails 2
    [['1', '3', '2'], ['0', '2', '4'], ['0', '0', '0']],              // fails 3
    [['1', '2', '0', '1'], ['0', '1', '0', '3'], ['0', '0', '1', '-2']], // fails 4
    [['1', '0', '-1', '2'], ['0', '1', '3', '0'], ['0', '0', '0', '0']]  // reduced
  ];

  // Examples for the explanation page (checked in tests/test.js).
  const EXAMPLES = {
    ref: [[['2', '1', '-1', '3'], ['0', '0', '4', '1'], ['0', '0', '0', '-2']], [['1', '3', '0'], ['0', '-1', '2'], ['0', '0', '0']]],
    nonRef: [['1', '2', '3'], ['0', '0', '1'], ['0', '4', '5']],
    rref: [[['1', '0', '2'], ['0', '1', '-3']], [['1', '2', '0', '1/2'], ['0', '0', '1', '3'], ['0', '0', '0', '0']]],
    nonRref: [['1', '2', '0'], ['0', '1', '3'], ['0', '0', '0']]
  };

  const api = { diagnose, pivots, practiceCard, randomEchelon, EXAMPLES, checkSteps, TUTORIAL };
  root.Echelon = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
