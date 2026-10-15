\set ON_ERROR_STOP on
-- Abrange toda a carga, não só a troca final. Falha imediatamente se outro
-- importador já estiver trabalhando (inclusive fora do GitHub Actions).
select pg_try_advisory_lock(hashtext('caepi_import_dataset')) as lock_acquired \gset
\if :lock_acquired
\else
  \echo 'CAEPI: outra importação está em andamento.'
  do $$ begin raise exception 'Outra importação CAEPI está em andamento'; end $$;
\endif

-- Revalida o hash dentro da sessão exclusiva para evitar uma segunda
-- cópia caso outra execução tenha publicado a mesma fonte nesse intervalo.
select exists(select 1 from public.caepi_datasets where status = 'active' and source_hash = :'source_hash') as already_active \gset
\if :already_active
  \echo 'CAEPI: conteúdo já ativo; nada a importar.'
  \quit
\endif

-- Torna reutilizáveis as páginas deixadas por uma tentativa abortada.
vacuum (analyze) public.caepi_records;

begin;
set local statement_timeout = '15min';
set local lock_timeout = '10s';

insert into public.caepi_datasets (
  id, source_type, source_url, source_hash, status,
  ignored_rows, archive_bytes, txt_bytes, metadata, started_at
) values (
  :'dataset_id'::uuid,
  :'source_type',
  :'source_url',
  :'source_hash',
  'importing',
  :'ignored_rows'::integer,
  :'archive_bytes'::bigint,
  :'txt_bytes'::bigint,
  :'metadata'::jsonb,
  now()
);

-- Copia diretamente para a tabela final. A versão anterior continua ativa
-- durante a carga e a transação inteira é revertida se o COPY falhar.
\copy public.caepi_records (dataset_id, record_hash, ca, data_validade, situacao, fabricante, cnpj, equipamento, descricao, marca, referencia, norma, laudos, raw) from '__CSV_PATH__' with (format csv, header true, encoding 'UTF8');

-- Este é o tamanho REAL durante o pico (versão anterior + nova + índices).
-- O orçamento preliminar no Node é apenas uma estimativa conservadora.
select pg_database_size(current_database()) <= :'max_db_bytes'::bigint as within_budget \gset
\if :within_budget
\else
  rollback;
  \echo 'CAEPI: orçamento de banco excedido; transação revertida.'
  do $$ begin raise exception 'Orçamento de banco excedido'; end $$;
\endif

select public.caepi_activate_dataset(:'dataset_id'::uuid);

commit;

vacuum (analyze) public.caepi_records;
select pg_database_size(current_database()) as database_bytes,
       pg_total_relation_size('public.caepi_records') as caepi_bytes;
select pg_advisory_unlock(hashtext('caepi_import_dataset'));
