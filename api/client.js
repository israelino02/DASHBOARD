/* ============================================================
   Perfil do cliente para o link — só o necessário para montar a tela.
   Nunca devolve o token nem o key.
   ============================================================ */
const { authorize } = require('./_clients');

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'private, no-store');
  const q = req.query || {};
  const c = authorize(q.slug, q.key);
  if (!c) {
    res.status(403).json({ error: { message: 'Link inválido ou expirado.' } });
    return;
  }
  const accountId = String(c.accountId || '').replace(/^act_/, '');
  res.status(200).json({
    name: c.name || 'Relatório',
    accountId,
    pageId: c.pageId || '',
    igId: c.igId || '',
    // Sem conta de anúncio da Meta, o relatório é só de Google Ads. A página
    // precisa saber disso antes de montar, para não tentar sincronizar a
    // Graph API e mostrar erro num cliente que nunca teve Meta.
    temMeta: Boolean(accountId),
  });
};
