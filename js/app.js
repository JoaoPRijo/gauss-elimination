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
  function matrixLatex(M, aug) {
    const n = M[0].length;
    const spec = aug ? 'c'.repeat(n - 1) + '|c' : 'c'.repeat(n);
    return '\\left[\\begin{array}{' + spec + '} ' + M.map((r) => r.map((x) => x.toLatex()).join(' & ')).join(' \\\\ ') + ' \\end{array}\\right]';
  }

  // ---------------- Views ----------------
  const VIEWS = ['home', 'size', 'entry', 'work'];
  function show(id) {
    VIEWS.forEach((v) => { $(v).hidden = v !== id; });
    const el = $(id);
    el.style.animation = 'none'; void el.offsetWidth; el.style.animation = '';
    window.scrollTo({ top: 0 });
  }
  document.querySelectorAll('[data-back]').forEach((b) => b.addEventListener('click', () => { closePad(); show(b.dataset.back); }));
  $('homeBtn').addEventListener('click', () => { if (state.busy) return; closePad(); cancelOp(); show('home'); });

  // ---------------- Language ----------------
  function applyLang() {
    document.documentElement.lang = state.lang;
    document.title = t('title');
    document.querySelectorAll('[data-i18n]').forEach((el) => { el.textContent = t(el.dataset.i18n); });
    document.querySelectorAll('[data-i18n-title]').forEach((el) => {
      el.title = t(el.dataset.i18nTitle); el.setAttribute('aria-label', t(el.dataset.i18nTitle));
    });
    document.querySelectorAll('.lang button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.lang === state.lang)));
    $('opError').textContent = '';
    if (state.steps.length) { renderMatrix(); renderStatus(false); renderHistory(); }
    if (state.op) renderSentence();
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
  $('randomSizeBtn').addEventListener('click', async () => {
    state.rows = randInt(2, 4);
    state.cols = randInt(state.augmented ? 3 : 2, 5);
    renderSize();
    [$('rowsOut'), $('colsOut')].forEach((o) => o.animate([{ transform: 'scale(1.4)' }, { transform: 'none' }], { duration: D(350) }));
    await wait(D(450));
    startWith(randomMatrix(state.rows, state.cols));
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
    state.steps = [{ M, ids: M.map((_, i) => i), op: null, augmented: state.augmented && M[0].length > 1 }];
    state.op = null;
    $('opPanel').hidden = true;
    show('work');
    renderMatrix();
    renderOpButtons();
    renderStatus(false);
    renderHistory();
  }

  function renderMatrix(flip) {
    const box = $('matrix');
    const { M, ids } = current();
    const aug = isAug();
    const m = M.length, n = M[0].length;

    const before = new Map();
    if (flip) box.querySelectorAll('.mrow').forEach((el) => before.set(el.dataset.id, { top: el.getBoundingClientRect().top, text: el.dataset.content }));

    const tpl = ['auto', '9px'];
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
      let html = '<span class="rlabel">' + rowHTML(r) + '</span><span></span>';
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
        el.animate([{ transform: `translateY(${dy}px)` }, { transform: 'none' }], { duration: D(450), easing: 'cubic-bezier(.2,.8,.2,1)' })
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
    if (Ops.isReducedRowEchelon(M)) {
      el.innerHTML = '<span class="msg rref"><svg viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>' + t('rref') + '</span>';
      if (celebrate) celebrateMatrix();
    } else if (Ops.isRowEchelon(M)) {
      el.innerHTML = '<span class="msg ref"><svg viewBox="0 0 24 24"><path d="M4 19h5v-5h5V9h5V4"/></svg>' + t('ref') + '</span>';
    } else el.innerHTML = '';
  }

  // ---------------- Building an operation ----------------
  const SLOT_KINDS = { add: ['row', 'num', 'row'], mul: ['row', 'num'], swap: ['row', 'row'] };
  const SENTENCE = { add: 'sentAdd', mul: 'sentMul', swap: 'sentSwap' };

  document.querySelectorAll('.op-btn').forEach((b) => b.addEventListener('click', () => {
    if (state.busy) return;
    if (state.op && state.op.type === b.dataset.op) { cancelOp(); return; }
    state.op = { type: b.dataset.op, slots: SLOT_KINDS[b.dataset.op].map((kind) => ({ kind, value: null })), active: 0 };
    $('opPanel').hidden = false;
    $('opError').textContent = '';
    renderOpButtons();
    setActive(0);
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

  function renderSentence() {
    const op = state.op;
    const box = $('sentence');
    box.innerHTML = '';
    t(SENTENCE[op.type]).forEach((part) => {
      if (typeof part === 'string') {
        const s = document.createElement('span'); s.textContent = part; box.appendChild(s); return;
      }
      const slot = op.slots[part];
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'slot ' + slot.kind + '-slot' + (slot.value !== null ? ' filled' : '') + (op.active === part ? ' active' : '');
      b.innerHTML = '<span>' + (slot.value === null ? '&nbsp;' : slot.kind === 'row' ? rowHTML(slot.value) : fracHTML(slot.value)) + '</span>';
      b.addEventListener('click', () => { if (!state.busy) setActive(part); });
      box.appendChild(b);
    });
    const done = op.slots.every((s) => s.value !== null);
    $('opApply').disabled = !done;
    $('notation').innerHTML = done ? opHTML(buildOp()) : '';
    $('matrix').classList.toggle('picking', op.active >= 0 && op.slots[op.active].kind === 'row');
    paintChosen();
  }

  function setActive(idx) {
    const op = state.op;
    op.active = idx;
    renderSentence();
    if (idx >= 0 && op.slots[idx].kind === 'num') {
      const slot = op.slots[idx];
      openPad({
        text: slot.value === null ? '' : slot.value.toString(),
        validate: (v) => (op.type === 'mul' && v.isZero() ? 'errZero' : null),
        onOk: (v) => { slot.value = v; advance(); },
        onClose: () => { op.active = -1; renderSentence(); }
      });
    } else closePad(true);
  }
  function advance() {
    const op = state.op;
    const n = op.slots.length;
    for (let k = 1; k <= n; k++) {
      const idx = (Math.max(op.active, 0) + k) % n;
      if (op.slots[idx].value === null) return setActive(idx);
    }
    setActive(-1);
    $('opApply').focus({ preventScroll: true });
  }

  function onRowClick(r) {
    const op = state.op;
    if (!op || state.busy || op.active < 0 || op.slots[op.active].kind !== 'row') return;
    // The two rows of "add" and "swap" must be different.
    const other = op.slots.find((s, idx) => idx !== op.active && s.kind === 'row');
    if (other && other.value === r) {
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

  function buildOp() {
    const v = state.op.slots.map((s) => s.value);
    if (state.op.type === 'add') return { type: 'add', i: v[2], j: v[0], k: v[1] };  // L_target ← L_target + k L_source
    if (state.op.type === 'mul') return { type: 'mul', i: v[0], k: v[1] };
    return { type: 'swap', i: v[0], j: v[1] };
  }

  $('opCancel').addEventListener('click', cancelOp);
  $('opApply').addEventListener('click', applyOp);

  async function applyOp() {
    if (state.busy || !state.op || !state.op.slots.every((s) => s.value !== null)) return;
    const op = buildOp();
    const prev = current();
    let M;
    try { M = Ops.apply(prev.M, op); } catch (e) { $('opError').textContent = t(e.message === 'same-row' ? 'errSameRow' : 'errZero'); return; }
    const ids = prev.ids.slice();
    if (op.type === 'swap') [ids[op.i], ids[op.j]] = [ids[op.j], ids[op.i]];
    const wasRREF = Ops.isReducedRowEchelon(prev.M);

    cancelOp();
    state.busy = true;
    document.body.classList.add('busy');
    try {
      if (op.type === 'add') await animateAdd(op, M);
      else if (op.type === 'mul') await animateMul(op, M);
      state.steps.push({ M, ids, op });
      renderMatrix(op.type === 'swap');
      if (op.type === 'swap') await wait(D(470));
    } finally {
      state.busy = false;
      document.body.classList.remove('busy');
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

  async function animateAdd(op, newM) {
    const stage = $('stage');
    const sb = stageBox();
    const src = rowEl(op.j), dst = rowEl(op.i);
    const sr = src.getBoundingClientRect(), dr = dst.getBoundingClientRect();
    const mr = $('matrix').getBoundingClientRect();
    src.classList.add('chosen2'); dst.classList.add('chosen');

    // 1. A copy of the source row lifts off...
    const ghost = document.createElement('div');
    ghost.className = 'ghost-row';
    Object.assign(ghost.style, { left: sr.left - sb.left + 'px', top: sr.top - sb.top + 'px', width: sr.width + 'px', height: sr.height + 'px' });
    const srcCells = [...src.querySelectorAll('.cell')];
    const gCells = srcCells.map((c) => {
      const r = c.getBoundingClientRect();
      const g = document.createElement('span');
      g.className = 'cell';
      Object.assign(g.style, { left: r.left - sr.left + 'px', width: r.width + 'px' });
      g.innerHTML = '<span>' + c.innerHTML + '</span>';
      ghost.appendChild(g);
      return g;
    });
    stage.appendChild(ghost);

    // ...and jumps to the side of the matrix (or below it, on narrow screens).
    const sideX = mr.right - sr.left + 40;
    const fitsSide = sr.right + sideX + 8 < document.documentElement.clientWidth;
    const park = fitsSide ? { x: sideX, y: 0 } : { x: 0, y: mr.bottom - sr.top + 26 };
    await ghost.animate([
      { transform: 'none', boxShadow: 'none' },
      { transform: `translate(${park.x * 0.5}px, ${park.y * 0.5 - 28}px) scale(1.04)`, offset: 0.5 },
      { transform: `translate(${park.x}px, ${park.y}px)` }
    ], { duration: D(560), easing: 'cubic-bezier(.3,.7,.3,1)', fill: 'forwards' }).finished;
    // Keep the parked position in normal layout so the badge can measure it.
    ghost.getAnimations().forEach((a) => a.cancel());
    ghost.style.transform = `translate(${park.x}px, ${park.y}px)`;

    // 2. It is multiplied by k.
    await wait(D(120));
    await sweep(ghost, gCells, op.k, newM[op.i].map((_, c) => fracHTML(op.k.mul(current().M[op.j][c]))), 500 + 80 * gCells.length);
    await wait(D(150));

    // 3. It falls onto the target row, leaving the result.
    const toY = dr.top - sr.top;
    await ghost.animate([
      { transform: `translate(${park.x}px, ${park.y}px)` },
      { transform: `translate(${park.x * 0.45}px, ${Math.min(park.y, toY) - 34}px) scale(1.04)`, offset: 0.45 },
      { transform: `translate(0px, ${toY}px) scale(1)` }
    ], { duration: D(620), easing: 'cubic-bezier(.45,.05,.4,1)', fill: 'forwards' }).finished;
    const dstCells = [...dst.querySelectorAll('.cell')];
    dstCells.forEach((c, idx) => {
      c.innerHTML = fracHTML(newM[op.i][idx]);
      c.animate([{ transform: 'translateY(-6px)', opacity: 0.2 }, { transform: 'none', opacity: 1 }], { duration: D(380), easing: 'cubic-bezier(.2,.8,.2,1)' });
    });
    flashRow(dst);
    await ghost.animate([{ opacity: 1 }, { opacity: 0, transform: `translate(0px, ${toY}px) scale(.96)` }], { duration: D(260), fill: 'forwards' }).finished;
    ghost.remove();
    await wait(D(200));
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
      li.innerHTML = '<span class="n">' + (idx + 1) + '</span><span>' + opHTML(s.op) + '</span>';
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
    const lines = state.steps.map((s, idx) => (idx === 0 ? '' : '\\xrightarrow{' + opLatex(s.op) + '}\\;') + '&' + matrixLatex(s.M, aug));
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

  // ---------------- Init ----------------
  applyLang();
  renderSize();
})();
