alter table public.caepi_datasets enable row level security;
alter table public.caepi_records enable row level security;

revoke all on public.caepi_datasets from anon, authenticated;
revoke all on public.caepi_records from anon, authenticated;

grant select on public.caepi_datasets to anon, authenticated;
grant select on public.caepi_records to anon, authenticated;

grant select, insert, update, delete on public.caepi_datasets to service_role;
grant select, insert, update, delete on public.caepi_records to service_role;
grant usage, select on sequence public.caepi_records_id_seq to service_role;

drop policy if exists "caepi_datasets_read_active" on public.caepi_datasets;
create policy "caepi_datasets_read_active"
on public.caepi_datasets
for select
to anon, authenticated
using (status = 'active');

drop policy if exists "caepi_records_read_active" on public.caepi_records;
create policy "caepi_records_read_active"
on public.caepi_records
for select
to anon, authenticated
using (
  exists (
    select 1
    from public.caepi_datasets d
    where d.id = caepi_records.dataset_id
      and d.status = 'active'
  )
);

drop policy if exists "caepi_datasets_service_write" on public.caepi_datasets;
create policy "caepi_datasets_service_write"
on public.caepi_datasets
for all
to service_role
using (true)
with check (true);

drop policy if exists "caepi_records_service_write" on public.caepi_records;
create policy "caepi_records_service_write"
on public.caepi_records
for all
to service_role
using (true)
with check (true);
