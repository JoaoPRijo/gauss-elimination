// Exact rational numbers: numerator and denominator are BigInt.
// Invariant: denominator > 0 and gcd(|num|, den) = 1. Zero is 0/1.
(function (root) {
  'use strict';

  function gcd(a, b) {
    if (a < 0n) a = -a;
    if (b < 0n) b = -b;
    while (b !== 0n) { const t = a % b; a = b; b = t; }
    return a;
  }

  class Fraction {
    constructor(num, den = 1n) {
      num = BigInt(num); den = BigInt(den);
      if (den === 0n) throw new RangeError('Denominator cannot be zero');
      if (den < 0n) { num = -num; den = -den; }
      const g = gcd(num, den);
      if (g > 1n) { num /= g; den /= g; }
      if (num === 0n) den = 1n;
      this.num = num;
      this.den = den;
      Object.freeze(this);
    }

    static from(x) { return x instanceof Fraction ? x : new Fraction(x); }

    add(o) { o = Fraction.from(o); return new Fraction(this.num * o.den + o.num * this.den, this.den * o.den); }
    sub(o) { o = Fraction.from(o); return new Fraction(this.num * o.den - o.num * this.den, this.den * o.den); }
    mul(o) { o = Fraction.from(o); return new Fraction(this.num * o.num, this.den * o.den); }
    div(o) {
      o = Fraction.from(o);
      if (o.num === 0n) throw new RangeError('Division by zero');
      return new Fraction(this.num * o.den, this.den * o.num);
    }
    neg() { return new Fraction(-this.num, this.den); }
    isZero() { return this.num === 0n; }
    isOne() { return this.num === 1n && this.den === 1n; }
    isInteger() { return this.den === 1n; }
    sign() { return this.num > 0n ? 1 : this.num < 0n ? -1 : 0; }
    abs() { return this.num < 0n ? this.neg() : this; }
    equals(o) { o = Fraction.from(o); return this.num === o.num && this.den === o.den; }

    // Plain text, e.g. "-3/4" (ASCII minus, used for input fields).
    toString() { return this.isInteger() ? this.num.toString() : this.num + '/' + this.den; }

    toLatex() {
      if (this.isInteger()) return this.num.toString();
      const a = this.abs();
      return (this.sign() < 0 ? '-' : '') + '\\frac{' + a.num + '}{' + a.den + '}';
    }

    // Parse user input. Accepts integers, decimals (point or comma),
    // and quotients of those, e.g. "3", "-2/5", "0,25", "1.5/-2".
    // Decimals are converted exactly (0.1 -> 1/10). Returns null if invalid.
    static parse(text) {
      if (text == null) return null;
      let s = String(text).trim().replace(/−/g, '-').replace(/,/g, '.').replace(/\s+/g, '');
      if (s === '') return null;
      const parts = s.split('/');
      if (parts.length > 2) return null;
      const n = parseDecimal(parts[0]);
      if (n === null) return null;
      if (parts.length === 1) return n;
      const d = parseDecimal(parts[1]);
      if (d === null || d.isZero()) return null;
      return n.div(d);
    }
  }

  // Strict parser for the number pad: an integer or a quotient of integers,
  // e.g. "-3", "4/6", "-1/2". No decimals. Returns a Fraction, or an error code.
  Fraction.parseInput = function (text) {
    const m = /^(-?)(\d+)(?:\/(\d+))?$/.exec(text);
    if (!m) return { error: 'errNumber' };
    const den = m[3] === undefined ? 1n : BigInt(m[3]);
    if (den === 0n) return { error: 'errDenZero' };
    return { value: new Fraction(BigInt(m[2]) * (m[1] ? -1n : 1n), den) };
  };

  function parseDecimal(s) {
    const m = /^([+-]?)(\d*)(?:\.(\d*))?$/.exec(s);
    if (!m) return null;
    const intPart = m[2] || '';
    const fracPart = m[3] || '';
    if (intPart === '' && fracPart === '') return null;
    const num = BigInt((intPart || '0') + fracPart) * (m[1] === '-' ? -1n : 1n);
    const den = 10n ** BigInt(fracPart.length);
    return new Fraction(num, den);
  }

  Fraction.ZERO = new Fraction(0n);
  Fraction.ONE = new Fraction(1n);

  root.Fraction = Fraction;
  if (typeof module !== 'undefined' && module.exports) module.exports = Fraction;
})(typeof globalThis !== 'undefined' ? globalThis : this);
