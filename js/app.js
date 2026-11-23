(function () {
  'use strict';
  const F = window.Fraction;
  const Ops = window.MatrixOps;
  const I18N = window.I18N;

  const MAX = 8;
  const $ = (id) => document.getElementById(id);
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const D = (ms) => (reduceMotion ? 1 : ms); // animation durations

  // ---------------- State ----------------
  const state = {
    lang: initialLang(),
    mode: 'manual',          // 'manual' | 'random'
    rows: 3,
    cols: 4,
    augmented: true,
    entries: Array.from({ length: MAX }, () => Array(MAX).fill('')), // text typed on the pad
    steps: [],               // [{ M, ids, op }]; steps[0] is the initial matrix (op = null)
    op: null,                // operation being built: { type, lines: [{ i, a, b, j }], active: { line, f } }
    busy: false              // true while an animation runs
  };

  function initialLang() {
    try {
      const saved = localStorage.getItem('gauss-lang');
      if (saved === 'pt' || saved === 'en') return saved;
    } catch (e) { /* storage unavailable */ }
    return (navigator.language || 'pt').toLowerCase().startsWith('pt') ? 'pt' : 'en';
  }
  const t = (key) => I18N[state.lang][key];
  const current = () => state.steps[state.steps.length - 1];
  const isAug = () => state.steps.length ? state.steps[0].augmented : state.augmented && state.cols > 1;

  // ---------------- Formatting ----------------
  const MINUS = '\u2212';
  const rowHTML = (i) => t('row') + '<sub>' + (i + 1) + '</sub>';

  function fracHTML(q) {
    const neg = q.sign() < 0;
    const a = q.abs();
    if (a.isInteger()) return (neg ? MINUS : '') + a.num;
    return (neg ? '<span class="neg">' + MINUS + '</span>' : '') +
      '<span class="frac"><span>' + a.num + '</span><span>' + a.den + '</span></span>';
  }
  const coefHTML = (absK) => (absK.isOne() ? '' : fracHTML(absK));

  // Notation: L1 ↔ L2 (swap), L2' = kL2 (multiply), L2' = L2 + kL1 (add).
  // A coefficient 1 is omitted, −1 is written as a minus sign.
  function combTerms(op, fmt) {
    const terms = op.type === 'mul' ? [[op.k, op.i]] : [[F.ONE, op.i], [op.k, op.j]];
    return terms.map(([k, r], idx) => {
      const neg = k.sign() < 0;
      const sign = idx === 0 ? (neg ? fmt.minus : '') : (neg ? fmt.sub : fmt.plus);
      return sign + (k.abs().isOne() ? '' : fmt.num(k.abs())) + fmt.row(r);
    }).join('');
  }
  function opHTML(op) {
    if (op.type === 'swap') return rowHTML(op.i) + ' ↔ ' + rowHTML(op.j);
    return rowHTML(op.i) + '′ = ' + combTerms(op, { minus: MINUS, sub: ' ' + MINUS + ' ', plus: ' + ', num: fracHTML, row: rowHTML });
  }
  function opLatex(op) {
    const R = (i) => t('row') + '_{' + (i + 1) + '}';
    if (op.type === 'swap') return R(op.i) + ' \\leftrightarrow ' + R(op.j);
    return R(op.i) + "' = " + combTerms(op, { minus: '-', sub: ' - ', plus: ' + ', num: (k) => k.toLatex(), row: R });
  }
  // Several simultaneous operations are stacked over one arrow.
  function stepLatex(ops) {
    return ops.length === 1 ? opLatex(ops[0]) : '\\substack{' + ops.map(opLatex).join(' \\\\ ') + '}';
  }
  function matrixLatex(M, aug) {
    const n = M[0].length;
    const spec = aug ? 'c'.repeat(n - 1) + '|c' : 'c'.repeat(n);
    return '\\left[\\begin{array}{' + spec + '} ' + M.map((r) => r.map((x) => x.toLatex()).join(' & ')).join(' \\\\ ') + ' \\end{array}\\right]';
  }

  // ---------------- Views ----------------
  const VIEWS = ['menu', 'echelon', 'tutorial', 'practice', 'home', 'size', 'entry', 'work'];
  function show(id) {
    VIEWS.forEach((v) => { $(v).hidden = v !== id; });
    const el = $(id);
    el.style.animation = 'none'; void el.offsetWidth; el.style.animation = '';
    window.scrollTo({ top: 0 });
  }
  document.querySelectorAll('[data-back]').forEach((b) => b.addEventListener('click', () => { closePad(); show(b.dataset.back); }));
  document.querySelectorAll('[data-go]').forEach((b) => b.addEventListener('click', () => { closePad(); location.hash = b.dataset.go; }));
  $('homeBtn').addEventListener('click', () => { if (state.busy) return; closePad(); location.hash = ''; });
  $('newMatrixBtn').addEventListener('click', () => { if (state.busy) return; cancelOp(); state.steps = []; show('home'); });

  // Top-level pages have their own address, so links and the browser's back button work.
  function route() {
    if (state.busy) return;
    closePad(true);
    if (state.op) cancelOp();
    const h = location.hash.replace('#', '');
    if (h === 'gauss') show(state.steps.length ? 'work' : 'home');
    else if (h === 'escada' || h === 'escada-reduzida') {
      show('echelon');
      if (h === 'escada-reduzida') requestAnimationFrame(() => $('secRref').scrollIntoView({ behavior: 'smooth', block: 'start' }));
    } else if (h === 'praticar') { if (!practice.card) newCard(false); show('practice'); }
    else if (h === 'tutorial') { show('tutorial'); requestAnimationFrame(() => renderTutorial(true)); }
    else show('menu');
  }
  window.addEventListener('hashchange', route);

  // ---------------- Language ----------------
  function applyLang() {
    document.documentElement.lang = state.lang;
    document.title = t('appTitle');
    document.querySelectorAll('[data-i18n]').forEach((el) => { el.textContent = t(el.dataset.i18n); });
    document.querySelectorAll('[data-i18n-title]').forEach((el) => {
      el.title = t(el.dataset.i18nTitle); el.setAttribute('aria-label', t(el.dataset.i18nTitle));
    });
    document.querySelectorAll('.lang button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.lang === state.lang)));
    $('opError').textContent = '';
    if (state.steps.length) { renderMatrix(); renderStatus(false); renderHistory(); }
    if (state.op) renderSentence();
    renderEchelonPage();
    renderPractice();
    if (!$('tutorial').hidden) renderTutorial(false);
  }
  document.querySelectorAll('.lang button').forEach((b) => b.addEventListener('click', () => {
    state.lang = b.dataset.lang;
    try { localStorage.setItem('gauss-lang', state.lang); } catch (e) { /* ignore */ }
    applyLang();
  }));

  // ---------------- Home and size ----------------
  $('chooseManual').addEventListener('click', () => { state.mode = 'manual'; openSize(); });
  $('chooseRandom').addEventListener('click', () => { state.mode = 'random'; openSize(); });
  function openSize() {
    $('randomSizeBtn').hidden = state.mode !== 'random';
    $('sizeNext').textContent = state.mode === 'random' ? t('start') : t('continue');
    renderSize();
    show('size');
  }
  function renderSize() {
    $('rowsOut').textContent = state.rows;
    $('colsOut').textContent = state.cols;
    // Small drawing of the matrix shape
    const m = state.rows, n = state.cols, s = 14, g = 4;
    const aug = state.augmented && n > 1;
    const w = n * s + (n - 1) * g + (aug ? 8 : 0) + 20, h = m * s + (m - 1) * g + 8;
    const svg = $('sizePreview');
    svg.setAttribute('width', w); svg.setAttribute('height', h);
    let html = `<path d="M6 0H1v${h}h5M${w - 6} 0h5v${h}h-5"/>`;
    for (let r = 0; r < m; r++) {
      for (let c = 0; c < n; c++) {
        const x = 10 + c * (s + g) + (aug && c === n - 1 ? 8 : 0);
        html += `<rect x="${x}" y="${4 + r * (s + g)}" width="${s}" height="${s}" rx="3"/>`;
      }
    }
    if (aug) { const x = 10 + (n - 1) * (s + g) + 2; html += `<path d="M${x} 2v${h - 4}" style="stroke-width:1.2"/>`; }
    svg.innerHTML = html;
  }
  document.querySelectorAll('[data-step]').forEach((b) => b.addEventListener('click', () => {
    const [what, d] = b.dataset.step.split(':');
    state[what] = Math.min(MAX, Math.max(1, state[what] + Number(d)));
    renderSize();
  }));
  $('augmented').addEventListener('change', (e) => { state.augmented = e.target.checked; renderSize(); });

  const randInt = (a, b) => a + Math.floor(Math.random() * (b - a + 1));
  function randomMatrix(m, n) {
    return Array.from({ length: m }, () => Array.from({ length: n }, () => new F(randInt(-6, 6))));
  }
  $('sizeNext').addEventListener('click', () => {
    if (state.mode === 'random') startWith(randomMatrix(state.rows, state.cols));
    else { buildEntryGrid(); show('entry'); if (finePointer) entryCell(0, 0).focus(); }
  });
  // Only picks a random size; the person confirms it with "Começar" (and can keep trying).
  $('randomSizeBtn').addEventListener('click', () => {
    let r, c;
    do {
      r = randInt(2, 4);
      c = randInt(state.augmented ? 3 : 2, 5);
    } while (r === state.rows && c === state.cols);
    state.rows = r; state.cols = c;
    renderSize();
    [$('rowsOut'), $('colsOut')].forEach((o) => o.animate([{ transform: 'scale(1.4)' }, { transform: 'none' }], { duration: D(350) }));
  });

  // ---------------- Manual entry ----------------
  function buildEntryGrid() {
    const g = $('entryGrid');
    const { rows, cols } = state;
    const aug = state.augmented && cols > 1;
    const tpl = [];
    for (let c = 0; c < cols; c++) { if (aug && c === cols - 1) tpl.push('8px'); tpl.push('auto'); }
    g.style.gridTemplateColumns = tpl.join(' ');
    g.innerHTML = '';
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        if (aug && c === cols - 1) { const s = document.createElement('div'); s.className = 'sep'; g.appendChild(s); }
        if (finePointer) { g.appendChild(entryInput(r, c)); continue; }
        const b = document.createElement('button');
        b.type = 'button'; b.className = 'entry-cell';
        b.dataset.r = r; b.dataset.c = c;
        b.setAttribute('aria-label', 'a' + (r + 1) + (c + 1));
        b.addEventListener('click', () => editEntry(r, c));
        g.appendChild(b);
        paintEntry(r, c);
      }
    }
    $('entryError').textContent = '';
  }
  // On a computer the entries are typed directly (digits, "-" and "/" only).
  function entryInput(r, c) {
    const inp = document.createElement('input');
    inp.className = 'entry-cell entry-input';
    inp.dataset.r = r; inp.dataset.c = c;
    inp.placeholder = '0';
    inp.spellcheck = false;
    inp.setAttribute('aria-label', 'a' + (r + 1) + (c + 1));
    inp.value = state.entries[r][c].replace(/-/g, MINUS);
    inp.addEventListener('input', () => {
      const clean = inp.value.replace(/\u2212/g, '-').replace(/[^0-9/-]/g, '');
      inp.value = clean.replace(/-/g, MINUS);
      state.entries[r][c] = clean;
      inp.classList.remove('invalid');
      $('entryError').textContent = '';
    });
    inp.addEventListener('blur', () => {
      const s = state.entries[r][c];
      if (s !== '' && F.parseInput(s).error) inp.classList.add('invalid');
    });
    inp.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter') return;
      e.preventDefault();
      let nr = r, nc = c + 1;
      if (nc >= state.cols) { nc = 0; nr++; }
      if (nr < state.rows) entryCell(nr, nc).focus();
      else $('entryDone').click();
    });
    return inp;
  }
  const entryCell = (r, c) => $('entryGrid').querySelector(`[data-r="${r}"][data-c="${c}"]`);
  function paintEntry(r, c) {
    const b = entryCell(r, c);
    const s = state.entries[r][c];
    if (s === '') { b.textContent = '0'; b.classList.add('empty'); }
    else { b.innerHTML = '<span>' + fracHTML(F.parseInput(s).value) + '</span>'; b.classList.remove('empty'); }
  }
  function editEntry(r, c) {
    $('entryGrid').querySelectorAll('.entry-cell').forEach((x) => x.classList.remove('active'));
    entryCell(r, c).classList.add('active');
    openPad({
      text: state.entries[r][c],
      allowEmpty: true,
      onOk: (value, text) => {
        state.entries[r][c] = text;
        paintEntry(r, c);
        // move on to the next entry
        let nr = r, nc = c + 1;
        if (nc >= state.cols) { nc = 0; nr++; }
        if (nr < state.rows) editEntry(nr, nc);
        else entryCell(r, c).classList.remove('active');
      },
      onClose: () => entryCell(r, c) && entryCell(r, c).classList.remove('active')
    });
  }
  $('entryDone').addEventListener('click', () => {
    closePad();
    let bad = false;
    for (let r = 0; r < state.rows; r++) for (let c = 0; c < state.cols; c++) {
      const s = state.entries[r][c];
      if (s !== '' && F.parseInput(s).error) { bad = true; entryCell(r, c).classList.add('invalid'); }
    }
    if (bad) { $('entryError').textContent = t('errNumber'); return; }
    const M = [];
    for (let r = 0; r < state.rows; r++) {
      const row = [];
      for (let c = 0; c < state.cols; c++) {
        const s = state.entries[r][c];
        row.push(s === '' ? F.ZERO : F.parseInput(s).value);
      }
      M.push(row);
    }
    startWith(M);
  });

  // ---------------- Number pad ----------------
  let pad = null; // { text, allowEmpty, validate, onOk, onClose }
  function openPad(opts) {
    pad = Object.assign({ text: '', allowEmpty: false }, opts);
    pad.fresh = pad.text !== '';   // like a selected value: the first digit replaces it
    $('pad').hidden = false; $('padBackdrop').hidden = false;
    $('padError').textContent = '';
    renderPad();
  }
  function closePad(silent) {
    if (!pad) return;
    const p = pad; pad = null;
    $('pad').hidden = true; $('padBackdrop').hidden = true;
    if (!silent && p.onClose) p.onClose();
  }
  function renderPad() {
    const txt = escapeHTML(pad.text.replace(/-/g, MINUS));
    $('padDisplay').innerHTML = (pad.fresh ? '<span class="sel">' + txt + '</span>' : txt) + '<span class="caret"></span>';
  }
  function escapeHTML(s) { return s.replace(/[&<>]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[ch])); }
  function padError(key) {
    $('padError').textContent = t(key);
    const p = $('pad');
    p.classList.remove('shake'); void p.offsetWidth; p.classList.add('shake');
  }
  function padKey(key) {
    if (!pad) return;
    $('padError').textContent = '';
    let s = pad.text;
    if (pad.fresh && (/^\d$/.test(key) || key === 'back' || key === '-')) s = '';
    if (key !== 'ok') pad.fresh = false;
    if (key === 'back') s = s.slice(0, -1);
    else if (key === '-') s = s.startsWith('-') ? s.slice(1) : '-' + s;   // the sign goes in front
    else if (key === '/') { if (/\d$/.test(s) && !s.includes('/')) s += '/'; }
    else if (key === 'ok') return padOk();
    else if (/^\d$/.test(key) && s.replace(/\D/g, '').length < 12) s += key;
    pad.text = s;
    renderPad();
  }
  function padOk() {
    const p = pad;
    if (p.text === '' || p.text === '-') {
      if (!p.allowEmpty) return padError('errNumber');
      closePad(true); p.onOk(null, ''); return;
    }
    const res = F.parseInput(p.text);
    if (res.error) return padError(res.error);
    const err = p.validate && p.validate(res.value);
    if (err) return padError(err);
    closePad(true);
    p.onOk(res.value, p.text);
  }
  document.querySelectorAll('.pad-keys button').forEach((b) => b.addEventListener('click', () => padKey(b.dataset.key)));
  $('padBackdrop').addEventListener('click', () => closePad());

  document.addEventListener('keydown', (e) => {
    if (pad) {
      if (/^\d$/.test(e.key)) padKey(e.key);
      else if (e.key === '-' || e.key === '\u2212') padKey('-');
      else if (e.key === '/') padKey('/');
      else if (e.key === 'Backspace') padKey('back');
      else if (e.key === 'Enter') padKey('ok');
      else if (e.key === 'Escape') closePad();
      else return;
      e.preventDefault();
      return;
    }
    if ($('work').hidden || $('stepsDialog').open) return;
    if (e.key === 'Escape' && state.op) cancelOp();
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z' && document.activeElement.tagName !== 'INPUT') { e.preventDefault(); undo(); }
  });

  // ---------------- Work view ----------------
  function startWith(M) {
    state.steps = [{ M, ids: M.map((_, i) => i), ops: null, augmented: state.augmented && M[0].length > 1 }];
    state.op = null;
    $('opPanel').hidden = true;
    show('work');
    renderMatrix();
    renderOpButtons();
    renderStatus(false);
    renderHistory();
  }

  function renderMatrix(flip, flipMs) {
    const box = $('matrix');
    const { M, ids } = current();
    const aug = isAug();
    const m = M.length, n = M[0].length;

    const before = new Map();
    if (flip) box.querySelectorAll('.mrow').forEach((el) => before.set(el.dataset.id, { top: el.getBoundingClientRect().top, text: el.dataset.content }));

    const tpl = ['0px', '9px'];
    for (let c = 0; c < n; c++) { if (aug && c === n - 1) tpl.push('16px'); tpl.push('auto'); }
    tpl.push('9px');
    box.style.gridTemplateColumns = tpl.join(' ');
    box.innerHTML = '';
    M.forEach((row, r) => {
      const el = document.createElement('div');
      el.className = 'mrow';
      el.style.gridRow = String(r + 1);
      el.dataset.id = ids[r];
      el.dataset.index = r;
      el.dataset.content = row.map(String).join(',');
      let html = '<span></span><span></span>'; // no row labels: rows are chosen by tapping them
      row.forEach((x, c) => {
        if (aug && c === n - 1) html += '<span></span>';
        html += '<span class="cell">' + fracHTML(x) + '</span>';
      });
      el.innerHTML = html + '<span></span>';
      el.addEventListener('click', () => onRowClick(r));
      box.appendChild(el);
    });
    const span = '1 / ' + (m + 1);
    const add = (cls, col) => { const d = document.createElement('div'); d.className = cls; d.style.gridColumn = String(col); d.style.gridRow = span; box.appendChild(d); };
    add('bracket l', 2);
    add('bracket r', tpl.length);
    if (aug) add('vsep', n + 2);
    paintChosen();

    if (!flip) return;
    box.querySelectorAll('.mrow').forEach((el) => {
      const old = before.get(el.dataset.id);
      if (!old) return;
      const dy = old.top - el.getBoundingClientRect().top;
      if (Math.abs(dy) > 0.5) {
        el.style.zIndex = dy > 0 ? 3 : 2;
        el.animate([{ transform: `translateY(${dy}px)` }, { transform: 'none' }], { duration: D(flipMs || 450), easing: 'cubic-bezier(.25,.75,.25,1)' })
          .finished.then(() => { el.style.zIndex = ''; });
      } else if (old.text !== el.dataset.content) {
        flashRow(el);
      }
    });
  }
  const rowEl = (r) => $('matrix').querySelector(`.mrow[data-index="${r}"]`);
  function flashRow(el) {
    const color = getComputedStyle(document.documentElement).getPropertyValue('--accent-soft').trim();
    el.animate([{ backgroundColor: color }, { backgroundColor: 'rgba(0,0,0,0)' }], { duration: D(900), easing: 'ease-out' });
  }

  function renderStatus(celebrate) {
    const M = current().M;
    const el = $('status');
    // The message can be tapped to show a link to the page that explains it.
    const msg = (cls, icon, text, href, question) => {
      el.innerHTML = '<button type="button" class="msg ' + cls + '"><svg viewBox="0 0 24 24"><path d="' + icon + '"/></svg>' + text + '</button>' +
        '<div><a class="what" href="' + href + '" hidden>' + question + ' →</a></div>';
      el.querySelector('.msg').addEventListener('click', () => {
        const a = el.querySelector('.what');
        a.hidden = !a.hidden;
      });
    };
    if (Ops.isReducedRowEchelon(M)) {
      msg('rref', 'M5 12.5l4.5 4.5L19 7.5', t('rref'), '#escada-reduzida', t('whatRref'));
      if (celebrate) celebrateMatrix();
    } else if (Ops.isRowEchelon(M)) {
      msg('ref', 'M4 19h5v-5h5V9h5V4', t('ref'), '#escada', t('whatRef'));
    } else el.innerHTML = '';
  }

  // ---------------- Building an operation ----------------
  // Two kinds of operation:
  //  - "mul": one or more lines  Li' = a·Li  (a ≠ 0), applied together;
  //  - "add": one or more lines  Li' = Li + b·Lj, applied together;
  //  - "swap": Li ↔ Lj.
  // Internally every line is {i, a, b, j}; "mul" uses a, "add" uses b and j.
  // On a computer the numbers are typed directly; on touch screens the number pad opens.
  const finePointer = window.matchMedia('(pointer: fine)').matches;
  const newLine = (type) => ({ i: null, a: type === 'add' ? F.ONE : null, b: null, j: null });
  const FIELDS = { mul: ['i', 'a'], add: ['i', 'b', 'j'], swap: ['i', 'j'] };
  const ROW_FIELDS = ['i', 'j'];

  document.querySelectorAll('.op-btn').forEach((b) => b.addEventListener('click', () => {
    if (state.busy) return;
    if (state.op && state.op.type === b.dataset.op) { cancelOp(); return; }
    const type = b.dataset.op;
    state.op = { type, lines: [newLine(type)], active: { line: 0, f: 'i' } };
    $('opPanel').hidden = false;
    $('opError').textContent = '';
    renderOpButtons();
    renderSentence();
  }));
  function renderOpButtons() {
    document.querySelectorAll('.op-btn').forEach((b) => {
      b.setAttribute('aria-pressed', String(!!state.op && state.op.type === b.dataset.op));
      b.disabled = current().M.length < 2 && b.dataset.op !== 'mul';
    });
  }
  function cancelOp() {
    closePad(true);
    state.op = null;
    $('opPanel').hidden = true;
    $('matrix').classList.remove('picking');
    renderOpButtons();
    paintChosen();
  }

  const isActive = (li, f) => state.op && state.op.active && state.op.active.line === li && state.op.active.f === f;

  function rowSlot(li, f, prime) {
    const v = state.op.lines[li][f];
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'slot row-slot' + (v !== null ? ' filled' : '') + (isActive(li, f) ? ' active' : '');
    b.dataset.line = li; b.dataset.f = f;
    b.innerHTML = '<span>' + (v === null ? '&nbsp;' : rowHTML(v) + (prime ? '′' : '')) + '</span>';
    b.addEventListener('click', () => { if (!state.busy) setActive(li, f, false); });
    return b;
  }

  function numSlot(li, f) {
    const line = state.op.lines[li];
    const v = line[f];
    if (finePointer) {
      // Typed directly: digits, "-" and "/" only (no decimals).
      const inp = document.createElement('input');
      inp.className = 'slot num-input' + (v !== null ? ' filled' : '') + (isActive(li, f) ? ' active' : '');
      inp.dataset.line = li; inp.dataset.f = f;
      inp.value = v === null ? '' : v.toString().replace('-', MINUS);
      inp.size = Math.max(2, inp.value.length + 1);
      inp.setAttribute('aria-label', f);
      inp.spellcheck = false;
      inp.addEventListener('focus', () => { state.op.active = { line: li, f }; markActive(); inp.select(); });
      inp.addEventListener('input', () => {
        const clean = inp.value.replace(/−/g, '-').replace(/[^0-9/-]/g, '');
        inp.value = clean.replace(/-/g, MINUS);
        inp.size = Math.max(2, inp.value.length + 1);
        inp.classList.remove('invalid');
        $('opError').textContent = '';
      });
      inp.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { e.preventDefault(); if (commitNum(li, f, inp)) advance(); }
      });
      inp.addEventListener('blur', () => { if (state.op && state.op.lines[li] === line) commitNum(li, f, inp, true); });
      return inp;
    }
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'slot num-slot' + (v !== null ? ' filled' : '') + (isActive(li, f) ? ' active' : '');
    b.dataset.line = li; b.dataset.f = f;
    b.innerHTML = '<span>' + (v === null ? '&nbsp;' : fracHTML(v)) + '</span>';
    b.addEventListener('click', () => { if (!state.busy) setActive(li, f, true); });
    return b;
  }

  // Read a typed number. Returns true when the value was accepted.
  function commitNum(li, f, inp, quiet) {
    const line = state.op.lines[li];
    const text = inp.value.replace(/−/g, '-').trim();
    if (text === '' || text === '-') {
      line[f] = null;
      if (!quiet) renderSentence(); else refreshApply();
      return true;
    }
    const res = F.parseInput(text);
    let err = res.error;
    if (!err && f === 'a' && res.value.isZero()) err = 'errZero';
    if (err) {
      inp.classList.add('invalid');
      $('opError').textContent = t(err);
      if (!quiet) inp.select();   // the next key replaces the wrong value
      return false;
    }
    line[f] = res.value;
    inp.classList.add('filled');
    if (!quiet) renderSentence(); else refreshApply();
    return true;
  }

  function word(text, cls) { const s = document.createElement('span'); s.textContent = text; if (cls) s.className = cls; return s; }
  function html(h, cls) { const s = document.createElement('span'); s.innerHTML = h; if (cls) s.className = cls; return s; }

  function renderSentence(newLineAdded) {
    const op = state.op;
    const box = $('sentence');
    box.innerHTML = '';
    if (op.type !== 'swap') {
      const wrap = document.createElement('div');
      wrap.className = 's-comb';
      op.lines.forEach((l, li) => {
        const row = document.createElement('div');
        row.className = 's-line c-line' + (newLineAdded && li === op.lines.length - 1 ? ' enter' : '');
        const echo = html(l.i === null ? t('row') + '<sub>&#9633;</sub>' : rowHTML(l.i), 'echo');
        if (op.type === 'mul') row.append(rowSlot(li, 'i', true), word('=', 'sym'), numSlot(li, 'a'), echo);
        else row.append(rowSlot(li, 'i', true), word('=', 'sym'), echo, word('+', 'sym'), numSlot(li, 'b'), rowSlot(li, 'j', false));
        if (op.lines.length > 1) {
          const rm = document.createElement('button');
          rm.type = 'button'; rm.className = 'mini'; rm.title = t('removeRow'); rm.setAttribute('aria-label', t('removeRow'));
          rm.innerHTML = '<svg viewBox="0 0 24 24"><path d="M7 7l10 10M17 7L7 17"/></svg>';
          rm.addEventListener('click', () => removeLine(li));
          row.appendChild(rm);
        }
        wrap.appendChild(row);
      });
      const more = document.createElement('button');
      more.type = 'button'; more.className = 'more'; more.title = t('addRow'); more.setAttribute('aria-label', t('addRow'));
      more.innerHTML = '<svg viewBox="0 0 24 24"><path d="M12 6v12M6 12h12"/></svg>';
      // "add" needs at least one row that is not changed (to be added to the others)
      more.disabled = !op.lines.every((l) => l.i !== null) || op.lines.length >= current().M.length - (op.type === 'add' ? 1 : 0);
      more.addEventListener('click', addLine);
      wrap.appendChild(more);
      box.appendChild(wrap);
    } else {
      const row = document.createElement('div');
      row.className = 's-line';
      t('sentSwap').forEach((part) => row.appendChild(typeof part === 'string' ? word(part) : rowSlot(0, part === 0 ? 'i' : 'j', false)));
      box.appendChild(row);
    }
    refreshApply();
    markActive();
    // keep the keyboard focus on the active number box
    if (finePointer && op.active && !ROW_FIELDS.includes(op.active.f)) {
      const inp = box.querySelector(`.num-input[data-line="${op.active.line}"][data-f="${op.active.f}"]`);
      if (inp) inp.focus({ preventScroll: true });
    }
  }

  function markActive() {
    const op = state.op;
    $('sentence').querySelectorAll('.slot').forEach((el) => el.classList.toggle('active', isActive(Number(el.dataset.line), el.dataset.f)));
    $('matrix').classList.toggle('picking', !!op.active);
    paintChosen();
  }

  function lineProblems(l) {
    return FIELDS[state.op.type].every((f) => l[f] !== null) ? null : 'incomplete';
  }
  function opValid() {
    const op = state.op;
    if (!op.lines.every((l) => lineProblems(l) === null)) return false;
    const targets = op.lines.map((l) => l.i);
    if (new Set(targets).size !== targets.length) return false;
    return op.lines.every((l) => l.j === null || !targets.includes(l.j));
  }
  function refreshApply() { $('opApply').disabled = !opValid(); }

  function addLine() {
    state.op.lines.push(newLine());
    state.op.active = { line: state.op.lines.length - 1, f: 'i' };
    renderSentence(true);
  }
  function removeLine(li) {
    const op = state.op;
    op.lines.splice(li, 1);
    closePad(true);
    op.active = null;
    $('opError').textContent = '';
    renderSentence();
    advance();
  }

  function setActive(li, f, openPad_) {
    const op = state.op;
    op.active = { line: li, f };
    renderSentence();
    if (openPad_ && !ROW_FIELDS.includes(f)) {
      const line = op.lines[li];
      openPad({
        text: line[f] === null ? '' : line[f].toString(),
        allowEmpty: true,
        validate: (v) => (f === 'a' && v.isZero() ? 'errZero' : null),
        onOk: (v) => { line[f] = v; advance(); },
        onClose: () => renderSentence()
      });
    } else closePad(true);
  }

  // Go to the next box that still needs something: target row, then b, then the other row.
  function advance() {
    const op = state.op;
    if (!op) return;
    const order = FIELDS[op.type];
    const start = op.active ? op.active.line : 0;
    for (let k = 0; k < op.lines.length; k++) {
      const li = (start + k) % op.lines.length;
      const f = order.find((x) => op.lines[li][x] === null);
      if (f) { op.active = { line: li, f }; renderSentence(); return; }
    }
    op.active = null;
    renderSentence();
    if (opValid()) $('opApply').focus({ preventScroll: true });
  }

  function onRowClick(r) {
    const op = state.op;
    if (!op || state.busy || !op.active) return;
    let { line: li, f } = op.active;
    const line = op.lines[li];
    // A tap on the matrix while a number box is active fills the row that is still missing.
    if (!ROW_FIELDS.includes(f)) f = line.i === null || op.type === 'mul' ? 'i' : 'j';
    // Rows that change cannot be used anywhere else in the same operation
    // (so applying all lines together is the same as applying them one by one).
    let clash;
    if (op.type === 'swap') clash = (f === 'i' ? line.j : line.i) === r;
    else if (f === 'i') clash = op.lines.some((l, k) => (k !== li && l.i === r) || l.j === r);
    else clash = op.lines.some((l) => l.i === r);
    if (clash) {
      $('opError').textContent = t('errSameRow');
      const el = rowEl(r);
      el.classList.remove('shake'); void el.offsetWidth; el.classList.add('shake');
      return;
    }
    $('opError').textContent = '';
    line[f] = r;
    op.active = { line: li, f };
    advance();
  }

  function paintChosen() {
    const rows = $('matrix').querySelectorAll('.mrow');
    rows.forEach((el) => el.classList.remove('chosen', 'chosen2'));
    if (!state.op) return;
    state.op.lines.forEach((l) => {
      if (l.i !== null && rowEl(l.i)) rowEl(l.i).classList.add('chosen');
      if (l.j !== null && rowEl(l.j)) rowEl(l.j).classList.add(state.op.type === 'swap' ? 'chosen' : 'chosen2');
    });
  }

  function buildOps() {
    const op = state.op;
    if (op.type === 'swap') return [{ type: 'swap', i: op.lines[0].i, j: op.lines[0].j }];
    if (op.type === 'mul') return op.lines.map((l) => ({ type: 'mul', i: l.i, k: l.a }));
    return op.lines.map((l) => ({ type: 'add', i: l.i, j: l.j, k: l.b }));
  }

  $('opCancel').addEventListener('click', cancelOp);
  $('opApply').addEventListener('mousedown', (e) => e.preventDefault()); // keep typed value until click
  $('opApply').addEventListener('click', () => {
    // commit a number that is still being typed
    const inp = document.activeElement;
    if (inp && inp.classList && inp.classList.contains('num-input')) {
      if (!commitNum(Number(inp.dataset.line), inp.dataset.f, inp, true)) return;
    }
    applyOp();
  });

  async function applyOp() {
    if (state.busy || !state.op || !opValid()) return;
    const ops = buildOps();
    const prev = current();
    // The rows that change are all different and none of them is used as the
    // "other row" of a line, so applying the lines one after the other is the
    // same as applying them simultaneously.
    let M;
    try { M = ops.reduce((A, op) => Ops.apply(A, op), prev.M); } catch (e) { $('opError').textContent = t(e.message === 'same-row' ? 'errSameRow' : 'errZero'); return; }
    const ids = prev.ids.slice();
    ops.forEach((op) => { if (op.type === 'swap') [ids[op.i], ids[op.j]] = [ids[op.j], ids[op.i]]; });
    const wasRREF = Ops.isReducedRowEchelon(prev.M);
    const type = ops[0].type;

    cancelOp();
    state.busy = true;
    try {
      // multiply: ×k sweeps across the row; add: the other row jumps out, ×k, and drops in
      if (type !== 'swap') await animateComb(ops.map((o) => (o.type === 'mul'
        ? { i: o.i, a: o.k, j: null, b: null }
        : { i: o.i, a: F.ONE, j: o.j, b: o.k })), M);
      state.steps.push({ M, ids, ops });
      renderMatrix(type === 'swap', SWAP_MS);
      if (type === 'swap') await wait(D(SWAP_MS + 30));
    } finally {
      state.busy = false;
    }
    renderOpButtons();
    renderHistory();
    renderStatus(!wasRREF);
  }

  // ---------------- Undo ----------------
  function undo() {
    if (state.busy || state.steps.length < 2) return;
    cancelOp();
    state.steps.pop();
    renderMatrix(true);
    renderOpButtons();
    renderHistory();
    renderStatus(false);
  }
  $('undoBtn').addEventListener('click', undo);

  // ---------------- Animations ----------------
  const SWAP_MS = 760;
  const stageBox = () => $('stage').getBoundingClientRect();

  // A badge with the constant k slides across `cells`, changing each value as it passes.
  async function sweep(container, cells, k, newHTML, duration) {
    const stage = $('stage');
    const sb = stageBox();
    const cr = container.getBoundingClientRect();
    const badge = document.createElement('div');
    badge.className = 'k-badge';
    badge.innerHTML = '<span>×&thinsp;' + (k.sign() < 0 ? '(' + fracHTML(k) + ')' : fracHTML(k)) + '</span>';
    stage.appendChild(badge);
    const bw = badge.offsetWidth, bh = badge.offsetHeight;
    const y = cr.top - sb.top + cr.height / 2 - bh / 2;
    const x0 = cr.left - sb.left - bw - 4;
    const x1 = cr.right - sb.left + 4;
    badge.style.left = '0px'; badge.style.top = y + 'px';
    await badge.animate([{ transform: `translateX(${x0}px) scale(.3)`, opacity: 0 }, { transform: `translateX(${x0}px) scale(1)`, opacity: 1 }],
      { duration: D(260), easing: 'cubic-bezier(.2,.8,.2,1)', fill: 'forwards' }).finished;
    const run = badge.animate([{ transform: `translateX(${x0}px)` }, { transform: `translateX(${x1}px)` }],
      { duration: D(duration), easing: 'linear', fill: 'forwards' });
    cells.forEach((cell, idx) => {
      const r = cell.getBoundingClientRect();
      const centre = r.left - sb.left + r.width / 2 - bw / 2;
      const frac = Math.min(1, Math.max(0, (centre - x0) / (x1 - x0)));
      setTimeout(() => {
        cell.innerHTML = cell.parentElement.classList.contains('ghost-row') ? '<span>' + newHTML[idx] + '</span>' : newHTML[idx];
        cell.animate([{ transform: 'scale(1.35)', opacity: 0.3 }, { transform: 'none', opacity: 1 }], { duration: D(320), easing: 'cubic-bezier(.2,.8,.2,1)' });
      }, D(duration) * frac);
    });
    await run.finished;
    await badge.animate([{ opacity: 1 }, { opacity: 0, transform: `translateX(${x1 + 12}px) scale(.6)` }], { duration: D(220), fill: 'forwards' }).finished;
    badge.remove();
  }

  // A floating copy of a matrix row, placed exactly over it.
  function makeGhost(src) {
    const sb = stageBox();
    const sr = src.getBoundingClientRect();
    const ghost = document.createElement('div');
    ghost.className = 'ghost-row';
    Object.assign(ghost.style, { left: sr.left - sb.left + 'px', top: sr.top - sb.top + 'px', width: sr.width + 'px', height: sr.height + 'px' });
    const cells = [...src.querySelectorAll('.cell')].map((c) => {
      const r = c.getBoundingClientRect();
      const g = document.createElement('span');
      g.className = 'cell';
      Object.assign(g.style, { left: r.left - sr.left + 'px', width: r.width + 'px' });
      g.innerHTML = '<span>' + c.innerHTML + '</span>';
      ghost.appendChild(g);
      return g;
    });
    $('stage').appendChild(ghost);
    return { ghost, cells };
  }

  // Points along a quadratic Bézier curve from p0 to p2 with control point c.
  function curveFrames(p0, c, p2, steps) {
    const frames = [];
    for (let s = 0; s <= steps; s++) {
      const u = s / steps;
      const e = u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2; // ease in-out
      const x = (1 - e) * (1 - e) * p0.x + 2 * (1 - e) * e * c.x + e * e * p2.x;
      const y = (1 - e) * (1 - e) * p0.y + 2 * (1 - e) * e * c.y + e * e * p2.y;
      const sc = 1 + 0.04 * Math.sin(Math.PI * u);
      frames.push({ transform: `translate(${x}px, ${y}px) scale(${sc})` });
    }
    return frames;
  }

  // Li' = a·Li + b·Lj, for each line in turn: first the constant a crosses row i,
  // then a copy of row j jumps out, is multiplied by b and falls onto row i.
  async function animateComb(ops, newM) {
    const M0 = current().M;
    for (const op of ops) {
      const dst = rowEl(op.i);
      dst.classList.add('chosen');
      if (!op.a.isOne()) {
        const cells = [...dst.querySelectorAll('.cell')];
        await sweep(dst, cells, op.a, M0[op.i].map((x) => fracHTML(op.a.mul(x))), 600 + 80 * cells.length);
        if (op.j === null) [...dst.querySelectorAll('.cell')].forEach((c, idx) => { c.innerHTML = fracHTML(newM[op.i][idx]); });
        flashRow(dst);
        await wait(D(220));
      }
      if (op.j !== null) await dropMultiple(op, newM, M0);
    }
  }

  async function dropMultiple(op, newM, M0) {
    const src = rowEl(op.j), dst = rowEl(op.i);
    const sr = src.getBoundingClientRect();
    const mr = $('matrix').getBoundingClientRect();
    src.classList.add('chosen2');
    const g = makeGhost(src);
    const sideX = mr.right - sr.left + 40;
    const fitsSide = sr.right + sideX + 8 < document.documentElement.clientWidth;
    const park = fitsSide ? { x: sideX, y: 0 } : { x: 0, y: mr.bottom - sr.top + 26 };
    await g.ghost.animate([
      { transform: 'none' },
      { transform: `translate(${park.x * 0.5}px, ${park.y * 0.5 - 28}px) scale(1.04)`, offset: 0.5 },
      { transform: `translate(${park.x}px, ${park.y}px)` }
    ], { duration: D(560), easing: 'cubic-bezier(.3,.7,.3,1)', fill: 'forwards' }).finished;
    g.ghost.getAnimations().forEach((a) => a.cancel());
    g.ghost.style.transform = `translate(${park.x}px, ${park.y}px)`;
    await wait(D(100));
    await sweep(g.ghost, g.cells, op.b, M0[op.j].map((x) => fracHTML(op.b.mul(x))), 450 + 75 * g.cells.length);
    await wait(D(120));
    // falls along the outside of the matrix, then slides into the row
    const toY = dst.getBoundingClientRect().top - sr.top;
    await g.ghost.animate(curveFrames(park, { x: park.x, y: toY }, { x: 0, y: toY }, 24),
      { duration: D(720), easing: 'linear', fill: 'forwards' }).finished;
    [...dst.querySelectorAll('.cell')].forEach((c, idx) => {
      c.innerHTML = fracHTML(newM[op.i][idx]);
      c.animate([{ transform: 'translateX(-6px)', opacity: 0.2 }, { transform: 'none', opacity: 1 }], { duration: D(380), easing: 'cubic-bezier(.2,.8,.2,1)' });
    });
    flashRow(dst);
    await g.ghost.animate([{ opacity: 1 }, { opacity: 0, transform: `translate(0px, ${toY}px) scale(.96)` }], { duration: D(240), fill: 'forwards' }).finished;
    g.ghost.remove();
    src.classList.remove('chosen2');
    await wait(D(150));
  }

  // The matrix "is happy": rows hop one after the other, the matrix bounces, and sparks fly.
  function celebrateMatrix() {
    if (reduceMotion) return;
    const box = $('matrix');
    box.querySelectorAll('.mrow').forEach((el, i) => {
      el.animate([{ transform: 'none' }, { transform: 'translateY(-10px)' }, { transform: 'none' }],
        { duration: 380, delay: 90 * i, easing: 'cubic-bezier(.3,.7,.4,1)' });
    });
    const m = box.querySelectorAll('.mrow').length;
    box.animate([
      { transform: 'none' },
      { transform: 'scale(1.08) rotate(-2.5deg)' },
      { transform: 'scale(.97) rotate(2deg)' },
      { transform: 'scale(1.04) rotate(-1deg)' },
      { transform: 'none' }
    ], { duration: 900, delay: 90 * m + 150, easing: 'ease-in-out' });

    const stage = $('stage');
    const sb = stageBox();
    const mr = box.getBoundingClientRect();
    const cx = mr.left - sb.left + mr.width / 2, cy = mr.top - sb.top + mr.height / 2;
    const css = getComputedStyle(document.documentElement);
    const colors = ['--green', '--accent', '--orange', '--green'].map((v) => css.getPropertyValue(v).trim());
    for (let s = 0; s < 22; s++) {
      const d = document.createElement('div');
      d.className = 'spark';
      d.style.left = cx + 'px'; d.style.top = cy + 'px';
      d.style.background = colors[s % colors.length];
      stage.appendChild(d);
      const ang = (Math.PI * 2 * s) / 22 + Math.random() * 0.3;
      const dist = Math.max(mr.width, mr.height) / 2 + 30 + Math.random() * 50;
      d.animate([
        { transform: 'translate(-50%,-50%) scale(.4)', opacity: 0 },
        { transform: `translate(calc(-50% + ${Math.cos(ang) * dist * 0.7}px), calc(-50% + ${Math.sin(ang) * dist * 0.7}px)) scale(1)`, opacity: 1, offset: 0.5 },
        { transform: `translate(calc(-50% + ${Math.cos(ang) * dist}px), calc(-50% + ${Math.sin(ang) * dist}px)) scale(.3)`, opacity: 0 }
      ], { duration: 1000, delay: 90 * m + 200, easing: 'cubic-bezier(.2,.8,.2,1)', fill: 'both' }).finished.then(() => d.remove());
    }
  }

  // ---------------- Applied steps ----------------
  function renderHistory() {
    const n = state.steps.length - 1;
    $('stepsCount').textContent = n;
    $('undoBtn').disabled = n === 0;
    const ol = $('history');
    ol.innerHTML = '';
    state.steps.slice(1).forEach((s, idx) => {
      const li = document.createElement('li');
      li.innerHTML = '<span class="n">' + (idx + 1) + '</span><span class="ops">' + s.ops.map((op) => '<span>' + opHTML(op) + '</span>').join('') + '</span>';
      ol.appendChild(li);
    });
    $('historyEmpty').hidden = n > 0;
    $('latexBtn').disabled = n === 0;
  }
  $('stepsBtn').addEventListener('click', () => { renderHistory(); $('stepsDialog').showModal(); });
  $('stepsClose').addEventListener('click', () => $('stepsDialog').close());
  $('stepsDialog').addEventListener('click', (e) => { if (e.target === $('stepsDialog')) $('stepsDialog').close(); });

  $('latexBtn').addEventListener('click', () => {
    const aug = isAug();
    const lines = state.steps.map((s, idx) => (idx === 0 ? '' : '\\xrightarrow{' + stepLatex(s.ops) + '}\\;') + '&' + matrixLatex(s.M, aug));
    const tex = '% \\usepackage{amsmath}\n\\begin{align*}\n' + lines.join(' \\\\\n') + '\n\\end{align*}\n';
    copyText(tex).then(() => toast(t('copied')));
  });
  function copyText(text) {
    if (navigator.clipboard && window.isSecureContext) return navigator.clipboard.writeText(text);
    const ta = document.createElement('textarea');
    ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.appendChild(ta); ta.select();
    try { document.execCommand('copy'); } finally { ta.remove(); }
    return Promise.resolve();
  }
  let toastTimer;
  function toast(msg) {
    const el = $('toast');
    el.textContent = msg; el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('show'), 1800);
  }

  // ---------------- Echelon forms page ----------------
  const fill = (text, vals) => text.replace(/\{(\w+)\}/g, (_, k) => vals[k]);

  // A matrix to look at (not to work on). Pivots can be circled.
  function staticMatrix(M, withPivots) {
    const piv = new Set(withPivots ? window.Echelon.pivots(M).map(([r, c]) => r + ',' + c) : []);
    let html = '<div class="smatrix" style="grid-template-columns: repeat(' + M[0].length + ', auto)">';
    M.forEach((row, r) => row.forEach((x, c) => {
      html += '<span class="sc' + (piv.has(r + ',' + c) ? ' pivot' : '') + '"><span>' + fracHTML(x) + '</span></span>';
    }));
    return html + '</div>';
  }
  const toM = (rows) => rows.map((r) => r.map((x) => F.parse(x)));

  // "How to tell": a small flow chart. Check 1 and 2 -> row echelon form -> check 3 and 4 -> reduced.
  let flowObserver = null;
  function renderFlow() {
    const c = t('condShort');
    const check = (a, b) => '<div class="f-check"><div class="f-h">' + fill(t('flowCheck'), { a, b }) + '</div>' +
      '<ol start="' + a + '"><li>' + c[a - 1] + '</li><li>' + c[b - 1] + '</li></ol></div>';
    const no = (cls, text) => '<div class="f-branch"><div class="f-harr"><span class="f-lab">' + t('flowNo') + '</span><span class="f-line"></span></div>' +
      '<div class="f-out ' + cls + '">' + text + '</div></div>';
    const down = (label) => '<div class="f-down"><span class="f-vline"></span>' + (label ? '<span class="f-lab">' + label + '</span>' : '') + '</div>';
    const flow = $('howFlow');
    flow.innerHTML =
      check(1, 2) + no('none', t('flowNone')) +
      down(t('flowYes')) +
      '<div class="f-out ref main">' + t('flowRef') + '</div>' +
      down('') +
      check(3, 4) + no('refonly', t('flowRefOnly')) +
      down(t('flowYes')) +
      '<div class="f-out rref main">' + t('flowRref') + '</div>';
    if (reduceMotion || !('IntersectionObserver' in window)) return;
    // the blocks appear one after the other the first time the chart is on screen
    if (flowObserver) flowObserver.disconnect();
    const parts = [...flow.children];
    if (flow.dataset.shown) return;
    parts.forEach((el) => { el.style.opacity = 0; });
    flowObserver = new IntersectionObserver((entries) => {
      if (!entries.some((e) => e.isIntersecting)) return;
      flowObserver.disconnect();
      flow.dataset.shown = '1';
      parts.forEach((el, k) => {
        el.animate([{ opacity: 0, transform: 'translateY(8px)' }, { opacity: 1, transform: 'none' }],
          { duration: 380, delay: 140 * k, easing: 'cubic-bezier(.2,.8,.2,1)', fill: 'backwards' });
        el.style.opacity = '';
      });
    }, { threshold: 0.25 });
    flowObserver.observe(flow);
  }

  function renderEchelonPage() {
    renderFlow();
    const ex = window.Echelon.EXAMPLES;
    const section = (id, title, intro, conds, note, examples, non, why) =>
      '<section class="learn-sec" id="' + id + '">' +
      '<h3>' + title + '</h3>' +
      '<p>' + intro + '</p><ol>' + conds.map((c) => '<li>' + c + '</li>').join('') + '</ol>' +
      (note ? '<p class="note">' + note + '</p>' : '') +
      '<h4>' + t('examples') + '</h4>' +
      '<div class="ex-row">' + examples.map((m) => '<div class="ex">' + staticMatrix(toM(m), true) + '</div>').join('') + '</div>' +
      '<h4>' + t('notExample') + '</h4>' +
      '<div class="ex-row"><div class="ex non">' + staticMatrix(toM(non), true) + '<p>' + why + '</p></div></div>' +
      '</section>';
    $('echelonContent').innerHTML =
      '<p class="pivot-def"><span class="pivot-dot"></span><span>' + t('pivotDef') + '</span></p>' +
      section('secRef', t('refTitle'), t('refIntro'), t('refConds'), t('refNote'), ex.ref, ex.nonRef, t('nonRefWhy')) +
      section('secRref', t('rrefTitle'), t('rrefIntro'), t('rrefConds'), '', ex.rref, ex.nonRref, t('nonRrefWhy'));
  }

  // ---------------- Tutorial ----------------
  const tut = { ex: 0, slide: 0, timers: [] };

  // One slide per check, in order, stopping at the first one that fails.
  function tutSlides(st) {
    const s = ['intro'];
    for (let k = 1; k <= 4; k++) { s.push(k); if (!st[k - 1].ok) break; }
    return s;
  }
  const listRows = (rows) => {
    const r = rows.map((x) => x + 1);
    return r.length === 1 ? String(r[0]) : r.slice(0, -1).join(', ') + ' ' + t('and') + ' ' + r[r.length - 1];
  };

  function renderTutorial(animate) {
    const M = toM(window.Echelon.TUTORIAL[tut.ex]);
    const st = window.Echelon.checkSteps(M);
    const slides = tutSlides(st);
    tut.slide = Math.min(tut.slide, slides.length - 1);
    const cur = slides[tut.slide];
    // the last check that is shown on this slide (0 = none yet)
    const lastCheck = cur === 'intro' ? 0 : cur;
    tut.timers.forEach(clearTimeout);
    tut.timers = [];

    // Example tabs
    $('exTabs').innerHTML = window.Echelon.TUTORIAL.map((_, i) =>
      '<button type="button" role="tab" aria-selected="' + (i === tut.ex) + '" data-ex="' + i + '">' + t('example') + ' ' + (i + 1) + '</button>').join('');
    $('exTabs').querySelectorAll('button').forEach((b) => b.addEventListener('click', () => { tut.ex = Number(b.dataset.ex); tut.slide = 0; renderTutorial(true); }));

    // Matrix
    const box = $('tutMatrix');
    let html = '<div class="smatrix" style="grid-template-columns: repeat(' + M[0].length + ', auto)">';
    M.forEach((row, r) => row.forEach((x, c) => { html += '<span class="sc" data-r="' + r + '" data-c="' + c + '"><span>' + fracHTML(x) + '</span></span>'; }));
    box.innerHTML = html + '</div><div class="tut-overlay"></div>';
    const ov = box.querySelector('.tut-overlay');
    const cell = (r, c) => box.querySelector(`.sc[data-r="${r}"][data-c="${c}"]`);
    const base = box.getBoundingClientRect();
    const rect = (el) => { const q = el.getBoundingClientRect(); return { l: q.left - base.left, t: q.top - base.top, r: q.right - base.left, b: q.bottom - base.top, w: q.width, h: q.height }; };
    const n = M[0].length;
    const anim = (el, frames, opts) => { if (animate && !reduceMotion) el.animate(frames, Object.assign({ fill: 'both', easing: 'cubic-bezier(.2,.8,.2,1)' }, opts)); };
    const band = (cls, a, b2, delay) => {
      const d = document.createElement('div');
      d.className = 'band ' + cls;
      Object.assign(d.style, { left: a.l - 4 + 'px', top: a.t - 2 + 'px', width: b2.r - a.l + 8 + 'px', height: b2.b - a.t + 4 + 'px' });
      ov.appendChild(d);
      anim(d, [{ transform: 'scaleX(0)', opacity: 0 }, { transform: 'none', opacity: 1 }], { duration: 450, delay });
      return d;
    };

    // Check 1: zero rows
    if (lastCheck === 1) {
      st[0].zeroRows.forEach((z, k) => band(z === st[0].zeroRow ? 'bad' : 'zero', rect(cell(z, 0)), rect(cell(z, n - 1)), 250 * k));
      if (!st[0].ok) {
        const d = band('below', rect(cell(st[0].row, 0)), rect(cell(st[0].row, n - 1)), 250 * st[0].zeroRows.length + 200);
        void d;
      }
    }
    // Check 2 onwards: pivots circled
    if (lastCheck >= 2) {
      const piv = st[1].pivots;
      piv.forEach(([r, p], k) => {
        const el = cell(r, p);
        el.classList.add('pivot');
        if (lastCheck === 2 && !st[1].ok && r === st[1].row) el.classList.add('bad');
        if (lastCheck === 3) el.classList.add(st[2].notOne.includes(r) ? 'bad' : 'good');
        if (lastCheck === 4) el.classList.add('good');
        const inner = el.firstElementChild;
        if (lastCheck === 2) anim(inner, [{ boxShadow: '0 0 0 0 transparent', transform: 'scale(.6)' }, { transform: 'scale(1.15)', offset: .6 }, { transform: 'none' }], { duration: 420, delay: 380 * k });
        if (lastCheck === 3) anim(inner, [{ transform: 'none' }, { transform: 'scale(1.25)' }, { transform: 'none' }], { duration: 450, delay: 350 * k, fill: 'none' });
      });
      // the staircase under the pivots
      if (lastCheck === 2 && piv.length) {
        const pts = [];
        const top = rect(cell(0, 0)).t;
        piv.forEach(([r, p], k) => {
          const q = rect(cell(r, p));
          if (k === 0) pts.push([q.l, top]);
          else pts.push([q.l, pts[pts.length - 1][1]]);
          pts.push([q.l, q.b]);
        });
        pts.push([rect(cell(0, n - 1)).r, pts[pts.length - 1][1]]);
        const svgNS = 'http://www.w3.org/2000/svg';
        const svg = document.createElementNS(svgNS, 'svg');
        svg.setAttribute('class', 'stair' + (st[1].ok ? '' : ' bad'));
        svg.setAttribute('width', base.width); svg.setAttribute('height', base.height);
        const path = document.createElementNS(svgNS, 'path');
        path.setAttribute('d', 'M' + pts.map((pt) => pt.join(' ')).join(' L'));
        svg.appendChild(path);
        ov.appendChild(svg);
        const len = path.getTotalLength();
        path.style.strokeDasharray = len;
        path.style.strokeDashoffset = 0;
        anim(path, [{ strokeDashoffset: len }, { strokeDashoffset: 0 }], { duration: 900, delay: 380 * piv.length + 100, easing: 'ease-in-out' });
        if (!st[1].ok) {
          const el = cell(st[1].row, st[1].pivots.find(([r]) => r === st[1].row)[1]).firstElementChild;
          anim(el, [{ transform: 'none' }, { transform: 'translateX(-5px)' }, { transform: 'translateX(5px)' }, { transform: 'none' }], { duration: 400, delay: 380 * piv.length + 1000, fill: 'none' });
        }
      }
      // Check 4: one column at a time
      if (lastCheck === 4) {
        piv.forEach(([, p], k) => {
          const a = rect(cell(0, p)), b2 = rect(cell(M.length - 1, p));
          const d = document.createElement('div');
          d.className = 'band col';
          Object.assign(d.style, { left: a.l - 2 + 'px', top: a.t - 4 + 'px', width: a.w + 4 + 'px', height: b2.b - a.t + 8 + 'px' });
          ov.appendChild(d);
          anim(d, [{ transform: 'scaleY(0)', opacity: 0 }, { transform: 'none', opacity: 1 }], { duration: 400, delay: 600 * k });
        });
        st[3].bad.forEach(([r, c]) => {
          const el = cell(r, c);
          el.classList.add('pivot', 'bad', 'entry');
          const k = piv.findIndex(([, p]) => p === c);
          anim(el.firstElementChild, [{ transform: 'scale(.5)', opacity: 0 }, { transform: 'none', opacity: 1 }], { duration: 350, delay: 600 * k + 350 });
        });
      }
    }

    renderTutBoxes(M, st, slides, lastCheck, animate);

    $('tutPrev').disabled = tut.slide === 0 && tut.ex === 0;
    const atEnd = tut.slide === slides.length - 1;
    $('tutNext').textContent = atEnd ? (tut.ex < window.Echelon.TUTORIAL.length - 1 ? t('nextExample') : t('practice')) : t('next');
    tut.slides = slides.length;
  }
  // The two question boxes under the matrix: "Is it in row echelon form?" (checks 1 and 2)
  // and, only when the answer is yes, "Is it reduced?" (checks 3 and 4).
  function renderTutBoxes(M, st, slides, lastCheck, animate) {
    const boxes = $('tutBoxes');
    const moving = animate && !reduceMotion;
    const later = (ms, fn) => { if (moving) tut.timers.push(setTimeout(fn, D(ms))); else fn(); };
    const failAt = st.findIndex((x) => !x.ok);                  // -1: every check holds
    const piv = st[1].pivots.length;
    const explain = (k) => {
      if (k === 1) return !st[0].ok ? fill(t('t1Bad'), { z: st[0].zeroRow + 1, r: st[0].row + 1 }) : st[0].zeroRows.length ? t('t1Ok') : t('t1None');
      if (k === 2) return st[1].ok ? t('t2Ok') : fill(t('t2Bad'), { r: st[1].row + 1, p: st[1].prev + 1 });
      if (k === 3) return st[2].ok ? t('t3Ok') : fill(t(st[2].notOne.length > 1 ? 't3BadMany' : 't3Bad'), { rows: listRows(st[2].notOne) });
      return st[3].ok ? t('t4Ok') : t('t4Bad');
    };
    // how long the matrix animation of each check takes, so that the text comes after it
    const revealAt = [0, 250 * st[0].zeroRows.length + (st[0].ok ? 250 : 650), 380 * piv + (st[1].ok ? 1050 : 1450), 350 * piv + 250, 600 * piv + 300][lastCheck];
    const box1Ok = st[0].ok && st[1].ok;
    const showBox2 = lastCheck >= 2 && box1Ok;
    const qBox = (id, title, ks) => '<div class="qbox" id="' + id + '"><div class="qhead"><span class="qt">' + title + '</span>' +
      '<span class="qans"></span></div><ol class="conds">' +
      ks.map((k) => '<li class="cond" data-k="' + k + '"><span class="num">' + k + '</span><div class="cbody"><div class="ct">' + t('t' + k + 'Title') + '</div><div class="cx"></div></div></li>').join('') +
      '</ol></div>';
    boxes.innerHTML =
      qBox('qb1', t('qRef'), [1, 2]) + (showBox2 ? qBox('qb2', t('qRref'), [3, 4]) : '') +
      '<p class="tut-concl" hidden></p>';
    const li = (k) => boxes.querySelector('.cond[data-k="' + k + '"]');
    const fadeIn = (el, ms) => { if (moving) el.animate([{ opacity: 0, transform: 'translateY(-4px)' }, { opacity: 1, transform: 'none' }], { duration: ms || 300, easing: 'ease-out' }); };
    const setCond = (k, cls, text, anim_) => {
      const el = li(k);
      el.className = 'cond ' + cls;
      el.querySelector('.cx').innerHTML = text;
      if (anim_) fadeIn(el.querySelector('.cx'));
    };
    const decide = (id, ok, ks, anim_) => {
      const b = $(id);
      b.classList.add(ok ? 'ok' : 'bad');
      b.querySelector('.qans').innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="' + (ok ? 'M5 12.5l4.5 4.5L19 7.5' : 'M7 7l10 10M17 7L7 17') + '"/></svg>' + t(ok ? 'yes' : 'no');
      // conditions after the one that failed are not needed
      if (!ok) ks.forEach((k) => { if (k > failAt + 1) setCond(k, 'skip', t('tSkip'), anim_); });
      if (!anim_) return;
      b.animate(ok
        ? [{ transform: 'none' }, { transform: 'scale(1.035)', offset: 0.4 }, { transform: 'none' }]
        : [{ transform: 'none' }, { transform: 'translateX(-5px)' }, { transform: 'translateX(5px)' }, { transform: 'none' }],
      { duration: ok ? 520 : 380, easing: 'ease-in-out' });
      b.querySelector('.qans').animate([{ transform: 'scale(.4)', opacity: 0 }, { transform: 'scale(1.15)', offset: 0.6 }, { transform: 'none', opacity: 1 }], { duration: 420, easing: 'ease-out' });
    };

    if (lastCheck === 0) return;
    // conditions already checked on earlier slides
    for (let k = 1; k < lastCheck; k++) setCond(k, st[k - 1].ok ? 'ok' : 'bad', explain(k), false);
    if (showBox2 && lastCheck > 2) decide('qb1', true, [1, 2], false);
    // the condition checked now
    li(lastCheck).className = 'cond current';
    const ok = st[lastCheck - 1].ok;
    later(revealAt, () => setCond(lastCheck, ok ? 'ok' : 'bad', explain(lastCheck), moving));
    const tDecide = revealAt + 500;
    const final = tut.slide === slides.length - 1;
    const showConcl = (ms) => later(ms, () => {
      const p = boxes.querySelector('.tut-concl');
      const kind = failAt === -1 ? 'endRref' : failAt <= 1 ? 'endNone' : 'endRef';
      p.className = 'tut-concl end ' + kind;
      p.innerHTML = t({ endNone: 'tEndNone', endRef: 'tEndRef', endRref: 'tEndRref' }[kind]);
      p.hidden = false;
      fadeIn(p, 350);
      if (moving) $('tutNext').scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      if (kind === 'endRref' && moving) {
        $('tutMatrix').querySelector('.smatrix').animate([{ transform: 'none' }, { transform: 'scale(1.06) rotate(-1.5deg)' }, { transform: 'scale(.98) rotate(1deg)' }, { transform: 'none' }], { duration: 800, easing: 'ease-in-out' });
      }
    });
    if (lastCheck <= 2) {
      if (lastCheck === 2 || !ok) {
        later(tDecide, () => decide('qb1', box1Ok, [1, 2], moving));
        if (showBox2) {
          const b2 = $('qb2');
          b2.hidden = true;
          later(tDecide + 700, () => {
            b2.hidden = false;
            if (moving) $('tutNext').scrollIntoView({ block: 'nearest', behavior: 'smooth' });
            if (moving) b2.animate([{ opacity: 0, transform: 'translateY(12px)' }, { opacity: 1, transform: 'none' }], { duration: 420, easing: 'cubic-bezier(.2,.8,.2,1)' });
          });
        }
      }
      if (final) showConcl(tDecide + 450);
      return;
    }
    if (lastCheck === 4 || !ok) {
      later(tDecide, () => decide('qb2', failAt === -1, [3, 4], moving));
      showConcl(tDecide + 450);
    }
  }

  $('tutNext').addEventListener('click', () => {
    if (tut.slide < tut.slides - 1) tut.slide++;
    else if (tut.ex < window.Echelon.TUTORIAL.length - 1) { tut.ex++; tut.slide = 0; }
    else { location.hash = 'praticar'; return; }
    renderTutorial(true);
  });
  $('tutPrev').addEventListener('click', () => {
    if (tut.slide > 0) tut.slide--;
    else if (tut.ex > 0) { tut.ex--; tut.slide = 99; }
    renderTutorial(true);
  });
  document.addEventListener('keydown', (e) => {
    if ($('tutorial').hidden || e.metaKey || e.ctrlKey) return;
    if (e.key === 'ArrowRight') $('tutNext').click();
    else if (e.key === 'ArrowLeft' && !$('tutPrev').disabled) $('tutPrev').click();
  });
  // (only when the width changes: on phones scrolling shows/hides the address bar, which changes the height)
  let lastWidth = window.innerWidth;
  window.addEventListener('resize', () => {
    if (window.innerWidth === lastWidth) return;
    lastWidth = window.innerWidth;
    if (!$('tutorial').hidden) renderTutorial(false);
  });

  // ---------------- Practice (flash cards) ----------------
  // Two questions per card: "Is it in row echelon form?" and, only if it is,
  // "Is it reduced?". A card counts as correct when every answer is correct.
  const practice = { card: null, a1: null, a2: null, correct: 0, total: 0 };

  function reasonText(card) {
    if (card.kind === 'rref') return t('rRref');
    const r = card.reason;
    const n = (x) => x + 1;
    if (r.type === 'zeroAbove') return fill(t('rZeroAbove'), { z: n(r.zeroRow), r: n(r.row) });
    if (r.type === 'pivotNotRight') return fill(t('rPivotNotRight'), { r: n(r.row), p: n(r.prev) });
    if (r.type === 'pivotNotOne') return fill(t('rPivotNotOne'), { r: n(r.row) });
    return fill(t('rNonzeroPivotCol'), { r: n(r.row), o: n(r.other) });
  }
  const isRef = (card) => card.kind !== 'none';
  // finished: null while waiting for an answer, otherwise true/false (all answers right?)
  function cardResult() {
    const p = practice;
    if (p.a1 === null) return null;
    if (p.a1 !== isRef(p.card)) return false;
    if (!isRef(p.card)) return true;
    if (p.a2 === null) return null;
    return p.a2 === (p.card.kind === 'rref');
  }

  function renderPractice() {
    const p = practice;
    $('score').textContent = p.total ? fill(t('score'), { c: p.correct, t: p.total }) : '';
    if (!p.card) return;
    const result = cardResult();
    $('card').innerHTML = staticMatrix(p.card.M, result !== null);
    const paint = (q, given, truth) => document.querySelectorAll(`.yn[data-q="${q}"] button`).forEach((b) => {
      const v = b.dataset.v === 'yes';
      b.classList.toggle('right', given !== null && v === truth && (v === given || result !== null));
      b.classList.toggle('wrong', given !== null && v === given && given !== truth);
      b.disabled = given !== null;
    });
    paint(1, p.a1, isRef(p.card));
    // The second question appears only after a correct "yes" to the first.
    const showQ2 = p.a1 === true && isRef(p.card);
    if ($('q2').hidden === showQ2) $('q2').hidden = !showQ2;
    paint(2, p.a2, p.card.kind === 'rref');
    const fb = $('feedback');
    if (result === null) { fb.innerHTML = ''; fb.className = 'feedback'; }
    else {
      fb.className = 'feedback ' + (result ? 'ok' : 'no');
      fb.innerHTML = '<b>' + (result ? t('correct') : t('wrong')) + '</b> ' +
        (p.card.kind === 'none' ? reasonText(p.card) : (p.a1 === false ? t('rIsRef') + ' ' : '') + reasonText(p.card));
    }
    $('nextCard').hidden = result === null;
  }

  async function newCard(animate) {
    const card = $('card');
    if (animate && !reduceMotion) {
      await card.animate([{ transform: 'none', opacity: 1 }, { transform: 'translateX(-60px) rotate(-3deg)', opacity: 0 }],
        { duration: 220, easing: 'ease-in', fill: 'forwards' }).finished;
    }
    Object.assign(practice, { card: window.Echelon.practiceCard(), a1: null, a2: null });
    renderPractice();
    card.getAnimations().forEach((a) => a.cancel());
    if (!reduceMotion) {
      card.animate([{ transform: 'translateX(60px) rotate(3deg)', opacity: 0 }, { transform: 'none', opacity: 1 }],
        { duration: 320, easing: 'cubic-bezier(.2,.8,.2,1)' });
    }
  }
  function answer(q, yes) {
    const p = practice;
    if (!p.card || cardResult() !== null) return;
    if (q === 1 && p.a1 === null) p.a1 = yes;
    else if (q === 2 && p.a1 !== null && p.a2 === null) p.a2 = yes;
    else return;
    const result = cardResult();
    if (result !== null) { p.total++; if (result) p.correct++; }
    renderPractice();
    if (result !== null && !reduceMotion) {
      $('card').animate(result
        ? [{ transform: 'scale(1)' }, { transform: 'scale(1.04)' }, { transform: 'scale(1)' }]
        : [{ transform: 'none' }, { transform: 'translateX(-8px)' }, { transform: 'translateX(8px)' }, { transform: 'none' }],
        { duration: 350, easing: 'ease-out' });
    }
    if (result !== null) $('nextCard').focus({ preventScroll: true });
  }
  document.querySelectorAll('.yn button').forEach((b) => b.addEventListener('click', () => answer(Number(b.parentElement.dataset.q), b.dataset.v === 'yes')));
  $('nextCard').addEventListener('click', () => newCard(true));
  document.addEventListener('keydown', (e) => {
    if ($('practice').hidden || e.metaKey || e.ctrlKey) return;
    const k = e.key.toLowerCase();
    const yes = k === 's' || k === 'y' || k === '1', no = k === 'n' || k === '2';
    if ((yes || no) && cardResult() === null) answer(practice.a1 === null ? 1 : 2, yes);
    else if ((e.key === 'Enter' || e.key === ' ') && cardResult() !== null && document.activeElement !== $('nextCard')) { e.preventDefault(); newCard(true); }
  });

  // ---------------- Light / dark mode ----------------
  // By default the page follows the device setting; the button overrides it.
  const darkQuery = window.matchMedia('(prefers-color-scheme: dark)');
  $('themeBtn').addEventListener('click', () => {
    const now = document.documentElement.dataset.theme || (darkQuery.matches ? 'dark' : 'light');
    const next = now === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset.theme = next;
    try { localStorage.setItem('gauss-theme', next); } catch (e) { /* ignore */ }
  });

  // ---------------- Init ----------------
  applyLang();
  renderSize();
  route();
})();
