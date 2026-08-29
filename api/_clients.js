/* ============================================================
   Registro de clientes — lado servidor, nunca enviado ao navegador.

   Lido de AG_CLIENTS (JSON), variável de ambiente do projeto na Vercel.
   Formato:

   {
     "cliente-exemplo": {
       "name": "Nome do Cliente",
       "accountId": "1234567890",
       "pageId": "",
       "igId": "",
       "key": "<32 hex — gerado por scripts/gerar-cliente.py>"
     }
   }

   O `key` é o que autoriza o link. Cada cliente tem o seu; trocar o key
   revoga o link antigo sem afetar os demais.
   ============================================================ */
const crypto = require('crypto');

let cache = null;

function registry() {
  if (cache) return cache;
  const raw = process.env.AG_CLIENTS;
  if (!raw) { cache = {}; return cache; }
  try {
    const parsed = JSON.parse(raw);
    cache = parsed && typeof parsed === 'object' ? parsed : {};
  } catch (e) {
    console.error('[AG] AG_CLIENTS não é um JSON válido — nenhum cliente será servido.');
    cache = {};
  }
  return cache;
}

/** Comparação em tempo constante: comparar chave com === vaza, pelo tempo
 *  de resposta, quantos caracteres iniciais o atacante acertou. */
function sameKey(a, b) {
  const ba = Buffer.from(String(a || ''), 'utf8');
  const bb = Buffer.from(String(b || ''), 'utf8');
  if (ba.length !== bb.length || ba.length === 0) return false;
  return crypto.timingSafeEqual(ba, bb);
}

/** Resolve slug + key. Devolve null para slug inexistente E para key errada,
 *  sem distinguir os dois casos — a diferença diria ao atacante quais slugs
 *  existem. */
function authorize(slug, key) {
  const c = registry()[String(slug || '')];
  if (!c || !c.key) return null;
  if (!sameKey(key, c.key)) return null;
  return c;
}

/** Nós da Graph API que este cliente pode consultar. Qualquer outro id é
 *  recusado — é isso que impede o link de um cliente de ler a conta de outro. */
function allowedNodes(client) {
  const out = new Set();
  if (client.accountId) out.add('act_' + String(client.accountId).replace(/^act_/, ''));
  if (client.pageId) out.add(String(client.pageId));
  if (client.igId) out.add(String(client.igId));
  return out;
}

module.exports = { authorize, allowedNodes };
