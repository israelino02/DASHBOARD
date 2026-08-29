/* ============================================================
   DASHBOARD — páginas 7 a 12 e configuração
   ============================================================ */
window.AG = window.AG || {};
AG.pages = AG.pages || {};

(function () {
  const U = AG.util, C = AG.charts, UI = AG.ui, M = AG.meta, I = AG.insights;
  const el = U.el;
  const S = () => AG.pages._shared;

  /* ============================================================
     7 — PÚBLICO (idade e gênero)
     ============================================================ */
  AG.pages.publico = {
    title: 'Público',
    subtitle: 'Quem responde ao anúncio — e quanto custa falar com cada recorte.',
    render(data, root) {
      const rows = data.ageGender || [];
      if (!rows.length) {
        root.appendChild(UI.empty('Sem dados demográficos no período.',
          'A Meta suprime o breakdown quando o volume é pequeno demais para preservar o anonimato.'));
        return;
      }

      const byGender = I.groupBy(rows, (r) => r.gender, (k) => I.prettyGender(k));
      const kpis = UI.grid('grid-kpi');
      byGender.forEach((g) => kpis.appendChild(UI.kpi({
        label: g.label, value: U.fmt.money(g.spend),
        hint: `${U.fmt.int(g.results)} resultados · ${g.results ? U.fmt.money(g.cpr) : '—'} por resultado`,
      })));
      root.appendChild(kpis);

      /* Idade × gênero: barras agrupadas, uma cor por gênero (a entidade),
         nunca por posição no ranking. */
      const ages = Array.from(new Set(rows.map((r) => r.age).filter(Boolean))).sort();
      const genders = byGender.map((g) => g.key);
      const colorOf = (gk) => C.SERIES[genders.indexOf(gk) % C.SERIES.length];

      const buildMatrix = (metric) => ages.map((age) => ({
        label: age,
        values: genders.map((gk) => {
          const sub = rows.filter((r) => r.age === age && r.gender === gk);
          const a = I.agg(sub);
          return metric === 'cpr' ? (a.results ? a.cpr : 0) : a[metric];
        }),
      }));

      const c1 = UI.card('Resultados por faixa etária e gênero');
      C.bars(c1.body, {
        series: genders.map((g) => I.prettyGender(g)),
        colors: genders.map(colorOf),
        rows: buildMatrix('results'), fmt: U.fmt.compact, fmtTip: U.fmt.int, height: 280,
      });
      root.appendChild(c1);

      const c2 = UI.card('Custo por resultado, por faixa etária', { subtitle: 'quanto menor, melhor' });
      C.bars(c2.body, {
        series: genders.map((g) => I.prettyGender(g)),
        colors: genders.map(colorOf),
        rows: buildMatrix('cpr'), fmt: U.fmt.moneyShort, fmtTip: U.fmt.money, height: 280,
      });
      root.appendChild(c2);

      const detail = I.groupBy(rows, (r) => `${r.gender}|${r.age}`,
        (k) => `${I.prettyGender(k.split('|')[0])} · ${k.split('|')[1]}`);
      let tbl;
      const card = UI.card('Recortes em detalhe', {
        action: UI.exportButton(() => tbl, 'publico-' + data.range.since + '.csv') });
      tbl = UI.table({
        sortKey: 'spend',
        columns: [
          { key: 'label', label: 'Recorte' },
          { key: 'spend', label: 'Investimento', align: 'right', fmt: U.fmt.money },
          { key: 'impressions', label: 'Impressões', align: 'right', fmt: U.fmt.int },
          { key: 'clicks', label: 'Cliques', align: 'right', fmt: U.fmt.int },
          { key: 'ctr', label: 'CTR', align: 'right', fmt: (v) => U.fmt.pct(v) },
          { key: 'results', label: 'Resultados', align: 'right', fmt: U.fmt.int },
          { key: 'cpr', label: 'Custo p/ Res.', align: 'right', fmt: (v, r) => (r.results ? U.fmt.money(v) : '—') },
          { key: 'roas', label: 'ROAS', align: 'right', fmt: (v, r) => (r.revenue ? U.fmt.roas(v) : '—') },
        ],
        rows: detail,
      });
      card.body.appendChild(tbl);
      root.appendChild(card);
    },
  };

  /* ============================================================
     8 — LOCALIZAÇÃO
     ============================================================ */
  AG.pages.local = {
    title: 'Localização',
    subtitle: 'Onde estão as pessoas que respondem ao anúncio.',
    render(data, root) {
      root.appendChild(UI.note(
        'A Meta não expõe cidade nem bairro no relatório de insights — o recorte geográfico mais fino disponível na API é ' +
        'a região (estado). Para leitura por cidade, o caminho é criar um conjunto de anúncios por cidade e ler o resultado ' +
        'por conjunto na página de Anúncios.', 'info'));

      const rows = data.region || [];
      if (!rows.length) { root.appendChild(UI.empty('Sem dados de região no período.')); return; }

      const groups = I.groupBy(rows, (r) => r.region).filter((g) => g.spend > 0);

      const c1 = UI.card('Investimento por região', { subtitle: 'top 12' });
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

      const eff = groups.filter((g) => g.results >= 3).sort(U.byAsc((g) => g.cpr)).slice(0, 12);
      const c2 = UI.card('Regiões mais eficientes', { subtitle: 'menor custo por resultado, mínimo de 3 resultados' });
      if (eff.length) {
        C.bars(c2.body, {
          horizontal: true,
          rows: eff.map((g) => ({ label: g.label, value: g.cpr, color: C.SERIES[0],
            note: `${U.fmt.int(g.results)} resultados sobre ${U.fmt.money(g.spend)}` })),
          fmt: U.fmt.money, height: Math.max(140, eff.length * 34 + 20),
        });
      } else c2.body.appendChild(UI.empty('Nenhuma região atingiu volume mínimo para ranquear.'));
      root.appendChild(c2);

      let tbl;
      const card = UI.card('Regiões em detalhe', {
        action: UI.exportButton(() => tbl, 'regioes-' + data.range.since + '.csv') });
      tbl = UI.table({
        sortKey: 'spend',
        columns: [
          { key: 'label', label: 'Região' },
          { key: 'spend', label: 'Investimento', align: 'right', fmt: U.fmt.money },
          { key: 'impressions', label: 'Impressões', align: 'right', fmt: U.fmt.int },
          { key: 'reach', label: 'Alcance', align: 'right', fmt: U.fmt.int },
          { key: 'clicks', label: 'Cliques', align: 'right', fmt: U.fmt.int },
          { key: 'results', label: 'Resultados', align: 'right', fmt: U.fmt.int },
          { key: 'cpr', label: 'Custo p/ Res.', align: 'right', fmt: (v, r) => (r.results ? U.fmt.money(v) : '—') },
          { key: 'revenue', label: 'Receita', align: 'right', fmt: (v) => (v ? U.fmt.money(v) : '—') },
        ],
        rows: groups,
      });
      card.body.appendChild(tbl);
      root.appendChild(card);
    },
  };

  /* ============================================================
     9 — EVOLUÇÃO TEMPORAL
     Cada métrica tem escala própria: são painéis separados, não
     duas escalas empilhadas no mesmo plot.
     ============================================================ */
  AG.pages.evolucao = {
    title: 'Evolução Temporal',
    subtitle: 'O comportamento diário de cada métrica, em painéis de escala própria.',
    render(data, root) {
      const rows = data.daily || [];
      if (!rows.length) { root.appendChild(UI.empty('Sem série diária para este período.')); return; }

      const labels = rows.map((r) => U.brDate(r.date));
      const contatos = rows.map((r) => U.num(r.messaging) + U.num(r.leads));

      const c1 = UI.card('Investimento por dia');
      C.lineArea(c1.body, {
        labels, height: 260,
        series: [{ name: 'Investimento', values: rows.map((r) => U.num(r.spend)), color: C.SERIES[0] }],
        fmtY: U.fmt.moneyShort, fmtTip: U.fmt.money,
        tipTitle: (i) => U.brDateFull(rows[i].date),
      });
      root.appendChild(c1);

      const c2 = UI.card('Todas as métricas, dia a dia', { subtitle: 'cada painel tem sua própria escala' });
      C.smallMultiples(c2.body, {
        labels,
        panels: [
          { name: 'Impressões', values: rows.map((r) => U.num(r.impressions)), fmt: U.fmt.compact, color: C.SERIES[1] },
          { name: 'Alcance', values: rows.map((r) => U.num(r.reach)), fmt: U.fmt.compact, color: C.SERIES[1] },
          { name: 'Cliques', values: rows.map((r) => U.num(r.clicks)), fmt: U.fmt.int, color: C.SERIES[1] },
          { name: 'CTR', values: rows.map((r) => U.num(r.ctr)), fmt: (v) => U.fmt.pct(v), color: C.SERIES[2] },
          { name: 'CPC', values: rows.map((r) => U.num(r.cpc)), fmt: U.fmt.money, color: C.SERIES[2] },
          { name: 'CPM', values: rows.map((r) => U.num(r.cpm)), fmt: U.fmt.money, color: C.SERIES[2] },
          { name: 'Contatos', values: contatos, fmt: U.fmt.int, color: C.SERIES[0] },
          { name: 'Custo por contato', values: rows.map((r, i) => U.safeDiv(r.spend, contatos[i])), fmt: U.fmt.money, color: C.SERIES[0] },
          { name: 'Receita', values: rows.map((r) => U.num(r.revenue)), fmt: U.fmt.moneyShort, color: C.SERIES[3] },
        ],
      });
      root.appendChild(c2);

      const best = rows.slice().sort(U.byAsc((r) => U.safeDiv(r.spend, U.num(r.messaging) + U.num(r.leads)) || Infinity))[0];
      const worst = rows.filter((r) => U.num(r.spend) > 0).slice()
        .sort(U.byDesc((r) => U.safeDiv(r.spend, U.num(r.messaging) + U.num(r.leads)) || 0))[0];
      const tiles = UI.grid('grid-kpi');
      [
        { label: 'Melhor dia', value: best ? U.brDateFull(best.date) : '—',
          hint: best ? `${U.fmt.money(U.safeDiv(best.spend, U.num(best.messaging) + U.num(best.leads)))} por contato` : null },
        { label: 'Pior dia', value: worst ? U.brDateFull(worst.date) : '—',
          hint: worst ? `${U.fmt.money(U.safeDiv(worst.spend, U.num(worst.messaging) + U.num(worst.leads)))} por contato` : null },
        { label: 'Média diária investida', value: U.fmt.money(U.safeDiv(U.sum(rows, (r) => r.spend), rows.length)) },
        { label: 'Projeção 30 dias', value: U.fmt.money(U.safeDiv(U.sum(rows, (r) => r.spend), rows.length) * 30),
          hint: 'no ritmo atual' },
      ].forEach((k) => tiles.appendChild(UI.kpi(k)));
      root.appendChild(tiles);

      let tbl;
      const card = UI.card('Série diária', {
        action: UI.exportButton(() => tbl, 'diario-' + data.range.since + '.csv') });
      tbl = UI.table({
        sortKey: null, sortable: true,
        columns: [
          { key: 'date', label: 'Data', fmt: (v) => U.brDateFull(v) },
          { key: 'spend', label: 'Investimento', align: 'right', fmt: U.fmt.money },
          { key: 'impressions', label: 'Impressões', align: 'right', fmt: U.fmt.int },
          { key: 'reach', label: 'Alcance', align: 'right', fmt: U.fmt.int },
          { key: 'clicks', label: 'Cliques', align: 'right', fmt: U.fmt.int },
          { key: 'ctr', label: 'CTR', align: 'right', fmt: (v) => U.fmt.pct(v) },
          { key: 'cpc', label: 'CPC', align: 'right', fmt: U.fmt.money },
          { key: 'contatos', label: 'Contatos', align: 'right', fmt: U.fmt.int },
          { key: 'revenue', label: 'Receita', align: 'right', fmt: (v) => (v ? U.fmt.money(v) : '—') },
        ],
        rows: rows.map((r, i) => Object.assign({}, r, { contatos: contatos[i] })),
      });
      card.body.appendChild(tbl);
      root.appendChild(card);
    },
  };

  /* ============================================================
     10 — CRESCIMENTO SOCIAL
     ============================================================ */
  AG.pages.social = {
    title: 'Crescimento Social',
    subtitle: 'O que a mídia paga devolveu em audiência própria.',
    render(data, root) {
      const client = data.client;
      const soc = data.social || { errors: [] };

      /* O que sempre existe: o efeito social medido dentro dos anúncios. */
      const t = data.totals || {};
      const kpis = UI.grid('grid-kpi');
      [
        { label: 'Engajamento com a página', value: U.fmt.int(t.pageEngagement) },
        { label: 'Engajamento com publicações', value: U.fmt.int(t.postEngagement) },
        { label: 'Visitas ao perfil (Instagram)', value: U.fmt.int(t.profileVisits) },
        { label: 'Conversas iniciadas', value: U.fmt.int(t.messaging) },
        { label: 'Curtidas geradas', value: U.fmt.int(t.likes) },
        { label: 'Visualizações de vídeo', value: U.fmt.int(t.videoViews) },
      ].forEach((k) => kpis.appendChild(UI.kpi(k)));
      root.appendChild(kpis);
      root.appendChild(UI.note('Os números acima vêm dos anúncios: é o crescimento social atribuível à mídia paga.', 'info'));

      if (!client.pageId && !client.igId) {
        root.appendChild(UI.empty(
          'Seguidores e alcance orgânico não estão configurados.',
          'Informe o Page ID e o Instagram Business ID do cliente em Integração API. O token precisa das permissões ' +
          'pages_read_engagement e instagram_basic.'));
        return;
      }

      /* Facebook — série diária de fãs */
      if (soc.page && soc.page.length) {
        const byName = {};
        soc.page.forEach((m) => { byName[m.name] = m.values || []; });
        const adds = byName['page_fan_adds'] || [];
        if (adds.length) {
          const c = UI.card('Novos seguidores da Página (Facebook)');
          C.lineArea(c.body, {
            labels: adds.map((v) => U.brDate(String(v.end_time).slice(0, 10))),
            series: [{ name: 'Novos seguidores', values: adds.map((v) => U.num(v.value)), color: C.SERIES[0] }],
            fmtY: U.fmt.int, fmtTip: U.fmt.int, height: 240,
          });
          const total = U.sum(adds, (v) => v.value);
          c.body.appendChild(UI.note(`Total no período: ${U.fmt.int(total)} novos seguidores.`, 'info'));
          root.appendChild(c);
        }
      }

      /* Instagram — seguidores atuais e série diária */
      if (soc.ig) {
        const prof = soc.ig.profile || {};
        const k = UI.grid('grid-kpi');
        k.appendChild(UI.kpi({ label: 'Seguidores no Instagram', value: U.fmt.int(prof.followers_count),
          hint: prof.username ? '@' + prof.username : null }));
        root.appendChild(k);

        const series = soc.ig.series || [];
        const panels = series.map((m, i) => ({
          name: ({ reach: 'Alcance', profile_views: 'Visitas ao perfil', website_clicks: 'Cliques no site' }[m.name] || m.name),
          values: (m.values || []).map((v) => U.num(v.value)),
          fmt: U.fmt.int, color: C.SERIES[i % C.SERIES.length],
        })).filter((p) => p.values.length);
        if (panels.length) {
          const c = UI.card('Instagram, dia a dia');
          C.smallMultiples(c.body, {
            labels: (series[0].values || []).map((v) => U.brDate(String(v.end_time).slice(0, 10))),
            panels,
          });
          root.appendChild(c);
        }
      }

      if (soc.errors && soc.errors.length) {
        const c = UI.card('Avisos da API social');
        soc.errors.forEach((e) => c.body.appendChild(UI.note(e, 'warn')));
        root.appendChild(c);
      }
    },
  };

  /* ============================================================
     11 — GOOGLE ADS (import de CSV)
     ============================================================ */
  AG.pages.google = {
    title: 'Google Ads',
    subtitle: 'Relatórios exportados do Google Ads, lidos localmente.',
    render(data, root) {
      // O import do Google Ads pertence ao cliente selecionado, não ao
      // conjunto de dados em tela: em modo demonstração os CSVs reais do
      // cliente continuam sendo os que valem.
      const clientId = (AG.store.activeClient() || data.client).id;

      /* Importar e filtrar são controles do operador. No link do cliente eles
         não aparecem: o cliente lê o relatório, não o configura. */
      const operador = !window.AG_CLIENT_MODE;

      const drop = el('div', { class: 'dropzone' });
      const input = el('input', { type: 'file', accept: '.csv,.tsv,.txt', multiple: true, class: 'file-input', id: 'gads-file' });
      drop.appendChild(el('label', { for: 'gads-file', class: 'dz-label' }, [
        el('b', { text: 'Solte aqui os CSVs do Google Ads' }),
        el('span', { text: 'ou clique para escolher — Campanhas, Grupos de anúncios, Anúncios, Palavras-chave, Termos de pesquisa, Dispositivos, Localizações' }),
      ]));
      drop.appendChild(input);

      const handle = (files) => {
        Array.from(files).forEach((f) => {
          const reader = new FileReader();
          reader.onload = () => {
            try {
              const parsed = AG.gads.parse(String(reader.result));
              AG.gads.ingest(clientId, parsed, f.name);
              const resumo = parsed.reports
                .map((r) => `${r.kindLabel} (${U.fmt.int(r.rows.length)})`).join(', ');
              UI.toast(`${f.name} → ${resumo}`, 'success');
              AG.app.rerender();
            } catch (e) {
              UI.toast(`${f.name}: ${e.message}`, 'error');
            }
          };
          reader.onerror = () => UI.toast('Não consegui ler ' + f.name, 'error');
          reader.readAsText(f, 'utf-8');
        });
      };
      input.addEventListener('change', (e) => handle(e.target.files));
      ['dragenter', 'dragover'].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.add('over'); }));
      ['dragleave', 'drop'].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.remove('over'); }));
      drop.addEventListener('drop', (e) => handle(e.dataTransfer.files));

      const acoes = el('div', { class: 'form-actions', style: 'margin-left:auto' });
      // Publicar para o link do cliente: baixa o que está no navegador no
      // mesmo formato que a função servidor lê. O parser continua sendo a
      // única fonte da verdade — nada é reimplementado do outro lado.
      acoes.appendChild(UI.button('Exportar para o link do cliente', () => {
        const dados = AG.store.gadsFor(clientId);
        if (!dados || !dados.reports || !Object.keys(dados.reports).length) {
          UI.toast('Importe pelo menos um relatório antes de exportar.', 'error'); return;
        }
        const c = AG.store.activeClient() || {};
        const slug = (c.name || 'cliente').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
          .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
        U.download(slug + '.gads.json', JSON.stringify(dados, null, 1), 'application/json');
        UI.toast(`Salve como data/${slug}.gads.json no repositório e faça push.`, 'success');
      }, 'primary'));
      acoes.appendChild(UI.button('Limpar dados importados', () => {
        AG.store.clearGads(clientId); UI.toast('Dados do Google Ads removidos.'); AG.app.rerender();
      }, 'ghost'));

      // Mostrar de qual conta são os CSVs evita o erro de subir o arquivo do
      // cliente errado — o nome do arquivo raramente diz de quem ele é.
      const contaGoogle = (AG.store.activeClient() || {}).googleId;
      const importCard = UI.card('Importar relatórios', {
        subtitle: (contaGoogle ? 'conta ' + contaGoogle + ' · ' : '') + 'nada sai do seu computador',
        action: acoes,
      });
      importCard.body.appendChild(drop);
      importCard.body.appendChild(UI.note(
        'No Google Ads: Campanhas → Relatórios → Download → CSV. Os relatórios aceitos são detectados automaticamente ' +
        'pela coluna de identificação. Os arquivos são lidos no navegador e guardados apenas neste computador.', 'info'));
      if (operador) root.appendChild(importCard);

      const stored = AG.store.gadsFor(clientId);
      if (!stored || !stored.reports || !Object.keys(stored.reports).length) {
        root.appendChild(operador
          ? UI.empty('Nenhum relatório do Google Ads importado para este cliente ainda.')
          : UI.empty('Este relatório ainda não tem dados publicados.',
              'Fale com quem cuida da sua conta.'));
        return;
      }

      /* Filtro de campanha — persiste junto dos relatórios do cliente */
      const filtroInput = el('input', {
        class: 'input', type: 'text', value: stored.campanha || '',
        placeholder: 'ex.: [MARCA] SEARCH - INSTITUCIONAL',
      });
      const aplicar = () => {
        const atual = AG.store.gadsFor(clientId) || {};
        atual.campanha = filtroInput.value.trim();
        AG.store.setGads(clientId, atual);
        AG.app.rerender();
      };
      filtroInput.addEventListener('change', aplicar);
      const filtroCard = UI.card('Campanha em foco', {
        subtitle: 'deixe vazio para ver todas',
        action: UI.button('Aplicar', aplicar, 'ghost'),
      });
      filtroCard.body.appendChild(filtroInput);
      filtroCard.body.appendChild(UI.note(
        'Só os relatórios de Campanha e de Grupo de anúncios trazem a coluna Campanha. ' +
        'Palavras-chave, Anúncios e Termos de pesquisa não trazem — esses exports já saem de dentro de ' +
        'uma campanha, então passam inteiros pelo filtro.', 'info'));
      if (operador) root.appendChild(filtroCard);

      /* "—" para o que o relatório não informa; 0 diria que o valor é zero. */
      const nn = (v, f) => (v == null ? '—' : f(v));

      /* Com export segmentado por dia, o seletor de período do topo passa a
         valer aqui também. Sem data na linha, não há como recortar — ela passa. */
      const periodo = data && data.range;
      const brutasDe = (kind) => AG.gads.rowsOf(stored.reports[kind]);
      const grupoAtivo = AG.store.get().ui.gadsGrupo || '';
      const linhasDe = (kind) => AG.gads.filterByGroup(
        AG.gads.filterByRange(
          AG.gads.filterByCampaign(brutasDe(kind), stored.campanha, kind), periodo),
        grupoAtivo, kind);

      const TIPOS = Object.keys(stored.reports);
      const todasBrutas = TIPOS.flatMap(brutasDe);
      const temData = AG.gads.hasDates(todasBrutas);
      const datas = todasBrutas.filter((r) => r.date).map((r) => r.date).sort();

      /* KPIs a partir do relatório de campanhas (única visão sem dupla contagem) */
      /* Diz sem rodeios se o seletor de período está agindo — a diferença entre
         "o CSV não tem datas" e "o período não bate" muda o que fazer. */
      if (temData) {
        const dentro = TIPOS.flatMap(linhasDe).filter((r) => r.date).length;
        root.appendChild(UI.note(
          `Exports segmentados por dia: ${U.brDateFull(datas[0])} a ${U.brDateFull(datas[datas.length - 1])}. ` +
          `O período selecionado no topo recorta esta aba — ${U.fmt.int(dentro)} linha(s) dentro dele.` +
          (dentro === 0 ? ' Nenhuma linha cai no período atual: ajuste o filtro no topo.' : ''),
          dentro === 0 ? 'warn' : 'info'));
      } else {
        root.appendChild(UI.note(
          'Estes exports não têm coluna de data, então o seletor de período do topo não age nesta aba — ' +
          'o que aparece é o intervalo que você escolheu ao exportar do Google Ads. Para ter a série diária, ' +
          'exporte de novo com Segmentar → Tempo → Dia.', 'info'));
      }

      /* Filtro por grupo de anúncios — visível também no link do cliente:
         é controle de leitura, não configuração. Os grupos existem porque
         cada um roda palavras-chave de um serviço diferente. */
      const grupos = AG.gads.gruposDe(TIPOS.flatMap(brutasDe));
      if (grupos.length > 1) {
        const chips = el('div', { class: 'chips' });
        const escolher = (g) => { AG.store.setUI({ gadsGrupo: g }); AG.app.rerender(); };
        chips.appendChild(el('button', {
          class: 'chip' + (grupoAtivo ? '' : ' active'), type: 'button',
          text: 'Todos os grupos', onClick: () => escolher(''),
        }));
        grupos.forEach((g) => chips.appendChild(el('button', {
          class: 'chip' + (grupoAtivo === g ? ' active' : ''), type: 'button',
          text: g, onClick: () => escolher(g),
        })));
        const cardGrupo = UI.card('Grupo de anúncios', {
          subtitle: grupoAtivo
            ? 'mostrando só ' + grupoAtivo + ' e as palavras-chave dele'
            : 'todos juntos — clique para separar por serviço' });
        cardGrupo.body.appendChild(chips);
        if (grupoAtivo) {
          const naoDivide = AG.gads.semGrupo(stored.reports, TIPOS)
            .map((k) => AG.gads.KIND_LABEL[k] || k);
          if (naoDivide.length) {
            cardGrupo.body.appendChild(UI.note(
              `${naoDivide.join(', ')} — o Google não informa o grupo nesses relatórios, ` +
              'então esses números continuam sendo os da campanha inteira, não só de ' + grupoAtivo + '.', 'warn'));
          }
        }
        root.appendChild(cardGrupo);
      }

      /* Com um grupo escolhido, os totais vêm do próprio grupo. O relatório de
         campanha não se divide por grupo, então continuaria mostrando a conta
         inteira e contradizendo a tabela logo abaixo. */
      const linhasGrupoKpi = linhasDe('adgroups').filter((r) => r.name === grupoAtivo);
      const linhasCamp = grupoAtivo && linhasGrupoKpi.length ? linhasGrupoKpi : linhasDe('campaigns');
      if (linhasCamp.length) {
        const t = AG.gads.totals(linhasCamp);
        const kpis = UI.grid('grid-kpi');
        [
          { label: 'Investimento', value: nn(t.cost, U.fmt.money) },
          { label: 'Impressões', value: nn(t.impressions, U.fmt.int),
            hint: t.impressions == null ? 'não informado neste export' : null },
          { label: 'Cliques', value: nn(t.clicks, U.fmt.int) },
          { label: 'CTR', value: nn(t.ctr, (v) => U.fmt.pct(v)) },
          { label: 'CPC Médio', value: nn(t.avgCpc, U.fmt.money) },
          { label: 'Conversões', value: nn(t.conversions, U.fmt.dec) },
          { label: 'CPA', value: t.conversions ? nn(t.costPerConv, U.fmt.money) : '—' },
          { label: 'Receita', value: t.convValue ? U.fmt.money(t.convValue) : '—' },
          { label: 'ROAS', value: t.convValue ? U.fmt.roas(t.roas) : '—' },
        ].forEach((k) => kpis.appendChild(UI.kpi(k)));
        root.appendChild(kpis);
      }

      /* Onde o dinheiro está: grupos de anúncios, se houver; senão campanhas */
      const linhasGrupo = linhasDe('adgroups');
      const base = AG.gads.collapseDates(linhasGrupo.length ? linhasGrupo : linhasDe('campaigns'));
      if (base.length) {
        const top = base.slice().sort(U.byDesc((r) => r.cost)).slice(0, 10);
        const c = UI.card(linhasGrupo.length ? 'Investimento por grupo de anúncios' : 'Investimento por campanha',
          { subtitle: 'soma do período selecionado', collapsible: true, collapseId: 'gads-ranking' });
        C.bars(c.body, {
          horizontal: true,
          rows: top.map((r) => ({ label: S().shorten(r.name, 28), value: r.cost, color: C.SERIES[0],
            note: `${U.fmt.dec(r.conversions)} conversões · CTR ${U.fmt.pct(r.ctr)}` })),
          fmt: U.fmt.moneyShort, fmtTip: U.fmt.money, height: Math.max(160, top.length * 34 + 20),
        });
        root.appendChild(c);
      }

      /* Série diária — só existe se algum export veio segmentado por dia */
      const ORDEM = ['campaigns', 'adgroups', 'ads', 'keywords', 'terms'];
      const kindSerie = ORDEM.find((k) => stored.reports[k] && AG.gads.hasDates(linhasDe(k)));
      if (kindSerie) {
        const serie = AG.gads.daily(linhasDe(kindSerie));
        const rotulos = serie.map((d) => U.brDate(d.date));

        const cInv = UI.card('Investimento por dia', {
          subtitle: `a partir do relatório de ${(AG.gads.KIND_LABEL[kindSerie] || kindSerie).toLowerCase()}`,
          collapsible: true, collapseId: 'gads-inv-dia' });
        C.lineArea(cInv.body, {
          labels: rotulos, height: 260,
          series: [{ name: 'Investimento', values: serie.map((d) => U.num(d.cost)), color: C.SERIES[0] }],
          fmtY: U.fmt.moneyShort, fmtTip: U.fmt.money,
          tipTitle: (i) => U.brDateFull(serie[i].date),
        });
        root.appendChild(cInv);

        const paineis = [
          { name: 'Cliques', values: serie.map((d) => U.num(d.clicks)), fmt: U.fmt.int, color: C.SERIES[1] },
          { name: 'Impressões', values: serie.map((d) => U.num(d.impressions)), fmt: U.fmt.compact, color: C.SERIES[1] },
          { name: 'CTR', values: serie.map((d) => U.num(d.ctr)), fmt: (v) => U.fmt.pct(v), color: C.SERIES[2] },
          { name: 'CPC', values: serie.map((d) => U.num(d.avgCpc)), fmt: U.fmt.money, color: C.SERIES[2] },
          { name: 'Conversões', values: serie.map((d) => U.num(d.conversions)), fmt: U.fmt.dec, color: C.SERIES[0] },
          { name: 'CPA', values: serie.map((d) => U.num(d.costPerConv)), fmt: U.fmt.money, color: C.SERIES[0] },
        // um painel só faz sentido se o export informou aquela métrica
        ].filter((p) => serie.some((d, i) => p.values[i] != null && p.values[i] !== 0));

        if (paineis.length) {
          const cSm = UI.card('Métricas diárias', { subtitle: 'cada painel tem sua própria escala',
            collapsible: true, collapseId: 'gads-metricas-dia' });
          C.smallMultiples(cSm.body, { labels: rotulos, panels: paineis });
          root.appendChild(cSm);
        }

        let tblDia;
        const cTab = UI.card('Série diária', {
          subtitle: `${U.fmt.int(serie.length)} dias`,
          action: UI.exportButton(() => tblDia, 'google-diario.csv'),
          collapsible: true, defaultOpen: false, collapseId: 'gads-serie' });
        tblDia = UI.table({
          sortKey: null,
          columns: [
            { key: 'date', label: 'Data', fmt: (v) => U.brDateFull(v) },
            { key: 'cost', label: 'Custo', align: 'right', fmt: (v) => nn(v, U.fmt.money) },
            { key: 'impressions', label: 'Impressões', align: 'right', fmt: (v) => nn(v, U.fmt.int) },
            { key: 'clicks', label: 'Cliques', align: 'right', fmt: (v) => nn(v, U.fmt.int) },
            { key: 'ctr', label: 'CTR', align: 'right', fmt: (v) => nn(v, (x) => U.fmt.pct(x)) },
            { key: 'avgCpc', label: 'CPC Méd.', align: 'right', fmt: (v) => nn(v, U.fmt.money) },
            { key: 'conversions', label: 'Conversões', align: 'right', fmt: (v) => nn(v, U.fmt.dec) },
            { key: 'costPerConv', label: 'CPA', align: 'right', fmt: (v) => nn(v, U.fmt.money) },
          ],
          rows: serie,
        });
        cTab.body.appendChild(tblDia);
        root.appendChild(cTab);
      }

      /* Uma tabela por tipo de relatório, em ordem de leitura: do mais amplo
         para o mais granular. Termos de pesquisa vai por último — é a maior
         lista e a de consulta pontual, não a que se lê primeiro. */
      const ORDEM_TABELAS = ['campaigns', 'adgroups', 'ads', 'keywords', 'locations', 'devices', 'terms'];
      const tiposOrdenados = ORDEM_TABELAS.filter((k) => stored.reports[k])
        .concat(Object.keys(stored.reports).filter((k) => !ORDEM_TABELAS.includes(k)));

      tiposOrdenados.forEach((kind) => {
        const rep = stored.reports[kind];
        // Uma linha por entidade, somando as datas: a evolução no tempo é
        // papel da Série diária, não de repetir cada nome 29 vezes aqui.
        const linhas = AG.gads.collapseDates(linhasDe(kind));
        const arquivos = AG.gads.fileNames(rep);
        let tbl;
        const card = UI.card(rep.kindLabel || AG.gads.KIND_LABEL[kind], {
          subtitle: `${U.fmt.int(linhas.length)} ${linhas.length === 1 ? 'linha' : 'linhas'} · ` +
                    `soma do período selecionado`,
          action: UI.exportButton(() => tbl, `google-${kind}.csv`),
          collapsible: true, defaultOpen: false, collapseId: 'gads-' + kind,
        });
        tbl = UI.table({
          sortKey: 'cost',
          emptyMessage: 'Nenhuma linha deste relatório corresponde à campanha em foco.',
          columns: [
            { key: 'name', label: rep.kindLabel || 'Item', render: (r) => {
                const box = el('div');
                box.appendChild(el('div', { title: r.name, text: S().shorten(r.name, 56) }));
                // A campanha vira legenda; o grupo ganhou coluna própria abaixo.
                const sub = r.campanha || (arquivos.length > 1 ? r.origem : '');
                if (sub) box.appendChild(el('div', { class: 'ad-sub', title: sub, text: S().shorten(sub, 46) }));
                return box;
              } },
            // Coluna própria para o grupo: é o que separa as palavras-chave de
            // um grupo das de outro, e permite ordenar por isso.
            ...(linhas.some((r) => r.grupo)
              ? [{ key: 'grupo', label: 'Grupo',
                   render: (r) => UI.badge(r.grupo || '—', 'neutral') }] : []),
            { key: 'cost', label: 'Custo', align: 'right', fmt: (v) => nn(v, U.fmt.money) },
            { key: 'impressions', label: 'Impressões', align: 'right', fmt: (v) => nn(v, U.fmt.int) },
            { key: 'clicks', label: 'Cliques', align: 'right', fmt: (v) => nn(v, U.fmt.int) },
            { key: 'ctr', label: 'CTR', align: 'right', fmt: (v) => nn(v, (x) => U.fmt.pct(x)) },
            { key: 'avgCpc', label: 'CPC Méd.', align: 'right', fmt: (v) => nn(v, U.fmt.money) },
            { key: 'conversions', label: 'Conversões', align: 'right', fmt: (v) => nn(v, U.fmt.dec) },
            { key: 'costPerConv', label: 'CPA', align: 'right', fmt: (v, r) => (r.conversions ? nn(v, U.fmt.money) : '—') },
            { key: 'roas', label: 'ROAS', align: 'right', fmt: (v, r) => (r.convValue ? U.fmt.roas(v) : '—') },
          ],
          rows: linhas,
        });
        card.body.appendChild(tbl);
        root.appendChild(card);
      });
    },
  };

  /* ============================================================
     12 — INSIGHTS AUTOMÁTICOS
     ============================================================ */
  AG.pages.insights = {
    title: 'Insights Automáticos',
    subtitle: 'A leitura dos dados que o cliente não faz sozinho.',
    render(data, root) {
      const list = I.build(data);
      if (!list.length) { root.appendChild(UI.empty('Ainda não há massa de dados suficiente para conclusões.')); return; }

      const ICON_LABEL = { good: 'Positivo', warning: 'Atenção', critical: 'Crítico', neutral: 'Contexto' };
      const box = el('div', { class: 'insights' });
      list.forEach((it) => {
        box.appendChild(el('div', { class: 'insight insight-' + it.severity }, [
          el('div', { class: 'insight-mark' }, [
            el('i', { class: 'insight-ico', text: it.icon }),
            el('span', { class: 'insight-kind', text: ICON_LABEL[it.severity] }),
          ]),
          el('div', {}, [
            el('h3', { text: it.title }),
            el('p', { text: it.detail }),
          ]),
        ]));
      });
      const card = UI.card('O que os dados dizem', {
        subtitle: `${U.brDateFull(data.range.since)} a ${U.brDateFull(data.range.until)}, contra o período anterior de mesma duração`,
        action: UI.button('Exportar CSV', () => U.download('insights-' + data.range.since + '.csv',
          U.toCSV([['Tipo', 'Título', 'Detalhe']].concat(list.map((i) => [ICON_LABEL[i.severity], i.title, i.detail])))), 'ghost'),
      });
      card.body.appendChild(box);
      root.appendChild(card);

      /* Narrativa opcional — os números continuam sendo os do dashboard */
      const narr = UI.card('Resumo para o cliente', { subtitle: 'texto gerado a partir dos insights acima' });
      const out = el('div', { class: 'narrative' });
      const btn = UI.button('Gerar resumo com IA', async () => {
        btn.disabled = true; btn.textContent = 'Gerando…';
        out.innerHTML = '';
        try {
          const txt = await I.narrate(data, list);
          txt.split(/\n{2,}/).forEach((p) => out.appendChild(el('p', { text: p.trim() })));
          const copy = UI.button('Copiar texto', () => {
            navigator.clipboard.writeText(txt).then(() => UI.toast('Texto copiado.'));
          }, 'ghost');
          out.appendChild(copy);
        } catch (e) {
          out.appendChild(UI.note(e.message, 'warn'));
        } finally { btn.disabled = false; btn.textContent = 'Gerar resumo com IA'; }
      }, 'primary');
      narr.body.appendChild(btn);
      narr.body.appendChild(out);
      if (!AG.store.get().global.geminiKey) {
        narr.body.appendChild(UI.note('Configure a Google Gemini API Key em Integração API para habilitar o resumo escrito.', 'info'));
      }
      root.appendChild(narr);
    },
  };

  /* ============================================================
     CONFIGURAÇÃO — clientes e credenciais
     ============================================================ */
  AG.pages.config = {
    title: 'Integração API',
    subtitle: 'Clientes, tokens e chaves. Tudo fica guardado apenas neste navegador.',
    needsData: false,
    render(_data, root) {
      const st = AG.store.get();

      /* --- clientes --- */
      const clientsCard = UI.card('Gerenciador de Clientes (Meta Ads)', {
        action: UI.button('+ Adicionar cliente', () => openForm({}), 'primary'),
      });
      const list = el('div', { class: 'client-list' });
      if (!st.clients.length) list.appendChild(UI.empty('Nenhum cliente cadastrado ainda.'));
      st.clients.forEach((c) => {
        const item = el('div', { class: 'client-item' + (c.id === st.activeClientId ? ' active' : '') });
        const resumo = el('div', {}, [
          el('div', { class: 'client-name', text: c.name || '(sem nome)' }),
          el('div', { class: 'client-meta', text: [
            c.accountId ? 'Meta: ' + c.accountId : null,
            c.googleId ? 'Google Ads: ' + c.googleId : null,
          ].filter(Boolean).join('  ·  ') || 'Sem conta configurada' }),
        ]);
        // Page ID, Instagram e token só dizem respeito à Meta: num cliente que
        // só roda Google Ads, seriam três linhas de "não configurado" inúteis.
        if (c.accountId) {
          resumo.appendChild(el('div', { class: 'client-meta', text: 'Page ID: ' + (c.pageId || 'não configurado') +
            ' · Instagram ID: ' + (c.igId || 'não configurado') }));
          resumo.appendChild(el('div', { class: 'client-meta', text: 'Token: ' + (c.token ? 'próprio' : 'usando o universal') }));
        }
        item.appendChild(resumo);
        const acts = el('div', { class: 'client-actions' });
        if (c.accountId) acts.appendChild(UI.button('Testar conexão', async () => {
          try {
            const info = await M.testConnection(c);
            UI.toast(`OK — ${info.name} (${info.currency}, ${info.timezone_name})`, 'success');
          } catch (e) { UI.toast('Falhou: ' + e.message, 'error'); }
        }, 'ghost'));
        acts.appendChild(UI.button('Editar', () => openForm(c), 'ghost'));
        acts.appendChild(UI.button('Remover', () => {
          if (!confirm(`Remover "${c.name}"? Os dados importados do Google Ads deste cliente também serão apagados.`)) return;
          AG.store.removeClient(c.id); AG.app.rerender();
        }, 'danger'));
        item.appendChild(acts);
        list.appendChild(item);
      });
      clientsCard.body.appendChild(list);
      root.appendChild(clientsCard);

      /* --- formulário --- */
      const formCard = UI.card('Cliente', { class: 'hidden' });
      root.appendChild(formCard);

      function openForm(c) {
        formCard.classList.remove('hidden');
        formCard.body.innerHTML = '';
        const f = el('div', { class: 'form' });
        // Duas contas, dois campos. Preencha a que o cliente tem: só Google,
        // só Meta, ou as duas.
        const fields = [
          { k: 'name', label: 'Nome do cliente', ph: 'Nome que aparece no relatório' },
          { k: 'accountId', label: 'Account ID da Meta', ph: '1234567890 — deixe vazio se não houver Meta' },
          { k: 'googleId', label: 'Customer ID do Google Ads', ph: '123-456-7890 — deixe vazio se não houver Google' },
          { k: 'token', label: 'Token específico da Meta (opcional)', ph: 'deixe vazio para usar o token universal', type: 'password' },
          { k: 'pageId', label: 'Page ID do Facebook (opcional)', ph: 'para seguidores e alcance orgânico' },
          { k: 'igId', label: 'Instagram Business ID (opcional)', ph: 'para métricas do Instagram' },
        ];
        const inputs = {};
        fields.forEach((fd) => {
          const inp = el('input', { class: 'input', type: fd.type || 'text', placeholder: fd.ph, value: c[fd.k] || '' });
          inputs[fd.k] = inp;
          f.appendChild(el('label', { class: 'field' }, [el('span', { text: fd.label }), inp]));
        });
        f.appendChild(UI.note(
          'Sem Account ID da Meta, o cliente fica só com a aba Google Ads — o dashboard nem tenta ' +
          'sincronizar a Graph API. Os relatórios importados ficam guardados neste navegador por cliente ' +
          'e são atualizados a cada novo CSV que você anexar. O Customer ID do Google Ads não busca dados ' +
          'sozinho: ele identifica de qual conta são os CSVs, para você não subir o arquivo do cliente errado.', 'info'));

        const actions = el('div', { class: 'form-actions' });
        actions.appendChild(UI.button('Salvar', () => {
          const payload = { id: c.id };
          fields.forEach((fd) => { payload[fd.k] = inputs[fd.k].value.trim(); });
          // Só o nome é obrigatório. Sem Account ID o cliente é de Google Ads
          // apenas — cadastrá-lo é o que permite guardar os CSVs dele.
          if (!payload.name) { UI.toast('O nome do cliente é obrigatório.', 'error'); return; }
          // Sem nenhuma das duas contas não há de onde tirar dado nenhum.
          if (!payload.accountId && !payload.googleId) {
            UI.toast('Informe o Account ID da Meta, o Customer ID do Google Ads, ou os dois.', 'error'); return;
          }
          payload.accountId = payload.accountId.replace(/^act_/, '');
          AG.store.upsertClient(payload);
          UI.toast('Cliente salvo.');
          // Sair da demonstração ao cadastrar um cliente de verdade: continuar
          // com números sintéticos na tela depois disso só confunde. init()
          // também refaz as abas, que mudam conforme o cliente tenha Meta ou não.
          AG.app.sairDaDemonstracao();
          AG.app.init();
        }, 'primary'));
        actions.appendChild(UI.button('Cancelar', () => formCard.classList.add('hidden'), 'ghost'));
        f.appendChild(actions);
        formCard.body.appendChild(f);
      }

      /* --- globais --- */
      const g = UI.card('Configurações Globais');
      const tokenInput = el('input', { class: 'input', type: 'password', value: st.global.token, placeholder: 'Token de System User da Meta' });
      const geminiInput = el('input', { class: 'input', type: 'password', value: st.global.geminiKey, placeholder: 'AIza…' });
      const verInput = el('input', { class: 'input', type: 'text', value: st.global.apiVersion, placeholder: 'v23.0' });
      const form = el('div', { class: 'form' });
      form.appendChild(el('label', { class: 'field' }, [
        el('span', { text: 'Token Universal (System User Meta)' }), tokenInput,
        el('small', { text: 'Clientes sem token próprio usam este. Precisa das permissões ads_read e, para a aba social, pages_read_engagement e instagram_basic.' }),
      ]));
      form.appendChild(el('label', { class: 'field' }, [
        el('span', { text: 'Google Gemini API Key (opcional)' }), geminiInput,
        el('small', { text: 'Usada só para redigir o resumo da página de Insights. Os números vêm sempre do dashboard.' }),
      ]));
      form.appendChild(el('label', { class: 'field' }, [
        el('span', { text: 'Versão da Graph API' }), verInput,
        el('small', { text: 'Padrão v23.0. Só mude se a Meta descontinuar a versão.' }),
      ]));
      const ga = el('div', { class: 'form-actions' });
      ga.appendChild(UI.button('Salvar configurações', () => {
        AG.store.setGlobal({
          token: tokenInput.value.trim(),
          geminiKey: geminiInput.value.trim(),
          apiVersion: verInput.value.trim() || 'v23.0',
        });
        UI.toast('Configurações salvas.');
      }, 'primary'));
      ga.appendChild(UI.button('Exportar configuração', () =>
        U.download('dashboard-config.json', AG.store.exportConfig(), 'application/json'), 'ghost'));
      const importInput = el('input', { type: 'file', accept: '.json', class: 'file-input', id: 'cfg-import' });
      importInput.addEventListener('change', (e) => {
        const f2 = e.target.files[0]; if (!f2) return;
        const r = new FileReader();
        r.onload = () => {
          try { AG.store.importConfig(String(r.result)); UI.toast('Configuração importada.'); AG.app.rerender(); }
          catch (err) { UI.toast('JSON inválido: ' + err.message, 'error'); }
        };
        r.readAsText(f2);
      });
      ga.appendChild(el('label', { class: 'btn btn-ghost', for: 'cfg-import', text: 'Importar configuração' }));
      ga.appendChild(importInput);
      form.appendChild(ga);
      g.body.appendChild(form);
      g.body.appendChild(UI.note(
        'As credenciais ficam no localStorage deste navegador — não são enviadas para nenhum servidor além da própria Meta ' +
        'e do Google. Em computador compartilhado, use "Exportar configuração" e limpe os campos ao terminar.', 'warn'));
      root.appendChild(g);
    },
  };
})();
