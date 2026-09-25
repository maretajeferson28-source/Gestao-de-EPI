\set ON_ERROR_STOP on
begin;
set local statement_timeout = '15min';

create temp table caepi_import_stage (
  record_hash text not null,
  ca text not null,
  data_validade date,
  situacao text,
  fabricante text,
  cnpj text,
  equipamento text,
  descricao text,
  marca text,
  referencia text,
  norma text,
  laudos jsonb,
  raw jsonb not null
) on commit drop;

\copy caepi_import_stage (record_hash,ca,data_validade,situacao,fabricante,cnpj,equipamento,descricao,marca,referencia,norma,laudos,raw) from '__CSV_PATH__' with (format csv, header true, encoding 'UTF8');

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

insert into public.caepi_records (
  dataset_id, record_hash, ca, data_validade, situacao, fabricante, cnpj,
  equipamento, descricao, marca, referencia, norma, laudos, raw
)
select
  :'dataset_id'::uuid,
  record_hash,
  ca,
  data_validade,
  nullif(situacao,''),
  nullif(fabricante,''),
  nullif(cnpj,''),
  nullif(equipamento,''),
  nullif(descricao,''),
  nullif(marca,''),
  nullif(referencia,''),
  nullif(norma,''),
  laudos,
  raw
from caepi_import_stage
on conflict (dataset_id, record_hash) do nothing;

select public.caepi_activate_dataset(:'dataset_id'::uuid);

commit;
