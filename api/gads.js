/* ============================================================
   Dados do Google Ads para o link do cliente.

   O Google Ads entra por CSV, e o CSV é lido no navegador do operador.
   Para o cliente ver esses números pelo link, o resultado da leitura é
   publicado como data/<slug>.gads.json no repositório — gerado pelo botão
   "Exportar para o link do cliente" na aba Google Ads.

   O arquivo NÃO é servido como estático: passa por aqui, atrás da mesma
   validação de slug + chave que protege os dados da Meta. Servi-lo direto
   de /data deixaria o relatório de um cliente aberto para qualquer um que
   adivinhasse o nome do arquivo.
   ============================================================ */
const fs = require('fs');
const path = require('path');
const { authorize } = require('./_clients');

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'private, no-store');

  const q = req.query || {};
  const client = authorize(q.slug, q.key);
  if (!client) {
    res.status(403).json({ error: { message: 'Link inválido ou expirado.' } });
    return;
  }

  // O slug já foi validado contra o registro; ainda assim, nada de separador
  // de caminho vindo da query monta o nome do arquivo.
  const slug = String(q.slug || '');
  if (!/^[A-Za-z0-9_-]+$/.test(slug)) {
    res.status(400).json({ error: { message: 'Identificador inválido.' } });
    return;
  }

  const arquivo = path.join(process.cwd(), 'data', slug + '.gads.json');
  let bruto;
  try {
    bruto = fs.readFileSync(arquivo, 'utf8');
  } catch (e) {
    // Cliente sem Google Ads publicado é situação normal, não erro.
    res.status(200).json({ reports: {}, vazio: true });
    return;
  }

  try {
    res.status(200).json(JSON.parse(bruto));
  } catch (e) {
    console.error('[AG] JSON inválido em', arquivo);
    res.status(500).json({ error: { message: 'Os dados do Google Ads deste cliente estão corrompidos.' } });
  }
};
