/* ============================================================
   DASHBOARD — biblioteca de gráficos (SVG puro, sem dependências)

   Regras seguidas em todos os gráficos:
   • Nunca dois eixos Y no mesmo plot. Medidas de escalas diferentes
     viram gráficos separados (small multiples) ou indexadas à mesma base.
   • Cor segue a entidade, nunca a posição no ranking.
   • Traços finos, grade em hairline sólido, respiro generoso.
   • Legenda sempre presente a partir de 2 séries; rótulo direto só
     no ponto que importa (extremo / última observação).
   • Camada de hover por padrão: crosshair em linha/área, tooltip por
     marca em barra/rosca/funil.
   ============================================================ */
window.AG = window.AG || {};

AG.charts = (function () {
  const U = AG.util;
  const NS = 'http://www.w3.org/2000/svg';

  /* Slots categóricos — ordem fixa, validada para CVD e contraste
     contra a superfície #0E120F. Nunca cicle além do slot 8:
     a cauda vira "Outros" ou small multiples. */
  const SERIES = ['#16a870', '#3987e5', '#c98500', '#d55181',
                  '#8b7fe0', '#d95926', '#0f9fb8', '#e05a5a'];
  /* Rampa ordinal (uma só matiz, clara→escura) para etapas ordenadas: o funil. */
  const ORDINAL = ['#9eecc7', '#5fd7a3', '#2fc084', '#16a870', '#0c8258'];
  const INK = { grid: '#1E2620', axis: '#2A342D', muted: '#7E887F', dim: '#A8B2AA', surface: '#0E120F' };

  const color = (i) => SERIES[i % SERIES.length];

  /* ---------- helpers SVG ---------- */
  function svgEl(tag, attrs) {
    const n = document.createElementNS(NS, tag);
    for (const k in attrs) if (attrs[k] != null) n.setAttribute(k, attrs[k]);
    return n;
  }
  function text(x, y, str, opts) {
    const o = opts || {};
    const t = svgEl('text', {
      x, y, fill: o.fill || INK.muted, 'font-size': o.size || 11,
      'text-anchor': o.anchor || 'start', 'font-weight': o.weight || 500,
      'dominant-baseline': o.baseline || 'auto',
      'font-variant-numeric': o.tabular ? 'tabular-nums' : null,
    });
    t.textContent = str;
    return t;
  }

  /** Largura real de um texto, medida no próprio SVG (que já está no
   *  documento). Estimar por contagem de caracteres recorta rótulo. */
  function measure(svg, str, size, weight) {
    const t = text(0, -100, str, { size: size || 11, weight: weight || 500 });
    svg.appendChild(t);
    const w = t.getComputedTextLength();
    svg.removeChild(t);
    return w;
  }
  const measureMax = (svg, arr, size, weight) =>
    arr.reduce((m, s) => Math.max(m, measure(svg, s, size, weight)), 0);

  /** Trunca com reticências até caber na largura dada. */
  function fitText(node, maxW) {
    const full = node.textContent;
    if (node.getComputedTextLength() <= maxW) return;
    let lo = 0, hi = full.length;
    while (lo < hi) {
      const mid = Math.ceil((lo + hi) / 2);
      node.textContent = full.slice(0, mid) + '…';
      if (node.getComputedTextLength() <= maxW) lo = mid; else hi = mid - 1;
    }
    node.textContent = lo > 0 ? full.slice(0, lo) + '…' : '';
  }

  /** Escala de eixo legível: passos 1/2/2.5/5 × 10^n. */
  function niceTicks(min, max, count) {
    count = count || 5;
    if (!Number.isFinite(min) || !Number.isFinite(max)) return [0, 1];
    if (min === max) { if (min === 0) return [0, 1]; min = Math.min(0, min); max = Math.max(0, max); }
    const span = max - min || 1;
    const raw = span / count;
    const mag = Math.pow(10, Math.floor(Math.log10(raw)));
    const norm = raw / mag;
    const step = (norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 2.5 ? 2.5 : norm <= 5 ? 5 : 10) * mag;
    const lo = Math.floor(min / step) * step;
    const hi = Math.ceil(max / step) * step;
    const out = [];
    for (let v = lo; v <= hi + step / 2; v += step) out.push(Math.abs(v) < step / 1e6 ? 0 : v);
    return out;
  }

  /* ---------- tooltip global ---------- */
  let tipEl = null;
  function tip() {
    if (!tipEl) {
      tipEl = document.createElement('div');
      tipEl.className = 'ag-tip';
      tipEl.setAttribute('role', 'status');
      document.body.appendChild(tipEl);
    }
    return tipEl;
  }
  function showTip(html, evt) {
    const t = tip();
    t.innerHTML = html;
    t.style.display = 'block';
    const pad = 14, r = t.getBoundingClientRect();
    let x = evt.clientX + pad, y = evt.clientY + pad;
    if (x + r.width > window.innerWidth - 8) x = evt.clientX - r.width - pad;
    if (y + r.height > window.innerHeight - 8) y = evt.clientY - r.height - pad;
    t.style.left = Math.max(8, x) + 'px';
    t.style.top = Math.max(8, y) + 'px';
  }
  function hideTip() { if (tipEl) tipEl.style.display = 'none'; }

  /* ---------- legenda (HTML, tinta de texto — nunca a cor da série) ---------- */
  function legend(items) {
    const wrap = U.el('div', { class: 'ag-legend' });
    items.forEach((it) => {
      wrap.appendChild(U.el('span', { class: 'ag-legend-item' }, [
        U.el('i', { class: 'ag-swatch', style: 'background:' + it.color }),
        U.el('span', { text: it.label }),
      ]));
    });
    return wrap;
  }

  /** Toda renderização passa por aqui: mede o container, desenha e
   *  redesenha em resize. Guarda o spec para o redraw. */
  function mount(container, height, draw) {
    container.innerHTML = '';
    const host = U.el('div', { class: 'ag-chart-host' });
    container.appendChild(host);

    const render = () => {
      const w = Math.max(240, host.clientWidth || container.clientWidth || 640);
      host.innerHTML = '';
      const svg = svgEl('svg', { width: '100%', height, viewBox: `0 0 ${w} ${height}`, role: 'img' });
      // Anexa antes de desenhar: só dentro do documento o SVG tem layout, e
      // sem layout getComputedTextLength() devolve 0 — o que faz qualquer
      // teste de "esse rótulo cabe?" passar e recortar o texto.
      host.appendChild(svg);
      draw(svg, w, height);
    };
    // As páginas montam o gráfico antes de inserir o card no documento.
    // Desconectado, o host tem largura 0 e getComputedTextLength() devolve 0 —
    // toda medição de rótulo sai errada. Então só desenhamos quando o
    // elemento estiver de fato no documento.
    // setTimeout e não requestAnimationFrame: rAF não dispara em aba oculta,
    // e o dashboard aberto em segundo plano ficaria com os cards vazios.
    if (host.isConnected) render();
    else setTimeout(() => { if (host.isConnected) render(); }, 0);

    if (window.ResizeObserver) {
      let t = null;
      const ro = new ResizeObserver(() => { clearTimeout(t); t = setTimeout(render, 80); });
      ro.observe(host);
    }
    return { render };
  }

  /* ============================================================
     LINHA / ÁREA — múltiplas séries, um único eixo Y.
     Use apenas com séries de mesma unidade (R$ com R$, contagem
     com contagem). Unidades diferentes → smallMultiples().
     ============================================================ */
  function lineArea(container, spec) {
    const { labels, series } = spec;
    const fmtY = spec.fmtY || U.fmt.compact;
    const fmtTip = spec.fmtTip || fmtY;
    const area = spec.area !== false;
    const H = spec.height || 300;
    const showLegend = series.length >= 2;

    const wrap = U.el('div');
    container.innerHTML = '';
    container.appendChild(wrap);
    const chartBox = U.el('div');
    wrap.appendChild(chartBox);
    if (showLegend) wrap.appendChild(legend(series.map((s, i) => ({ label: s.name, color: s.color || color(i) }))));

    mount(chartBox, H, (svg, w, h) => {
      const n = labels.length;
      const allVals = series.flatMap((s) => s.values.map(U.num));
      const ticks = niceTicks(Math.min(0, ...allVals), Math.max(0, ...allVals), 4);
      const yMin = ticks[0], yMax = ticks[ticks.length - 1];

      // A calha do eixo Y é dimensionada pelo rótulo mais largo que ela
      // vai receber — com padding fixo, "R$ 250,00" sai pela borda.
      const padL = Math.min(140, Math.max(40, measureMax(svg, ticks.map(fmtY), 11) + 16));
      const padR = 18, padT = 14, padB = 30;
      const iw = w - padL - padR, ih = h - padT - padB;
      const X = (i) => padL + (n <= 1 ? iw / 2 : (i / (n - 1)) * iw);
      const Y = (v) => padT + ih - ((U.num(v) - yMin) / (yMax - yMin || 1)) * ih;

      // grade + eixo Y (hairline sólido, recuado)
      ticks.forEach((tv) => {
        const y = Y(tv);
        svg.appendChild(svgEl('line', { x1: padL, x2: padL + iw, y1: y, y2: y, stroke: INK.grid, 'stroke-width': 1 }));
        svg.appendChild(text(padL - 8, y, fmtY(tv), { anchor: 'end', baseline: 'middle', tabular: true }));
      });

      // eixo X: no máximo ~8 rótulos, sempre incluindo primeiro e último
      const every = Math.max(1, Math.ceil(n / 8));
      labels.forEach((lb, i) => {
        if (i % every !== 0 && i !== n - 1) return;
        svg.appendChild(text(X(i), h - 10, lb, { anchor: i === 0 ? 'start' : i === n - 1 ? 'end' : 'middle', tabular: true }));
      });

      // séries
      series.forEach((s, si) => {
        const c = s.color || color(si);
        const pts = s.values.map((v, i) => [X(i), Y(v)]);
        if (area && n > 1) {
          const gid = 'agGrad' + si + '_' + Math.random().toString(36).slice(2, 7);
          const defs = svgEl('defs');
          const lg = svgEl('linearGradient', { id: gid, x1: 0, y1: 0, x2: 0, y2: 1 });
          lg.appendChild(svgEl('stop', { offset: '0%', 'stop-color': c, 'stop-opacity': 0.28 }));
          lg.appendChild(svgEl('stop', { offset: '100%', 'stop-color': c, 'stop-opacity': 0.02 }));
          defs.appendChild(lg); svg.appendChild(defs);
          const d = 'M' + pts.map((p) => p.join(',')).join('L') +
                    `L${pts[pts.length - 1][0]},${padT + ih}L${pts[0][0]},${padT + ih}Z`;
          svg.appendChild(svgEl('path', { d, fill: `url(#${gid})` }));
        }
        svg.appendChild(svgEl('path', {
          d: (n === 1 ? '' : 'M' + pts.map((p) => p.join(',')).join('L')),
          fill: 'none', stroke: c, 'stroke-width': 2, 'stroke-linejoin': 'round', 'stroke-linecap': 'round',
        }));
        if (n === 1) svg.appendChild(svgEl('circle', { cx: pts[0][0], cy: pts[0][1], r: 4, fill: c }));

        // rótulo direto só no último ponto — o resto fica no tooltip
        if (spec.labelLast !== false && n > 1) {
          const last = pts[pts.length - 1];
          svg.appendChild(svgEl('circle', { cx: last[0], cy: last[1], r: 4, fill: c, stroke: INK.surface, 'stroke-width': 2 }));
        }
      });

      // camada de hover: crosshair + tooltip
      const cross = svgEl('line', { y1: padT, y2: padT + ih, stroke: INK.axis, 'stroke-width': 1, opacity: 0 });
      svg.appendChild(cross);
      const dots = series.map((s, si) =>
        svg.appendChild(svgEl('circle', { r: 4.5, fill: s.color || color(si), stroke: INK.surface, 'stroke-width': 2, opacity: 0 })));

      const hit = svgEl('rect', { x: padL, y: padT, width: iw, height: ih, fill: 'transparent' });
      svg.appendChild(hit);
      hit.addEventListener('mousemove', (e) => {
        const box = svg.getBoundingClientRect();
        const rel = ((e.clientX - box.left) / box.width) * w;
        const i = Math.max(0, Math.min(n - 1, Math.round(((rel - padL) / (iw || 1)) * (n - 1))));
        cross.setAttribute('x1', X(i)); cross.setAttribute('x2', X(i)); cross.setAttribute('opacity', 1);
        dots.forEach((d, si) => {
          d.setAttribute('cx', X(i)); d.setAttribute('cy', Y(series[si].values[i])); d.setAttribute('opacity', 1);
        });
        showTip(
          `<div class="ag-tip-h">${U.esc(spec.tipTitle ? spec.tipTitle(i) : labels[i])}</div>` +
          series.map((s, si) =>
            `<div class="ag-tip-r"><i style="background:${s.color || color(si)}"></i>` +
            `<span>${U.esc(s.name)}</span><b>${fmtTip(s.values[i])}</b></div>`).join(''), e);
      });
      hit.addEventListener('mouseleave', () => {
        cross.setAttribute('opacity', 0); dots.forEach((d) => d.setAttribute('opacity', 0)); hideTip();
      });
    });
  }

  /* ============================================================
     BARRAS — vertical (séries agrupadas) ou horizontal (ranking).
     Extremidade arredondada em 4px, ancorada na linha de base;
     2px de respiro entre barras adjacentes.
     ============================================================ */
  function bars(container, spec) {
    const rows = spec.rows;                    // [{label, values:[..]}] ou [{label, value}]
    const names = spec.series || [''];         // nomes das séries
    const fmtV = spec.fmt || U.fmt.compact;
    const fmtTip = spec.fmtTip || fmtV;
    const horizontal = !!spec.horizontal;
    const showLegend = names.length >= 2;
    const H = spec.height || (horizontal ? Math.max(140, rows.length * 34 + 24) : 280);

    const wrap = U.el('div');
    container.innerHTML = '';
    container.appendChild(wrap);
    const chartBox = U.el('div');
    wrap.appendChild(chartBox);
    if (showLegend) wrap.appendChild(legend(names.map((nm, i) => ({ label: nm, color: spec.colors?.[i] || color(i) }))));

    const valsOf = (r) => (r.values != null ? r.values.map(U.num) : [U.num(r.value)]);

    mount(chartBox, H, (svg, w, h) => {
      const all = rows.flatMap(valsOf);
      const maxV = Math.max(0, ...all);

      if (horizontal) {
        const labelW = spec.labelWidth || Math.min(190, Math.max(90, w * 0.32));
        // A faixa da direita recebe o valor de cada barra: dimensione-a pelo
        // maior deles, senão o último dígito fica fora do desenho.
        const padR = Math.min(150, Math.max(34, measureMax(svg, rows.map((r) => fmtV(valsOf(r)[0])), 12) + 18));
        const padT = 4, padB = 4;
        const iw = w - labelW - padR, ih = h - padT - padB;
        const band = ih / Math.max(1, rows.length);
        const barH = Math.min(18, Math.max(8, band - 10));

        rows.forEach((r, ri) => {
          const y = padT + ri * band + (band - barH) / 2;
          const vals = valsOf(r);
          const sub = vals.length;
          const subH = sub === 1 ? barH : (barH - 2 * (sub - 1)) / sub;   // 2px de respiro entre séries
          const lbl = text(labelW - 12, y + barH / 2, r.label, {
            anchor: 'end', baseline: 'middle', fill: INK.dim, size: 12 });
          svg.appendChild(lbl);
          fitText(lbl, labelW - 16);
          vals.forEach((v, si) => {
            const bw = Math.max(2, (maxV ? v / maxV : 0) * iw);
            const by = y + si * (subH + 2);
            const rect = svgEl('rect', {
              x: labelW, y: by, width: bw, height: subH,
              rx: Math.min(4, subH / 2), fill: r.color || spec.colors?.[si] || color(si),
            });
            rect.addEventListener('mousemove', (e) => showTip(
              `<div class="ag-tip-h">${U.esc(r.label)}</div>` +
              `<div class="ag-tip-r"><i style="background:${r.color || spec.colors?.[si] || color(si)}"></i>` +
              `<span>${U.esc(names[si] || 'Valor')}</span><b>${fmtTip(v)}</b></div>` +
              (r.note ? `<div class="ag-tip-n">${U.esc(r.note)}</div>` : ''), e));
            rect.addEventListener('mouseleave', hideTip);
            svg.appendChild(rect);
          });
          // rótulo direto ao final da barra: cabe sempre, fora da marca
          svg.appendChild(text(labelW + Math.max(2, (maxV ? vals[0] / maxV : 0) * iw) + 8,
            y + barH / 2, fmtV(vals[0]), { baseline: 'middle', fill: INK.dim, size: 12, tabular: true }));
        });
      } else {
        const ticks = niceTicks(0, maxV, 4);
        const yMax = ticks[ticks.length - 1];
        const padL = Math.min(140, Math.max(38, measureMax(svg, ticks.map(fmtV), 11) + 16));
        const padR = 12, padT = 12, padB = 42;
        const iw = w - padL - padR, ih = h - padT - padB;
        const Y = (v) => padT + ih - (v / (yMax || 1)) * ih;

        ticks.forEach((tv) => {
          const y = Y(tv);
          svg.appendChild(svgEl('line', { x1: padL, x2: padL + iw, y1: y, y2: y, stroke: INK.grid, 'stroke-width': 1 }));
          svg.appendChild(text(padL - 8, y, fmtV(tv), { anchor: 'end', baseline: 'middle', tabular: true }));
        });

        const band = iw / Math.max(1, rows.length);
        const groupW = Math.min(band - 14, 76);
        const sub = names.length;
        const barW = (groupW - 2 * (sub - 1)) / sub;      // 2px de respiro

        rows.forEach((r, ri) => {
          const cx = padL + ri * band + band / 2;
          const x0 = cx - groupW / 2;
          valsOf(r).forEach((v, si) => {
            const bh = Math.max(1, (v / (yMax || 1)) * ih);
            const c = r.color || spec.colors?.[si] || color(si);
            const rect = svgEl('rect', {
              x: x0 + si * (barW + 2), y: Y(v), width: barW, height: bh,
              rx: Math.min(4, barW / 2), fill: c,
            });
            rect.addEventListener('mousemove', (e) => showTip(
              `<div class="ag-tip-h">${U.esc(r.label)}</div>` +
              `<div class="ag-tip-r"><i style="background:${c}"></i>` +
              `<span>${U.esc(names[si] || 'Valor')}</span><b>${fmtTip(v)}</b></div>`, e));
            rect.addEventListener('mouseleave', hideTip);
            svg.appendChild(rect);
          });
          const lb = String(r.label);
          svg.appendChild(text(cx, h - 24, lb.length > 14 ? lb.slice(0, 13) + '…' : lb,
            { anchor: 'middle', size: 11 }));
        });
      }
    });
  }

  /* ============================================================
     ROSCA — parte-do-todo, no máximo 6 fatias (a cauda vira "Outros").
     Só para leitura de relance; comparação fina é barra.
     ============================================================ */
  function donut(container, spec) {
    let slices = spec.slices.slice().sort(U.byDesc((s) => s.value));
    if (slices.length > 6) {
      const tail = slices.slice(5);
      slices = slices.slice(0, 5).concat([{ label: 'Outros', value: U.sum(tail, (t) => t.value) }]);
    }
    const total = U.sum(slices, (s) => s.value) || 1;
    const fmtV = spec.fmt || U.fmt.money;
    const H = spec.height || 260;

    const wrap = U.el('div');
    container.innerHTML = '';
    container.appendChild(wrap);
    const chartBox = U.el('div');
    wrap.appendChild(chartBox);
    wrap.appendChild(legend(slices.map((s, i) => ({
      label: `${s.label} · ${U.fmt.pct((s.value / total) * 100, 1)}`, color: s.color || color(i) }))));

    mount(chartBox, H, (svg, w, h) => {
      const cx = w / 2, cy = h / 2;
      const R = Math.min(w, h) / 2 - 12, r = R * 0.62;
      let a0 = -Math.PI / 2;
      const GAP = 0.018;                       // respiro de superfície entre fatias

      slices.forEach((s, i) => {
        const frac = s.value / total;
        const a1 = a0 + frac * Math.PI * 2;
        const s0 = a0 + (frac > 0.02 ? GAP : 0), s1 = a1 - (frac > 0.02 ? GAP : 0);
        if (s1 > s0) {
          const large = s1 - s0 > Math.PI ? 1 : 0;
          const d = `M${cx + R * Math.cos(s0)},${cy + R * Math.sin(s0)}` +
                    `A${R},${R} 0 ${large} 1 ${cx + R * Math.cos(s1)},${cy + R * Math.sin(s1)}` +
                    `L${cx + r * Math.cos(s1)},${cy + r * Math.sin(s1)}` +
                    `A${r},${r} 0 ${large} 0 ${cx + r * Math.cos(s0)},${cy + r * Math.sin(s0)}Z`;
          const c = s.color || color(i);
          const p = svgEl('path', { d, fill: c });
          p.addEventListener('mousemove', (e) => showTip(
            `<div class="ag-tip-h">${U.esc(s.label)}</div>` +
            `<div class="ag-tip-r"><i style="background:${c}"></i><span>Valor</span><b>${fmtV(s.value)}</b></div>` +
            `<div class="ag-tip-r"><i style="background:transparent"></i><span>Share</span><b>${U.fmt.pct(frac * 100, 1)}</b></div>`, e));
          p.addEventListener('mouseleave', hideTip);
          svg.appendChild(p);
        }
        a0 = a1;
      });

      svg.appendChild(text(cx, cy - 6, spec.centerLabel || 'TOTAL',
        { anchor: 'middle', baseline: 'middle', size: 10, fill: INK.muted, weight: 700 }));
      svg.appendChild(text(cx, cy + 14, fmtV(total),
        { anchor: 'middle', baseline: 'middle', size: 15, fill: '#F2F5F3', weight: 700 }));
    });
  }

  /* ============================================================
     FUNIL — etapas ordenadas, rampa ordinal de uma só matiz.
     A largura codifica o volume; a taxa entre etapas fica à direita.
     ============================================================ */
  function funnel(container, spec) {
    const stages = spec.stages;                // [{label, value, rateLabel}]
    const H = spec.height || Math.max(200, stages.length * 62);
    const maxV = Math.max(...stages.map((s) => U.num(s.value)), 1);

    container.innerHTML = '';
    const chartBox = U.el('div');
    container.appendChild(chartBox);

    // As taxas entre etapas vivem numa lista HTML sob o funil: em tela
    // estreita não há espaço para elas ao lado das barras, e assim a
    // informação continua legível (e selecionável) em qualquer largura.
    const notes = U.el('ol', { class: 'funnel-notes' });
    stages.forEach((s) => {
      if (!s.rateLabel) return;
      notes.appendChild(U.el('li', {}, [
        U.el('span', { class: 'fn-stage', text: s.label }),
        U.el('span', { class: 'fn-rate', text: s.rateLabel }),
      ]));
    });

    mount(chartBox, H, (svg, w, h) => {
      // O SVG carrega volume e rótulo da etapa; a taxa de passagem fica na
      // lista abaixo. Desenhar as duas coisas lado a lado colidia em
      // qualquer largura, porque a barra encolhe conforme o funil afunila.
      const plotW = w;
      const band = h / stages.length;
      const barH = Math.min(42, band - 10);

      stages.forEach((s, i) => {
        const frac = Math.max(0.10, U.num(s.value) / maxV);   // piso para a etapa continuar visível
        const bw = frac * plotW;
        const x = (plotW - bw) / 2;
        const y = i * band + (band - barH) / 2;
        const c = ORDINAL[Math.min(i, ORDINAL.length - 1)];

        const rect = svgEl('rect', { x, y, width: bw, height: barH, rx: 6, fill: c });
        rect.addEventListener('mousemove', (e) => showTip(
          `<div class="ag-tip-h">${U.esc(s.label)}</div>` +
          `<div class="ag-tip-r"><i style="background:${c}"></i><span>Volume</span>` +
          `<b>${(s.fmt || U.fmt.int)(s.value)}</b></div>` +
          (s.rateLabel ? `<div class="ag-tip-n">${U.esc(s.rateLabel)}</div>` : ''), e));
        rect.addEventListener('mouseleave', hideTip);
        svg.appendChild(rect);

        // O rótulo só entra na marca se AMBAS as linhas couberem com folga.
        // Estimar por contagem de caracteres erra e recorta o texto, então
        // desenhamos, medimos a largura real e reposicionamos se não coube.
        const val = (s.fmt || U.fmt.int)(s.value);
        const tVal = text(0, y + barH / 2 - 8, val,
          { anchor: 'middle', baseline: 'middle', size: 15, weight: 700, tabular: true });
        const tLab = text(0, y + barH / 2 + 11, s.label,
          { anchor: 'middle', baseline: 'middle', size: 9.5, weight: 700 });
        svg.appendChild(tVal); svg.appendChild(tLab);

        const widest = Math.max(tVal.getComputedTextLength(), tLab.getComputedTextLength());
        const fits = widest + 20 <= bw;
        const tx = fits ? plotW / 2 : Math.min(x + bw + 10, w - widest - 4);
        [tVal, tLab].forEach((t) => {
          t.setAttribute('x', tx);
          t.setAttribute('text-anchor', fits ? 'middle' : 'start');
        });
        tVal.setAttribute('fill', fits ? '#07120C' : '#F2F5F3');
        tLab.setAttribute('fill', fits ? 'rgba(7,18,12,.72)' : INK.muted);
      });
    });

    if (notes.childNodes.length) container.appendChild(notes);
  }

  /* ============================================================
     SMALL MULTIPLES — a alternativa correta ao eixo duplo.
     Cada métrica tem seu próprio painel e sua própria escala;
     o eixo X é compartilhado, então a leitura temporal é comparável
     sem inventar correlação entre escalas.
     ============================================================ */
  function smallMultiples(container, spec) {
    container.innerHTML = '';
    const grid = U.el('div', { class: 'ag-sm-grid' });
    container.appendChild(grid);

    spec.panels.forEach((p, pi) => {
      const cell = U.el('div', { class: 'ag-sm' });
      cell.appendChild(U.el('div', { class: 'ag-sm-h' }, [
        U.el('i', { class: 'ag-swatch', style: 'background:' + (p.color || color(pi)) }),
        U.el('span', { text: p.name }),
        U.el('b', { text: (p.fmt || U.fmt.compact)(p.values[p.values.length - 1] ?? 0) }),
      ]));
      const box = U.el('div');
      cell.appendChild(box);
      grid.appendChild(cell);

      mount(box, 96, (svg, w, h) => {
        const padT = 10, padB = 14, padX = 4;
        const ih = h - padT - padB, iw = w - padX * 2;
        const vals = p.values.map(U.num);
        const mn = Math.min(0, ...vals), mx = Math.max(...vals, mn + 1);
        const X = (i) => padX + (vals.length <= 1 ? iw / 2 : (i / (vals.length - 1)) * iw);
        const Y = (v) => padT + ih - ((v - mn) / (mx - mn || 1)) * ih;
        const c = p.color || color(pi);

        svg.appendChild(svgEl('line', { x1: padX, x2: w - padX, y1: padT + ih, y2: padT + ih, stroke: INK.grid, 'stroke-width': 1 }));
        const pts = vals.map((v, i) => [X(i), Y(v)]);
        svg.appendChild(svgEl('path', { d: 'M' + pts.map((q) => q.join(',')).join('L'),
          fill: 'none', stroke: c, 'stroke-width': 2, 'stroke-linejoin': 'round', 'stroke-linecap': 'round' }));
        const last = pts[pts.length - 1];
        if (last) svg.appendChild(svgEl('circle', { cx: last[0], cy: last[1], r: 3.5, fill: c, stroke: INK.surface, 'stroke-width': 2 }));

        const hit = svgEl('rect', { x: 0, y: 0, width: w, height: h, fill: 'transparent' });
        svg.appendChild(hit);
        hit.addEventListener('mousemove', (e) => {
          const box2 = svg.getBoundingClientRect();
          const rel = ((e.clientX - box2.left) / box2.width) * w;
          const i = Math.max(0, Math.min(vals.length - 1, Math.round(((rel - padX) / (iw || 1)) * (vals.length - 1))));
          showTip(`<div class="ag-tip-h">${U.esc(spec.labels[i] || '')}</div>` +
            `<div class="ag-tip-r"><i style="background:${c}"></i><span>${U.esc(p.name)}</span>` +
            `<b>${(p.fmt || U.fmt.compact)(vals[i])}</b></div>`, e);
        });
        hit.addEventListener('mouseleave', hideTip);
      });
    });
  }

  return { SERIES, ORDINAL, INK, color, lineArea, bars, donut, funnel, smallMultiples, legend, niceTicks, hideTip };
})();
