/* ============================================================
   DASHBOARD — modo cliente

   Serve o relatório de um único cliente a partir de /c/<slug>?k=<key>.
   Não há token nesta página: toda chamada passa pela função servidor, que
   valida o link e só libera os nós daquele cliente.

   Carregado ANTES de app.js, para que app.js não inicialize sozinho — a
   tela só pode montar depois de sabermos de quem é o relatório.
   ============================================================ */
window.AG = window.AG || {};
window.AG_DEFER_INIT = true;
window.AG_CLIENT_MODE = true;

(function () {
  const STORE_PREFIX = 'ag.link.';

  function readLink() {
    const m = location.pathname.match(/\/c\/([A-Za-z0-9_-]+)/);
    const slug = m ? m[1] : '';
    if (!slug) return null;

    const qs = new URLSearchParams(location.search);
    let key = qs.get('k') || '';

    if (key) {
      // Guarda a chave e limpa a barra de endereços: um link com a chave
      // exposta acaba em print de tela e em grupo de WhatsApp.
      try { localStorage.setItem(STORE_PREFIX + slug, key); } catch (e) { /* modo privado */ }
      qs.delete('k');
      const clean = location.pathname + (qs.toString() ? '?' + qs : '');
      history.replaceState(null, '', clean);
    } else {
      try { key = localStorage.getItem(STORE_PREFIX + slug) || ''; } catch (e) { key = ''; }
    }
    return { slug, key };
  }

  function fail(title, detail) {
    const app = document.getElementById('app');
    app.innerHTML = '';
    const box = document.createElement('div');
    box.className = 'link-error';
    const h = document.createElement('h1'); h.textContent = title;
    const p = document.createElement('p'); p.textContent = detail;
    box.appendChild(h); box.appendChild(p);
    app.appendChild(box);
  }

  const link = readLink();
  if (!link) {
    fail('Link incompleto', 'Este endereço não identifica nenhum relatório. Peça o link completo a quem cuida da sua conta.');
    return;
  }
  if (!link.key) {
    fail('Falta a chave de acesso',
      'O link precisa terminar com ?k=… na primeira vez que você abrir neste navegador. Peça o link completo a quem cuida da sua conta.');
    return;
  }

  window.AG_PROXY = { base: '/api/graph', slug: link.slug, key: link.key };

  fetch('/api/client?' + new URLSearchParams({ slug: link.slug, key: link.key }))
    .then((r) => r.json().then((j) => ({ ok: r.ok, j })))
    .then(({ ok, j }) => {
      if (!ok || j.error) {
        try { localStorage.removeItem(STORE_PREFIX + link.slug); } catch (e) { /* ignore */ }
        fail('Link inválido ou expirado',
          (j.error && j.error.message) || 'Peça um link novo a quem cuida da sua conta.');
        return;
      }
      // Registra como cliente ativo para que as páginas leiam do jeito de sempre.
      const id = 'link_' + link.slug;
      AG.store.upsertClient({
        id, name: j.name,
        accountId: j.accountId, pageId: j.pageId, igId: j.igId, token: '',
      });
      AG.store.setActiveClient(id);
      window.AG_SEM_META = !j.temMeta;

      // Os dados do Google Ads vêm do servidor e entram no store no mesmo
      // formato do import por CSV, para as páginas não precisarem saber a
      // diferença entre um caso e outro.
      fetch('/api/gads?' + new URLSearchParams({ slug: link.slug, key: link.key }))
        .then((r) => r.json())
        .then((g) => { if (g && g.reports) AG.store.setGads(id, g); })
        .catch(() => { /* sem Google Ads publicado: a aba mostra o estado vazio */ })
        .then(() => AG.app.init());
    })
    .catch(() => fail('Não consegui carregar o relatório',
      'Verifique sua conexão e recarregue a página.'));
})();
