# DASHBOARD — Dashboard de Performance de Tráfego Pago

Dashboard de 12 páginas para Meta Ads (+ Google Ads via import de CSV), pensado
para entregar resultado a cliente de negócio local: o dono da loja entende em 30
segundos, e você tem profundidade para otimizar.

Roda inteiro no navegador. Sem build, sem `npm install`, sem servidor de
aplicação. Os dados vão direto da Graph API da Meta para a tela.

---

## Como rodar

Na pasta do projeto:

```bash
python3 servir.py
```

Depois abra <http://localhost:8777>.

Use `servir.py` e não `python3 -m http.server`: o servidor embutido do Python só
manda `Last-Modified`, e o navegador passa a servir JS e CSS antigos
indefinidamente — a tela fica com o comportamento de uma versão passada mesmo
depois de o arquivo mudar no disco. O `servir.py` manda `Cache-Control:
no-store`, então cada recarga pega a versão atual.

Se mesmo assim a tela ficar com o comportamento antigo, force uma recarga com
**Cmd+Shift+R**. Os assets também carregam com `?v=N` no `index.html` e no
`cliente.html`; ao mexer no CSS ou no JS, incremente esse número nos dois
arquivos — isso cobre o caso de a página estar aberta em outro navegador ou
publicada na Vercel.

**Não abra o `index.html` com duplo clique.** Em `file://` o navegador manda
origem `null`, e a Graph API recusa a chamada. Qualquer servidor estático serve
— `python3 -m http.server` é só o mais rápido de ter.

Para ver o dashboard funcionando antes de configurar credenciais, clique em
**Demonstração** no topo: ele carrega um conjunto sintético com a forma exata do
retorno real da API. Todo o layout, os gráficos e os insights ficam navegáveis.

---

## Configuração

Aba **Integração API**.

### Token universal (System User)

Um token de System User no Business Manager, com acesso às contas de anúncio dos
clientes. Permissões necessárias:

| Permissão | Para quê |
|---|---|
| `ads_read` | tudo que é campanha, anúncio, criativo e breakdown |
| `pages_read_engagement` | página 10, seguidores e alcance da Página |
| `instagram_basic` | página 10, métricas do Instagram |

Sem as duas últimas o dashboard funciona igual — só a página **Social** fica
limitada ao efeito social medido dentro dos anúncios.

### Por cliente

- **Account ID** — só os números, sem o prefixo `act_`.
- **Token específico** — opcional. Vazio significa "usa o universal".
- **Page ID** e **Instagram Business ID** — opcionais, só para a página Social.

O botão **Testar conexão** confirma token e conta antes de você depender deles.

### Onde as credenciais ficam

No `localStorage` deste navegador, e em nenhum outro lugar. Não há backend. As
únicas chamadas de rede saem para `graph.facebook.com` e, se você usar o resumo
escrito, para a API do Gemini.

Em computador compartilhado: **Exportar configuração** guarda tudo num JSON, e
você limpa os campos ao terminar.

---

## As 12 páginas

| # | Página | O que responde |
|---|---|---|
| 1 | Resumo Executivo | Valeu a pena? KPIs com variação contra o período anterior e leitura de saúde da conta |
| 2 | Receita × Investimento | Quanto entrou por real que saiu, dia a dia, mais ROAS em escala própria |
| 3 | Funil de Captação | Onde as pessoas param, e o custo de cada etapa. Filtrável por campanha |
| 4 | Performance dos Anúncios | Ranking por eficiência, com melhor peça, pior peça e quem gastou sem entregar |
| 5 | Comparativo de Criativos | Qual formato entrega mais barato, com galeria das peças |
| 6 | Posicionamentos | Onde dentro da Meta o dinheiro rende mais |
| 7 | Público | Idade e gênero: quem responde e quanto custa |
| 8 | Localização | Ranking por região |
| 9 | Evolução Temporal | Cada métrica em painel próprio, mais melhor e pior dia |
| 10 | Crescimento Social | O que a mídia paga devolveu em audiência própria |
| 11 | Google Ads | Relatórios importados por CSV |
| 12 | Insights Automáticos | A leitura que o cliente não faz sozinho |

