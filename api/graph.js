/* ============================================================
   Proxy com escopo — a única porta entre o navegador do cliente e a Meta.

   Três garantias, nesta ordem:
   1. O token de System User nunca sai do servidor.
   2. O link do cliente só consegue pedir dados dos nós dele. Um id de
      outra conta é recusado antes de qualquer chamada à Meta.
   3. A paginação é resolvida aqui. A Meta devolve `paging.next` como URL
      absoluta COM o access_token embutido; repassar isso ao navegador
      entregaria o token de bandeja. Nós seguimos as páginas e devolvemos
      só os dados, sem `paging`.
   ============================================================ */
const { authorize, allowedNodes } = require('./_clients');

const GRAPH = 'https://graph.facebook.com/';
const VERSION = process.env.AG_API_VERSION || 'v23.0';

const MAX_PAGES = 12;        // teto de segurança: conta grande não trava a função
const MAX_LIMIT = 500;

/* Só estes formatos de caminho existem para o dashboard. */
const PATH_RE = /^(act_\d+|\d+)(?:\/(insights|ads))?$/;

/* Parâmetros que o navegador pode mandar. Qualquer outro é descartado —
   inclusive `access_token`, que é a tentativa óbvia de injeção. */
const ALLOWED_PARAMS = new Set([
  'fields', 'level', 'breakdowns', 'time_range', 'time_increment', 'date_preset',
  'limit', 'action_report_time', 'use_unified_attribution_setting',
  'metric', 'period', 'since', 'until', 'filtering', 'sort',
]);

function sanitizeParams(raw) {
  const out = {};
  if (!raw || typeof raw !== 'object') return out;
  for (const k of Object.keys(raw)) {
    if (!ALLOWED_PARAMS.has(k)) continue;
    const v = raw[k];
    if (v == null) continue;
    out[k] = String(v);
  }
  if (out.limit) out.limit = String(Math.min(MAX_LIMIT, Math.max(1, parseInt(out.limit, 10) || 100)));
  return out;
}

async function graphGet(url) {
  const res = await fetch(url, { headers: { 'User-Agent': 'dashboard-trafego' } });
  const json = await res.json().catch(() => ({}));
  return { ok: res.ok && !json.error, status: res.status, json };
}

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'private, no-store');

  if (req.method !== 'GET') {
    res.status(405).json({ error: { message: 'Método não permitido.' } });
    return;
  }

  const token = process.env.META_TOKEN;
  if (!token) {
    res.status(500).json({ error: { message: 'Servidor sem META_TOKEN configurado.' } });
    return;
  }

  const q = req.query || {};
  const client = authorize(q.slug, q.key);
  if (!client) {
    // Mesma resposta para slug inexistente e key errada.
    res.status(403).json({ error: { message: 'Link inválido ou expirado.' } });
    return;
  }

  const path = String(q.path || '');
  const m = path.match(PATH_RE);
  if (!m) {
    res.status(400).json({ error: { message: 'Caminho não suportado.' } });
    return;
  }
  if (!allowedNodes(client).has(m[1])) {
    res.status(403).json({ error: { message: 'Este relatório não tem acesso a esse recurso.' } });
    return;
  }

  let params;
  try {
    params = sanitizeParams(q.params ? JSON.parse(q.params) : {});
  } catch (e) {
    res.status(400).json({ error: { message: 'Parâmetros inválidos.' } });
    return;
  }

  const qs = new URLSearchParams(Object.assign({}, params, { access_token: token }));
  let url = GRAPH + VERSION + '/' + path + '?' + qs.toString();

  try {
    const first = await graphGet(url);
    if (!first.ok) {
      const err = first.json.error || {};
      // A mensagem da Meta ajuda a diagnosticar, mas o token não aparece nela.
      res.status(first.status === 200 ? 502 : first.status)
         .json({ error: { message: err.message || 'Falha ao consultar a Meta.', code: err.code } });
      return;
    }

    // Sem `data` é resposta de nó único (ex.: dados da conta): devolve direto.
    if (!Array.isArray(first.json.data)) {
      const out = Object.assign({}, first.json);
      delete out.paging;
      res.status(200).json(out);
      return;
    }

    let data = first.json.data;
    let next = first.json.paging && first.json.paging.next;
    let pages = 0;
    while (next && pages < MAX_PAGES) {
      const step = await graphGet(next);
      if (!step.ok) break;
      data = data.concat(step.json.data || []);
      next = step.json.paging && step.json.paging.next;
      pages++;
    }

    res.status(200).json({ data, truncated: Boolean(next) });
  } catch (e) {
    console.error('[AG] erro no proxy', e);
    res.status(502).json({ error: { message: 'Não consegui falar com a Meta agora.' } });
  }
};
