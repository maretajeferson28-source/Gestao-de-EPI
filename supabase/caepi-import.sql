\set ON_ERROR_STOP on
-- Torna reutilizáveis as páginas deixadas por uma tentativa abortada.
vacuum (analyze) public.caepi_records;

begin;
set local statement_timeout = '15min';

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

select public.caepi_activate_dataset(:'dataset_id'::uuid);

commit;

vacuum (analyze) public.caepi_records;