Todas as tabelas são ordenáveis e exportam CSV. **Imprimir / PDF** aplica uma
folha de estilo clara e evita quebra dentro de card.

---

## Google Ads

A API do Google Ads exige OAuth, developer token e um servidor — nada disso
existe num app que roda só no navegador. Em vez de fingir integração, a página 11
lê os relatórios exportados do próprio painel.

No Google Ads: **Campanhas → Relatórios → Download → CSV**. Arraste os arquivos
para a área de import.

Reconhece automaticamente, em português ou inglês, separado por vírgula, ponto e
vírgula ou tabulação:

- Campanhas
- Grupos de anúncios
- Anúncios
- Palavras-chave
- Termos de pesquisa
- Dispositivos
- Localizações

Cada relatório é um nível — o Google exporta uma granularidade por arquivo, não
dá para trazer tudo num CSV só. Mas você pode arrastar todos de uma vez: o tipo
de cada um é detectado pela coluna de identificação.

**Arquivo consolidado.** Se o CSV tiver uma coluna **Nível** (ou Level/Tipo)
com os níveis empilhados — Campanhas, Grupos de anúncios, Anúncios,
Palavras-chave, Termos de pesquisa, Localizações, Dispositivos — um único
arquivo alimenta as sete tabelas de uma vez. É o formato mais prático: um
import, tudo preenchido. Nesse layout a coluna **Cidade**, quando existir, vira
o nome na tabela de Localizações.

**Dois arquivos do mesmo tipo convivem.** As palavras-chave saem um export por
grupo de anúncios; os dois ficam guardados e a tabela mostra de qual arquivo
cada linha veio. Reimportar o mesmo nome de arquivo substitui só aquele.

