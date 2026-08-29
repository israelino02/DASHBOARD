# data/

Dados do Google Ads publicados para os links de cliente.

Um arquivo por cliente, nomeado `<slug>.gads.json` — o mesmo slug do
registro em `AG_CLIENTS`.

Para gerar: no console do operador, aba **Google Ads**, importe os CSVs e
clique em **Exportar para o link do cliente**. Salve o arquivo baixado
aqui e faça `git push`; a Vercel republica sozinha.

Estes arquivos contêm dados comerciais de cliente. Eles só são entregues
pela rota `/api/gads`, que exige o slug e a chave daquele cliente —
nunca servidos como estático.
