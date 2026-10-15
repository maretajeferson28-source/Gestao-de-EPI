# Operação segura do CAEPI

O workflow `Sync CAEPI` é **somente manual**, sem cron. O modo padrão é
`validate`: baixa, valida e prepara a fonte oficial sem credencial de banco.
Um erro encerra a execução; não há fallback automático nem repetição de carga.

## Validação

No GitHub Actions, escolher `Run workflow` → `mode: validate`.
Antes de baixar, o workflow executa os testes do extrator e das proteções.
O arquivo oficial pode conter várias linhas diferentes por C.A.; isso não
significa duplicação de datasets. Apenas linhas exatamente iguais são omitidas.

Também é possível validar um arquivo local, sem rede nem acesso ao banco,
no PowerShell (caminhos são exemplos, substituir por arquivos existentes):

```powershell
$env:CAEPI_DRY_RUN = '1'
$env:CAEPI_ARCHIVE_PATH = 'C:\dados\caepi-oficial.bin'
$env:CAEPI_REPORT_PATH = 'C:\dados\relatorio-caepi.json'
node scripts/sync-caepi-to-supabase.mjs
```

Para baixar em vez de usar um arquivo local, remover `CAEPI_ARCHIVE_PATH` e
definir `CAEPI_DOWNLOAD_METHOD` como `browser` ou `curl`. O método `browser`
exige navegador instalado; no runner Linux, roda dentro do Xvfb.

As validações incluem CRC/tamanho do GZIP, cabeçalhos obrigatórios e únicos,
largura das linhas, datas de calendário, C.A. numérico, caracteres inválidos,
duplicatas exatas, mínimo de 80.000 registros e 25.000 C.A.s distintos.
Campos ausentes são contabilizados, nunca completados por adivinhação.
Limites: download de 64 MiB; arquivo extraído e CSV preparado de 256 MiB.

## Primeira carga — exige liberação separada

1. Revisar o relatório da validação e dimensionar o banco.
2. Configurar o **novo secret `CAEPI_DB_URL`**, exclusivamente com a conexão
   PostgreSQL do projeto `jrzviiaywfjaawwkwgze`. Não reutilizar o nome de secret
   antigo `SUPABASE_DB_URL` para a nova credencial. Não salvar URLs em código.
3. Definir a variável do repositório `CAEPI_SYNC_ENABLED=true`.
4. Executar manualmente `mode: import`. Sem secret/liberação/projeto correto,
   a carga falha fechada. O modo de arquivo local é recusado em importações.
5. Após concluir, conferir os tamanhos medidos e desativar novamente a variável.

O importador mede `pg_database_size` antes da carga. A estimativa conservadora
inclui o banco existente, duas vezes o tamanho do CSV, margem por registro para
índices e 32 MiB adicionais. O orçamento máximo é de **450 MB decimais**.
Isto é uma estimativa, não uma garantia sobre espaço físico ou WAL. Se o orçamento
estimado for excedido, a carga é bloqueada antes do COPY.

Uma trava exclusiva protege toda a carga, inclusive execuções fora do Actions.
O hash é revalidado sob a trava; conteúdo já ativo não é recopiado.
O COPY e a ativação ocorrem numa única transação; o tamanho real é conferido
antes da ativação. Se essa conferência ou o COPY falhar, a transação é revertida.
Uma carga abortada pode deixar páginas físicas reutilizáveis; rollback não
garante redução imediata do arquivo em disco. O próximo import executa VACUUM
normal, sem VACUUM FULL e sem bloquear a tabela inteira para reescrita.

A versão anterior só é removida após validar e ativar a nova dentro da mesma
transação. Após sucesso, conserva-se apenas o dataset ativo. Registros legítimos
diferentes de um mesmo C.A. continuam preservados na fonte ativa.

Não reativar agendamento sem medir o pico de espaço durante uma segunda carga.
Não apagar execuções antigas para tentar corrigir armazenamento do Supabase:
histórico de Actions, RAM, tamanho do banco e WAL são medidas diferentes.

O workflow fixa `CAEPI_APPROVED_HASH` no hash de conteúdo revisado. Se o portal
publicar uma base diferente, a carga será recusada até uma nova validação e
atualização explícita desse hash. Em execução local de importação, esse valor
também é obrigatório. Não há upload de artefatos da base para o GitHub.

## Testes

```text
node --test scripts/test-caepi-sync.mjs scripts/test-supabase-rebuild.mjs
```

Os testes locais cobrem o extrator, parser, validações, hash, deduplicação,
orçamento estimado e estrutura das salvaguardas SQL. Eles **não substituem**
um teste de carga PostgreSQL nem comprovam o tamanho final no banco.