**Relatório segmentado é somado.** Se o export estiver segmentado (por "Topo x
outro", por rede, por dia), a mesma campanha aparece uma vez por segmento. As
linhas são somadas e as métricas derivadas — CTR, CPC, CPA — recalculadas do
total, porque a média entre segmentos não é a métrica do conjunto.

**Métrica ausente aparece como "—", não como zero.** O relatório de campanha do
Google, por exemplo, não traz coluna de impressões. Mostrar zero ali afirmaria
que a campanha não teve nenhuma, que é diferente de "esse export não informa".

### Métricas reconhecidas

Além de Impr., Cliques, CTR, CPC méd., Custo, Conversões, Custo/conv., Valor de
conv. e Valor conv./custo, o parser lê, quando o export as traz:

**Ligações telefônicas · Impr. de chamadas · % de impr. (1ª posição) ·
% de impr. (parte sup.) · Parc impr pesquisa · Parc impr perd rede de pesquisa
(orç) · Parc impr perd rede de pesquisa (class.) · IS parte sup. pesq.**

Cada uma só aparece na tela se o arquivo a trouxer — um cartão com "—" para
cada coluna ausente encheria a página de nada.

**Os percentuais de leilão não são somados.** Somar 30% de um dia com 40% de
outro daria 70%, que não quer dizer nada. Eles viram média ponderada pelas
impressões, que é como o próprio Google consolida esses índices. Quando o export
traz `< 10%`, o número lido é 10 — a Google esconde o valor exato abaixo desse
piso, então trate como teto.

### Dimensões

As tabelas ganham coluna conforme o export informa: **Grupo**, **Tipo de
anúncio**, **Correspondência** e **Região**. Cada uma aparece só onde existe.
`RESPONSIVE_SEARCH_AD` e `PHRASE` são traduzidos para "Pesquisa responsivo" e
"Frase".

### Gráficos de rosca

Investimento por dispositivo e por cidade saem em rosca quando há **três ou mais
categorias**. Com uma ou duas, viram números com a porcentagem — um anel de duas
fatias lê pior que "92,9% no celular".

### Campanha em foco

O campo no topo da página filtra tudo para uma campanha só. Deixe vazio para ver
todas.

O filtro age onde há informação de campanha: no relatório de Campanhas (onde ela
é o próprio nome da linha) e nos de Grupo de anúncios e Anúncios, quando o export
traz a coluna Campanha. Palavras-chave, Anúncios e Termos de pesquisa exportados
de dentro de um grupo não trazem essa coluna — essas linhas passam inteiras, e a
página avisa isso na tela.

### Série diária

Para ter os números dia a dia, segmente o relatório antes de baixar:

**Segmentar → Tempo → Dia**, depois Download → CSV.

Com a coluna de data presente, a aba ganha três coisas: gráfico de
investimento por dia, painéis diários de cliques, impressões, CTR, CPC,
conversões e CPA, e uma tabela da série. **O seletor de período do topo passa a
recortar a aba Google Ads**, igual faz com a Meta.

A data é lida em três formatos — `2026-08-11`, `11/08/2026` e
`11 de ago. de 2026` — porque a locale da conta muda o export.

Sem coluna de data, a página avisa que o seletor de período não age ali e mostra
o intervalo que você escolheu ao exportar. A coluna Data só aparece nas tabelas
dos relatórios que a trazem.

O parser entende número em pt-BR (`1.234,56`) e en-US (`1,234.56`), ignora as
linhas de total do rodapé e pula o preâmbulo do relatório. Os arquivos são lidos
no navegador — nada é enviado para lugar nenhum.

---

## Limites que vale conhecer de antemão

**Cidade e bairro não existem no relatório da Meta.** O recorte geográfico mais
fino que a API de insights devolve é a região (estado). Para ler por cidade, o
caminho é criar um conjunto de anúncios por cidade e olhar a página de Anúncios.

**Receita e ROAS dependem de compra rastreada.** Os números vêm de
`purchase_roas` e `action_values` da própria Meta. Em conta que roda só campanha
de mensagem, a venda acontece no WhatsApp e a Meta não a enxerga — receita e ROAS
ficam zerados, e o dashboard diz isso na cara em vez de inventar um número. Para
popular essas páginas é preciso pixel/CAPI enviando o valor da conversão.

**O formato do criativo é inferido.** A Meta não expõe um campo "formato". A
classificação usa vídeo / carrossel (múltiplos cartões) / imagem; peças montadas
por Advantage+ podem cair em "Não identificado".

**O dia corrente fica de fora dos presets de "últimos N dias".** Um dia
incompleto distorce CPA e ROAS, então os períodos terminam ontem. "Hoje" e "Mês
atual" incluem o dia corrente de propósito.

**Os dados não são cacheados entre sessões.** Cada Sincronizar busca da API. As
credenciais e os CSVs do Google Ads, sim, ficam salvos.

---

## Estrutura

```
index.html              carrega os módulos na ordem de dependência
assets/css/app.css      tema escuro único
assets/js/
  util.js               formatação pt-BR, datas, períodos, CSV
  store.js              localStorage: clientes, credenciais, preferências
  charts.js             gráficos em SVG puro, sem dependências
  meta.js               cliente da Graph API e normalização das métricas
  gads.js               parser de CSV do Google Ads
  insights.js           motor de insights + narrativa opcional via Gemini
  demo.js               gerador de dados sintéticos
  ui.js                 componentes (KPI, card, tabela, selo, toast)
  pages.js              páginas 1 a 6
  pages2.js             páginas 7 a 12 e configuração
  app.js                navegação, filtros, sincronização
```

### Sobre os gráficos

Feitos à mão em SVG, sem biblioteca externa — a página abre sem rede e sem CDN.

Duas decisões que valem explicar, porque contrariam o que se vê por aí:

**Nenhum gráfico tem eixo Y duplo.** Sobrepor duas escalas diferentes no mesmo
plot inventa uma correlação que não está nos dados. Investimento e Receita
dividem um eixo porque ambos são Reais; investimento contra contagem de leads
vira painéis separados na página Evolução, cada um com sua escala.

**A paleta foi validada, não escolhida no olho.** As 8 cores de série passam nos
testes de separação para daltonismo (protanopia e deuteranopia), faixa de
luminosidade e contraste contra a superfície escura `#0E120F`. As cores de status
(bom / atenção / crítico) são reservadas e nunca viram cor de série — e sempre
aparecem com ícone e rótulo, para que a cor nunca seja o único sinal.

---

## Aviso

Os números da aba **Demonstração** são inventados. Não use em apresentação para
cliente — a faixa amarela no topo está lá justamente para isso.

---

## Links por cliente (GitHub + Vercel)

Cada cliente recebe um endereço próprio — `/c/<slug>` — onde navega o relatório
inteiro, as 12 páginas, com os dados só da conta dele.

O token de System User **nunca chega ao navegador de ninguém**. Ele fica numa
variável de ambiente do servidor, e uma função valida cada requisição antes de
falar com a Meta: o link do cliente A pedindo a conta do cliente B recebe 403 e
a chamada nem sai.

### Cliente só de Google Ads

Um cliente sem `accountId` no registro não tem Meta. O link dele abre direto na
aba Google Ads, e as outras onze somem — elas leem dados da Meta e apareceriam
todas vazias.

Os números vêm de `data/<slug>.gads.json`. Para gerar: no console do operador,
aba **Google Ads**, importe os CSVs e clique em **Exportar para o link do
cliente**. Salve o arquivo em `data/` e faça `git push` — a Vercel republica
sozinha.

Esse arquivo é entregue pela rota `/api/gads`, atrás da mesma validação de slug
e chave que protege a Meta. Ele **não** é servido como estático: `/data/...`
direto no navegador não responde. Como carrega dados comerciais do cliente, **o
repositório precisa continuar privado**.

No link do cliente não aparecem a área de import nem o filtro de campanha — são
controles do operador. O filtro por **grupo de anúncios**, esse sim, fica
visível: é leitura, não configuração.

### Cadastrar um cliente só de Google Ads

No console, **Integração API → + Adicionar cliente**. São dois campos de conta,
e você preenche o que o cliente tem:

| Campo | Para quê |
|---|---|
| **Account ID da Meta** | busca dados da Graph API. Vazio = cliente sem Meta |
| **Customer ID do Google Ads** | identifica de qual conta são os CSVs |

Pelo menos um dos dois é obrigatório. Sem Account ID da Meta, o cliente passa a
ter apenas as abas Google Ads e Integração API, e o dashboard não tenta
sincronizar a Graph API.

O Customer ID do Google Ads **não busca dados sozinho** — o Google Ads continua
entrando por CSV. Ele aparece no topo da aba Google Ads para você não subir o
arquivo do cliente errado, já que o nome do arquivo exportado raramente diz de
quem ele é.

Os relatórios importados ficam guardados no navegador por cliente. Anexar um
CSV novo do mesmo tipo substitui o anterior daquele arquivo e mantém os demais.

### Tudo somado no período

Campanhas, Grupos de anúncios, Anúncios, Palavras-chave, Localizações e
Dispositivos mostram **uma linha por entidade**, somando todos os dias
selecionados — Caruaru aparece uma vez com o total do período, não uma vez por
dia. A dimensão tempo vive na **Série diária** e nos gráficos diários, que é
onde ela informa.

As tabelas aparecem nesta ordem: Campanhas, Grupos de anúncios, Anúncios,
Palavras-chave, Localizações, Dispositivos e, por último, Termos de pesquisa —
a maior lista e a de consulta pontual.

### Cards recolhíveis

Cada bloco tem uma seta no cabeçalho. As tabelas nascem fechadas, mostrando só
o nome; os gráficos nascem abertos. Clicar na seta — ou em qualquer parte do
cabeçalho — abre e fecha, e o estado fica salvo: trocar de período não reabre
tudo de novo.

### Grupos de anúncios

Quando os relatórios trazem a coluna de grupo, a aba ganha um filtro em chips —
*Todos os grupos*, e um por grupo. Escolher um recorta KPIs, gráficos e tabelas
para aquele grupo, e a coluna **Grupo** nas tabelas mostra a qual deles cada
palavra-chave, anúncio ou termo pertence.

Localizações e Dispositivos não trazem grupo no export do Google. Com um grupo
selecionado, esses dois continuam mostrando a campanha inteira — e a tela diz
isso, em vez de deixar o número parecer recortado.

### Publicar

1. Suba o repositório no GitHub. O `.gitignore` já bloqueia `.env` e afins —
   token commitado fica no histórico do Git mesmo depois de apagado, e aí só
   resta revogá-lo na Meta.
2. Importe o repositório na Vercel. Não há build: é site estático + funções.
3. Em **Settings → Environment Variables**, crie:

| Variável | Valor |
|---|---|
| `META_TOKEN` | seu token de System User |
| `AG_CLIENTS` | o JSON do registro (gerado no passo abaixo) |
| `AG_API_VERSION` | opcional, padrão `v23.0` |

4. Redeploy. Variável de ambiente nova só vale no deploy seguinte.

### Cadastrar um cliente

```bash
python3 scripts/gerar-cliente.py "Nome do Cliente" 1234567890 --dominio https://seu-projeto.vercel.app
```

Saem duas coisas: o **link para mandar ao cliente** e o **JSON para colar em
`AG_CLIENTS`**. A chave aparece uma vez só.

Para acrescentar um segundo cliente sem perder o primeiro, passe o registro
atual:

```bash
python3 scripts/gerar-cliente.py "Outro Cliente" 111111111111111 --registro '<JSON atual>'
```

Para revogar um link, troque o `key` daquele cliente e mande um endereço novo.
Os outros não são afetados.

### Como o link se comporta

Na primeira abertura o `?k=…` é guardado no navegador do cliente e **apagado da
barra de endereços** — link com a chave à vista acaba em print de tela e em
grupo de WhatsApp. Nas visitas seguintes, `/c/<slug>` sozinho já funciona
naquele navegador.

Na página do cliente não existe aba de Integração API, nem seletor de clientes,
nem botão de demonstração. Todo o resto funciona: filtros de período, ordenação
das tabelas, exportação de CSV e Imprimir / PDF.

### O que o proxy libera, e só

- `act_<conta do cliente>` — dados da conta
- `act_<conta do cliente>/insights` e `/ads`
- `<pageId>` e `<igId>` do cliente, quando cadastrados

Qualquer outro id é recusado antes de qualquer chamada à Meta. Os parâmetros
passam por lista de permissão, então `access_token` injetado pelo navegador é
descartado. A paginação é resolvida no servidor de propósito: a URL de
`paging.next` que a Meta devolve carrega o token dentro, e repassá-la ao
navegador entregaria a credencial.

### Duas coisas a decidir antes

**O plano Hobby da Vercel é para uso não-comercial.** Relatório de cliente numa
operação de tráfego paga é uso comercial — na régua deles, isso pede o plano
Pro. O Cloudflare Pages + Workers faz o mesmo trabalho com tier gratuito sem
essa restrição.

**A raiz do site (`/`) continua sendo o seu console.** Ela usa o token do seu
próprio navegador e é inofensiva para quem abrir sem credencial — vê a tela de
configuração vazia. Ainda assim, vale proteger com senha de deploy se o domínio
for divulgado.

### Rodar local com as funções

A Vercel CLI precisa de Node. Com ele instalado:

```bash
npx vercel dev
```

Sem Node, o `python3 -m http.server 8777` continua servindo o console do
operador — só as rotas `/api/*` e `/c/<slug>` não funcionam nesse modo.
