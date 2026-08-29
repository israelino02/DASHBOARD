/* ============================================================
   DASHBOARD — dados de demonstração

   Conjunto sintético com a forma exata do retorno de AG.meta.fetchAll,
   para conferir o dashboard sem credenciais. Os números são plausíveis
   para um supermercado de bairro, mas são inventados — a interface
   sinaliza o modo demonstração o tempo todo.
   ============================================================ */
window.AG = window.AG || {};

AG.demo = (function () {
  const U = AG.util;

  /* PRNG com semente: a demonstração precisa ser idêntica a cada carga,
     senão comparar duas telas vira adivinhação. */
  function rng(seed) {
    let s = seed >>> 0;
    return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
  }
  const jitter = (r, base, spread) => base * (1 - spread + r() * spread * 2);

  /* Nomes propositalmente genéricos e marcados como DEMO: dado de
     demonstração nunca deve carregar o nome real de um cliente, porque
     demo.js é servido ao navegador em qualquer deploy público. */
  const CAMPAIGNS = [
    { id: 'c1', name: '[DEMO] WhatsApp | Reativação de Clientes', objective: 'OUTCOME_ENGAGEMENT', share: 0.295 },
    { id: 'c2', name: '[DEMO] WhatsApp | Conversas pelo Feed', objective: 'OUTCOME_ENGAGEMENT', share: 0.297 },
    { id: 'c3', name: '[DEMO] Feed | Engajamento', objective: 'OUTCOME_ENGAGEMENT', share: 0.101 },
    { id: 'c4', name: '[DEMO] Cadastro no Aplicativo', objective: 'OUTCOME_LEADS', share: 0.095 },
    { id: 'c5', name: '[DEMO] Reconhecimento de Marca', objective: 'OUTCOME_AWARENESS', share: 0.069 },
    { id: 'c6', name: '[DEMO] Tráfego para o Instagram', objective: 'OUTCOME_TRAFFIC', share: 0.143 },
  ];

  const PLACEMENTS = [
    { p: 'instagram', pos: 'reels', w: 0.28 }, { p: 'instagram', pos: 'feed', w: 0.22 },
    { p: 'instagram', pos: 'story', w: 0.14 }, { p: 'facebook', pos: 'feed', w: 0.18 },
    { p: 'facebook', pos: 'video_feeds', w: 0.06 }, { p: 'facebook', pos: 'marketplace', w: 0.05 },
    { p: 'instagram', pos: 'explore', w: 0.04 }, { p: 'audience_network', pos: 'classic', w: 0.03 },
  ];
  const AGES = ['18-24', '25-34', '35-44', '45-54', '55-64', '65+'];
  const AGE_W = [0.12, 0.29, 0.24, 0.18, 0.11, 0.06];
  const GENDERS = [{ g: 'female', w: 0.61 }, { g: 'male', w: 0.36 }, { g: 'unknown', w: 0.03 }];
  const REGIONS = [
    { name: 'Ceará', w: 0.46 }, { name: 'Pernambuco', w: 0.14 }, { name: 'Piauí', w: 0.11 },
    { name: 'Rio Grande do Norte', w: 0.09 }, { name: 'Paraíba', w: 0.08 },
    { name: 'Maranhão', w: 0.06 }, { name: 'Bahia', w: 0.06 },
  ];
  const DEVICES = [
    { d: 'android_smartphone', w: 0.58 }, { d: 'iphone', w: 0.31 },
    { d: 'desktop', w: 0.07 }, { d: 'ipad', w: 0.02 }, { d: 'android_tablet', w: 0.02 },
  ];

  /** Monta uma linha já no formato normalizado que as páginas consomem. */
  function row(o) {
    const spend = o.spend, impressions = o.impressions, clicks = o.clicks;
    return Object.assign({
      spend, impressions, clicks,
      reach: o.reach ?? Math.round(impressions / (o.freq || 1.62)),
      frequency: o.freq || 1.62,
      linkClicks: o.linkClicks ?? Math.round(clicks * 0.42),
      ctr: U.safeDiv(clicks, impressions) * 100,
      linkCtr: U.safeDiv(o.linkClicks ?? clicks * 0.42, impressions) * 100,
      cpc: U.safeDiv(spend, clicks),
      cpm: U.safeDiv(spend, impressions) * 1000,
      messaging: o.messaging || 0, leads: o.leads || 0, landing: o.landing || 0,
      purchases: o.purchases || 0, revenue: o.revenue || 0,
      roas: U.safeDiv(o.revenue || 0, spend),
      postEngagement: o.postEngagement ?? Math.round(clicks * 0.55),
      pageEngagement: o.pageEngagement ?? Math.round(clicks * 0.62),
      videoViews: o.videoViews ?? Math.round(impressions * 0.11),
      profileVisits: o.profileVisits ?? Math.round(clicks * 0.09),
      likes: o.likes ?? Math.round(clicks * 0.04),
      appInstalls: 0, thruplays: Math.round(impressions * 0.03),
    }, o.extra || {});
  }

  /** Divide um total entre pesos, com ruído leve para não parecer tabela. */
  function split(total, weights, r) {
    const noisy = weights.map((w) => w * jitter(r, 1, 0.12));
    const s = noisy.reduce((a, b) => a + b, 0);
    return noisy.map((w) => (w / s) * total);
  }

  function build(range) {
    const r = rng(20260818);
    const days = U.daysBetween(range.since, range.until);
    const prev = U.previousRange(range);

    /* Base da conta: escala com o número de dias do período. */
    const perDay = { spend: 105.2, impressions: 19920, clicks: 373, messaging: 33, leads: 3.4, purchases: 1.15, revenue: 168 };
    const scale = (k, mult) => perDay[k] * days * (mult == null ? 1 : mult);

    const mkDaily = (rg, mult) => {
      const out = [];
      const n = U.daysBetween(rg.since, rg.until);
      for (let i = 0; i < n; i++) {
        const date = U.iso(U.addDays(U.parseISO(rg.since), i));
        const wave = 0.82 + 0.32 * Math.sin((i / Math.max(1, n - 1)) * Math.PI * 1.6);
        const f = wave * jitter(r, 1, 0.16) * mult;
        const impressions = Math.round(perDay.impressions * f);
        const clicks = Math.round(perDay.clicks * f * jitter(r, 1, 0.1));
        const purchases = Math.round(perDay.purchases * f * jitter(r, 1, 0.5));
        out.push(Object.assign(row({
          spend: +(perDay.spend * f).toFixed(2), impressions, clicks,
          messaging: Math.round(perDay.messaging * f * jitter(r, 1, 0.2)),
          leads: Math.round(perDay.leads * f * jitter(r, 1, 0.4)),
          purchases,
          revenue: +(purchases * jitter(r, 146, 0.25)).toFixed(2),
        }), { date, dateStop: date }));
      }
      return out;
    };

    const daily = mkDaily(range, 1);
    const dailyPrev = mkDaily(prev, 0.9);

    const agg = (rows) => row({
      spend: +U.sum(rows, (x) => x.spend).toFixed(2),
      impressions: U.sum(rows, (x) => x.impressions),
      clicks: U.sum(rows, (x) => x.clicks),
      reach: Math.round(U.sum(rows, (x) => x.impressions) / 1.62),
      messaging: U.sum(rows, (x) => x.messaging),
      leads: U.sum(rows, (x) => x.leads),
      purchases: U.sum(rows, (x) => x.purchases),
      revenue: +U.sum(rows, (x) => x.revenue).toFixed(2),
    });

    const totals = agg(daily), totalsPrev = agg(dailyPrev);

    /* Campanhas */
    const campSpend = split(totals.spend, CAMPAIGNS.map((c) => c.share), r);
    const campaigns = CAMPAIGNS.map((c, i) => {
      const spend = campSpend[i];
      const f = spend / totals.spend;
      const isAware = /AWARENESS/.test(c.objective);
      const impressions = Math.round(totals.impressions * f * (isAware ? 2.4 : 0.9));
      const clicks = Math.round(totals.clicks * f * (isAware ? 0.16 : 1.1));
      return Object.assign(row({
        spend: +spend.toFixed(2), impressions, clicks,
        freq: +jitter(r, isAware ? 1.54 : 1.78, 0.14).toFixed(2),
        messaging: /ENGAGEMENT/.test(c.objective) ? Math.round(totals.messaging * f * 1.25) : 0,
        leads: /LEADS/.test(c.objective) ? Math.round(totals.leads * f * 6.2) : 0,
        landing: /LEADS/.test(c.objective) ? Math.round(clicks * 0.62) : 0,
        purchases: /LEADS|TRAFFIC/.test(c.objective) ? Math.round(totals.purchases * f * 2.1) : 0,
        revenue: /LEADS|TRAFFIC/.test(c.objective) ? +(totals.revenue * f * 2.1).toFixed(2) : 0,
      }), { campaignId: c.id, campaignName: c.name, objective: c.objective });
    });

    /* Anúncios: 3 por campanha */
    const FORMATS = ['Vídeo', 'Imagem', 'Carrossel'];
    const ads = [];
    const creatives = {};
    campaigns.forEach((c, ci) => {
      const parts = split(c.spend, [0.48, 0.33, 0.19], r);
      parts.forEach((sp, ai) => {
        const id = `a${ci + 1}${ai + 1}`;
        const f = sp / c.spend;
        // um anúncio propositalmente ruim, para a página de destaques ter o que mostrar
        const dud = ci === 2 && ai === 2;
        ads.push(Object.assign(row({
          spend: +sp.toFixed(2),
          impressions: Math.round(c.impressions * f),
          clicks: Math.round(c.clicks * f * (dud ? 0.35 : jitter(r, 1, 0.25))),
          freq: +jitter(r, c.frequency, 0.1).toFixed(2),
          messaging: dud ? 0 : Math.round(c.messaging * f * jitter(r, 1, 0.3)),
          leads: dud ? 0 : Math.round(c.leads * f),
          landing: Math.round(c.landing * f),
          purchases: dud ? 0 : Math.round(c.purchases * f),
          revenue: dud ? 0 : +(c.revenue * f).toFixed(2),
        }), {
          adId: id, adName: `${c.campaignName.slice(0, 22)} — peça ${ai + 1}`,
          campaignId: c.campaignId, campaignName: c.campaignName, objective: c.objective,
        }));
        creatives[id] = { id, name: 'peça ' + (ai + 1), status: 'ACTIVE', thumb: null, format: FORMATS[ai % 3] };
      });
    });

    /* Breakdowns */
    const mkBreak = (defs, weightKey, assign) => {
      const spends = split(totals.spend, defs.map((d) => d[weightKey]), r);
      return defs.map((d, i) => {
        const f = spends[i] / totals.spend;
        const eff = jitter(r, 1, 0.35);
        return Object.assign(row({
          spend: +spends[i].toFixed(2),
          impressions: Math.round(totals.impressions * f * jitter(r, 1, 0.2)),
          clicks: Math.round(totals.clicks * f * eff),
          messaging: Math.round(totals.messaging * f * eff),
          leads: Math.round(totals.leads * f * eff),
          purchases: Math.round(totals.purchases * f * eff),
          revenue: +(totals.revenue * f * eff).toFixed(2),
        }), assign(d));
      });
    };

    const platform = mkBreak(PLACEMENTS, 'w', (d) =>
      ({ publisherPlatform: d.p, platformPosition: d.pos, objective: 'OUTCOME_ENGAGEMENT' }));
    const device = mkBreak(DEVICES, 'w', (d) => ({ device: d.d, objective: 'OUTCOME_ENGAGEMENT' }));
    const region = mkBreak(REGIONS, 'w', (d) => ({ region: d.name, country: 'BR', objective: 'OUTCOME_ENGAGEMENT' }));

    const demoCells = [];
    GENDERS.forEach((g) => AGES.forEach((a, ai) => demoCells.push({ g: g.g, a, w: g.w * AGE_W[ai] })));
    const ageGender = mkBreak(demoCells, 'w', (d) => ({ age: d.a, gender: d.g, objective: 'OUTCOME_ENGAGEMENT' }));

    /* Social */
    const fanAdds = daily.map((d) => ({ end_time: d.date + 'T07:00:00+0000', value: Math.round(jitter(r, 34, 0.5)) }));
    const social = {
      page: [{ name: 'page_fan_adds', period: 'day', values: fanAdds }],
      ig: {
        profile: { followers_count: 18422, username: 'demonstracao' },
        series: [
          { name: 'reach', values: daily.map((d) => ({ end_time: d.date, value: Math.round(jitter(r, 9400, 0.3)) })) },
          { name: 'profile_views', values: daily.map((d) => ({ end_time: d.date, value: Math.round(jitter(r, 410, 0.4)) })) },
          { name: 'website_clicks', values: daily.map((d) => ({ end_time: d.date, value: Math.round(jitter(r, 62, 0.5)) })) },
        ],
      },
      errors: [],
    };

    return {
      demo: true, fetchedAt: Date.now(), errors: [],
      client: { id: '__demo__', name: 'Cliente Demonstração', accountId: '000000000000000', pageId: 'demo', igId: 'demo' },
      range, prev,
      totals, totalsPrev, daily, dailyPrev,
      campaigns, ads, platform, device, ageGender, region, creatives, social,
    };
  }

  return { build };
})();
