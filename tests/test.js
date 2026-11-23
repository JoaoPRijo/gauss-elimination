// Run with: node tests/test.js
const assert = require('assert');
const F = require('../js/fraction.js');
const Ops = require('../js/matrix.js');
const q = (s) => F.parse(s);

// Parsing
assert.strictEqual(q('3').toString(), '3');
assert.strictEqual(q('-6/8').toString(), '-3/4');
assert.strictEqual(q('6/-8').toString(), '-3/4');
assert.strictEqual(q('0,25').toString(), '1/4');
assert.strictEqual(q('-.5').toString(), '-1/2');
assert.strictEqual(q('1.5/2').toString(), '3/4');
assert.strictEqual(q('−2/3').toString(), '-2/3');
assert.strictEqual(q('0.1').add(q('0.2')).toString(), '3/10');
assert.strictEqual(q('0/5').toString(), '0');
assert.strictEqual(q('-0').toString(), '0');
for (const bad of ['', 'abc', '1/0', '1/2/3', '.', '1..2', '2x', '--1', '/3']) assert.strictEqual(q(bad), null, bad);
// Big numbers stay exact
assert.strictEqual(q('123456789012345678901234567890').mul(q('10')).toString(), '1234567890123456789012345678900');
// Arithmetic
assert.strictEqual(q('1/3').add(q('1/6')).toString(), '1/2');
assert.strictEqual(q('1/3').sub(q('1/3')).toString(), '0');
assert.strictEqual(q('2/3').div(q('-4/9')).toString(), '-3/2');
assert.throws(() => q('1').div(F.ZERO));
assert.strictEqual(q('-3/4').toLatex(), '-\\frac{3}{4}');

// Row operations
const M = [['1','2','-1','3'],['2','1','1','7'],['3','-1','2','4']].map(r => r.map(q));
const show = (A) => A.map(r => r.map(String).join(' ')).join(' | ');
assert.strictEqual(show(Ops.swap(M, 0, 2)), '3 -1 2 4 | 2 1 1 7 | 1 2 -1 3');
assert.strictEqual(show(Ops.scale(M, 1, q('1/2'))), '1 2 -1 3 | 1 1/2 1/2 7/2 | 3 -1 2 4');
assert.strictEqual(show(Ops.addMultiple(M, 1, 0, q('-2'))), '1 2 -1 3 | 0 -3 3 1 | 3 -1 2 4');
assert.strictEqual(show(M), '1 2 -1 3 | 2 1 1 7 | 3 -1 2 4', 'input not mutated');
assert.throws(() => Ops.scale(M, 0, F.ZERO));
assert.throws(() => Ops.swap(M, 1, 1));
assert.throws(() => Ops.addMultiple(M, 1, 1, q('2')));
assert.strictEqual(show(Ops.addMultiple(M, 1, 0, F.ZERO)), show(M), 'adding 0 times a row is allowed');
assert.strictEqual(show(Ops.apply(M, { type: 'mul', i: 0, k: q('-1') })), '-1 -2 1 -3 | 2 1 1 7 | 3 -1 2 4');
// Combined operation Li <- a Li + b Lj
assert.strictEqual(show(Ops.apply(M, { type: 'comb', i: 1, a: q('2'), j: 0, b: q('-4') })), '1 2 -1 3 | 0 -6 6 2 | 3 -1 2 4');
assert.strictEqual(show(Ops.apply(M, { type: 'comb', i: 2, a: q('1/3'), j: null, b: null })), '1 2 -1 3 | 2 1 1 7 | 1 -1/3 2/3 4/3');
assert.throws(() => Ops.apply(M, { type: 'comb', i: 1, a: F.ZERO, j: 0, b: q('1') }));
assert.throws(() => Ops.apply(M, { type: 'comb', i: 1, a: q('2'), j: 1, b: q('1') }));
// Number pad parser
const P = (s) => { const r = F.parseInput(s); return r.error || r.value.toString(); };
assert.strictEqual(P('4/6'), '2/3'); assert.strictEqual(P('-12'), '-12'); assert.strictEqual(P('-0'), '0');
assert.strictEqual(P('3/0'), 'errDenZero'); assert.strictEqual(P('1.5'), 'errNumber'); assert.strictEqual(P('--1'), 'errNumber');
assert.strictEqual(P('1/-2'), 'errNumber'); assert.strictEqual(P(''), 'errNumber'); assert.strictEqual(P('2/'), 'errNumber'); assert.strictEqual(P('1/2/3'), 'errNumber');

