# NF-e e estoque

Importar não grava dados. **Salvar entrada** envia o XML original, a chave de
acesso e todas as linhas para `epi_save_nfe`, em uma única transação. Reimportar
a mesma chave atualiza a nota sem duplicar estoque. Se ocorrer erro, a nota e
os itens anteriores permanecem intactos.

A conferência usa a nota selecionada no visualizador, inclusive em lotes com
XML inválido. O C.A. é extraído da descrição e de `infAdProd`, com ou sem pontos,
e o vínculo prioriza um C.A. único cadastrado. A descrição só é vinculada se os
termos do nome cadastrado estiverem presentes e não houver empate. É possível
corrigir o vínculo manualmente.

`quantidade` preserva `qCom` e `unidade` preserva `uCom`. `quantidade_estoque`
é o número de itens usado no saldo. UN/peça e PAR recebem a quantidade da NF;
PAR representa um par, não duas peças. Para CX/PCT e unidades desconhecidas,
informar explicitamente a quantidade de itens após a conversão. Linhas sem
EPI ou sem conversão ficam salvas como pendentes, mas não aumentam o saldo.

`epi_stock_summary` agrega todas as linhas no banco, sem limite de paginação:
entradas vinculadas de notas com status `entrada` menos novas movimentações.
O início é a primeira nota cadastrada (não sua data de emissão). Movimentações
anteriores ficam preservadas no histórico com `contabiliza_estoque=false`, sem
reduzir o saldo. Novas movimentações recebem `true` por padrão, mesmo com data
informada retroativa. Editar uma saída antiga não a inclui no estoque.
Valores negativos são mostrados com aviso. Editar/excluir uma nova movimentação altera o saldo
derivado; não há um contador separado que possa ficar desatualizado.

O botão de busca filtra o saldo pelo nome do EPI. `epi_id`, C.A., unidade e
quantidades permanecem gravados para evoluir para filtros detalhados. Mínimo
é mostrado como não configurado; crítico indica itens com saldo zero/negativo.

As RPCs usam SECURITY INVOKER, RLS e a autorização administrativa existente.
São negadas para anônimos e usuários não administradores.

## Verificação

- `node --test scripts/test-nfe-stock.mjs scripts/test-mobile-pwa.mjs`
- `supabase/test-nfe-stock.sql`: execução administrativa de diagnóstico,
  com `ROLLBACK` obrigatório; não deixa registros sintéticos no banco.
- `supabase/nfe-stock.sql`: SQL da migração aplicada remotamente
  `atomic_nfe_save_and_stock_balance`.
- `supabase/stock-notes-start.sql`: aplicar depois do SQL acima; migração
  `stock_start_from_registered_notes`. A marcação inicial ocorre uma única vez.
