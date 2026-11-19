// Elementary row operations on matrices of Fractions (pure functions:
// each returns a new matrix and never modifies its input). Rows are 0-based here.
(function (root) {
  'use strict';
  const Fraction = root.Fraction || (typeof require !== 'undefined' ? require('./fraction.js') : null);

  function copy(M) { return M.map(r => r.slice()); }

  // Li <-> Lj
  function swap(M, i, j) {
    if (i === j) throw new RangeError('same-row');
    const R = copy(M);
    [R[i], R[j]] = [R[j], R[i]];
    return R;
  }

  // Li <- k Li, with k != 0
  function scale(M, i, k) {
    if (k.isZero()) throw new RangeError('zero-scalar');
    const R = copy(M);
    R[i] = R[i].map(x => x.mul(k));
    return R;
  }

  // Li <- Li + k Lj, with i != j (any scalar k)
  function addMultiple(M, i, j, k) {
    if (i === j) throw new RangeError('same-row');
    const R = copy(M);
    R[i] = R[i].map((x, c) => x.add(k.mul(M[j][c])));
    return R;
  }

  function apply(M, op) {
    if (op.type === 'swap') return swap(M, op.i, op.j);
    if (op.type === 'mul') return scale(M, op.i, op.k);
    if (op.type === 'add') return addMultiple(M, op.i, op.j, op.k);
    throw new Error('unknown operation');
  }

  function pivotCol(row) {
    for (let c = 0; c < row.length; c++) if (!row[c].isZero()) return c;
    return -1;
  }

  // Row echelon form: zero rows at the bottom, and the leading entry of each
  // nonzero row lies strictly to the right of the leading entry of the row above.
  function isRowEchelon(M) {
    let last = -1, seenZero = false;
    for (const row of M) {
      const p = pivotCol(row);
      if (p === -1) { seenZero = true; continue; }
      if (seenZero || p <= last) return false;
      last = p;
    }
    return true;
  }

  // Reduced row echelon form: row echelon form, every leading entry is 1,
  // and it is the only nonzero entry in its column.
  function isReducedRowEchelon(M) {
    if (!isRowEchelon(M)) return false;
    for (let r = 0; r < M.length; r++) {
      const p = pivotCol(M[r]);
      if (p === -1) continue;
      if (!M[r][p].isOne()) return false;
      for (let s = 0; s < M.length; s++) if (s !== r && !M[s][p].isZero()) return false;
    }
    return true;
  }

  const api = { copy, swap, scale, addMultiple, apply, pivotCol, isRowEchelon, isReducedRowEchelon };
  root.MatrixOps = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
