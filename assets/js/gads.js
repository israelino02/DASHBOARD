/* ============================================================
   DASHBOARD — importador de CSV do Google Ads

   A API do Google Ads exige OAuth + developer token + servidor, o que
   não existe num app que roda inteiro no navegador. Em vez de fingir
   uma integração, o dashboard lê os relatórios exportados direto do
   painel do Google Ads (CSV ou TSV, PT-BR ou EN).

   Aceita os relatórios de Campanhas, Palavras-chave, Termos de
   pesquisa, Dispositivos e Localizações. O tipo é detectado pela
   coluna de identificação presente no arquivo.
   ============================================================ */
window.AG = window.AG || {};

AG.gads = (function () {
  const U = AG.util;

  /* Sinônimos de cabeçalho → campo canônico. Comparação é feita sobre
     o texto normalizado (minúsculo, sem acento, sem pontuação). */
  const HEADERS = {
    name:        ['campanha', 'campaign', 'palavrachave', 'keyword', 'termodepesquisa', 'searchterm', 'termo',
                  'dispositivo', 'device', 'local', 'location', 'regiao', 'cidade', 'city',
                  'grupodeanuncios', 'adgroup', 'titulo', 'headline', 'urlfinal', 'finalurl', 'anuncio'],
    // callImpressions ANTES de impressions: "Impr. chamadas" normaliza para
    // 'imprchamadas', que começa com 'impr' e seria capturado por impressions
    // na passada de prefixo se viesse depois.
    callImpressions: ['imprchamadas', 'imprdechamadas', 'phoneimpressions'],
    impressions: ['impr', 'impressoes', 'impressions', 'imprs'],
    clicks:      ['cliques', 'clicks'],
    ctr:         ['ctr', 'taxadecliques'],
    avgCpc:      ['cpcmed', 'cpcmedio', 'avgcpc', 'custoporclique', 'cpc'],
    cost:        ['custo', 'cost', 'investimento', 'valorgasto'],
    conversions: ['conversoes', 'conversions', 'conv'],
    costPerConv: ['custoconv', 'custoporconv', 'costconv', 'custoporconversao', 'costperconv'],
    convValue:   ['valordeconv', 'valorconv', 'convvalue', 'valordeconversao', 'receita', 'revenue'],
    roas:        ['roas', 'valorconvcusto', 'convvaluecost'],
    date:        ['dia', 'day', 'data', 'date'],

    phoneCalls:  ['ligacoestelefonicas', 'ligacoes', 'phonecalls'],
    // Percentuais de leilão. Nunca somados — ver PONDERADAS abaixo.
    searchIS:         ['parcimprpesquisa', 'parcelaimprrededepesquisa', 'parcimprrededepesquisa', 'searchimprshare'],
    searchLostBudget: ['parcimprperdrededepesquisaorc', 'parcimprperdorc', 'searchlostisbudget'],
    searchLostRank:   ['parcimprperdrededepesquisaclass', 'parcimprperdclass', 'searchlostisrank'],
    // "1ª" usa o indicador ordinal U+00AA, que não decompõe em "a": a
    // normalização devolve 'deimpr1posicao', não 'deimpr1aposicao'.
    absTopIS:         ['deimpr1posicao', 'deimpr1aposicao', 'impr1posicao', 'impr1aposicao',
                       'absolutetopimpressionrate'],
    topIS:            ['deimprpartesup', 'imprpartesup', 'topimpressionrate'],
    searchTopIS:      ['ispartesuppesq', 'searchtopis'],
  };

  /* Somáveis: fazem sentido empilhadas entre dias e entidades. */
  const ADITIVAS = ['impressions', 'clicks', 'cost', 'conversions', 'convValue',
                    'phoneCalls', 'callImpressions'];
  /* Percentuais de leilão: somar 30% de um dia com 40% de outro daria 70%, que
     não quer dizer nada. A junta correta é a média ponderada por impressões —
     é assim que o próprio Google consolida esses índices. */
  const PONDERADAS = ['searchIS', 'searchLostBudget', 'searchLostRank',
                      'absTopIS', 'topIS', 'searchTopIS'];

  /* A ORDEM decide o tipo: vale o primeiro que casar. Relatório de grupo de
     anúncios e de anúncio também trazem a coluna "Campanha", então precisam
     ser testados ANTES de 'campaigns' — senão caem todos como campanha. */
  const KIND_BY_HEADER = [
    { kind: 'terms',      match: ['termodepesquisa', 'searchterm', 'termo'] },
    { kind: 'keywords',   match: ['palavrachave', 'keyword'] },
    { kind: 'ads',        match: ['titulo', 'headline', 'urlfinal', 'finalurl', 'anuncio'] },
    { kind: 'adgroups',   match: ['grupodeanuncios', 'adgroup'] },
    { kind: 'devices',    match: ['dispositivo', 'device'] },
    { kind: 'locations',  match: ['local', 'location', 'regiao', 'cidade', 'city'] },
    { kind: 'campaigns',  match: ['campanha', 'campaign'] },
  ];

  /* Arquivo consolidado: um CSV com uma coluna "Nível" e todos os níveis
     empilhados. Não é um export nativo do Google — é o formato que sai quando
     alguém junta tudo num arquivo só. Cada valor de Nível vira um relatório. */
  const COLUNA_NIVEL = ['nivel', 'level', 'tipo', 'type'];
  const NIVEL_PARA_KIND = {
    campanhas: 'campaigns', campanha: 'campaigns', campaigns: 'campaigns',
    gruposdeanuncios: 'adgroups', grupodeanuncios: 'adgroups', adgroups: 'adgroups',
    anuncios: 'ads', anuncio: 'ads', ads: 'ads',
    palavraschave: 'keywords', palavrachave: 'keywords', keywords: 'keywords',
    termosdepesquisa: 'terms', termodepesquisa: 'terms', searchterms: 'terms',
    localizacoes: 'locations', localizacao: 'locations', locais: 'locations', locations: 'locations',
    dispositivos: 'devices', dispositivo: 'devices', devices: 'devices',
  };

  const KIND_LABEL = {
    campaigns: 'Campanhas', adgroups: 'Grupos de anúncios', ads: 'Anúncios',
    keywords: 'Palavras-chave', terms: 'Termos de pesquisa',
    devices: 'Dispositivos', locations: 'Localizações',
  };

  const norm = (s) => String(s || '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/[^a-z0-9]/g, '');

  /** Números do Google Ads chegam em pt-BR ("1.234,56") ou en-US
   *  ("1,234.56"), às vezes com moeda ou "%" colados e "--" para vazio.
   *  A regra que resolve os dois: o separador que aparece por ÚLTIMO é o
   *  decimal; o outro é milhar. Com um separador só, o que decide é o
   *  formato — grupos de exatamente 3 dígitos são milhar ("12.480" é doze
   *  mil e quatrocentos e oitenta, não 12,48). */
  function parseNum(v) {
    if (v == null) return 0;
    let s = String(v).trim();
    if (!s || s === '--' || s === '-') return 0;
    const neg = /^\(.*\)$/.test(s) || s.trim().startsWith('-');
    s = s.replace(/[^\d.,]/g, '');
    if (!s) return 0;

    const lastComma = s.lastIndexOf(','), lastDot = s.lastIndexOf('.');
    if (lastComma >= 0 && lastDot >= 0) {
      const dec = lastComma > lastDot ? ',' : '.';
      const thou = dec === ',' ? '.' : ',';
      s = s.split(thou).join('').replace(dec, '.');
    } else if (lastComma >= 0) {
      s = /^\d{1,3}(,\d{3})+$/.test(s) ? s.split(',').join('') : s.replace(',', '.');
    } else if (lastDot >= 0) {
      if (/^\d{1,3}(\.\d{3})+$/.test(s)) s = s.split('.').join('');
    }
    const n = parseFloat(s);
    return Number.isFinite(n) ? (neg ? -n : n) : 0;
  }

  /** Soma e razão que preservam o "não informado": null com null continua null. */
  const soma = (a, b) => (a == null && b == null ? null : U.num(a) + U.num(b));
  const razao = (a, b, mult) => (a == null || b == null ? null : U.safeDiv(a, b) * (mult || 1));

  const MESES_PT = { jan: 1, fev: 2, mar: 3, abr: 4, mai: 5, jun: 6,
                     jul: 7, ago: 8, set: 9, out: 10, nov: 11, dez: 12 };

  /** Converte a data do Google para ISO (YYYY-MM-DD).
   *  O export sai em ISO na maioria das contas, mas algumas locales devolvem
   *  "11/08/2026" ou "11 de ago. de 2026" — as três formas são aceitas. */
  function parseDate(v) {
    const t = String(v == null ? '' : v).trim();
    if (!t) return null;
    let m = t.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (m) return m[1] + '-' + m[2] + '-' + m[3];
    m = t.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
    if (m) return m[3] + '-' + String(m[2]).padStart(2, '0') + '-' + String(m[1]).padStart(2, '0');
    m = t.toLowerCase().match(/^(\d{1,2})\s*de\s*([a-zç]{3})[a-zç.]*\s*de\s*(\d{4})/);
    if (m && MESES_PT[m[2]]) {
      return m[3] + '-' + String(MESES_PT[m[2]]).padStart(2, '0') + '-' + String(m[1]).padStart(2, '0');
    }
    return null;
  }

  /** Divide uma linha respeitando aspas. */
  function splitLine(line, delim) {
    const out = []; let cur = '', q = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (q && line[i + 1] === '"') { cur += '"'; i++; }
        else q = !q;
      } else if (ch === delim && !q) { out.push(cur); cur = ''; }
      else cur += ch;
    }
    out.push(cur);
    return out.map((c) => c.trim());
  }

  function detectDelimiter(sample) {
    const counts = [',', ';', '\t'].map((d) => ({ d, n: (sample.match(new RegExp('\\' + d, 'g')) || []).length }));
    counts.sort((a, b) => b.n - a.n);
    return counts[0].n > 0 ? counts[0].d : ',';
  }

  /** Acha a linha de cabeçalho: o Google Ads coloca 1–3 linhas de
   *  preâmbulo (título do relatório e intervalo de datas) antes dela. */
  function findHeader(lines, delim) {
    for (let i = 0; i < Math.min(lines.length, 12); i++) {
      const cells = splitLine(lines[i], delim).map(norm);
      const hasName = cells.some((c) => HEADERS.name.some((h) => c.startsWith(h)));
      const hasMetric = cells.some((c) => ['cliques', 'clicks', 'impr', 'impressoes', 'impressions', 'custo', 'cost'].some((h) => c.startsWith(h)));
      if (hasName && hasMetric && cells.length >= 3) return i;
    }
    return -1;
  }

  /** Duas passadas: primeiro só correspondências EXATAS, depois prefixo.
   *  Sem isso, "Custo / conv." (norm: custoconv) captura o campo `cost`, porque
   *  começa com "custo" — e o Google exporta essa coluna ANTES de "Custo" em
   *  vários relatórios. O resultado seria todo custo trocado pelo custo por
   *  conversão, sem nenhum erro visível. */
  function mapColumns(headerCells) {
    const map = {};
    const usadas = new Set();
    const cols = headerCells.map((raw, idx) => ({ c: norm(raw), idx })).filter((x) => x.c);

    cols.forEach(({ c, idx }) => {
      for (const field in HEADERS) {
        if (map[field] != null) continue;
        if (HEADERS[field].includes(c)) { map[field] = idx; usadas.add(idx); return; }
      }
    });
    cols.forEach(({ c, idx }) => {
      if (usadas.has(idx)) return;
      for (const field in HEADERS) {
        if (map[field] != null) continue;
        if (HEADERS[field].some((h) => c.startsWith(h))) { map[field] = idx; usadas.add(idx); return; }
      }
    });
    return map;
  }

  /** A coluna de nome depende do tipo do relatório. A busca genérica pega a
   *  primeira que casar, e em "Relatório de anúncios" isso é "URL final" —
   *  igual nos três anúncios, tornando as linhas indistinguíveis. */
  const NOME_POR_TIPO = {
    ads:       ['titulo1', 'headline1', 'titulo', 'headline', 'anuncio', 'urlfinal', 'finalurl'],
    adgroups:  ['grupodeanuncios', 'adgroup'],
    keywords:  ['palavrachave', 'keyword'],
    terms:     ['termodepesquisa', 'searchterm', 'termo'],
    campaigns: ['campanha', 'campaign'],
    devices:   ['dispositivo', 'device'],
    // 'cidade' antes de 'local': no consolidado, "Localização" traz
    // "Cidade,Estado,País" numa string só, e a cidade sozinha lê melhor.
    locations: ['cidade', 'city', 'local', 'location', 'regiao'],
  };

  function pickNameColumn(headerCells, kind, fallback) {
    const cols = headerCells.map(norm);
    for (const pref of (NOME_POR_TIPO[kind] || [])) {
      const i = cols.findIndex((c) => c === pref);
      if (i >= 0) return i;
    }
    for (const pref of (NOME_POR_TIPO[kind] || [])) {
      const i = cols.findIndex((c) => c.startsWith(pref));
      if (i >= 0) return i;
    }
    return fallback;
  }

  function detectKind(headerCells) {
    const cells = headerCells.map(norm);
    for (const k of KIND_BY_HEADER) {
      if (cells.some((c) => k.match.some((m) => c.startsWith(m)))) return k.kind;
    }
    return 'campaigns';
  }

  /** Lê o texto de um CSV/TSV e devolve UM OU MAIS relatórios.
   *  Um export nativo do Google traz um nível por arquivo; um arquivo
   *  consolidado traz vários, separados pela coluna "Nível". Por isso o
   *  retorno é sempre uma lista — com um item no caso comum. */
  function parse(textRaw) {
    const textNoBom = textRaw.replace(/^\uFEFF/, '');
    const lines = textNoBom.split(/\r?\n/).filter((l) => l.trim() !== '');
    if (!lines.length) throw new Error('Arquivo vazio.');

    const delim = detectDelimiter(lines.slice(0, 8).join('\n'));
    const hIdx = findHeader(lines, delim);
    if (hIdx < 0) throw new Error('Não encontrei a linha de cabeçalho. Exporte do Google Ads em CSV mantendo os nomes das colunas.');

    const headerCells = splitLine(lines[hIdx], delim);
    const cols = mapColumns(headerCells);
    const nivelIdx = headerCells.findIndex((h) => COLUNA_NIVEL.includes(norm(h)));

    const corpo = lines.slice(hIdx + 1).map((l) => splitLine(l, delim));

    if (nivelIdx >= 0) {
      // Consolidado: agrupa por nível e trata cada grupo como um relatório.
      const porNivel = new Map();
      corpo.forEach((cells) => {
        const kind = NIVEL_PARA_KIND[norm(cells[nivelIdx])];
        if (!kind) return;
        if (!porNivel.has(kind)) porNivel.set(kind, []);
        porNivel.get(kind).push(cells);
      });
      if (!porNivel.size) {
        throw new Error('A coluna de nível não trouxe nenhum valor reconhecido ' +
          '(esperado: Campanhas, Grupos de anúncios, Anúncios, Palavras-chave, Termos de pesquisa, Localizações, Dispositivos).');
      }
      const reports = Array.from(porNivel.entries()).map(([kind, cells]) =>
        montar(kind, headerCells, cols, cells));
      return { reports: reports.filter((r) => r.rows.length) };
    }

    if (cols.name == null) throw new Error('Faltou a coluna de identificação (Campanha, Palavra-chave, Termo, Dispositivo ou Local).');
    const rep = montar(detectKind(headerCells), headerCells, cols, corpo);
    if (!rep.rows.length) throw new Error('Cabeçalho reconhecido, mas nenhuma linha de dados foi lida.');
    return { reports: [rep] };
  }

  /** Converte as linhas de um nível em um relatório pronto. */
  function montar(kind, headerCells, colsBase, corpo) {
    const cols = Object.assign({}, colsBase);
    cols.name = pickNameColumn(headerCells, kind, cols.name);

    // Colunas de origem: a campanha e o grupo a que a linha pertence.
    const ctxIdx = headerCells.findIndex((h) => ['campanha', 'campaign'].includes(norm(h)));
    const grpIdx = headerCells.findIndex((h) => ['grupodeanuncios', 'adgroup'].includes(norm(h)));

    /* Dimensões que descrevem a linha sem serem o nome dela. Ficam em campos
       próprios para virarem coluna na tabela e recorte nos gráficos. */
    const idxDe = (nomes) => headerCells.findIndex((h) => nomes.includes(norm(h)));
    const DIMS = {
      adType:    idxDe(['tipodeanuncio', 'adtype']),
      matchType: idxDe(['tipodecorrespondencia', 'tipodecorresp', 'matchtype']),
      cidade:    idxDe(['cidade', 'city']),
      regiao:    idxDe(['regiao', 'region', 'estado']),
      pais:      idxDe(['pais', 'country']),
    };

    const rows = [];
    corpo.forEach((cells) => {
      const name = (cells[cols.name] || '').trim();
      if (!name) return;
      if (/^total/.test(norm(name))) return;      // rodapé de totais do Google
      if (/^-{1,2}$/.test(name)) return;          // " --" onde não há valor

      // Campanha e grupo ficam em campos próprios, além do texto combinado:
      // sem isso não dá para dizer a que grupo cada palavra-chave pertence,
      // nem agrupar por isso na tela.
      const campanha = ctxIdx >= 0 && ctxIdx !== cols.name ? (cells[ctxIdx] || '').trim() : '';
      const grupo = grpIdx >= 0 && grpIdx !== cols.name ? (cells[grpIdx] || '').trim() : '';
      const contexto = [campanha, grupo].filter(Boolean).join(' › ');

      // Coluna ausente vira null, não 0: "esse export não informa" é diferente
      // de "o valor é zero".
      const g = (f) => (cols[f] != null ? parseNum(cells[cols[f]]) : null);
      const cost = g('cost'), clicks = g('clicks'), impressions = g('impressions');
      const conversions = g('conversions'), convValue = g('convValue');
      const date = cols.date != null ? parseDate(cells[cols.date]) : null;

      const linha = {
        name, contexto, campanha, grupo, date,
        impressions, clicks, cost, conversions, convValue,
        phoneCalls: g('phoneCalls'),
        callImpressions: g('callImpressions'),
        // Percentuais do leilão. "< 10%" vira 10 — a Google esconde o valor
        // exato abaixo desse piso, então o número é um teto, não a medida.
        searchIS: g('searchIS'),
        searchLostBudget: g('searchLostBudget'),
        searchLostRank: g('searchLostRank'),
        absTopIS: g('absTopIS'),
        topIS: g('topIS'),
        searchTopIS: g('searchTopIS'),
        ctr: cols.ctr != null ? g('ctr') : razao(clicks, impressions, 100),
        avgCpc: cols.avgCpc != null ? g('avgCpc') : razao(cost, clicks),
        costPerConv: cols.costPerConv != null ? g('costPerConv') : razao(cost, conversions),
        roas: cols.roas != null ? g('roas') : razao(convValue, cost),
      };
      Object.keys(DIMS).forEach((d) => {
        linha[d] = DIMS[d] >= 0 && DIMS[d] !== cols.name ? (cells[DIMS[d]] || '').trim() : '';
      });
      rows.push(linha);
    });

    return { kind, kindLabel: KIND_LABEL[kind], rows: aggregate(rows), columns: Object.keys(cols) };
  }

  /** Soma linhas que descrevem a mesma coisa.
   *  O Google permite segmentar o relatório (por "Topo x outro", por rede, por
   *  dia), e aí a MESMA campanha aparece uma vez por segmento. Sem somar, a
   *  tabela mostra a campanha repetida 29 vezes, cada uma com um pedaço do
   *  investimento. As métricas derivadas são recalculadas do total — média de
   *  CPC entre segmentos não é o CPC do conjunto. */
  /** Junta um conjunto de linhas numa só, respeitando a natureza de cada
   *  métrica: aditivas somam, percentuais de leilão viram média ponderada por
   *  impressões, e as derivadas são recalculadas do total — média de CPC entre
   *  linhas não é o CPC do conjunto. */
  function combinar(linhas, base) {
    const r = Object.assign({}, base || linhas[0]);

    ADITIVAS.forEach((f) => {
      r[f] = linhas.every((x) => x[f] == null) ? null : U.sum(linhas, (x) => U.num(x[f]));
    });

    PONDERADAS.forEach((f) => {
      const validas = linhas.filter((x) => x[f] != null);
      if (!validas.length) { r[f] = null; return; }
      const peso = U.sum(validas, (x) => U.num(x.impressions));
      // Sem impressões para pesar, cai na média simples — melhor que descartar.
      r[f] = peso > 0
        ? U.sum(validas, (x) => U.num(x[f]) * U.num(x.impressions)) / peso
        : U.sum(validas, (x) => U.num(x[f])) / validas.length;
    });

    r.ctr = razao(r.clicks, r.impressions, 100);
    r.avgCpc = razao(r.cost, r.clicks);
    r.costPerConv = razao(r.cost, r.conversions);
    r.roas = razao(r.convValue, r.cost);
    return r;
  }

  function aggregate(rows) {
    const mapa = new Map();
    rows.forEach((r) => {
      // A data entra na chave: somar linhas de dias diferentes destruiria
      // exatamente a série diária que o export segmentado veio trazer.
      const k = r.name + '\u0000' + (r.contexto || '') + '\u0000' + (r.date || '');
      if (!mapa.has(k)) mapa.set(k, []);
      mapa.get(k).push(r);
    });
    return Array.from(mapa.values()).map((linhas) => combinar(linhas));
  }

  /** Totais consolidados a partir do relatório de campanhas
   *  (é o único que representa a conta inteira sem dupla contagem). */
  function totals(rows) {
    if (!rows.length) return combinar([{}], {});
    return combinar(rows, {});
  }

  /** Guarda o relatório dentro do seu tipo, POR ARQUIVO.
   *  Dois exports podem ser do mesmo tipo e não se substituir: as palavras-chave
   *  saem um arquivo por grupo de anúncios, e guardar só um descartaria o outro
   *  em silêncio. Reimportar o mesmo nome de arquivo substitui aquele, só. */
  function ingest(clientId, parsed, fileName) {
    const cur = AG.store.gadsFor(clientId) || { reports: {} };
    cur.reports = cur.reports || {};
    // Um arquivo consolidado alimenta vários tipos de uma vez.
    (parsed.reports || []).forEach((rep) => {
      const slot = cur.reports[rep.kind] || { kindLabel: rep.kindLabel, files: {} };
      slot.files = slot.files || {};
      slot.kindLabel = rep.kindLabel;
      slot.files[fileName] = { rows: rep.rows, importedAt: Date.now() };
      slot.importedAt = Date.now();
      cur.reports[rep.kind] = slot;
    });
    cur.importedAt = Date.now();
    AG.store.setGads(clientId, cur);
    return cur;
  }

  /** Achata um slot em linhas, marcando de qual arquivo cada uma veio.
   *  Em relatório sem coluna de campanha ou grupo, o nome do arquivo é a única
   *  pista de origem — é o que separa as palavras-chave de um grupo das de
   *  outro. Aceita também o formato antigo, com `rows` na raiz. */
  function rowsOf(slot) {
    if (!slot) return [];
    if (Array.isArray(slot.rows)) return slot.rows.map((r) => Object.assign({ origem: slot.fileName || '' }, r));
    return Object.keys(slot.files || {}).flatMap((f) =>
      (slot.files[f].rows || []).map((r) => Object.assign({}, r, { origem: f.replace(/\.[^.]+$/, '') })));
  }

  const fileNames = (slot) => (slot && slot.files ? Object.keys(slot.files) : (slot && slot.fileName ? [slot.fileName] : []));

  /** Mantém só as linhas da campanha escolhida.
   *  Relatório sem coluna de campanha (palavras-chave, anúncios, termos) passa
   *  inteiro: o próprio export já foi feito dentro de uma campanha, e descartar
   *  essas linhas esvaziaria a página sem motivo. */
  function filterByCampaign(rows, campanha, kind) {
    const alvo = norm(campanha || '');
    if (!alvo) return rows;
    return rows.filter((r) => {
      // No relatório de campanha, a campanha É o nome da linha.
      if (kind === 'campaigns') return norm(r.name).includes(alvo);
      // Nos demais, filtra pela campanha de origem quando a linha a trouxe.
      if (r.contexto) return norm(r.contexto).includes(alvo);
      // Export sem coluna de campanha (palavras-chave, anúncios, termos) já
      // saiu de dentro de uma campanha: descartar aqui esvaziaria a página.
      return true;
    });
  }

  /** Soma as linhas por data, para a série diária da conta. */
  function daily(rows) {
    const porDia = new Map();
    rows.filter((r) => r.date).forEach((r) => {
      if (!porDia.has(r.date)) porDia.set(r.date, []);
      porDia.get(r.date).push(r);
    });
    return Array.from(porDia.entries())
      .sort((a, b) => (a[0] < b[0] ? -1 : 1))
      .map(([date, linhas]) => combinar(linhas, { date }));
  }

  const hasDates = (rows) => rows.some((r) => r.date);

  /** Soma as linhas de todas as datas, deixando uma por entidade.
   *  Com export diário, a mesma campanha ou grupo aparece uma vez por dia —
   *  um ranking precisa somar isso, senão mostra o mesmo nome N vezes, cada
   *  um com um pedaço do investimento. A dimensão tempo continua viva na
   *  série diária, que é onde ela informa. */
  function collapseDates(rows) {
    return aggregate(rows.map((r) => Object.assign({}, r, { date: null })));
  }

  /** Grupos de anúncios presentes nas linhas, para montar o filtro da tela. */
  function gruposDe(rows) {
    return Array.from(new Set(rows.map((r) => r.grupo).filter(Boolean))).sort();
  }

  /** Mantém só as linhas do grupo escolhido. Linha sem grupo passa: nem todo
   *  relatório traz essa coluna, e sumir com Campanhas ao filtrar por grupo
   *  seria uma surpresa ruim. */
  function filterByGroup(rows, grupo, kind) {
    if (!grupo) return rows;
    return rows.filter((r) => {
      // No relatório de grupos, o grupo É o nome da linha.
      if (kind === 'adgroups') return r.name === grupo;
      if (r.grupo) return r.grupo === grupo;
      // Relatório sem coluna de grupo (Localizações, Dispositivos, Campanhas)
      // não tem como ser dividido: passa inteiro, e a tela avisa isso.
      return true;
    });
  }

  /** Tipos de relatório que não trazem a coluna de grupo — usados para avisar
   *  na tela que aqueles números continuam sendo os da conta toda. */
  function semGrupo(reports, kinds) {
    return kinds.filter((k) => {
      if (k === 'adgroups' || k === 'campaigns') return false;
      const linhas = rowsOf(reports[k]);
      return linhas.length && !linhas.some((r) => r.grupo);
    });
  }

  /** Mantém as linhas dentro do período escolhido no topo do dashboard.
   *  Linha sem data passa: o export não segmentado não tem como ser recortado. */
  function filterByRange(rows, range) {
    if (!range || !range.since || !range.until) return rows;
    return rows.filter((r) => !r.date || (r.date >= range.since && r.date <= range.until));
  }

  return { parse, totals, ingest, rowsOf, fileNames, filterByCampaign, filterByRange,
           aggregate, combinar, collapseDates, daily, hasDates, parseDate, gruposDe,
           filterByGroup, semGrupo, ADITIVAS, PONDERADAS, KIND_LABEL, parseNum, norm };
})();
