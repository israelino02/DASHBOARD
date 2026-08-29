/* ============================================================
   DASHBOARD — páginas 1 a 6
   ============================================================ */
window.AG = window.AG || {};
AG.pages = AG.pages || {};

(function () {
  const U = AG.util, C = AG.charts, UI = AG.ui, M = AG.meta, I = AG.insights;
  const el = U.el;

  /* Métricas derivadas do bloco de totais, com a mesma conta em todo lugar. */
  function totalsView(t) {
    if (!t) return null;
    return {
      spend: U.num(t.spend), impressions: U.num(t.impressions), reach: U.num(t.reach),
      clicks: U.num(t.clicks), linkClicks: U.num(t.linkClicks),
      messaging: U.num(t.messaging), leads: U.num(t.leads), purchases: U.num(t.purchases),
      revenue: U.num(t.revenue),
      ctr: U.num(t.ctr), cpc: U.num(t.cpc), cpm: U.num(t.cpm),
      frequency: U.num(t.frequency) || U.safeDiv(t.impressions, t.reach),
      roas: U.num(t.roas) || U.safeDiv(t.revenue, t.spend),
    };
  }

  /** Contatos = a soma do que o negócio local chama de "lead":
   *  conversas iniciadas + leads de formulário. */
  const contactsOf = (t) => U.num(t.messaging) + U.num(t.leads);

  /* ============================================================
     1 — RESUMO EXECUTIVO
     ============================================================ */
  AG.pages.resumo = {
    title: 'Resumo Executivo',
    subtitle: 'Os números que respondem "valeu a pena?" em menos de 30 segundos.',
    render(data, root) {
      const cur = totalsView(data.totals), prev = totalsView(data.totalsPrev);
      if (!cur) { root.appendChild(UI.empty('A conta não retornou dados neste período.')); return; }

      const d = (k) => (prev ? U.pctChange(cur[k], prev[k]) : null);
      const contatos = contactsOf(data.totals);
      const contatosPrev = data.totalsPrev ? contactsOf(data.totalsPrev) : 0;
      const cpr = U.safeDiv(cur.spend, contatos);
      const cprPrev = U.safeDiv(prev?.spend, contatosPrev);

      const kpis = UI.grid('grid-kpi');
      [
        { label: 'Investimento', value: U.fmt.money(cur.spend), change: d('spend'), higherIsBetter: null },
        { label: 'Receita Gerada', value: U.fmt.money(cur.revenue), change: d('revenue'), higherIsBetter: true,
          hint: cur.revenue === 0 ? 'sem conversão de valor rastreada' : null },
        { label: 'ROAS', value: cur.revenue ? U.fmt.roas(cur.roas) : '—', change: cur.revenue ? d('roas') : null, higherIsBetter: true },
        { label: 'Contatos Gerados', value: U.fmt.int(contatos), change: U.pctChange(contatos, contatosPrev), higherIsBetter: true,
          hint: 'conversas + leads' },
        { label: 'Custo por Contato', value: contatos ? U.fmt.money(cpr) : '—', change: U.pctChange(cpr, cprPrev), higherIsBetter: false },
        { label: 'Impressões', value: U.fmt.int(cur.impressions), change: d('impressions'), higherIsBetter: null },
        { label: 'Alcance', value: U.fmt.int(cur.reach), change: d('reach'), higherIsBetter: true },
        { label: 'Cliques', value: U.fmt.int(cur.clicks), change: d('clicks'), higherIsBetter: true },
        { label: 'CTR Médio', value: U.fmt.pct(cur.ctr), change: d('ctr'), higherIsBetter: true },
        { label: 'CPC Médio', value: U.fmt.money(cur.cpc), change: d('cpc'), higherIsBetter: false },
        { label: 'CPM Médio', value: U.fmt.money(cur.cpm), change: d('cpm'), higherIsBetter: false },
        { label: 'Frequência', value: U.fmt.dec(cur.frequency), change: d('frequency'), higherIsBetter: false,
          hint: cur.frequency >= 3 ? 'acima de 3 = saturação' : null },
      ].forEach((k) => kpis.appendChild(UI.kpi(k)));
      root.appendChild(kpis);

      const row = UI.grid('grid-2');

      /* Verba por objetivo — parte-do-todo, leitura de relance */
      const byObj = I.groupBy(data.campaigns, (r) => objectiveLabel(r.objective));
      const cardVerba = UI.card('Distribuição de Verba', { subtitle: 'por objetivo de campanha' });
      if (byObj.length) {
        C.donut(cardVerba.body, {
          slices: byObj.map((g) => ({ label: g.label, value: g.spend })),
          fmt: U.fmt.money, centerLabel: 'INVESTIDO', height: 250,
        });
      } else cardVerba.body.appendChild(UI.empty('Sem campanhas com entrega no período.'));
      row.appendChild(cardVerba);

      /* Top campanhas por investimento — uma série, uma cor */
      const camps = I.groupBy(data.campaigns, (r) => r.campaignName || r.campaignId).slice(0, 7);
      const cardCamp = UI.card('Onde o dinheiro está', { subtitle: 'top campanhas por investimento' });
      if (camps.length) {
        C.bars(cardCamp.body, {
          horizontal: true,
          rows: camps.map((g) => ({ label: shorten(g.label, 26), value: g.spend, color: C.SERIES[0],
            note: `${U.fmt.int(g.results)} resultados · ${U.fmt.money(g.cpr)} por resultado` })),
          fmt: U.fmt.moneyShort, fmtTip: U.fmt.money,
          height: Math.max(160, camps.length * 34 + 20),
        });
      } else cardCamp.body.appendChild(UI.empty('Sem campanhas com entrega no período.'));
      row.appendChild(cardCamp);
      root.appendChild(row);

      /* Saúde da conta — um julgamento explícito, com ícone + rótulo */
      root.appendChild(healthCard(data, cur));
    },
  };

  function healthCard(data, cur) {
    const c = UI.card('Saúde da Conta', { subtitle: 'leitura rápida dos sinais estruturais' });
    const list = el('div', { class: 'health' });
    const signals = [
      { label: 'CTR global', value: U.fmt.pct(cur.ctr),
        kind: cur.ctr >= 1.5 ? 'good' : cur.ctr >= 0.8 ? 'warning' : 'critical',
        text: cur.ctr >= 1.5 ? 'Criativo comunicando bem' : cur.ctr >= 0.8 ? 'Aceitável, dá para melhorar' : 'Criativo ou público desalinhado' },
      { label: 'Frequência', value: U.fmt.dec(cur.frequency),
        kind: cur.frequency < 2.5 ? 'good' : cur.frequency < 3.5 ? 'warning' : 'critical',
        text: cur.frequency < 2.5 ? 'Público longe da saturação' : cur.frequency < 3.5 ? 'Começando a saturar' : 'Saturado — renove criativo ou amplie público' },
      { label: 'Campanhas ativas', value: U.fmt.int(new Set(data.campaigns.map((c2) => c2.campaignId)).size),
        kind: 'neutral', text: 'com entrega registrada no período' },
      { label: 'Anúncios sem resultado', value: U.fmt.int(data.ads.filter((a) => M.resultOf(a).value === 0 && a.spend > 0).length),
        kind: data.ads.filter((a) => M.resultOf(a).value === 0 && a.spend > 0).length === 0 ? 'good' : 'warning',
        text: 'gastaram verba sem entregar o objetivo' },
    ];
    signals.forEach((s) => {
      list.appendChild(el('div', { class: 'health-item' }, [
        el('div', { class: 'health-top' }, [
          UI.badge(s.kind === 'good' ? '● Bom' : s.kind === 'warning' ? '▲ Atenção' : s.kind === 'critical' ? '! Crítico' : 'i Info', s.kind),
          el('b', { text: s.value }),
        ]),
        el('div', { class: 'health-label', text: s.label }),
        el('div', { class: 'health-text', text: s.text }),
      ]));
    });
    c.body.appendChild(list);
    return c;
  }

  /* ============================================================
     2 — RECEITA × INVESTIMENTO
     Duas séries em Reais dividem o mesmo eixo — é a única forma
     honesta de sobrepor as duas. ROAS é outra unidade, então
     ganha o próprio gráfico logo abaixo.
     ============================================================ */
  AG.pages.receita = {
    title: 'Receita × Investimento',
    subtitle: 'Quanto entrou para cada real que saiu, dia a dia.',
    render(data, root) {
      const rows = data.daily || [];
      if (!rows.length) { root.appendChild(UI.empty('Sem série diária para este período.')); return; }

      const labels = rows.map((r) => U.brDate(r.date));
      const spend = rows.map((r) => U.num(r.spend));
      const revenue = rows.map((r) => U.num(r.revenue));
      const totalRev = U.sum(revenue), totalSpend = U.sum(spend);

      const kpis = UI.grid('grid-kpi');
      const prevRev = U.num(data.totalsPrev?.revenue), prevSpend = U.num(data.totalsPrev?.spend);
      [
        { label: 'Investimento no período', value: U.fmt.money(totalSpend), change: U.pctChange(totalSpend, prevSpend), higherIsBetter: null },
        { label: 'Receita no período', value: U.fmt.money(totalRev), change: U.pctChange(totalRev, prevRev), higherIsBetter: true },
        { label: 'Lucro bruto de mídia', value: U.fmt.money(totalRev - totalSpend),
          hint: 'receita menos investimento', higherIsBetter: true,
          change: U.pctChange(totalRev - totalSpend, prevRev - prevSpend) },
        { label: 'ROAS do período', value: totalRev ? U.fmt.roas(U.safeDiv(totalRev, totalSpend)) : '—',
          change: totalRev ? U.pctChange(U.safeDiv(totalRev, totalSpend), U.safeDiv(prevRev, prevSpend)) : null, higherIsBetter: true },
      ].forEach((k) => kpis.appendChild(UI.kpi(k)));
      root.appendChild(kpis);

      const c1 = UI.card('Investimento e Receita por dia', { subtitle: 'ambos em Reais, mesma escala' });
      C.lineArea(c1.body, {
        labels,
        series: [
          { name: 'Investimento', values: spend, color: C.SERIES[0] },
          { name: 'Receita', values: revenue, color: C.SERIES[1] },
        ],
        fmtY: U.fmt.moneyShort, fmtTip: U.fmt.money, height: 320,
        tipTitle: (i) => U.brDateFull(rows[i].date),
      });
      root.appendChild(c1);

      if (totalRev === 0) {
        c1.body.appendChild(UI.note(
          'A receita está zerada porque a conta não devolveu valor de conversão (purchase_roas / action_values). ' +
          'Isso é o esperado em contas que rodam só campanhas de mensagem: a venda acontece no WhatsApp e a Meta não a enxerga. ' +
          'Para popular esta página, é preciso rastrear a compra com pixel/CAPI e enviar o valor da conversão.', 'warn'));
      }

      const c2 = UI.card('ROAS por dia', { subtitle: 'retorno sobre o investimento — escala própria' });
      C.lineArea(c2.body, {
        labels,
        series: [{ name: 'ROAS', values: rows.map((r) => U.num(r.roas) || U.safeDiv(r.revenue, r.spend)), color: C.SERIES[2] }],
        fmtY: (v) => U.fmt.dec(v) + 'x', fmtTip: U.fmt.roas, height: 240,
        tipTitle: (i) => U.brDateFull(rows[i].date),
      });
      root.appendChild(c2);

      /* Atual × anterior lado a lado */
      const c3 = UI.card('Período atual × período anterior', {
        subtitle: `${U.brDateFull(data.prev.since)}–${U.brDateFull(data.prev.until)} contra ${U.brDateFull(data.range.since)}–${U.brDateFull(data.range.until)}` });
      C.bars(c3.body, {
        series: ['Período anterior', 'Período atual'],
        colors: [C.SERIES[4], C.SERIES[0]],
        rows: [
          { label: 'Investimento', values: [prevSpend, totalSpend] },
          { label: 'Receita', values: [prevRev, totalRev] },
        ],
        fmt: U.fmt.moneyShort, fmtTip: U.fmt.money, height: 260,
      });
      root.appendChild(c3);
    },
  };

  /* ============================================================
     3 — FUNIL DE CAPTAÇÃO
     ============================================================ */
  AG.pages.funil = {
    title: 'Funil de Captação',
    subtitle: 'Onde as pessoas entram, onde elas param e quanto custa cada etapa.',
    render(data, root) {
      const holder = el('div');
      const camps = I.groupBy(data.campaigns, (r) => r.campaignName || r.campaignId);

      const select = el('select', { class: 'select' }, [el('option', { value: '', text: 'Todas as campanhas' })]);
      camps.forEach((g) => select.appendChild(el('option', { value: g.key, text: shorten(g.label, 44) })));

      const card = UI.card('O Funil', { subtitle: 'volume por etapa e taxa de passagem', action: select });
      card.body.appendChild(holder);
      root.appendChild(card);

      const draw = () => {
        holder.innerHTML = '';
        const rows = select.value ? data.campaigns.filter((r) => (r.campaignName || r.campaignId) === select.value) : data.campaigns;
        const a = I.agg(rows);
        const contatos = U.sum(rows, (r) => U.num(r.messaging) + U.num(r.leads));
        const compras = a.purchases;

        const stages = [
          { label: 'IMPRESSÕES', value: a.impressions,
            rateLabel: `alcance ${U.fmt.int(a.reach)} · freq. ${U.fmt.dec(U.safeDiv(a.impressions, a.reach))}` },
          { label: 'CLIQUES NO LINK', value: a.linkClicks,
            rateLabel: `CTR de link ${U.fmt.pct(U.safeDiv(a.linkClicks, a.impressions) * 100)}` },
          { label: 'CONTATOS / LEADS', value: contatos,
            rateLabel: `${U.fmt.pct(U.safeDiv(contatos, a.linkClicks) * 100)} dos cliques viram contato` },
          { label: 'COMPRAS', value: compras,
            rateLabel: compras ? `${U.fmt.pct(U.safeDiv(compras, contatos) * 100)} dos contatos fecham` : 'nenhuma compra rastreada' },
        ];
        C.funnel(holder, { stages, height: 4 * 62 });

        const tiles = UI.grid('grid-kpi');
        [
          { label: 'Custo por clique no link', value: U.fmt.money(U.safeDiv(a.spend, a.linkClicks)) },
          { label: 'Custo por contato', value: contatos ? U.fmt.money(U.safeDiv(a.spend, contatos)) : '—' },
          { label: 'Custo por compra', value: compras ? U.fmt.money(U.safeDiv(a.spend, compras)) : '—' },
          { label: 'Ticket médio', value: compras ? U.fmt.money(U.safeDiv(a.revenue, compras)) : '—',
            hint: compras ? null : 'depende de compra rastreada' },
        ].forEach((k) => tiles.appendChild(UI.kpi(k)));
        holder.appendChild(tiles);
      };

      select.addEventListener('change', draw);
      draw();
    },
  };

  /* ============================================================
     4 — PERFORMANCE DOS ANÚNCIOS
     ============================================================ */
  AG.pages.anuncios = {
    title: 'Performance dos Anúncios',
    subtitle: 'Ranking por eficiência real, não por volume.',
    render(data, root) {
      const ads = (data.ads || []).map((r) => {
        const res = M.resultOf(r);
        const cr = data.creatives[r.adId] || {};
        return {
          adId: r.adId, name: r.adName || r.adId, campaign: r.campaignName || '',
          objective: objectiveLabel(r.objective),
          format: cr.format || '—', thumb: cr.thumb || null,
          spend: U.num(r.spend), results: res.value, resultLabel: res.label,
          cpr: U.safeDiv(r.spend, res.value), ctr: U.num(r.ctr), cpc: U.num(r.cpc),
          impressions: U.num(r.impressions), frequency: U.num(r.frequency),
          revenue: U.num(r.revenue), roas: U.num(r.roas) || U.safeDiv(r.revenue, r.spend),
        };
      }).filter((r) => r.spend > 0);

      if (!ads.length) { root.appendChild(UI.empty('Nenhum anúncio com investimento no período.')); return; }

      const withRes = ads.filter((a) => a.results > 0);
      const best = withRes.slice().sort(U.byAsc((a) => a.cpr))[0];
      const worst = withRes.length > 1 ? withRes.slice().sort(U.byDesc((a) => a.cpr))[0] : null;
      const burner = ads.filter((a) => a.results === 0).sort(U.byDesc((a) => a.spend))[0];

      const hi = UI.grid('grid-3');
      if (best) hi.appendChild(highlight('★ Melhor anúncio', best, 'good'));
      if (worst && worst.adId !== best.adId) hi.appendChild(highlight('▼ Pior anúncio', worst, 'warning'));
      if (burner) hi.appendChild(highlight('! Gastou sem resultado', burner, 'critical'));
      if (hi.childNodes.length) root.appendChild(hi);

      let tbl;
      const card = UI.card('Todos os anúncios', {
        subtitle: 'clique no cabeçalho para reordenar',
        action: UI.exportButton(() => tbl, 'anuncios-' + data.range.since + '-a-' + data.range.until + '.csv'),
      });
      tbl = UI.table({
        sortKey: 'spend', sortDir: 'desc',
        columns: [
          { key: 'name', label: 'Anúncio', render: (r) => adCell(r) },
          { key: 'objective', label: 'Objetivo', render: (r) => UI.badge(r.objective, 'neutral') },
          { key: 'spend', label: 'Investimento', align: 'right', fmt: U.fmt.money },
          { key: 'results', label: 'Resultados', align: 'right', fmt: U.fmt.int },
          { key: 'cpr', label: 'Custo p/ Res.', align: 'right', fmt: (v, r) => (r.results ? U.fmt.money(v) : '—') },
          { key: 'ctr', label: 'CTR', align: 'right', fmt: (v) => U.fmt.pct(v) },
          { key: 'cpc', label: 'CPC', align: 'right', fmt: U.fmt.money },
          { key: 'frequency', label: 'Freq.', align: 'right', fmt: U.fmt.dec },
          { key: 'roas', label: 'ROAS', align: 'right', fmt: (v, r) => (r.revenue ? U.fmt.roas(v) : '—') },
          { key: 'revenue', label: 'Receita', align: 'right', fmt: (v) => (v ? U.fmt.money(v) : '—') },
        ],
        rows: ads,
      });
      card.body.appendChild(tbl);
      root.appendChild(card);
    },
  };

  function highlight(title, ad, kind) {
    const c = UI.card(null, { class: 'hl hl-' + kind });
    c.body.appendChild(el('div', { class: 'hl-title', text: title }));
    c.body.appendChild(el('div', { class: 'hl-name', text: shorten(ad.name, 52) }));
    const stats = el('div', { class: 'hl-stats' });
    [
      ['Investimento', U.fmt.money(ad.spend)],
      ['Resultados', U.fmt.int(ad.results)],
      ['Custo p/ resultado', ad.results ? U.fmt.money(ad.cpr) : '—'],
      ['CTR', U.fmt.pct(ad.ctr)],
    ].forEach(([k, v]) => stats.appendChild(el('div', {}, [
      el('span', { class: 'hl-k', text: k }), el('b', { text: v }),
    ])));
    c.body.appendChild(stats);
    return c;
  }

  function adCell(r) {
    const wrap = el('div', { class: 'ad-cell' });
    if (r.thumb) wrap.appendChild(el('img', { src: r.thumb, alt: '', loading: 'lazy', class: 'ad-thumb' }));
    else wrap.appendChild(el('div', { class: 'ad-thumb ad-thumb-empty', text: '—' }));
    wrap.appendChild(el('div', {}, [
      el('div', { class: 'ad-name', text: shorten(r.name, 46), title: r.name }),
      el('div', { class: 'ad-sub', text: shorten(r.campaign, 46) }),
    ]));
    return wrap;
  }

  /* ============================================================
     5 — COMPARATIVO DE CRIATIVOS
     ============================================================ */
  AG.pages.criativos = {
    title: 'Comparativo de Criativos',
    subtitle: 'Que formato de peça entrega mais barato — e quais peças puxam o resultado.',
    render(data, root) {
      const ads = (data.ads || []).filter((r) => U.num(r.spend) > 0).map((r) => {
        const cr = data.creatives[r.adId] || {};
        return Object.assign({}, r, { format: cr.format || 'Não identificado', thumb: cr.thumb, result: M.resultOf(r).value });
      });
      if (!ads.length) { root.appendChild(UI.empty('Nenhum anúncio com investimento no período.')); return; }

      root.appendChild(UI.note(
        'O formato é inferido a partir do criativo (vídeo, carrossel com múltiplos cartões, imagem). ' +
        'A Meta não expõe um campo "formato" direto, então peças montadas por Advantage+ podem cair em "Não identificado".', 'info'));

      const byFormat = I.groupBy(ads, (r) => r.format);
      const c1 = UI.card('Custo por resultado, por formato', { subtitle: 'quanto menor, melhor' });
      C.bars(c1.body, {
        horizontal: true,
        rows: byFormat.slice().sort(U.byAsc((g) => g.cpr)).map((g) => ({
          label: g.label, value: g.cpr, color: C.SERIES[0],
          note: `${U.fmt.money(g.spend)} investidos · ${U.fmt.int(g.results)} resultados`,
        })),
        fmt: U.fmt.money, height: Math.max(140, byFormat.length * 34 + 20),
      });
      root.appendChild(c1);

      const c2 = UI.card('Investimento e alcance por formato');
      C.bars(c2.body, {
        series: ['Investimento (R$)'],
        rows: byFormat.map((g) => ({ label: g.label, value: g.spend, color: C.SERIES[0] })),
        fmt: U.fmt.moneyShort, fmtTip: U.fmt.money, height: 240,
      });
      root.appendChild(c2);

      /* Galeria: as peças que mais receberam verba */
      const top = ads.slice().sort(U.byDesc((r) => r.spend)).slice(0, 12);
      const gal = UI.card('Peças em destaque', { subtitle: 'as 12 com maior investimento' });
      const g = el('div', { class: 'gallery' });
      top.forEach((r) => {
        const item = el('figure', { class: 'gal-item' });
        item.appendChild(r.thumb
          ? el('img', { src: r.thumb, alt: '', loading: 'lazy' })
          : el('div', { class: 'gal-empty', text: 'sem prévia' }));
        item.appendChild(el('figcaption', {}, [
          el('div', { class: 'gal-name', text: shorten(r.adName || r.adId, 34), title: r.adName }),
          el('div', { class: 'gal-meta', text: `${U.fmt.money(r.spend)} · ${U.fmt.int(r.result)} res.` }),
          el('div', { class: 'gal-meta', text: `CTR ${U.fmt.pct(r.ctr)} · ${r.format}` }),
        ]));
        g.appendChild(item);
      });
      gal.body.appendChild(g);
      root.appendChild(gal);

      let tbl;
      const card = UI.card('Criativos em detalhe', {
        action: UI.exportButton(() => tbl, 'criativos-' + data.range.since + '.csv') });
      tbl = UI.table({
        sortKey: 'spend',
        columns: [
          { key: 'label', label: 'Formato' },
          { key: 'spend', label: 'Investimento', align: 'right', fmt: U.fmt.money },
          { key: 'impressions', label: 'Impressões', align: 'right', fmt: U.fmt.int },
          { key: 'ctr', label: 'CTR', align: 'right', fmt: (v) => U.fmt.pct(v) },
          { key: 'cpc', label: 'CPC', align: 'right', fmt: U.fmt.money },
          { key: 'results', label: 'Resultados', align: 'right', fmt: U.fmt.int },
          { key: 'cpr', label: 'Custo p/ Res.', align: 'right', fmt: (v, r) => (r.results ? U.fmt.money(v) : '—') },
          { key: 'roas', label: 'ROAS', align: 'right', fmt: (v, r) => (r.revenue ? U.fmt.roas(v) : '—') },
        ],
        rows: byFormat,
      });
      card.body.appendChild(tbl);
      root.appendChild(card);
    },
  };

  /* ============================================================
     6 — POSICIONAMENTOS
     ============================================================ */
  AG.pages.posicionamentos = {
    title: 'Posicionamentos',
    subtitle: 'Onde dentro da Meta o dinheiro rende mais.',
    render(data, root) {
      if (!data.platform || !data.platform.length) {
        root.appendChild(UI.empty('Sem dados de posicionamento no período.',
          'O breakdown por posicionamento exige entrega registrada e permissão de leitura na conta.'));
        return;
      }
      const groups = I.groupBy(data.platform, (r) => `${r.publisherPlatform || 'unknown'} · ${r.platformPosition || 'unknown'}`,
        (k) => I.prettyPlacement(k));

      const c1 = UI.card('Investimento por posicionamento');
      C.bars(c1.body, {
        horizontal: true,
        rows: groups.slice(0, 12).map((g) => ({
          label: g.label, value: g.spend, color: C.SERIES[0],
          note: `${U.fmt.int(g.results)} resultados · CTR ${U.fmt.pct(g.ctr)}`,
        })),
        fmt: U.fmt.moneyShort, fmtTip: U.fmt.money,
        height: Math.max(160, Math.min(groups.length, 12) * 34 + 20),
      });
      root.appendChild(c1);

      const eff = groups.filter((g) => g.results > 0).sort(U.byAsc((g) => g.cpr)).slice(0, 12);
      const c2 = UI.card('Custo por resultado, por posicionamento', { subtitle: 'do mais barato para o mais caro' });
      if (eff.length) {
        C.bars(c2.body, {
          horizontal: true,
          rows: eff.map((g) => ({ label: g.label, value: g.cpr, color: C.SERIES[0],
            note: `${U.fmt.money(g.spend)} investidos` })),
          fmt: U.fmt.money, height: Math.max(140, eff.length * 34 + 20),
        });
      } else c2.body.appendChild(UI.empty('Nenhum posicionamento registrou resultado no período.'));
      root.appendChild(c2);

      let tbl;
      const card = UI.card('Posicionamentos em detalhe', {
        action: UI.exportButton(() => tbl, 'posicionamentos-' + data.range.since + '.csv') });
      tbl = UI.table({
        sortKey: 'spend',
        columns: [
          { key: 'label', label: 'Posicionamento' },
          { key: 'spend', label: 'Investimento', align: 'right', fmt: U.fmt.money },
          { key: 'impressions', label: 'Impressões', align: 'right', fmt: U.fmt.int },
          { key: 'reach', label: 'Alcance', align: 'right', fmt: U.fmt.int },
          { key: 'clicks', label: 'Cliques', align: 'right', fmt: U.fmt.int },
          { key: 'ctr', label: 'CTR', align: 'right', fmt: (v) => U.fmt.pct(v) },
          { key: 'cpm', label: 'CPM', align: 'right', fmt: U.fmt.money },
          { key: 'results', label: 'Resultados', align: 'right', fmt: U.fmt.int },
          { key: 'cpr', label: 'Custo p/ Res.', align: 'right', fmt: (v, r) => (r.results ? U.fmt.money(v) : '—') },
        ],
        rows: groups,
      });
      card.body.appendChild(tbl);
      root.appendChild(card);
    },
  };

  /* ---------- utilidades compartilhadas entre páginas ---------- */
  function objectiveLabel(o) {
    const s = String(o || '').toUpperCase();
    if (/AWARENESS|REACH/.test(s)) return 'Reconhecimento';
    if (/TRAFFIC|LINK_CLICKS/.test(s)) return 'Tráfego';
    if (/SALES|CATALOG|CONVERSIONS/.test(s)) return 'Vendas';
    if (/LEAD/.test(s)) return 'Leads';
    if (/APP/.test(s)) return 'App';
    if (/ENGAGEMENT|MESSAGES|POST|VIDEO_VIEWS/.test(s)) return 'Engajamento';
    return s ? s.replace(/^OUTCOME_/, '').replace(/_/g, ' ') : 'Sem objetivo';
  }
  const shorten = (s, n) => (String(s || '').length > n ? String(s).slice(0, n - 1) + '…' : String(s || ''));

  AG.pages._shared = { objectiveLabel, shorten, totalsView, contactsOf };
})();
