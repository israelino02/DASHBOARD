/* ============================================================
   DASHBOARD — persistência local (localStorage)
   Clientes, credenciais, preferências e cache de dados.
   ============================================================ */
window.AG = window.AG || {};

AG.store = (function () {
  const KEY = 'ag.dashboard.v1';

  const DEFAULTS = {
    clients: [],            // {id, name, accountId, token, pageId, igId, notes}
    activeClientId: null,
    global: {
      token: '',            // token universal (System User) — usado quando o cliente não tem token próprio
      geminiKey: '',        // opcional: narrativa de IA na página de Insights
      apiVersion: 'v23.0',
    },
    ui: {
      presetKey: 'last7',
      range: null,          // {since, until} quando personalizado
      page: 'resumo',
    },
    gads: {},               // {clientId: {importedAt, rows:{campaigns,keywords,terms,devices,locations}}}
  };

  let state = load();

  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return structuredClone(DEFAULTS);
      const parsed = JSON.parse(raw);
      return Object.assign(structuredClone(DEFAULTS), parsed, {
        global: Object.assign({}, DEFAULTS.global, parsed.global),
        ui: Object.assign({}, DEFAULTS.ui, parsed.ui),
      });
    } catch (e) {
      console.warn('[AG] estado local corrompido, recomeçando do zero', e);
      return structuredClone(DEFAULTS);
    }
  }

  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(state)); }
    catch (e) { console.error('[AG] falha ao salvar estado', e); }
  }

  const get = () => state;

  /* ---------- clientes ---------- */
  function clients() { return state.clients; }

  function activeClient() {
    return state.clients.find((c) => c.id === state.activeClientId) || state.clients[0] || null;
  }

  function setActiveClient(id) { state.activeClientId = id; save(); }

  function upsertClient(client) {
    const idx = state.clients.findIndex((c) => c.id === client.id);
    if (idx >= 0) state.clients[idx] = Object.assign({}, state.clients[idx], client);
    else {
      client.id = client.id || 'c' + Date.now().toString(36);
      state.clients.push(client);
    }
    if (!state.activeClientId) state.activeClientId = client.id;
    save();
    return client.id;
  }

  function removeClient(id) {
    state.clients = state.clients.filter((c) => c.id !== id);
    if (state.activeClientId === id) state.activeClientId = state.clients[0]?.id || null;
    delete state.gads[id];
    save();
  }

  /** Token efetivo do cliente: o próprio, senão o universal. */
  function tokenFor(client) {
    return (client && client.token) || state.global.token || '';
  }

  /* ---------- configurações globais ---------- */
  function setGlobal(patch) { Object.assign(state.global, patch); save(); }
  function setUI(patch) { Object.assign(state.ui, patch); save(); }

  /* ---------- Google Ads (import CSV) ---------- */
  function gadsFor(clientId) { return state.gads[clientId] || null; }
  function setGads(clientId, payload) { state.gads[clientId] = payload; save(); }
  function clearGads(clientId) { delete state.gads[clientId]; save(); }

  /* ---------- export / import da configuração inteira ---------- */
  function exportConfig() { return JSON.stringify(state, null, 2); }
  function importConfig(json) {
    const parsed = JSON.parse(json);
    state = Object.assign(structuredClone(DEFAULTS), parsed);
    save();
  }

  return { get, save, clients, activeClient, setActiveClient, upsertClient, removeClient,
           tokenFor, setGlobal, setUI, gadsFor, setGads, clearGads, exportConfig, importConfig };
})();
