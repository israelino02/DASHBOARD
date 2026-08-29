/* ============================================================
   DASHBOARD — utilitários
   ============================================================ */
window.AG = window.AG || {};

AG.util = (function () {
  const nfInt = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 });
  const nfDec = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const nfCompact = new Intl.NumberFormat('pt-BR', { notation: 'compact', maximumFractionDigits: 1 });

  const num = (v) => {
    const n = typeof v === 'number' ? v : parseFloat(v);
    return Number.isFinite(n) ? n : 0;
  };

  const fmt = {
    int: (v) => nfInt.format(Math.round(num(v))),
    dec: (v) => nfDec.format(num(v)),
    money: (v) => 'R$ ' + nfDec.format(num(v)),
    moneyShort: (v) => 'R$ ' + (Math.abs(num(v)) >= 1000 ? nfCompact.format(num(v)) : nfDec.format(num(v))),
    compact: (v) => nfCompact.format(num(v)),
    pct: (v, d = 2) => num(v).toFixed(d).replace('.', ',') + '%',
    roas: (v) => nfDec.format(num(v)) + 'x',
    // variação percentual assinada, para deltas
    delta: (v) => (num(v) > 0 ? '+' : '') + nfDec.format(num(v)) + '%',
  };

  /* ---------- datas ---------- */
  const pad = (n) => String(n).padStart(2, '0');
  const iso = (d) => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  const parseISO = (s) => {
    const [y, m, d] = String(s).split('-').map(Number);
    return new Date(y, (m || 1) - 1, d || 1);
  };
  const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
  const daysBetween = (a, b) => Math.round((parseISO(b) - parseISO(a)) / 86400000) + 1;
  const brDate = (s) => { const d = parseISO(s); return pad(d.getDate()) + '/' + pad(d.getMonth() + 1); };
  const brDateFull = (s) => { const d = parseISO(s); return pad(d.getDate()) + '/' + pad(d.getMonth() + 1) + '/' + d.getFullYear(); };

  /** Presets de período. Sempre terminam ONTEM quando o preset é "últimos N dias",
   *  porque o dia corrente ainda está incompleto e distorce CPA/ROAS. */
  function preset(key) {
    const today = new Date();
    const y = addDays(today, -1);
    switch (key) {
      case 'today':    return { since: iso(today), until: iso(today) };
      case 'yesterday':return { since: iso(y), until: iso(y) };
      case 'last7':    return { since: iso(addDays(y, -6)),  until: iso(y) };
      case 'last14':   return { since: iso(addDays(y, -13)), until: iso(y) };
      case 'last30':   return { since: iso(addDays(y, -29)), until: iso(y) };
      case 'last60':   return { since: iso(addDays(y, -59)), until: iso(y) };
      case 'thisMonth':return { since: iso(new Date(today.getFullYear(), today.getMonth(), 1)), until: iso(today) };
      case 'lastMonth': {
        const first = new Date(today.getFullYear(), today.getMonth() - 1, 1);
        const last  = new Date(today.getFullYear(), today.getMonth(), 0);
        return { since: iso(first), until: iso(last) };
      }
      default: return preset('last7');
    }
  }

  /** Período imediatamente anterior, de mesma duração — base de toda comparação. */
  function previousRange(range) {
    const len = daysBetween(range.since, range.until);
    const until = addDays(parseISO(range.since), -1);
    const since = addDays(until, -(len - 1));
    return { since: iso(since), until: iso(until) };
  }

  /** Variação % entre dois valores. Retorna null quando a base é zero
   *  (crescimento a partir do nada não é uma porcentagem informativa). */
  function pctChange(curr, prev) {
    const c = num(curr), p = num(prev);
    if (p === 0) return null;
    return ((c - p) / Math.abs(p)) * 100;
  }

  const safeDiv = (a, b) => (num(b) === 0 ? 0 : num(a) / num(b));

  /* ---------- DOM ---------- */
  function el(tag, attrs, children) {
    const node = document.createElement(tag);
    if (attrs) for (const k in attrs) {
      if (k === 'class') node.className = attrs[k];
      else if (k === 'html') node.innerHTML = attrs[k];
      else if (k === 'text') node.textContent = attrs[k];
      else if (k.startsWith('on')) node.addEventListener(k.slice(2).toLowerCase(), attrs[k]);
      else if (attrs[k] != null) node.setAttribute(k, attrs[k]);
    }
    (children || []).forEach((c) => node.appendChild(typeof c === 'string' ? document.createTextNode(c) : c));
    return node;
  }
  const $  = (sel, root) => (root || document).querySelector(sel);
  const $$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  /** Baixa um texto como arquivo (CSV / JSON), sem depender de backend. */
  function download(filename, content, mime) {
    const blob = new Blob(['\uFEFF' + content], { type: (mime || 'text/csv') + ';charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = el('a', { href: url, download: filename });
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function toCSV(rows) {
    return rows.map((r) => r.map((c) => {
      const s = String(c == null ? '' : c);
      return /[";\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
    }).join(';')).join('\n');
  }

  const sum = (arr, f) => arr.reduce((a, x) => a + num(f ? f(x) : x), 0);
  const byDesc = (f) => (a, b) => num(f(b)) - num(f(a));
  const byAsc  = (f) => (a, b) => num(f(a)) - num(f(b));

  return { num, fmt, iso, parseISO, addDays, daysBetween, brDate, brDateFull, preset,
           previousRange, pctChange, safeDiv, el, $, $$, esc, download, toCSV, sum, byDesc, byAsc };
})();
