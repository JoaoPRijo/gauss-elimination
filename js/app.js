(function () {
  'use strict';
  const F = window.Fraction;
  const Ops = window.MatrixOps;
  const I18N = window.I18N;

  const MAX = 8;
  const $ = (id) => document.getElementById(id);

  // ---------------- State ----------------
  const state = {
    lang: initialLang(),
    rows: 3,
    cols: 4,
    augmented: true,
    values: Array.from({ length: MAX }, () => Array(MAX).fill('')), // setup inputs (strings)
    steps: [],      // [{ M, ids, op }], op === null for the initial matrix
    pointer: 0,     // index of the step currently shown
    opType: 'swap'
  };

  function initialLang() {
    try {
      const saved = localStorage.getItem('gauss-lang');
      if (saved === 'pt' || saved === 'en') return saved;
    } catch (e) { /* storage unavailable */ }
    return (navigator.language || 'pt').toLowerCase().startsWith('pt') ? 'pt' : 'en';
  }
  const t = (key) => I18N[state.lang][key];
  const current = () => state.steps[state.pointer];

  // ---------------- Formatting ----------------
  const SUB = '₀₁₂₃₄₅₆₇₈₉';
  const subDigits = (n) => String(n).replace(/\d/g, (d) => SUB[d]);
  const rowText = (i) => t('row') + subDigits(i + 1);              // for <option>
  const rowHTML = (i) => t('row') + '<sub>' + (i + 1) + '</sub>';
  const MINUS = '\u2212';

  function fracHTML(q) {
    const neg = q.sign() < 0;
    const a = q.abs();
    if (a.isInteger()) return (neg ? MINUS : '') + a.num;
    return (neg ? '<span class="neg">' + MINUS + '</span>' : '') +
      '<span class="frac"><span>' + a.num + '</span><span>' + a.den + '</span></span>';
  }
  // Coefficient written in front of a row: 1 is omitted.
  const coefHTML = (absK) => (absK.isOne() ? '' : fracHTML(absK));
  const coefLatex = (absK) => (absK.isOne() ? '' : absK.toLatex());

  function opHTML(op) {
    if (op.type === 'swap') return rowHTML(op.i) + ' ↔ ' + rowHTML(op.j);
    if (op.type === 'scale') {
      return rowHTML(op.i) + ' ← ' + (op.k.sign() < 0 ? MINUS : '') + coefHTML(op.k.abs()) + rowHTML(op.i);
    }
    return rowHTML(op.i) + ' ← ' + rowHTML(op.i) + (op.k.sign() < 0 ? ' ' + MINUS + ' ' : ' + ') +
      coefHTML(op.k.abs()) + rowHTML(op.j);
  }

  function opLatex(op) {
    const R = (i) => t('row') + '_{' + (i + 1) + '}';
    if (op.type === 'swap') return R(op.i) + ' \\leftrightarrow ' + R(op.j);
    if (op.type === 'scale') {
      return R(op.i) + ' \\leftarrow ' + (op.k.sign() < 0 ? '-' : '') + coefLatex(op.k.abs()) + R(op.i);
    }
    return R(op.i) + ' \\leftarrow ' + R(op.i) + (op.k.sign() < 0 ? ' - ' : ' + ') + coefLatex(op.k.abs()) + R(op.j);
  }

  function matrixLatex(M, aug) {
    const n = M[0].length;
    const spec = aug && n > 1 ? 'c'.repeat(n - 1) + '|c' : 'c'.repeat(n);
    const body = M.map((r) => r.map((x) => x.toLatex()).join(' & ')).join(' \\\\ ');
    return '\\left[\\begin{array}{' + spec + '} ' + body + ' \\end{array}\\right]';
  }

  // ---------------- Language ----------------
  function applyLang() {
    document.documentElement.lang = state.lang;
    document.title = t('title');
    document.querySelectorAll('[data-i18n]').forEach((el) => { el.textContent = t(el.dataset.i18n); });
    document.querySelectorAll('[data-i18n-title]').forEach((el) => { el.title = t(el.dataset.i18nTitle); });
    document.querySelectorAll('.lang button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.lang === state.lang)));
    const L = t('row');
    $('symSwap').innerHTML = L + '<sub>i</sub> ↔ ' + L + '<sub>j</sub>';
    $('symScale').innerHTML = L + '<sub>i</sub> ← k' + L + '<sub>i</sub>';
    $('symAdd').innerHTML = L + '<sub>i</sub> ← ' + L + '<sub>i</sub> + k' + L + '<sub>j</sub>';
    $('setupError').textContent = '';
    $('opError').textContent = '';
    if (state.steps.length) { fillSelects(); renderMatrix(false); renderHistory(); renderStatus(); updatePreview(); }
  }

  document.querySelectorAll('.lang button').forEach((b) => b.addEventListener('click', () => {
    state.lang = b.dataset.lang;
    try { localStorage.setItem('gauss-lang', state.lang); } catch (e) { /* ignore */ }
    applyLang();
  }));

  // ---------------- Setup view ----------------
  function buildInputGrid() {
    const g = $('inputGrid');
    const { rows, cols, augmented } = state;
    const tpl = [];
    for (let c = 0; c < cols; c++) {
      if (augmented && cols > 1 && c === cols - 1) tpl.push('6px');
      tpl.push('auto');
    }
    g.style.gridTemplateColumns = tpl.join(' ');
    g.innerHTML = '';
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        if (augmented && cols > 1 && c === cols - 1) {
          const s = document.createElement('div');
          s.className = 'sep';
          g.appendChild(s);
        }
        const inp = document.createElement('input');
        inp.value = state.values[r][c];
        inp.placeholder = '0';
        inp.inputMode = 'text';
        inp.spellcheck = false;
        inp.setAttribute('aria-label', 'a' + (r + 1) + ',' + (c + 1));
        inp.dataset.r = r; inp.dataset.c = c;
        inp.addEventListener('input', () => {
          state.values[r][c] = inp.value;
          inp.classList.remove('invalid');
          $('setupError').textContent = '';
        });
        inp.addEventListener('keydown', (e) => {
          if (e.key === 'Enter') { e.preventDefault(); start(); }
        });
        g.appendChild(inp);
      }
    }
    $('rowsOut').textContent = rows;
    $('colsOut').textContent = cols;
  }

  document.querySelectorAll('[data-step]').forEach((b) => b.addEventListener('click', () => {
    const [what, d] = b.dataset.step.split(':');
    state[what] = Math.min(MAX, Math.max(1, state[what] + Number(d)));
    buildInputGrid();
  }));
  $('augmented').addEventListener('change', (e) => { state.augmented = e.target.checked; buildInputGrid(); });

  $('randomBtn').addEventListener('click', () => {
    for (let r = 0; r < state.rows; r++) {
      for (let c = 0; c < state.cols; c++) state.values[r][c] = String(Math.floor(Math.random() * 13) - 6);
    }
    buildInputGrid();
  });
  $('clearBtn').addEventListener('click', () => {
    state.values.forEach((row) => row.fill(''));
    buildInputGrid();
    $('inputGrid').querySelector('input').focus();
  });

  function start() {
    const M = [];
    let ok = true;
    for (let r = 0; r < state.rows; r++) {
      const row = [];
      for (let c = 0; c < state.cols; c++) {
        const s = state.values[r][c].trim();
        const q = s === '' ? F.ZERO : F.parse(s);
        if (q === null) {
          ok = false;
          $('inputGrid').querySelector(`input[data-r="${r}"][data-c="${c}"]`).classList.add('invalid');
        }
        row.push(q);
      }
      M.push(row);
    }
    if (!ok) { $('setupError').textContent = t('errCells'); return; }
    state.steps = [{ M, ids: M.map((_, i) => i), op: null, augmented: state.augmented && state.cols > 1 }];
    state.pointer = 0;
    $('setup').hidden = true;
    $('work').hidden = false;
    retrigger($('work'));
    fillSelects();
    renderMatrix(false);
    renderHistory();
    renderStatus();
    updatePreview();
  }
  $('startBtn').addEventListener('click', start);

  $('newBtn').addEventListener('click', () => {
    $('work').hidden = true;
    $('setup').hidden = false;
    retrigger($('setup'));
    buildInputGrid();
  });

  function retrigger(el) { el.style.animation = 'none'; void el.offsetWidth; el.style.animation = ''; }

  // ---------------- Matrix rendering (with FLIP animation) ----------------
  function renderMatrix(animate) {
    const box = $('matrix');
    const { M, ids } = current();
    const aug = state.steps[0].augmented;
    const m = M.length, n = M[0].length;

    // Remember where each row was and what it contained.
    const before = new Map();
    if (animate) {
      box.querySelectorAll('.mrow').forEach((el) => {
        before.set(el.dataset.id, { top: el.getBoundingClientRect().top, text: el.dataset.content });
      });
    }

    const tpl = ['auto', '8px'];
    for (let c = 0; c < n; c++) {
      if (aug && c === n - 1) tpl.push('14px');
      tpl.push('auto');
    }
    tpl.push('8px');
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
      html += '<span></span>';
      el.innerHTML = html;
      box.appendChild(el);
    });

    const span = '1 / ' + (m + 1);
    const lb = document.createElement('div');
    lb.className = 'bracket l'; lb.style.gridColumn = '2'; lb.style.gridRow = span;
    const rb = document.createElement('div');
    rb.className = 'bracket r'; rb.style.gridColumn = String(tpl.length); rb.style.gridRow = span;
    box.append(lb, rb);
    if (aug) {
      const v = document.createElement('div');
      v.className = 'vsep'; v.style.gridColumn = String(n + 2); v.style.gridRow = span;
      box.appendChild(v);
    }

    if (!animate) return;
    box.querySelectorAll('.mrow').forEach((el) => {
      const old = before.get(el.dataset.id);
      if (!old) return;
      const dy = old.top - el.getBoundingClientRect().top;
      if (Math.abs(dy) > 0.5) {
        el.animate([{ transform: `translateY(${dy}px)` }, { transform: 'none' }],
          { duration: 450, easing: 'cubic-bezier(.2,.8,.2,1)' });
      } else if (old.text !== el.dataset.content) {
        el.animate([{ backgroundColor: flashColor() }, { backgroundColor: 'transparent' }],
          { duration: 900, easing: 'ease-out' });
        el.querySelectorAll('.cell').forEach((cell) => cell.animate(
          [{ opacity: 0.2, transform: 'translateY(-4px)' }, { opacity: 1, transform: 'none' }],
          { duration: 350, easing: 'ease-out' }));
      }
    });
  }
  function flashColor() {
    return getComputedStyle(document.documentElement).getPropertyValue('--accent-soft').trim() || 'rgba(47,93,138,.15)';
  }

  function renderStatus() {
    const M = current().M;
    const key = Ops.isReducedRowEchelon(M) ? 'rref' : Ops.isRowEchelon(M) ? 'ref' : null;
    $('status').innerHTML = key ? '<span>' + t(key) + '</span>' : '';
  }

  // ---------------- History ----------------
  function renderHistory() {
    const ol = $('history');
    ol.innerHTML = '';
    state.steps.forEach((s, idx) => {
      const li = document.createElement('li');
      if (idx === 0) { li.classList.add('first'); li.textContent = t('initial'); }
      else li.innerHTML = '<span class="n">' + idx + '</span><span>' + opHTML(s.op) + '</span>';
      if (idx === state.pointer) li.classList.add('current');
      if (idx > state.pointer) li.classList.add('future');
      li.style.animation = 'none';
      li.addEventListener('click', () => goTo(idx));
      ol.appendChild(li);
    });
    const last = ol.lastElementChild;
    if (last && state.pointer === state.steps.length - 1 && state.steps.length > 1) last.style.animation = '';
    const cur = ol.children[state.pointer];
    if (cur) cur.scrollIntoView({ block: 'nearest' });
    $('undoBtn').disabled = state.pointer === 0;
    $('redoBtn').disabled = state.pointer === state.steps.length - 1;
  }

  function goTo(idx) {
    if (idx < 0 || idx >= state.steps.length || idx === state.pointer) return;
    state.pointer = idx;
    $('opError').textContent = '';
    renderMatrix(true);
    renderHistory();
    renderStatus();
    updatePreview();
  }
  $('undoBtn').addEventListener('click', () => goTo(state.pointer - 1));
  $('redoBtn').addEventListener('click', () => goTo(state.pointer + 1));

  document.addEventListener('keydown', (e) => {
    if ($('work').hidden || !(e.metaKey || e.ctrlKey) || e.key.toLowerCase() !== 'z') return;
    if (document.activeElement && document.activeElement.tagName === 'INPUT') return; // let inputs undo text
    e.preventDefault();
    goTo(state.pointer + (e.shiftKey ? 1 : -1));
  });

  // ---------------- Operation form ----------------
  const sel = { swapI: $('swapI'), swapJ: $('swapJ'), scaleI: $('scaleI'), addI: $('addI'), addJ: $('addJ') };

  function fillSelects() {
    const m = current().M.length;
    const defaults = { swapI: 0, swapJ: 1, scaleI: 0, addI: 1, addJ: 0 };
    Object.entries(sel).forEach(([name, s]) => {
      const prev = s.value === '' ? defaults[name] : Number(s.value);
      s.innerHTML = '';
      for (let i = 0; i < m; i++) {
        const o = document.createElement('option');
        o.value = i; o.textContent = rowText(i);
        s.appendChild(o);
      }
      s.value = String(Math.min(prev, m - 1));
    });
    updateEchoes();
  }
  function updateEchoes() {
    $('scaleEcho').innerHTML = rowHTML(Number(sel.scaleI.value));
    $('addEcho').innerHTML = rowHTML(Number(sel.addI.value));
  }

  function setOpType(type) {
    state.opType = type;
    document.querySelectorAll('.op-tabs button').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.op === type)));
    document.querySelector('.f-swap').hidden = type !== 'swap';
    document.querySelector('.f-scale').hidden = type !== 'scale';
    document.querySelector('.f-add').hidden = type !== 'add';
    $('opError').textContent = '';
    updatePreview();
    const focusEl = type === 'scale' ? $('scaleK') : type === 'add' ? $('addK') : null;
    if (focusEl && window.matchMedia('(pointer: fine)').matches) focusEl.focus();
  }
  document.querySelectorAll('.op-tabs button').forEach((b) => b.addEventListener('click', () => setOpType(b.dataset.op)));

  // Highlight the rows involved in the chosen operation (same neutral colour for all).
  function updatePreview() {
    const rows = $('matrix').querySelectorAll('.mrow');
    rows.forEach((el) => el.classList.remove('target', 'source'));
    let target = [], source = [];
    if (state.opType === 'swap') target = [sel.swapI.value, sel.swapJ.value];
    else if (state.opType === 'scale') target = [sel.scaleI.value];
    else { target = [sel.addI.value]; source = [sel.addJ.value]; }
    rows.forEach((el) => {
      if (target.includes(el.dataset.index)) el.classList.add('target');
      else if (source.includes(el.dataset.index)) el.classList.add('source');
    });
  }
  Object.values(sel).forEach((s) => s.addEventListener('change', () => { updateEchoes(); updatePreview(); $('opError').textContent = ''; }));
  ['scaleK', 'addK'].forEach((id) => $(id).addEventListener('input', () => { $(id).classList.remove('invalid'); $('opError').textContent = ''; }));

  function readScalar(input) {
    const q = F.parse(input.value);
    if (q === null) { fail(input.value.trim() === '' ? 'errK' : 'errK', input); return null; }
    if (q.isZero()) { fail('errKZero', input); return null; }
    return q;
  }
  function fail(key, input) {
    $('opError').textContent = t(key);
    if (input) { input.classList.add('invalid'); input.focus(); }
  }

  $('opForm').addEventListener('submit', (e) => {
    e.preventDefault();
    let op;
    if (state.opType === 'swap') {
      const i = Number(sel.swapI.value), j = Number(sel.swapJ.value);
      if (i === j) return fail('errSameRow');
      op = { type: 'swap', i, j };
    } else if (state.opType === 'scale') {
      const k = readScalar($('scaleK'));
      if (!k) return;
      op = { type: 'scale', i: Number(sel.scaleI.value), k };
    } else {
      const i = Number(sel.addI.value), j = Number(sel.addJ.value);
      if (i === j) return fail('errSameRow');
      const k = readScalar($('addK'));
      if (!k) return;
      op = { type: 'add', i, j, k };
    }
    const cur = current();
    const M = Ops.apply(cur.M, op);
    const ids = cur.ids.slice();
    if (op.type === 'swap') [ids[op.i], ids[op.j]] = [ids[op.j], ids[op.i]];
    state.steps = state.steps.slice(0, state.pointer + 1);
    state.steps.push({ M, ids, op });
    state.pointer = state.steps.length - 1;
    $('opError').textContent = '';
    $('scaleK').value = ''; $('addK').value = '';
    renderMatrix(true);
    renderHistory();
    renderStatus();
    updatePreview();
  });

  // ---------------- LaTeX export ----------------
  $('latexBtn').addEventListener('click', () => {
    const aug = state.steps[0].augmented;
    const lines = state.steps.slice(0, state.pointer + 1).map((s, idx) =>
      (idx === 0 ? '' : '\\xrightarrow{' + opLatex(s.op) + '}\\;') + '&' + matrixLatex(s.M, aug));
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
  // A small example so the page is not empty on first visit.
  [['1', '2', '-1', '3'], ['2', '1', '1', '7'], ['3', '-1', '2', '4']].forEach((row, r) => row.forEach((v, c) => { state.values[r][c] = v; }));
  buildInputGrid();
  applyLang();
})();
