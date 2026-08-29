/* ============================================================
   DASHBOARD — motor de insights automáticos

   Regras determinísticas sobre os dados já carregados: comparam o
   período atual com o anterior de mesma duração e leem os breakdowns
   procurando o que de fato muda uma decisão de mídia.

   Cada insight sai com severidade (good / warning / critical / neutral),
   e a interface sempre mostra ícone + rótulo junto da cor — cor sozinha
   nunca carrega o significado.
   ============================================================ */
window.AG = window.AG || {};

AG.insights = (function () {
  const U = AG.util;
  const M = AG.meta;

  const MIN_SPEND = 20;        // abaixo disso o recorte não tem massa para conclusão
  const MIN_RESULTS = 5;

  /* ---------- agregação genérica de linhas ---------- */
  function agg(rows) {
    const spend = U.sum(rows, (r) => r.spend);
    const impressions = U.sum(rows, (r) => r.impressions);
    const clicks = U.sum(rows, (r) => r.clicks);
    const linkClicks = U.sum(rows, (r) => r.linkClicks);
    const reach = U.sum(rows, (r) => r.reach);
    const revenue = U.sum(rows, (r) => r.revenue);
    const purchases = U.sum(rows, (r) => r.purchases);
    const messaging = U.sum(rows, (r) => r.messaging);
    const leads = U.sum(rows, (r) => r.leads);
    const results = U.sum(rows, (r) => M.resultOf(r).value);
    return {
      rows, spend, impressions, clicks, linkClicks, reach, revenue, purchases, messaging, leads, results,
      ctr: U.safeDiv(clicks, impressions) * 100,
      cpc: U.safeDiv(spend, clicks),
      cpm: U.safeDiv(spend, impressions) * 1000,
      cpr: U.safeDiv(spend, results),
      roas: U.safeDiv(revenue, spend),
      frequency: U.safeDiv(impressions, reach),
    };
  }

  /** Agrupa por uma chave e devolve os agregados ordenados por investimento. */
  function groupBy(rows, keyFn, labelFn) {
    const map = new Map();
    (rows || []).forEach((r) => {
      const k = keyFn(r);
      if (k == null || k === '') return;
      if (!map.has(k)) map.set(k, []);
      map.get(k).push(r);
    });
    return Array.from(map.entries())
      .map(([k, rs]) => Object.assign({ key: k, label: labelFn ? labelFn(k, rs) : k }, agg(rs)))
      .sort(U.byDesc((g) => g.spend));
  }

  const ins = (severity, icon, title, detail, extra) =>
    Object.assign({ severity, icon, title, detail }, extra || {});

  /** Só compara recortes com massa suficiente para a conclusão valer. */
  const material = (g) => g.spend >= MIN_SPEND && g.results >= MIN_RESULTS;

  /* ---------- as regras ---------- */
  function build(data) {
    if (!data || !data.totals) return [];
    const out = [];
    const cur = data.totals, prev = data.totalsPrev;
    const curResults = U.sum(data.campaigns, (r) => M.resultOf(r).value);
    const prevAgg = prev ? agg([prev]) : null;

    const days = U.daysBetween(data.range.since, data.range.until);
    const periodo = `${days} dia${days > 1 ? 's' : ''}`;

    /* — variações período a período — */
    const deltas = [
      { key: 'roas', label: 'ROAS', get: (t) => U.num(t.roas), fmt: U.fmt.roas, higherIsBetter: true, skipIfZero: true },
      { key: 'cpc',  label: 'CPC',  get: (t) => U.num(t.cpc),  fmt: U.fmt.money, higherIsBetter: false },
      { key: 'ctr',  label: 'CTR',  get: (t) => U.num(t.ctr),  fmt: (v) => U.fmt.pct(v), higherIsBetter: true },
      { key: 'cpm',  label: 'CPM',  get: (t) => U.num(t.cpm),  fmt: U.fmt.money, higherIsBetter: false },
      { key: 'spend',label: 'Investimento', get: (t) => U.num(t.spend), fmt: U.fmt.money, higherIsBetter: null },
    ];

    if (prev) {
      deltas.forEach((d) => {
        const c = d.get(cur), p = d.get(prev);
        if (d.skipIfZero && (!c && !p)) return;
        const ch = U.pctChange(c, p);
        if (ch == null || Math.abs(ch) < 5) return;      // ruído: abaixo de 5% não é notícia
        const better = d.higherIsBetter == null ? null : (d.higherIsBetter ? ch > 0 : ch < 0);
        out.push(ins(
          better == null ? 'neutral' : better ? 'good' : 'warning',
          ch > 0 ? '▲' : '▼',
          `${d.label} ${ch > 0 ? 'subiu' : 'caiu'} ${U.fmt.pct(Math.abs(ch), 1)}`,
          `${d.fmt(c)} nos últimos ${periodo}, contra ${d.fmt(p)} no período anterior.`,
          { metric: d.key, change: ch }
        ));
      });
    }

    /* — retorno por real investido — */
    if (U.num(cur.revenue) > 0) {
      const roas = U.safeDiv(cur.revenue, cur.spend);
      out.push(ins(roas >= 1 ? 'good' : 'critical', roas >= 1 ? '◆' : '!',
        `Cada R$ 1 investido retornou ${U.fmt.money(roas).replace('R$ ', 'R$ ')}`,
        `${U.fmt.money(cur.revenue)} de receita sobre ${U.fmt.money(cur.spend)} investidos (ROAS ${U.fmt.roas(roas)}).`,
        { metric: 'roas' }));
    } else {
      out.push(ins('neutral', 'i', 'Sem valor de conversão registrado no período',
        'A conta não devolveu receita via pixel/CAPI, então ROAS e receita ficam zerados. ' +
        'Campanhas de mensagem só passam a ter ROAS quando a compra é rastreada.',
        { metric: 'roas' }));
    }

    /* — posicionamento campeão — */
    const positions = groupBy(data.platform,
      (r) => `${r.publisherPlatform || '?'} · ${r.platformPosition || '?'}`).filter(material);
    if (positions.length >= 2) {
      const best = positions.slice().sort(U.byAsc((g) => g.cpr))[0];
      const share = U.safeDiv(best.results, U.sum(positions, (g) => g.results)) * 100;
      out.push(ins('good', '◆', `${prettyPlacement(best.key)} entregou o menor custo por resultado`,
        `${U.fmt.money(best.cpr)} por resultado e ${U.fmt.pct(share, 0)} de todos os resultados do período.`,
        { metric: 'placement' }));

      const worst = positions.slice().sort(U.byDesc((g) => g.cpr))[0];
      if (worst.key !== best.key && worst.cpr > best.cpr * 2) {
        out.push(ins('warning', '▼', `${prettyPlacement(worst.key)} está custando ${U.fmt.dec(U.safeDiv(worst.cpr, best.cpr))}x mais caro`,
          `${U.fmt.money(worst.cpr)} por resultado com ${U.fmt.money(worst.spend)} investidos. Vale isolar ou cortar esse posicionamento.`,
          { metric: 'placement' }));
      }
    }

    /* — público — */
    const demo = groupBy(data.ageGender, (r) => `${r.gender || '?'}|${r.age || '?'}`).filter(material);
    if (demo.length >= 2) {
      const best = demo.slice().sort(U.byAsc((g) => g.cpr))[0];
      const [g, a] = best.key.split('|');
      out.push(ins('good', '◆', `${prettyGender(g)} de ${a} anos é o recorte mais eficiente`,
        `${U.fmt.money(best.cpr)} por resultado, com ${U.fmt.int(best.results)} resultados sobre ${U.fmt.money(best.spend)}.`,
        { metric: 'audience' }));
    }

    /* — localização — */
    const regions = groupBy(data.region, (r) => r.region).filter(material);
    if (regions.length >= 2) {
      const best = regions.slice().sort(U.byAsc((g) => g.cpr))[0];
      out.push(ins('good', '◆', `${best.key} apresentou o menor custo por resultado`,
        `${U.fmt.money(best.cpr)} por resultado em ${U.fmt.int(best.results)} resultados.`,
        { metric: 'region' }));
    }

    /* — melhor e pior anúncio — */
    const ads = (data.ads || []).map((r) => Object.assign({}, r, { result: M.resultOf(r).value }))
      .filter((r) => r.spend >= MIN_SPEND);
    if (ads.length >= 2) {
      const withRes = ads.filter((r) => r.result > 0);
      if (withRes.length) {
        const best = withRes.slice().sort(U.byAsc((r) => U.safeDiv(r.spend, r.result)))[0];
        out.push(ins('good', '★', `Melhor anúncio: ${best.adName || best.adId}`,
          `${U.fmt.money(U.safeDiv(best.spend, best.result))} por resultado, CTR ${U.fmt.pct(best.ctr)}.`,
          { metric: 'ad', adId: best.adId }));
      }
      const dead = ads.filter((r) => r.result === 0).sort(U.byDesc((r) => r.spend))[0];
      if (dead && dead.spend >= MIN_SPEND * 2) {
        out.push(ins('critical', '!', `${dead.adName || dead.adId} gastou sem gerar resultado`,
          `${U.fmt.money(dead.spend)} investidos e nenhum resultado no objetivo da campanha. Candidato imediato a pausa.`,
          { metric: 'ad', adId: dead.adId }));
      }
    }

    /* — fadiga de criativo — */
    const fatigued = (data.campaigns || []).filter((c) => c.frequency >= 3 && c.spend >= MIN_SPEND)
      .sort(U.byDesc((c) => c.frequency));
    if (fatigued.length) {
      const f = fatigued[0];
      out.push(ins('warning', '▲', `Frequência alta em ${f.campaignName || 'campanha'}`,
        `${U.fmt.dec(f.frequency)} exibições por pessoa. Acima de 3 o criativo satura e o CPM sobe — hora de renovar.`,
        { metric: 'frequency' }));
    }

    /* — concentração de verba — */
    const camps = groupBy(data.campaigns, (r) => r.campaignName || r.campaignId);
    if (camps.length >= 3) {
      const top = camps[0];
      const share = U.safeDiv(top.spend, cur.spend) * 100;
      if (share >= 50) {
        out.push(ins('neutral', 'i', `${U.fmt.pct(share, 0)} da verba está em uma única campanha`,
          `"${top.label}" concentra ${U.fmt.money(top.spend)} de ${U.fmt.money(cur.spend)}. Concentração acelera o aprendizado, mas reduz a margem de teste.`,
          { metric: 'budget' }));
      }
    }

    /* — dispositivo — */
    const devices = groupBy(data.device, (r) => r.device).filter(material);
    if (devices.length >= 2) {
      const best = devices.slice().sort(U.byAsc((g) => g.cpr))[0];
      out.push(ins('neutral', 'i', `${prettyDevice(best.key)} lidera em eficiência`,
        `${U.fmt.money(best.cpr)} por resultado contra ${U.fmt.money(devices.slice().sort(U.byDesc((g) => g.cpr))[0].cpr)} do pior dispositivo.`,
        { metric: 'device' }));
    }

    const order = { critical: 0, warning: 1, good: 2, neutral: 3 };
    return out.sort((a, b) => order[a.severity] - order[b.severity]);
  }

  /* ---------- rótulos legíveis ---------- */
  const PLACEMENT_PT = {
    facebook: 'Facebook', instagram: 'Instagram', audience_network: 'Audience Network',
    messenger: 'Messenger', threads: 'Threads', unknown: 'Não identificado',
    feed: 'Feed', story: 'Stories', reels: 'Reels', explore: 'Explorar',
    instagram_reels: 'Reels', instagram_stories: 'Stories', instagram_explore: 'Explorar',
    facebook_reels: 'Reels', marketplace: 'Marketplace', video_feeds: 'Feed de vídeo',
    search: 'Busca', instream_video: 'Vídeo in-stream', right_hand_column: 'Coluna da direita',
    profile_feed: 'Feed do perfil', biz_disco_feed: 'Descoberta', an_classic: 'Audience Network',
    rewarded_video: 'Vídeo premiado', ig_search: 'Busca do Instagram',
  };
  const pretty = (s) => PLACEMENT_PT[String(s || '').toLowerCase()] ||
    String(s || '').replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
  const prettyPlacement = (key) => String(key).split(' · ').map(pretty).join(' · ');
  const prettyGender = (g) => ({ male: 'Homens', female: 'Mulheres', unknown: 'Não informado' }[String(g).toLowerCase()] || 'Não informado');
  const prettyDevice = (d) => ({
    desktop: 'Desktop', iphone: 'iPhone', ipad: 'iPad', android_smartphone: 'Android',
    android_tablet: 'Tablet Android', ipod: 'iPod', other: 'Outros', unknown: 'Não identificado',
  }[String(d).toLowerCase()] || pretty(d));

  /* ---------- narrativa opcional via Gemini ---------- */
  /** Recebe os insights já calculados e pede ao Gemini um parágrafo de
   *  leitura para o cliente. Os números continuam vindo do dashboard —
   *  o modelo só redige. Sem chave configurada, a função não é chamada. */
  async function narrate(data, list) {
    const key = AG.store.get().global.geminiKey;
    if (!key) throw new Error('Configure a Google Gemini API Key em Integração API.');
    const t = data.totals || {};
    const resumo = {
      periodo: `${U.brDateFull(data.range.since)} a ${U.brDateFull(data.range.until)}`,
      investimento: U.fmt.money(t.spend), impressoes: U.fmt.int(t.impressions),
      alcance: U.fmt.int(t.reach), cliques: U.fmt.int(t.clicks),
      ctr: U.fmt.pct(t.ctr), cpc: U.fmt.money(t.cpc), cpm: U.fmt.money(t.cpm),
      receita: U.fmt.money(t.revenue), roas: U.fmt.roas(t.roas),
      insights: list.map((i) => `${i.title} — ${i.detail}`),
    };
    const prompt =
      'Você é analista de tráfego pago sênior. Escreva um resumo executivo em português do Brasil, ' +
      'para o dono de um negócio local que não entende de métricas. Máximo 4 parágrafos curtos. ' +
      'Use apenas os números fornecidos, sem inventar nenhum. Comece pelo resultado financeiro, ' +
      'depois o que funcionou, depois o que precisa de ajuste. Sem markdown, sem títulos.\n\n' +
      JSON.stringify(resumo, null, 2);

    const url = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=' + encodeURIComponent(key);
    const res = await fetch(url, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok || json.error) throw new Error(json.error?.message || ('HTTP ' + res.status));
    const txt = json.candidates?.[0]?.content?.parts?.map((p) => p.text).join('') || '';
    if (!txt) throw new Error('O modelo não retornou texto.');
    return txt.trim();
  }

  return { build, agg, groupBy, narrate, pretty, prettyPlacement, prettyGender, prettyDevice };
})();
