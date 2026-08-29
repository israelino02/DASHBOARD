# data/

Dados do Google Ads publicados para os links de cliente — um arquivo por
cliente, `<slug>.gads.json`, com o mesmo slug do registro em `AG_CLIENTS`.

## Antes de usar: o repositório precisa ser privado

Estes arquivos carregam dados comerciais de cliente: campanhas, palavras-chave,
termos de pesquisa e custos, dia a dia. Por isso `data/*.gads.json` está no
`.gitignore` — num repositório público, um `git add -A` distraído publicaria o
relatório inteiro de um cliente, e apagar depois não resolve: fica no histórico.

Com o repositório **privado**, remova a linha `data/*.gads.json` do `.gitignore`
e os arquivos passam a ser versionados normalmente.

Com o repositório **público**, os links de cliente precisam guardar os dados
fora do Git — Vercel Blob, KV, ou um repositório privado separado.

## Como gerar

No console do operador, aba **Google Ads**: importe os CSVs e clique em
**Exportar para o link do cliente**. Salve o arquivo baixado aqui e faça
`git push`; a Vercel republica sozinha.

O arquivo é entregue pela rota `/api/gads`, que exige o slug e a chave daquele
cliente. Nunca é servido como estático.
