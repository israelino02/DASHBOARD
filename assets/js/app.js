/* ============================================================
   DASHBOARD — casca do aplicativo: navegação, filtros e sincronização
   ============================================================ */
window.AG = window.AG || {};

AG.app = (function () {
  const U = AG.util, UI = AG.ui;
  const el = U.el;

  const NAV = [
    { key: 'resumo',          label: 'Resumo Executivo' },
    { key: 'receita',         label: 'Receita × Investimento' },
    { key: 'funil',           label: 'Funil' },
    { key: 'anuncios',        label: 'Anúncios' },
    { key: 'criativos',       label: 'Criativos' },
    { key: 'posicionamentos', label: 'Posicionamentos' },
    { key: 'publico',         label: 'Público' },
    { key: 'local',           label: 'Localização' },
    { key: 'evolucao',        label: 'Evolução' },
    { key: 'social',          label: 'Social' },
    { key: 'google',          label: 'Google Ads' },
    { key: 'insights',        label: 'Insights' },
    { key: 'config',          label: 'Integração API' },
  ];

  const PRESETS = [
    { key: 'today', label: 'Hoje' },
    { key: 'yesterday', label: 'Ontem' },
    { key: 'last7', label: '7 dias' },
    { key: 'last14', label: '14 dias' },
    { key: 'last30', label: '30 dias' },
    { key: 'last60', label: '60 dias' },
    { key: 'thisMonth', label: 'Mês atual' },
    { key: 'lastMonth', label: 'Mês passado' },
  ];

  let data = null;          // último payload sincronizado
  let loading = false;
  let lastError = null;

  /** Estrutura mínima para um cliente que só tem Google Ads: as páginas
   *  esperam sempre um payload com período e cliente, mesmo sem Meta. */
  function dadosSomenteGoogle() {
    const range = currentRange();
    return {
      fetchedAt: Date.now(), somenteGoogle: true, errors: [],
      client: AG.store.activeClient(), range, prev: U.previousRange(range),
      totals: null, totalsPrev: null, daily: [], dailyPrev: [],
      campaigns: [], ads: [], platform: [], device: [], ageGender: [], region: [],
      creatives: {}, social: { errors: [] },
    };
  }

  /** Modo demonstração: dados sintéticos, para conferir o dashboard
   *  antes de existir token. A interface avisa em toda página. */
  function loadDemo() {
    if (window.AG_CLIENT_MODE || !AG.demo) return;   // não existe demonstração no link do cliente
    data = AG.demo.build(currentRange());
    lastError = null; loading = false;
    mount();
  }

  /** No link do cliente não existe aba de credenciais: não há token nesta
   *  página, e nada para configurar. */
  /** Cliente sem Account ID não tem Meta — no link do cliente isso vem do
   *  servidor, no console vem do próprio cadastro. */
  const semMeta = () => {
    if (window.AG_CLIENT_MODE) return Boolean(window.AG_SEM_META);
    const c = AG.store.activeClient();
    return Boolean(c && !c.accountId);
  };

  const nav_items = () => {
    // Cliente só de Google Ads: as outras 11 páginas leem dados da Meta e
    // apareceriam todas vazias. Mostrar aba que não tem o que mostrar é pior
    // do que não mostrar. No console, a de credenciais fica, para editar o
    // cadastro e trocar de cliente.
    if (semMeta()) {
      return window.AG_CLIENT_MODE
        ? NAV.filter((n) => n.key === 'google')
        : NAV.filter((n) => n.key === 'google' || n.key === 'config');
    }
    return window.AG_CLIENT_MODE ? NAV.filter((n) => n.key !== 'config') : NAV;
  };

  const currentRange = () => {
    const ui = AG.store.get().ui;
    return ui.presetKey === 'custom' && ui.range ? ui.range : U.preset(ui.presetKey);
  };

  /* ---------- montagem da casca ---------- */
  function mount() {
    const root = U.$('#app');
    root.innerHTML = '';
    root.appendChild(buildHeader());
    root.appendChild(el('main', { id: 'view' }));
    rerender();
  }

  function buildHeader() {
    const st = AG.store.get();
    const head = el('header', { class: 'topbar' });

    const brandRow = el('div', { class: 'brand-row' });
    brandRow.appendChild(el('div', { class: 'brand' }, [
      el('span', { class: 'brand-mark' }),
      el('span', { class: 'brand-name', text: 'DASHBOARD' }),
      el('span', { class: 'brand-sub', text: 'Performance de Tráfego Pago' }),
    ]));

    const right = el('div', { class: 'brand-actions' });
    if (window.AG_CLIENT_MODE) {
      // O cliente vê o nome da própria conta, não um seletor.
      const c = AG.store.activeClient();
      right.appendChild(el('span', { class: 'client-tag', text: c ? c.name : 'Relatório' }));
    } else {
      const sel = el('select', { class: 'select select-client' });
      if (!st.clients.length) sel.appendChild(el('option', { value: '', text: 'Nenhum cliente cadastrado' }));
      st.clients.forEach((c) => sel.appendChild(el('option', {
        value: c.id, text: c.name, selected: c.id === st.activeClientId ? 'selected' : null })));
      sel.addEventListener('change', () => {
        AG.store.setActiveClient(sel.value); data = null; lastError = null;
        // Trocar de cliente pode mudar as abas disponíveis, então remonta tudo.
        init();
      });
      right.appendChild(sel);
      right.appendChild(UI.button('Demonstração', loadDemo, 'ghost'));
    }
    right.appendChild(UI.button('Imprimir / PDF', () => window.print(), 'ghost'));
    brandRow.appendChild(right);
    head.appendChild(brandRow);

    /* navegação */
    const nav = el('nav', { class: 'tabs' });
    nav_items().forEach((n) => {
      const b = el('button', {
        class: 'tab' + (st.ui.page === n.key ? ' active' : ''),
        type: 'button', text: n.label,
        onClick: () => { AG.store.setUI({ page: n.key }); mount(); },
      });
      nav.appendChild(b);
    });
    head.appendChild(nav);

    /* filtros de período */
    const bar = el('div', { class: 'filters' });
    const chips = el('div', { class: 'chips' });
    PRESETS.forEach((p) => {
      chips.appendChild(el('button', {
        class: 'chip' + (st.ui.presetKey === p.key ? ' active' : ''),
        type: 'button', text: p.label,
        onClick: () => { AG.store.setUI({ presetKey: p.key, range: null }); sync(); },
      }));
    });
    bar.appendChild(chips);

    const r = currentRange();
    const since = el('input', { class: 'input input-date', type: 'date', value: r.since });
    const until = el('input', { class: 'input input-date', type: 'date', value: r.until });
    const custom = el('div', { class: 'custom-range' }, [
      el('span', { class: 'lbl', text: 'De' }), since,
      el('span', { class: 'lbl', text: 'Até' }), until,
    ]);
    const applyCustom = () => {
      if (!since.value || !until.value) return;
      if (since.value > until.value) { UI.toast('A data inicial é posterior à final.', 'error'); return; }
      AG.store.setUI({ presetKey: 'custom', range: { since: since.value, until: until.value } });
      sync();
    };
    since.addEventListener('change', applyCustom);
    until.addEventListener('change', applyCustom);
    bar.appendChild(custom);

    const syncBtn = UI.button(loading ? 'Sincronizando…' : 'Sincronizar', () => sync(), 'primary');
    syncBtn.disabled = loading;
    syncBtn.id = 'sync-btn';
    bar.appendChild(syncBtn);
    head.appendChild(bar);

    /* contexto do período em texto — o cliente lê a data, não o preset */
    head.appendChild(el('div', { class: 'range-note' }, [
      el('span', { text: `Período: ${U.brDateFull(r.since)} a ${U.brDateFull(r.until)} (${U.daysBetween(r.since, r.until)} dias)` }),
      data ? el('span', { class: 'sync-at', text: 'Sincronizado às ' + new Date(data.fetchedAt).toLocaleTimeString('pt-BR') }) : el('span'),
    ]));

    return head;
  }

  /* ---------- renderização da página ativa ---------- */
  function rerender() {
    const view = U.$('#view');
    if (!view) return;
    view.innerHTML = '';

    const st = AG.store.get();
    const def = AG.pages[st.ui.page] || AG.pages.resumo;
    const client = AG.store.activeClient();

    const node = UI.page(def.title, def.subtitle);
    view.appendChild(node);

    if (def.needsData === false) { def.render(null, node); return; }

    if (data && data.demo) {
      node.appendChild(UI.note(window.AG_AUTO_DEMO
        ? 'Prévia hospedada — números sintéticos, gerados localmente. Esta versão não conversa com a Graph API: ' +
          'o sandbox da página bloqueia chamadas para hosts externos. Para dados reais da conta, rode a versão local.'
        : 'Modo demonstração — os números desta tela são sintéticos, gerados localmente. ' +
          'Cadastre um cliente em Integração API e clique em Sincronizar para ver os dados reais da conta.', 'warn'));
    }

    if (!client && !(data && data.demo)) {
      node.appendChild(UI.empty('Nenhum cliente cadastrado.',
        'Vá em Integração API, cadastre o cliente com o Account ID e informe o token. ' +
        'Ou abra a demonstração para ver o dashboard funcionando com dados sintéticos.'));
      const acts = el('div', { class: 'form-actions', style: 'justify-content:center' });
      acts.appendChild(UI.button('Ir para Integração API', () => { AG.store.setUI({ page: 'config' }); mount(); }, 'primary'));
      if (AG.demo) acts.appendChild(UI.button('Ver demonstração', loadDemo, 'ghost'));
      node.appendChild(acts);
      return;
    }
    if (loading) { node.appendChild(loader()); return; }
    if (lastError) {
      node.appendChild(UI.note(lastError, 'warn'));
      node.appendChild(UI.button('Tentar novamente', () => sync(), 'primary'));
      return;
    }
    if (!data) {
      node.appendChild(UI.empty('Nada carregado ainda.', 'Clique em Sincronizar para buscar os dados da conta.'));
      const acts = el('div', { class: 'form-actions', style: 'justify-content:center' });
      acts.appendChild(UI.button('Sincronizar agora', () => sync(), 'primary'));
      if (AG.demo) acts.appendChild(UI.button('Ver demonstração', loadDemo, 'ghost'));
      node.appendChild(acts);
      return;
    }

    if (data.errors && data.errors.length) {
      const warn = UI.card('Blocos que não carregaram', { subtitle: 'o resto do dashboard segue válido' });
      data.errors.forEach((e) => warn.body.appendChild(UI.note(e, 'warn')));
      node.appendChild(warn);
    }

    try {
      def.render(data, node);
    } catch (e) {
      console.error('[AG] erro ao renderizar', st.ui.page, e);
      node.appendChild(UI.note('Erro ao montar esta página: ' + e.message, 'warn'));
    }
  }

  function loader() {
    const box = el('div', { class: 'loader' });
    box.appendChild(el('div', { class: 'spinner' }));
    box.appendChild(el('p', { id: 'loader-msg', text: 'Consultando a Meta…' }));
    return box;
  }

  /* ---------- sincronização ---------- */
  async function sync() {
    const client = AG.store.activeClient();
    if (!client) {
      // Em demonstração, trocar o período deve regerar a demo — não expulsar
      // o usuário para a tela de credenciais.
      if (data && data.demo) { loadDemo(); return; }
      AG.store.setUI({ page: 'config' }); mount(); return;
    }
    // Sem Meta não há o que sincronizar: só refaz o recorte de período.
    if (semMeta()) { data = dadosSomenteGoogle(); lastError = null; mount(); return; }

    loading = true; lastError = null;
    mount();

    try {
      data = await AG.meta.fetchAll(client, currentRange(), (done, total, name) => {
        const msg = U.$('#loader-msg');
        if (msg) msg.textContent = `${name} (${done}/${total})`;
      });
      if (!data.totals && data.errors.length) {
        lastError = 'A conta não retornou dados. Primeiro erro: ' + data.errors[0];
      }
    } catch (e) {
      console.error('[AG] falha na sincronização', e);
      lastError = e.message;
      data = null;
    } finally {
      loading = false;
      mount();
    }
  }

  function init() {
    // A aba de credenciais some no link do cliente: se estava salva, volta ao início.
    if (window.AG_CLIENT_MODE && AG.store.get().ui.page === 'config') AG.store.setUI({ page: 'resumo' });
    // Cliente só de Google Ads abre na aba que existe para ele.
    const paginaAtual = AG.store.get().ui.page;
    if (semMeta() && !nav_items().some((n) => n.key === paginaAtual)) AG.store.setUI({ page: 'google' });
    mount();
    if (semMeta()) sync();
    // Link do cliente: não há o que configurar, busca os dados de imediato.
    else if (window.AG_CLIENT_MODE) sync();
    // Cliente já configurado: puxa os dados sem exigir um clique extra.
    else if (AG.store.activeClient() && AG.store.tokenFor(AG.store.activeClient())) sync();
    // Build de prévia (arquivo único, sem acesso de rede): abre já na demonstração.
    else if (window.AG_AUTO_DEMO) loadDemo();
  }

  /** Descarta os dados de demonstração. Chamado ao cadastrar um cliente real:
   *  o próximo init() busca os dados dele em vez de manter os sintéticos. */
  function sairDaDemonstracao() { if (data && data.demo) data = null; }

  return { init, mount, rerender, sync, loadDemo, sairDaDemonstracao,
           get data() { return data; }, NAV, nav: nav_items };
})();

// client-mode.js adia a inicialização até saber de quem é o relatório.
if (!window.AG_DEFER_INIT) document.addEventListener('DOMContentLoaded', AG.app.init);
