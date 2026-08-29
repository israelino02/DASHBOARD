/* ============================================================
   DASHBOARD — cliente da Meta Marketing API (Graph)

   Tudo roda no navegador com um token de System User guardado
   localmente. Cada bloco de dados é buscado de forma independente:
   se um breakdown falhar (permissão, conta sem dados), o resto do
   dashboard continua carregando e o erro aparece na aba de status.
   ============================================================ */
window.AG = window.AG || {};

AG.meta = (function () {
  const U = AG.util;

  const BASE = 'https://graph.facebook.com/';
  const version = () => AG.store.get().global.apiVersion || 'v23.0';

  /** Modo proxy: a página do cliente não tem token. As chamadas vão para a
   *  função servidor, que guarda o token e só libera os nós daquele cliente.
   *  Definido por client-mode.js; ausente no console do operador. */
  const proxy = () => (typeof window !== 'undefined' && window.AG_PROXY) || null;

  /* ---------- mapeamento de action_type ---------- */
  const ACT = {
    messaging: ['onsite_conversion.messaging_conversation_started_7d', 'onsite_conversion.messaging_first_reply'],
    linkClick: ['link_click'],
    landingPage: ['landing_page_view'],
    lead: ['offsite_conversion.fb_pixel_lead', 'lead', 'onsite_conversion.lead_grouped'],
    purchase: ['omni_purchase', 'offsite_conversion.fb_pixel_purchase', 'purchase'],
    postEngagement: ['post_engagement'],
    pageEngagement: ['page_engagement'],
    videoView: ['video_view'],
    appInstall: ['omni_app_install', 'mobile_app_install'],
    profileVisit: ['onsite_conversion.ig_profile_visit'],
    like: ['like'],
  };

  /** Primeiro action_type encontrado na ordem de prioridade da lista.
   *  A ordem importa: 'omni_purchase' antes de 'purchase' evita contar
   *  a mesma compra duas vezes em contas com pixel + CAPI. */
  function pick(actions, keys) {
    if (!Array.isArray(actions)) return 0;
    for (const k of keys) {
      const hit = actions.find((a) => a.action_type === k);
      if (hit) return U.num(hit.value);
    }
    return 0;
  }

  /** Normaliza uma linha crua de /insights para o formato do dashboard. */
  function normalize(row) {
    const a = row.actions, av = row.action_values;
    const spend = U.num(row.spend);
    const impressions = U.num(row.impressions);
    const clicks = U.num(row.clicks);
    const linkClicks = U.num(row.inline_link_clicks) || pick(a, ACT.linkClick);
    const messaging = pick(a, ACT.messaging);
    const leads = pick(a, ACT.lead);
    const landing = pick(a, ACT.landingPage);
    const purchases = pick(a, ACT.purchase);
    const revenue = pick(av, ACT.purchase);
    const roasRow = Array.isArray(row.purchase_roas) ? U.num(row.purchase_roas[0]?.value) : 0;

    return {
      raw: row,
      date: row.date_start,
      dateStop: row.date_stop,
      campaignId: row.campaign_id, campaignName: row.campaign_name,
      adsetId: row.adset_id, adsetName: row.adset_name,
      adId: row.ad_id, adName: row.ad_name,
      objective: row.objective || '',
      spend,
      impressions,
      reach: U.num(row.reach),
      frequency: U.num(row.frequency),
      clicks,
      linkClicks,
      ctr: U.num(row.ctr),
      linkCtr: U.num(row.inline_link_click_ctr),
      cpc: U.num(row.cpc),
      cpm: U.num(row.cpm),
      messaging, leads, landing, purchases,
      revenue,
      // ROAS preferencialmente da própria Meta; se vier zerado mas houver
      // valor de conversão, recalcula para não perder o dado.
      roas: roasRow || U.safeDiv(revenue, spend),
      postEngagement: pick(a, ACT.postEngagement),
      pageEngagement: pick(a, ACT.pageEngagement),
      videoViews: pick(a, ACT.videoView),
      profileVisits: pick(a, ACT.profileVisit),
      likes: pick(a, ACT.like),
      appInstalls: pick(a, ACT.appInstall),
      thruplays: Array.isArray(row.video_thruplay_watched_actions)
        ? U.num(row.video_thruplay_watched_actions[0]?.value) : 0,
      qualityRanking: row.quality_ranking,
      engagementRanking: row.engagement_rate_ranking,
      conversionRanking: row.conversion_rate_ranking,
      // dimensões de breakdown (presentes só quando pedidas)
      publisherPlatform: row.publisher_platform,
      platformPosition: row.platform_position,
      device: row.impression_device,
      age: row.age, gender: row.gender,
      region: row.region, country: row.country,
    };
  }

  /** Objetivo da campanha → qual métrica conta como "resultado". */
  function resultMetric(objective) {
    const o = String(objective || '').toUpperCase();
    if (/AWARENESS|REACH/.test(o))       return { key: 'reach',      label: 'Pessoas Alcançadas' };
    if (/TRAFFIC|LINK_CLICKS/.test(o))   return { key: 'linkClicks', label: 'Cliques no Link' };
    if (/SALES|CATALOG|CONVERSIONS/.test(o)) return { key: 'purchases', label: 'Compras' };
    if (/LEAD/.test(o))                  return { key: 'leads',      label: 'Leads' };
    if (/APP/.test(o))                   return { key: 'appInstalls', label: 'Instalações' };
    if (/ENGAGEMENT|MESSAGES|POST/.test(o)) return { key: 'messaging', label: 'Conversas Iniciadas' };
    return { key: 'linkClicks', label: 'Cliques no Link' };
  }

  /** Resultado de uma linha respeitando o objetivo, com fallback:
   *  campanhas de engajamento sem conversas caem para engajamento de post. */
  function resultOf(row) {
    const m = resultMetric(row.objective);
    let v = U.num(row[m.key]);
    let label = m.label;
    if (m.key === 'messaging' && v === 0 && row.postEngagement > 0) {
      v = row.postEngagement; label = 'Engajamentos';
    }
    if (m.key === 'leads' && v === 0 && row.landing > 0) {
      v = row.landing; label = 'Visitas à LP';
    }
    return { value: v, label };
  }

  /* ---------- transporte ---------- */
  const FIELDS = [
    'spend', 'impressions', 'reach', 'frequency', 'clicks', 'inline_link_clicks',
    'ctr', 'inline_link_click_ctr', 'cpc', 'cpm', 'actions', 'action_values',
    'purchase_roas', 'objective',
  ].join(',');

  const FIELDS_ENTITY = FIELDS + ',campaign_id,campaign_name,adset_id,adset_name,ad_id,ad_name,' +
    'video_thruplay_watched_actions,quality_ranking,engagement_rate_ranking,conversion_rate_ranking';

  class MetaError extends Error {
    constructor(msg, detail) { super(msg); this.name = 'MetaError'; this.detail = detail; }
  }

  async function call(path, params, token) {
    const P = proxy();
    const url = P
      ? P.base + '?' + new URLSearchParams({
          slug: P.slug, key: P.key, path, params: JSON.stringify(params || {}),
        }).toString()
      : BASE + version() + '/' + path + '?' +
        new URLSearchParams(Object.assign({ access_token: token }, params)).toString();
    let res;
    try {
      res = await fetch(url);
    } catch (e) {
      throw new MetaError(proxy()
        ? 'Não consegui falar com o servidor do relatório. Verifique a conexão e recarregue a página.'
        : 'Falha de rede ao chamar a Graph API. Se estiver abrindo o arquivo direto (file://), ' +
          'sirva a pasta por HTTP — veja o README.', e.message);
    }
    const json = await res.json().catch(() => ({}));
    if (!res.ok || json.error) {
      const err = json.error || {};
      throw new MetaError(err.message || ('HTTP ' + res.status), err);
    }
    return json;
  }

  /** Percorre a paginação até o fim (teto de segurança para não travar o navegador).
   *  No modo proxy o servidor já resolveu as páginas — e precisa resolver, porque
   *  a URL de `paging.next` que a Meta devolve carrega o access_token dentro. */
  async function callPaged(path, params, token, maxPages) {
    let out = [], page = 0;
    let json = await call(path, params, token);
    out = out.concat(json.data || []);
    if (proxy()) return out;
    let next = json.paging && json.paging.next;
    while (next && page < (maxPages || 12)) {
      const res = await fetch(next);
      const j = await res.json().catch(() => ({}));
      if (j.error) break;
      out = out.concat(j.data || []);
      next = j.paging && j.paging.next;
      page++;
    }
    return out;
  }

  const timeRange = (r) => JSON.stringify({ since: r.since, until: r.until });

  function insightsParams(range, extra) {
    return Object.assign({
      time_range: timeRange(range),
      fields: FIELDS_ENTITY,
      limit: 500,
      action_report_time: 'conversion',
      use_unified_attribution_setting: 'true',
    }, extra || {});
  }

  const acct = (id) => 'act_' + String(id).replace(/^act_/, '');

  /* ---------- blocos de dados ---------- */
  async function accountTotals(id, token, range) {
    const rows = await callPaged(acct(id) + '/insights',
      insightsParams(range, { level: 'account', fields: FIELDS }), token);
    return rows.map(normalize)[0] || null;
  }

  async function daily(id, token, range) {
    const rows = await callPaged(acct(id) + '/insights',
      insightsParams(range, { level: 'account', fields: FIELDS, time_increment: 1 }), token);
    return rows.map(normalize).sort((a, b) => (a.date < b.date ? -1 : 1));
  }

  async function byLevel(id, token, range, level) {
    const rows = await callPaged(acct(id) + '/insights',
      insightsParams(range, { level }), token);
    return rows.map(normalize);
  }

  async function byBreakdown(id, token, range, breakdowns, level) {
    const rows = await callPaged(acct(id) + '/insights',
      insightsParams(range, { level: level || 'account', fields: FIELDS, breakdowns }), token);
    return rows.map(normalize);
  }

  /** Criativos dos anúncios: miniatura + formato inferido.
   *  A Meta não expõe um campo "formato" direto, então classificamos por
   *  vídeo / carrossel (child_attachments) / imagem — e a página avisa
   *  que a classificação é inferida. */
  async function creatives(id, token) {
    const rows = await callPaged(acct(id) + '/ads', {
      fields: 'id,name,status,effective_status,creative{id,thumbnail_url,image_url,video_id,object_type,object_story_spec,asset_feed_spec}',
      limit: 300,
    }, token);
    const map = {};
    rows.forEach((ad) => {
      const cr = ad.creative || {};
      const spec = cr.object_story_spec || {};
      const link = spec.link_data || {};
      const video = spec.video_data || {};
      const feed = cr.asset_feed_spec || {};
      let format = 'Imagem';
      if (cr.video_id || video.video_id || (feed.videos && feed.videos.length)) format = 'Vídeo';
      else if ((link.child_attachments && link.child_attachments.length > 1)) format = 'Carrossel';
      else if (cr.object_type === 'SHARE' && !cr.image_url && !cr.thumbnail_url) format = 'Outro';
      map[ad.id] = {
        id: ad.id, name: ad.name, status: ad.effective_status || ad.status,
        thumb: cr.thumbnail_url || cr.image_url || null,
        format,
      };
    });
    return map;
  }

  /** Crescimento social. Depende de Page ID / IG ID configurados e de
   *  permissões extras no token (pages_read_engagement, instagram_basic).
   *  Falha aqui não derruba o resto do dashboard. */
  async function social(client, token, range) {
    const out = { page: null, ig: null, errors: [] };
    if (client.pageId) {
      try {
        const j = await call(client.pageId + '/insights', {
          metric: 'page_fan_adds,page_fans,page_impressions_unique,page_post_engagements',
          period: 'day', since: range.since, until: range.until,
        }, token);
        out.page = j.data || [];
      } catch (e) { out.errors.push('Página: ' + e.message); }
    }
    if (client.igId) {
      try {
        const prof = await call(client.igId, { fields: 'followers_count,username' }, token);
        let series = [];
        try {
          const j = await call(client.igId + '/insights', {
            metric: 'reach,profile_views,website_clicks', period: 'day',
            since: range.since, until: range.until,
          }, token);
          series = j.data || [];
        } catch (e) { out.errors.push('Instagram (métricas diárias): ' + e.message); }
        out.ig = { profile: prof, series };
      } catch (e) { out.errors.push('Instagram: ' + e.message); }
    }
    return out;
  }

  /* ---------- orquestração ---------- */
  /** Busca tudo de uma vez. Cada bloco é isolado: o que falhar entra
   *  em `errors` e vira um aviso na interface, sem quebrar o resto. */
  async function fetchAll(client, range, onProgress) {
    const token = AG.store.tokenFor(client);
    if (!token && !proxy()) throw new MetaError('Nenhum token configurado. Vá em Integração API e informe o token universal ou o token do cliente.');
    if (!client.accountId) throw new MetaError('Cliente sem Account ID configurado.');

    const id = client.accountId;
    const prev = U.previousRange(range);
    const errors = [];
    const steps = [];
    const step = (name, promise) => {
      steps.push(name);
      return promise.catch((e) => { errors.push(name + ': ' + e.message); return null; });
    };
    let done = 0;
    const total = 12;
    const tick = (name) => { done++; if (onProgress) onProgress(done, total, name); };
    const track = (name, p) => step(name, p).then((v) => { tick(name); return v; });

    const [totals, totalsPrev, dailyRows, dailyPrev, campaigns, ads,
           platform, device, ageGender, region, crMap, soc] = await Promise.all([
      track('Totais da conta',        accountTotals(id, token, range)),
      track('Período anterior',       accountTotals(id, token, prev)),
      track('Série diária',           daily(id, token, range)),
      track('Série diária anterior',  daily(id, token, prev)),
      track('Campanhas',              byLevel(id, token, range, 'campaign')),
      track('Anúncios',               byLevel(id, token, range, 'ad')),
      track('Posicionamentos',        byBreakdown(id, token, range, 'publisher_platform,platform_position')),
      track('Dispositivos',           byBreakdown(id, token, range, 'impression_device')),
      track('Público (idade/gênero)', byBreakdown(id, token, range, 'age,gender')),
      track('Localização',            byBreakdown(id, token, range, 'region')),
      track('Criativos',              creatives(id, token)),
      track('Redes sociais',          social(client, token, range)),
    ]);

    return {
      fetchedAt: Date.now(),
      client, range, prev, errors,
      totals, totalsPrev,
      daily: dailyRows || [], dailyPrev: dailyPrev || [],
      campaigns: campaigns || [], ads: ads || [],
      platform: platform || [], device: device || [],
      ageGender: ageGender || [], region: region || [],
      creatives: crMap || {}, social: soc || { errors: [] },
    };
  }

  /** Teste rápido de credenciais — usado no botão "Testar conexão". */
  async function testConnection(client) {
    const token = AG.store.tokenFor(client);
    const j = await call(acct(client.accountId), { fields: 'name,account_status,currency,timezone_name,amount_spent' }, token);
    return j;
  }

  return { fetchAll, testConnection, normalize, resultMetric, resultOf, pick, ACT, MetaError, call, acct };
})();
