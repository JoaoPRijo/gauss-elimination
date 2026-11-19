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
console.log('All tests passed');
