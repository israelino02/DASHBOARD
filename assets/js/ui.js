/* ============================================================
   DASHBOARD — componentes de interface reutilizados pelas páginas
   ============================================================ */
window.AG = window.AG || {};

AG.ui = (function () {
  const U = AG.util;
  const el = U.el;

  /* ---------- estrutura ---------- */
  function page(title, subtitle) {
    const node = el('section', { class: 'page' });
    const head = el('header', { class: 'page-head' }, [ el('h1', { text: title }) ]);
    if (subtitle) head.appendChild(el('p', { class: 'page-sub', text: subtitle }));
    node.appendChild(head);
    return node;
  }

  /** Card. Com `collapsible`, o corpo recolhe e o cabeçalho vira o botão —
   *  uma página com sete tabelas grandes só é navegável se der para fechar o
   *  que não interessa agora. O estado fica salvo por `collapseId`, senão
   *  reabriria tudo a cada troca de período. */
  function card(title, opts) {
    const o = opts || {};
    const node = el('div', { class: 'card' + (o.class ? ' ' + o.class : '') });

    if (title) {
      const h = el('div', { class: 'card-head' }, [el('h2', { text: title })]);
      if (o.subtitle) h.appendChild(el('span', { class: 'card-sub', text: o.subtitle }));
      if (o.action) h.appendChild(o.action);
      node.appendChild(h);

      if (o.collapsible) {
        const id = o.collapseId || title;
        const abertos = AG.store.get().ui.cardsAbertos || {};
        const aberto = id in abertos ? abertos[id] : o.defaultOpen !== false;

        const seta = el('button', {
          class: 'card-toggle', type: 'button',
          'aria-expanded': String(aberto),
          title: 'Mostrar ou esconder',
        }, [el('span', { class: 'chev', text: '▸' })]);

        const aplicar = (v) => {
          node.classList.toggle('collapsed', !v);
          seta.setAttribute('aria-expanded', String(v));
        };
        aplicar(aberto);

        const alternar = () => {
          const v = node.classList.contains('collapsed');
          aplicar(v);
          const st = Object.assign({}, AG.store.get().ui.cardsAbertos || {});
          st[id] = v;
          AG.store.setUI({ cardsAbertos: st });
        };
        // stopPropagation é necessário: sem ele o clique na seta dispara também
        // o handler do cabeçalho, alterna duas vezes e a seta parece morta.
        seta.addEventListener('click', (e) => { e.stopPropagation(); alternar(); });
        // O cabeçalho inteiro é clicável, menos os controles que já fazem algo.
        h.addEventListener('click', (e) => {
          if (e.target.closest('.btn, .select, input, .chip, .card-toggle')) return;
          alternar();
        });
        h.classList.add('card-head-clickable');
        h.insertBefore(seta, h.firstChild);
      }
    }

    const body = el('div', { class: 'card-body' });
    node.appendChild(body);
    node.body = body;
    return node;
  }

  const grid = (cls) => el('div', { class: 'grid ' + (cls || '') });

  function note(text, kind) {
    return el('p', { class: 'note note-' + (kind || 'info'), text });
  }

  function empty(message, hint) {
    const n = el('div', { class: 'empty' }, [el('p', { text: message })]);
    if (hint) n.appendChild(el('p', { class: 'empty-hint', text: hint }));
    return n;
  }

  /* ---------- delta: ícone + rótulo sempre, cor nunca sozinha ---------- */
  function deltaBadge(change, higherIsBetter) {
    if (change == null || !Number.isFinite(change)) return el('span', { class: 'delta delta-none', text: '— sem base' });
    // Variação que arredonda para zero não é alta nem queda: uma seta aqui
    // sugere movimento que não existe.
    if (Math.abs(change) < 0.05) return el('span', { class: 'delta delta-none', text: '= estável' });
    const up = change > 0;
    const good = higherIsBetter == null ? null : (higherIsBetter ? up : !up);
    const cls = good == null ? 'delta-neutral' : good ? 'delta-good' : 'delta-bad';
    return el('span', { class: 'delta ' + cls }, [
      el('i', { class: 'delta-ico', text: up ? '▲' : '▼' }),
      el('span', { text: U.fmt.pct(Math.abs(change), 1) }),
    ]);
  }

  /** Stat tile: quando a história é um número só, o número é o gráfico. */
  function kpi(spec) {
    const node = el('div', { class: 'kpi' + (spec.wide ? ' kpi-wide' : '') });
    node.appendChild(el('div', { class: 'kpi-label', text: spec.label }));
    node.appendChild(el('div', { class: 'kpi-value', text: spec.value }));
    const foot = el('div', { class: 'kpi-foot' });
    if (spec.change !== undefined) foot.appendChild(deltaBadge(spec.change, spec.higherIsBetter));
    if (spec.hint) foot.appendChild(el('span', { class: 'kpi-hint', text: spec.hint }));
    if (foot.childNodes.length) node.appendChild(foot);
    return node;
  }

  /* ---------- tabela ordenável, com exportação ---------- */
  /** columns: [{key, label, fmt, align, width, render}] */
  function table(spec) {
    const cols = spec.columns;
    let rows = spec.rows.slice();
    let sortKey = spec.sortKey || null;
    let sortDir = spec.sortDir || 'desc';

    const wrap = el('div', { class: 'table-wrap' });
    const tbl = el('table', { class: 'tbl' });
    const thead = el('thead');
    const tbody = el('tbody');
    tbl.appendChild(thead); tbl.appendChild(tbody);
    wrap.appendChild(tbl);

    function renderHead() {
      thead.innerHTML = '';
      const tr = el('tr');
      cols.forEach((c) => {
        const th = el('th', {
          class: (c.align === 'right' ? 'ta-r' : '') + (spec.sortable === false ? '' : ' sortable') +
                 (sortKey === c.key ? ' sorted' : ''),
          style: c.width ? 'width:' + c.width : null,
        }, [el('span', { text: c.label })]);
        if (sortKey === c.key) th.appendChild(el('i', { class: 'sort-ico', text: sortDir === 'desc' ? '▼' : '▲' }));
        if (spec.sortable !== false) {
          th.addEventListener('click', () => {
            if (sortKey === c.key) sortDir = sortDir === 'desc' ? 'asc' : 'desc';
            else { sortKey = c.key; sortDir = 'desc'; }
            apply(); renderHead(); renderBody();
          });
        }
        tr.appendChild(th);
      });
      thead.appendChild(tr);
    }

    function apply() {
      if (!sortKey) return;
      const cmp = sortDir === 'desc' ? U.byDesc : U.byAsc;
      const col = cols.find((c) => c.key === sortKey);
      const val = (r) => {
        const v = r[sortKey];
        return typeof v === 'number' ? v : (col && col.sortValue ? col.sortValue(r) : U.num(v));
      };
      const numeric = spec.rows.every((r) => typeof r[sortKey] === 'number' || !isNaN(U.num(r[sortKey])));
      rows.sort(numeric ? cmp(val)
        : (a, b) => String(a[sortKey]).localeCompare(String(b[sortKey]), 'pt-BR') * (sortDir === 'desc' ? -1 : 1));
    }

    function renderBody() {
      tbody.innerHTML = '';
      if (!rows.length) {
        tbody.appendChild(el('tr', {}, [el('td', { colspan: cols.length },
          [empty(spec.emptyMessage || 'Sem dados para este período.')])]));
        return;
      }
      rows.forEach((r) => {
        const tr = el('tr');
        cols.forEach((c) => {
          const td = el('td', { class: c.align === 'right' ? 'ta-r' : null });
          if (c.render) {
            const out = c.render(r);
            td.appendChild(typeof out === 'string' ? document.createTextNode(out) : out);
          } else {
            td.textContent = c.fmt ? c.fmt(r[c.key], r) : String(r[c.key] ?? '');
          }
          tr.appendChild(td);
        });
        tbody.appendChild(tr);
      });
    }

    apply(); renderHead(); renderBody();
    wrap.exportRows = () => [cols.map((c) => c.label)].concat(
      rows.map((r) => cols.map((c) => (c.csv ? c.csv(r) : (c.fmt ? c.fmt(r[c.key], r) : r[c.key])))));
    return wrap;
  }

  /* ---------- pílula de status / selo ---------- */
  function badge(text, kind) { return el('span', { class: 'badge badge-' + (kind || 'neutral'), text }); }

  function button(label, onClick, kind) {
    return el('button', { class: 'btn ' + (kind ? 'btn-' + kind : ''), type: 'button', onClick, text: label });
  }

  /** Botão que baixa o conteúdo de uma tabela já renderizada. */
  function exportButton(getWrap, filename) {
    return button('Exportar CSV', () => {
      const w = getWrap();
      if (!w || !w.exportRows) return;
      U.download(filename, U.toCSV(w.exportRows()));
    }, 'ghost');
  }

  function toast(message, kind) {
    let host = U.$('#ag-toasts');
    if (!host) { host = el('div', { id: 'ag-toasts' }); document.body.appendChild(host); }
    const t = el('div', { class: 'toast toast-' + (kind || 'info'), text: message });
    host.appendChild(t);
    setTimeout(() => { t.classList.add('out'); setTimeout(() => t.remove(), 300); }, kind === 'error' ? 7000 : 3800);
  }

  return { page, card, grid, note, empty, kpi, deltaBadge, table, badge, button, exportButton, toast };
})();