// Full elimination to RREF
let A = M;
A = Ops.addMultiple(A, 1, 0, q('-2'));
A = Ops.addMultiple(A, 2, 0, q('-3'));
A = Ops.scale(A, 1, q('-1/3'));
A = Ops.addMultiple(A, 2, 1, q('7'));
assert.ok(Ops.isRowEchelon(A) && !Ops.isReducedRowEchelon(A));
A = Ops.scale(A, 2, F.ONE.div(A[2][2]));
A = Ops.addMultiple(A, 1, 2, q('1'));
A = Ops.addMultiple(A, 0, 2, q('1'));
A = Ops.addMultiple(A, 0, 1, q('-2'));
assert.ok(Ops.isReducedRowEchelon(A), show(A));
// check solution satisfies original system
const x = A.map(r => r[3]);
M.forEach(r => assert.ok(r[0].mul(x[0]).add(r[1].mul(x[1])).add(r[2].mul(x[2])).equals(r[3])));
console.log('solution', x.map(String));

// Echelon checks
const E = (rows) => rows.map(r => r.map(q));
assert.ok(Ops.isRowEchelon(E([['0','0'],['0','0']])));
assert.ok(!Ops.isRowEchelon(E([['0','0'],['1','0']])));
assert.ok(!Ops.isRowEchelon(E([['0','1'],['0','2']])));
assert.ok(Ops.isReducedRowEchelon(E([['1','0','2'],['0','1','3']])));
assert.ok(!Ops.isReducedRowEchelon(E([['1','1'],['0','1']])));
assert.ok(!Ops.isReducedRowEchelon(E([['2','0'],['0','1']])));

// Classification with reasons
const Ech = require('../js/echelon.js');
const kindOf = (rows) => Ech.diagnose(E(rows));
assert.deepStrictEqual(kindOf([['1','2','3'],['0','0','1'],['0','4','5']]), { kind: 'none', reason: { type: 'pivotNotRight', row: 2, prev: 1 } });
assert.deepStrictEqual(kindOf([['0','0'],['1','0']]).reason.type, 'zeroAbove');
assert.deepStrictEqual(kindOf([['2','1'],['0','1']]).reason, { type: 'pivotNotOne', row: 0, col: 0 });
assert.deepStrictEqual(kindOf([['1','2','0'],['0','1','3'],['0','0','0']]).reason, { type: 'nonzeroInPivotCol', row: 1, col: 1, other: 0 });
assert.strictEqual(kindOf([['1','0','2'],['0','1','-3']]).kind, 'rref');
// Random practice cards: the stored answer always matches the independent checks.
const counts = { rref: 0, ref: 0, none: 0 };
for (let t = 0; t < 5000; t++) {
  const c = Ech.practiceCard();
  const truth = Ops.isReducedRowEchelon(c.M) ? 'rref' : Ops.isRowEchelon(c.M) ? 'ref' : 'none';
  assert.strictEqual(c.kind, truth);
  assert.ok(c.M.length >= 2 && c.M.length <= 4 && c.M[0].length >= 2 && c.M[0].length <= 5);
  assert.ok(c.M.some(r => r.some(x => !x.isZero())));
  counts[c.kind]++;
}
console.log('practice cards', counts);
// The examples on the explanation page are what they claim to be.
const X = Ech.EXAMPLES; const k = (rows) => Ech.diagnose(rows.map(r => r.map(q))).kind;
X.ref.forEach(m => assert.strictEqual(k(m), 'ref'));
assert.strictEqual(k(X.nonRef), 'none');
assert.deepStrictEqual(Ech.diagnose(X.nonRef.map(r => r.map(q))).reason, { type: 'pivotNotRight', row: 2, prev: 1 });
X.rref.forEach(m => assert.strictEqual(k(m), 'rref'));
assert.strictEqual(k(X.nonRref), 'ref');
assert.deepStrictEqual(Ech.diagnose(X.nonRref.map(r => r.map(q))).reason, { type: 'nonzeroInPivotCol', row: 1, col: 1, other: 0 });
// Tutorial: example i stops at check i (the last one passes all four), and the
// four checks agree with the classification for random matrices.
Ech.TUTORIAL.forEach((m, i) => {
  const st = Ech.checkSteps(m.map(r => r.map(q)));
  const firstFail = st.findIndex(x => !x.ok);
  assert.strictEqual(firstFail, i < 4 ? i : -1, 'tutorial example ' + (i + 1));
});
for (let t = 0; t < 3000; t++) {
  const c = Ech.practiceCard();
  const st = Ech.checkSteps(c.M);
  const kind = (!st[0].ok || !st[1].ok) ? 'none' : (!st[2].ok || !st[3].ok) ? 'ref' : 'rref';
  assert.strictEqual(kind, c.kind);
}
console.log('All tests passed');
