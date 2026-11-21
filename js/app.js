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
    op: null,                // operation being built: { type, slots: [{ kind, value }], active }
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

  // Standard notation, e.g. L2 ← L2 − 3L1
  function opHTML(op) {
    if (op.type === 'swap') return rowHTML(op.i) + ' ↔ ' + rowHTML(op.j);
    if (op.type === 'mul') return rowHTML(op.i) + ' ← ' + (op.k.sign() < 0 ? MINUS : '') + coefHTML(op.k.abs()) + rowHTML(op.i);
    if (op.k.isZero()) return rowHTML(op.i) + ' ← ' + rowHTML(op.i) + ' + 0' + rowHTML(op.j);
    return rowHTML(op.i) + ' ← ' + rowHTML(op.i) + (op.k.sign() < 0 ? ' ' + MINUS + ' ' : ' + ') + coefHTML(op.k.abs()) + rowHTML(op.j);
  }
  function opLatex(op) {
    const R = (i) => t('row') + '_{' + (i + 1) + '}';
    const c = (absK) => (absK.isOne() ? '' : absK.toLatex());
    if (op.type === 'swap') return R(op.i) + ' \\leftrightarrow ' + R(op.j);
    if (op.type === 'mul') return R(op.i) + ' \\leftarrow ' + (op.k.sign() < 0 ? '-' : '') + c(op.k.abs()) + R(op.i);
    if (op.k.isZero()) return R(op.i) + ' \\leftarrow ' + R(op.i) + ' + 0' + R(op.j);
    return R(op.i) + ' \\leftarrow ' + R(op.i) + (op.k.sign() < 0 ? ' - ' : ' + ') + c(op.k.abs()) + R(op.j);
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
  const VIEWS = ['menu', 'echelon', 'practice', 'home', 'size', 'entry', 'work'];
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
    else { buildEntryGrid(); show('entry'); }
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
    $('padDisplay').innerHTML = escapeHTML(pad.text.replace(/-/g, MINUS)) + '<span class="caret"></span>';
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
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); undo(); }
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
  // "add" has one source row followed by one or more (number, target row) pairs:
  // slots = [row(source), num, row(target), num, row(target), ...]
  const SLOT_KINDS = { add: ['row', 'num', 'row'], mul: ['row', 'num'], swap: ['row', 'row'] };
  const SENTENCE = { mul: 'sentMul', swap: 'sentSwap' };

  document.querySelectorAll('.op-btn').forEach((b) => b.addEventListener('click', () => {
    if (state.busy) return;
    if (state.op && state.op.type === b.dataset.op) { cancelOp(); return; }
    state.op = { type: b.dataset.op, slots: SLOT_KINDS[b.dataset.op].map((kind) => ({ kind, value: null })), active: 0 };
    $('opPanel').hidden = false;
    $('opError').textContent = '';
    renderOpButtons();
    setActive(0, false);
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

  function slotButton(idx) {
    const op = state.op;
    const slot = op.slots[idx];
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'slot ' + slot.kind + '-slot' + (slot.value !== null ? ' filled' : '') + (op.active === idx ? ' active' : '');
    b.innerHTML = '<span>' + (slot.value === null ? '&nbsp;' : slot.kind === 'row' ? rowHTML(slot.value) : fracHTML(slot.value)) + '</span>';
    b.addEventListener('click', () => { if (!state.busy) setActive(idx, true); });
    return b;
  }
  const word = (text) => { const s = document.createElement('span'); s.textContent = text; return s; };
  const line = (cls) => { const d = document.createElement('div'); d.className = cls; return d; };

  function renderSentence(newPair) {
    const op = state.op;
    const box = $('sentence');
    box.innerHTML = '';
    if (op.type === 'add') {
      const wrap = line('s-add');
      const head = line('s-line');
      head.append(word(t('addHead')), slotButton(0));
      wrap.appendChild(head);
      const branches = line('s-branches');
      const pairs = (op.slots.length - 1) / 2;
      for (let p = 0; p < pairs; p++) {
        const l = line('s-line s-branch');
        l.append(word(t('addTimes')), slotButton(1 + 2 * p), word(t('addTo')), slotButton(2 + 2 * p));
        if (pairs > 1) {
          const rm = document.createElement('button');
          rm.type = 'button'; rm.className = 'mini'; rm.title = t('removeRow'); rm.setAttribute('aria-label', t('removeRow'));
          rm.innerHTML = '<svg viewBox="0 0 24 24"><path d="M7 7l10 10M17 7L7 17"/></svg>';
          rm.addEventListener('click', () => removePair(p));
          l.appendChild(rm);
        }
        if (newPair && p === pairs - 1) l.classList.add('enter');
        branches.appendChild(l);
      }
      // "+" adds another target row that uses the same source row.
      const more = document.createElement('button');
      more.type = 'button'; more.className = 'more'; more.title = t('addRow'); more.setAttribute('aria-label', t('addRow'));
      more.innerHTML = '<svg viewBox="0 0 24 24"><path d="M12 6v12M6 12h12"/></svg>';
      more.disabled = !op.slots.every((s) => s.value !== null) || pairs >= current().M.length - 1;
      more.addEventListener('click', addPair);
      branches.appendChild(more);
      wrap.appendChild(branches);
      box.appendChild(wrap);
    } else {
      const l = line('s-line');
      t(SENTENCE[op.type]).forEach((part) => l.appendChild(typeof part === 'string' ? word(part) : slotButton(part)));
      box.appendChild(l);
    }
    $('opApply').disabled = !op.slots.every((s) => s.value !== null);
    $('matrix').classList.toggle('picking', op.active >= 0 && op.slots[op.active].kind === 'row');
    paintChosen();
  }

  function addPair() {
    const op = state.op;
    op.slots.push({ kind: 'num', value: null }, { kind: 'row', value: null });
    op.active = op.slots.length - 2;
    renderSentence(true);
  }
  function removePair(p) {
    const op = state.op;
    op.slots.splice(1 + 2 * p, 2);
    closePad(true);
    const firstEmpty = op.slots.findIndex((s) => s.value === null);
    op.active = firstEmpty;
    $('opError').textContent = '';
    renderSentence();
  }

  // Activate a slot. The number pad only opens when the person taps a number box.
  function setActive(idx, openNow) {
    const op = state.op;
    op.active = idx;
    renderSentence();
    if (openNow && idx >= 0 && op.slots[idx].kind === 'num') {
      const slot = op.slots[idx];
      openPad({
        text: slot.value === null ? '' : slot.value.toString(),
        validate: (v) => (op.type === 'mul' && v.isZero() ? 'errZero' : null),
        onOk: (v) => { slot.value = v; advance(); },
        onClose: () => renderSentence()
      });
    } else closePad(true);
  }
  function advance() {
    const op = state.op;
    const n = op.slots.length;
    for (let k = 1; k <= n; k++) {
      const idx = (Math.max(op.active, 0) + k) % n;
      if (op.slots[idx].value === null) return setActive(idx, false);
    }
    setActive(-1, false);
    $('opApply').focus({ preventScroll: true });
  }

  function onRowClick(r) {
    const op = state.op;
    if (!op || state.busy || op.active < 0 || op.slots[op.active].kind !== 'row') return;
    // All rows in one operation must be different (source and every target).
    const clash = op.slots.some((s, idx) => idx !== op.active && s.kind === 'row' && s.value === r);
    if (clash) {
      $('opError').textContent = t('errSameRow');
      const el = rowEl(r);
      el.classList.remove('shake'); void el.offsetWidth; el.classList.add('shake');
      return;
    }
    $('opError').textContent = '';
    op.slots[op.active].value = r;
    advance();
  }

  function paintChosen() {
    const rows = $('matrix').querySelectorAll('.mrow');
    rows.forEach((el) => el.classList.remove('chosen', 'chosen2'));
    if (!state.op) return;
    const rowSlots = state.op.slots.filter((s) => s.kind === 'row');
    rowSlots.forEach((s, k) => { if (s.value !== null && rowEl(s.value)) rowEl(s.value).classList.add(k === 0 ? 'chosen' : 'chosen2'); });
  }

  // The elementary operations described by the panel.
  function buildOps() {
    const v = state.op.slots.map((s) => s.value);
    if (state.op.type === 'add') {
      const ops = [];
      for (let p = 1; p < v.length; p += 2) ops.push({ type: 'add', i: v[p + 1], j: v[0], k: v[p] }); // L_target ← L_target + k L_source
      return ops;
    }
    if (state.op.type === 'mul') return [{ type: 'mul', i: v[0], k: v[1] }];
    return [{ type: 'swap', i: v[0], j: v[1] }];
  }

  $('opCancel').addEventListener('click', cancelOp);
  $('opApply').addEventListener('click', applyOp);

  async function applyOp() {
    if (state.busy || !state.op || !state.op.slots.every((s) => s.value !== null)) return;
    const ops = buildOps();
    const prev = current();
    // Several "add" operations share the source row, whose values never change,
    // and their target rows are all different; so applying them one after the
    // other is the same as applying them simultaneously.
    let M;
    try { M = ops.reduce((A, op) => Ops.apply(A, op), prev.M); } catch (e) { $('opError').textContent = t(e.message === 'same-row' ? 'errSameRow' : 'errZero'); return; }
    const ids = prev.ids.slice();
    ops.forEach((op) => { if (op.type === 'swap') [ids[op.i], ids[op.j]] = [ids[op.j], ids[op.i]]; });
    const wasRREF = Ops.isReducedRowEchelon(prev.M);
    const type = ops[0].type;

    cancelOp();
    state.busy = true;
    try {
      if (type === 'add') await animateAdd(ops, M);
      else if (type === 'mul') await animateMul(ops[0], M);
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

  async function animateMul(op, newM) {
    const row = rowEl(op.i);
    row.classList.add('chosen');
    const cells = [...row.querySelectorAll('.cell')];
    await sweep(row, cells, op.k, newM[op.i].map(fracHTML), 650 + 90 * cells.length);
    flashRow(row);
    await wait(D(250));
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

  // ops: one or more "add" operations sharing the same source row.
  async function animateAdd(ops, newM) {
    const srcIdx = ops[0].j;
    const src = rowEl(srcIdx);
    const sr = src.getBoundingClientRect();
    const mr = $('matrix').getBoundingClientRect();
    src.classList.add('chosen');
    ops.forEach((op) => rowEl(op.i).classList.add('chosen2'));

    // 1. A copy of the source row lifts off and jumps to the side of the matrix
    //    (or below it, on narrow screens).
    const base = makeGhost(src);
    const sideX = mr.right - sr.left + 40;
    const fitsSide = sr.right + sideX + 8 < document.documentElement.clientWidth;
    const park = fitsSide ? { x: sideX, y: 0 } : { x: 0, y: mr.bottom - sr.top + 26 };
    await base.ghost.animate([
      { transform: 'none' },
      { transform: `translate(${park.x * 0.5}px, ${park.y * 0.5 - 28}px) scale(1.04)`, offset: 0.5 },
      { transform: `translate(${park.x}px, ${park.y}px)` }
    ], { duration: D(560), easing: 'cubic-bezier(.3,.7,.3,1)', fill: 'forwards' }).finished;
    base.ghost.getAnimations().forEach((a) => a.cancel());
    base.ghost.style.transform = `translate(${park.x}px, ${park.y}px)`;

    for (const op of ops) {
      // 2. A copy of it is multiplied by k (the parked copy stays for the next target)...
      const g = ops.length > 1 ? makeGhost(src) : base;
      if (g !== base) g.ghost.style.transform = base.ghost.style.transform;
      await wait(D(100));
      await sweep(g.ghost, g.cells, op.k, current().M[srcIdx].map((x) => fracHTML(op.k.mul(x))), 450 + 75 * g.cells.length);
      await wait(D(120));

      // 3. ...and falls onto the target row along the outside of the matrix:
      //    first down (or up) beside the matrix, then sideways into place.
      const dst = rowEl(op.i);
      const toY = dst.getBoundingClientRect().top - sr.top;
      const control = { x: park.x, y: toY };
      await g.ghost.animate(curveFrames(park, control, { x: 0, y: toY }, 24),
        { duration: D(720), easing: 'linear', fill: 'forwards' }).finished;
      [...dst.querySelectorAll('.cell')].forEach((c, idx) => {
        c.innerHTML = fracHTML(newM[op.i][idx]);
        c.animate([{ transform: 'translateX(-6px)', opacity: 0.2 }, { transform: 'none', opacity: 1 }], { duration: D(380), easing: 'cubic-bezier(.2,.8,.2,1)' });
      });
      flashRow(dst);
      await g.ghost.animate([{ opacity: 1 }, { opacity: 0, transform: `translate(0px, ${toY}px) scale(.96)` }], { duration: D(240), fill: 'forwards' }).finished;
      g.ghost.remove();
    }
    if (base.ghost.isConnected) {
      await base.ghost.animate([{ opacity: 1 }, { opacity: 0 }], { duration: D(240), fill: 'forwards' }).finished;
      base.ghost.remove();
    }
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

  function renderEchelonPage() {
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

  // ---------------- Practice (flash cards) ----------------
  const practice = { card: null, answer: null, correct: 0, total: 0 };

  function reasonText(card, answer) {
    if (card.kind === 'rref') return t('rRref');
    const r = card.reason;
    const n = (x) => x + 1;
    if (r.type === 'zeroAbove') return fill(t('rZeroAbove'), { z: n(r.zeroRow), r: n(r.row) });
    if (r.type === 'pivotNotRight') return fill(t('rPivotNotRight'), { r: n(r.row), p: n(r.prev) });
    if (r.type === 'pivotNotOne') return fill(t('rPivotNotOne'), { r: n(r.row) });
    return fill(t('rNonzeroPivotCol'), { r: n(r.row), o: n(r.other) });
  }

  function renderPractice() {
    const p = practice;
    $('score').textContent = p.total ? fill(t('score'), { c: p.correct, t: p.total }) : '';
    if (!p.card) return;
    $('card').innerHTML = staticMatrix(p.card.M, p.answer !== null);
    document.querySelectorAll('.answer').forEach((b) => {
      b.classList.toggle('right', p.answer !== null && b.dataset.answer === p.card.kind);
      b.classList.toggle('wrong', p.answer !== null && b.dataset.answer === p.answer && p.answer !== p.card.kind);
      b.disabled = p.answer !== null;
    });
    const fb = $('feedback');
    if (p.answer === null) { fb.innerHTML = ''; fb.className = 'feedback'; }
    else {
      const ok = p.answer === p.card.kind;
      fb.className = 'feedback ' + (ok ? 'ok' : 'no');
      fb.innerHTML = '<b>' + (ok ? t('correct') : t('wrong')) + '</b> ' + reasonText(p.card, p.answer);
    }
    $('nextCard').hidden = p.answer === null;
  }

  async function newCard(animate) {
    const card = $('card');
    if (animate && !reduceMotion) {
      await card.animate([{ transform: 'none', opacity: 1 }, { transform: 'translateX(-60px) rotate(-3deg)', opacity: 0 }],
        { duration: 220, easing: 'ease-in', fill: 'forwards' }).finished;
    }
    practice.card = window.Echelon.practiceCard();
    practice.answer = null;
    renderPractice();
    card.getAnimations().forEach((a) => a.cancel());
    if (!reduceMotion) {
      card.animate([{ transform: 'translateX(60px) rotate(3deg)', opacity: 0 }, { transform: 'none', opacity: 1 }],
        { duration: 320, easing: 'cubic-bezier(.2,.8,.2,1)' });
    }
  }
  function answerCard(a) {
    const p = practice;
    if (!p.card || p.answer !== null) return;
    p.answer = a;
    p.total++;
    if (a === p.card.kind) p.correct++;
    renderPractice();
    const card = $('card');
    if (!reduceMotion) {
      card.animate(a === p.card.kind
        ? [{ transform: 'scale(1)' }, { transform: 'scale(1.04)' }, { transform: 'scale(1)' }]
        : [{ transform: 'none' }, { transform: 'translateX(-8px)' }, { transform: 'translateX(8px)' }, { transform: 'none' }],
        { duration: 350, easing: 'ease-out' });
    }
    $('nextCard').focus({ preventScroll: true });
  }
  document.querySelectorAll('.answer').forEach((b) => b.addEventListener('click', () => answerCard(b.dataset.answer)));
  $('nextCard').addEventListener('click', () => newCard(true));
  document.addEventListener('keydown', (e) => {
    if ($('practice').hidden || e.metaKey || e.ctrlKey) return;
    const map = { 1: 'ref', 2: 'rref', 3: 'none' };
    if (map[e.key] && practice.answer === null) answerCard(map[e.key]);
    else if ((e.key === 'Enter' || e.key === ' ') && practice.answer !== null && document.activeElement !== $('nextCard')) { e.preventDefault(); newCard(true); }
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
