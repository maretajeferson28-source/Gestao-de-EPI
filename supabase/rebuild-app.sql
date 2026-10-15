-- Estrutura reproduzível do Gestão de EPI. Não contém dados recuperados.
create schema if not exists epi_private;
revoke all on schema epi_private from public,anon;
grant usage on schema epi_private to authenticated;

create table public.usuarios_autorizados (
  email text primary key check (email=lower(trim(email))),
  nome text, ativo boolean not null default false, admin boolean not null default false,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.colaboradores (
  id uuid primary key default gen_random_uuid(), nome text not null check(length(trim(nome))>0),
  cargo text,setor text,ativo boolean not null default true,origem text,origem_registro_id text,
  created_at timestamptz not null default now(),updated_at timestamptz not null default now()
);
create table public.epis (
  id uuid primary key default gen_random_uuid(),nome text not null check(length(trim(nome))>0),categoria text,
  ativo boolean not null default true,origem text,origem_registro_id text,
  imagem_path text,imagem_nome text,imagem_updated_at timestamptz,
  created_at timestamptz not null default now(),updated_at timestamptz not null default now()
);
create table public.epi_variantes (
  id uuid primary key default gen_random_uuid(),epi_id uuid not null references public.epis(id) on delete cascade,
  ca text not null check(length(trim(ca)) between 1 and 80),fabricante text,cnpj text,marca text,referencia text,
  descricao text,data_validade date,situacao text,norma text,caracteristicas text,
  preco numeric check(preco>=0),preco_referencia numeric check(preco_referencia>=0),
  preco_promocional numeric check(preco_promocional>=0),
  comparativo_status text check(comparativo_status in ('atual','passada')),fornecedor text,unidade text default 'un',
  observacao text,imagem_path text,imagem_nome text,imagem_updated_at timestamptz,
  ativo boolean not null default true,origem text,
  created_at timestamptz not null default now(),updated_at timestamptz not null default now(),unique(epi_id,ca)
);
create table public.movimentacoes_epi (
  id uuid primary key default gen_random_uuid(),data date not null,
  colaborador_id uuid references public.colaboradores(id) on delete set null,colaborador_nome_informado text,
  epi_id uuid references public.epis(id) on delete set null,epi_nome_original text,
  quantidade numeric not null check(quantidade>0 and quantidade::text not in ('NaN','Infinity','-Infinity')),
  ca text,tamanho text,responsavel text not null,observacao text,origem text,origem_registro_id text,
  contabiliza_estoque boolean not null default true,
  created_at timestamptz not null default now(),updated_at timestamptz not null default now()
);
create index movimentacoes_epi_colaborador_idx on public.movimentacoes_epi(colaborador_id);
create index movimentacoes_epi_epi_idx on public.movimentacoes_epi(epi_id);
create index movimentacoes_epi_data_idx on public.movimentacoes_epi(data desc);
create table public.nfe_entradas (
  id uuid primary key default gen_random_uuid(),chave_acesso text not null unique check(chave_acesso ~ '^[0-9]{44}$'),
  numero text,serie text,emitente_nome text,emitente_documento text,data_emissao timestamptz,
  valor_total numeric not null default 0,arquivo_nome text,xml_original text not null,
  status text not null default 'entrada' check(status in ('entrada','cancelada')),
  dados jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),updated_at timestamptz not null default now()
);
create table public.nfe_entrada_itens (
  id uuid primary key default gen_random_uuid(),nfe_entrada_id uuid not null references public.nfe_entradas(id) on delete cascade,
  indice integer not null,codigo_produto text,descricao text,ncm text,cfop text,unidade text,
  quantidade numeric not null,quantidade_estoque numeric,valor_unitario numeric default 0,valor_total numeric default 0,
  ca_detectado text,epi_id uuid references public.epis(id) on delete set null,match_score numeric,dados jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),unique(nfe_entrada_id,indice)
);
create index nfe_entrada_itens_epi_stock_idx on public.nfe_entrada_itens(epi_id);

-- Somente helpers internos leem a lista de autorizações sem RLS.
-- Nunca usam metadados editáveis pelo usuário para decidir permissões.
create function epi_private.is_authorized() returns boolean language sql stable security definer set search_path='' as $$
  select auth.uid() is not null and exists(select 1 from public.usuarios_autorizados u
    where u.email=lower(auth.jwt()->>'email') and u.ativo);
$$;
create function epi_private.is_admin() returns boolean language sql stable security definer set search_path='' as $$
  select auth.uid() is not null and exists(select 1 from public.usuarios_autorizados u
    where u.email=lower(auth.jwt()->>'email') and u.ativo and u.admin);
$$;
create function public.epi_admin_is_admin() returns boolean language sql stable security invoker set search_path='' as $$
  select epi_private.is_admin();
$$;
create function public.epi_user_is_authorized() returns boolean language sql stable security invoker set search_path='' as $$
  select epi_private.is_authorized();
$$;
create function epi_private.register_access_request() returns setof public.usuarios_autorizados
language plpgsql security definer set search_path='' as $$
declare v_email text; v_nome text;
begin
  if auth.uid() is null then raise exception 'Autenticação obrigatória.' using errcode='42501'; end if;
  select lower(email),coalesce(raw_user_meta_data->>'full_name',raw_user_meta_data->>'name') into v_email,v_nome
    from auth.users where id=auth.uid();
  if v_email is null then raise exception 'Conta sem e-mail.'; end if;
  insert into public.usuarios_autorizados(email,nome) values(v_email,v_nome) on conflict(email) do nothing;
  return query select * from public.usuarios_autorizados u where u.email=v_email;
end;
$$;
create function public.epi_register_access_request() returns setof public.usuarios_autorizados
language sql security invoker set search_path='' as $$ select * from epi_private.register_access_request(); $$;
create function epi_private.admin_list_users() returns setof public.usuarios_autorizados
language plpgsql security definer set search_path='' as $$
begin
  if not epi_private.is_admin() then raise exception 'Somente administradores.' using errcode='42501'; end if;
  return query select * from public.usuarios_autorizados order by nome nulls last,email;
end;
$$;
create function public.epi_admin_list_users() returns setof public.usuarios_autorizados
language sql security invoker set search_path='' as $$ select * from epi_private.admin_list_users(); $$;
create function epi_private.admin_save_user(p_email text,p_nome text,p_ativo boolean) returns void
language plpgsql security definer set search_path='' as $$
declare v_email text:=lower(trim(p_email));
begin
  if not epi_private.is_admin() then raise exception 'Somente administradores.' using errcode='42501'; end if;
  if v_email is null or v_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then raise exception 'E-mail inválido.'; end if;
  if exists(select 1 from public.usuarios_autorizados where email=v_email and admin) then raise exception 'Administrador protegido.'; end if;
  insert into public.usuarios_autorizados(email,nome,ativo) values(v_email,p_nome,coalesce(p_ativo,false))
    on conflict(email) do update set nome=excluded.nome,ativo=excluded.ativo,updated_at=now();
end;
$$;
create function public.epi_admin_save_user(p_email text,p_nome text,p_ativo boolean) returns void
language sql security invoker set search_path='' as $$ select epi_private.admin_save_user(p_email,p_nome,p_ativo); $$;
create function epi_private.admin_set_active(p_email text,p_ativo boolean) returns void
language plpgsql security definer set search_path='' as $$
begin
  if not epi_private.is_admin() then raise exception 'Somente administradores.' using errcode='42501'; end if;
  if exists(select 1 from public.usuarios_autorizados where email=lower(trim(p_email)) and admin) then raise exception 'Administrador protegido.'; end if;
  update public.usuarios_autorizados set ativo=coalesce(p_ativo,false),updated_at=now() where email=lower(trim(p_email));
end;
$$;
create function public.epi_admin_set_active(p_email text,p_ativo boolean) returns void
language sql security invoker set search_path='' as $$ select epi_private.admin_set_active(p_email,p_ativo); $$;
create function epi_private.admin_delete_user(p_email text) returns void
language plpgsql security definer set search_path='' as $$
begin
  if not epi_private.is_admin() then raise exception 'Somente administradores.' using errcode='42501'; end if;
  if exists(select 1 from public.usuarios_autorizados where email=lower(trim(p_email)) and admin) then raise exception 'Administrador protegido.'; end if;
  delete from public.usuarios_autorizados where email=lower(trim(p_email));
end;
$$;
create function public.epi_admin_delete_user(p_email text) returns void
language sql security invoker set search_path='' as $$ select epi_private.admin_delete_user(p_email); $$;

revoke all on all functions in schema epi_private from public,anon;
grant execute on all functions in schema epi_private to authenticated;
revoke all on function public.epi_admin_is_admin(),public.epi_user_is_authorized(),public.epi_register_access_request(),
  public.epi_admin_list_users(),public.epi_admin_save_user(text,text,boolean),public.epi_admin_set_active(text,boolean),public.epi_admin_delete_user(text) from public,anon;
grant execute on function public.epi_admin_is_admin(),public.epi_user_is_authorized(),public.epi_register_access_request(),
  public.epi_admin_list_users(),public.epi_admin_save_user(text,text,boolean),public.epi_admin_set_active(text,boolean),public.epi_admin_delete_user(text) to authenticated;

alter table public.usuarios_autorizados enable row level security;
revoke all on public.usuarios_autorizados from public,anon,authenticated;
-- Confirmado pelo proprietário; não cria uma conta Auth nem uma senha.
insert into public.usuarios_autorizados(email,nome,ativo,admin) values('maretajeferson28@gmail.com','Jeferson',true,true);
do $$
declare t text;
begin
  foreach t in array array['colaboradores','epis','epi_variantes','movimentacoes_epi','nfe_entradas','nfe_entrada_itens'] loop
    execute format('alter table public.%I enable row level security',t);
    execute format('revoke all on public.%I from public,anon,authenticated',t);
    execute format('grant select,insert,update,delete on public.%I to authenticated',t);
    execute format('grant all on public.%I to service_role',t);
    if t in ('nfe_entradas','nfe_entrada_itens') then
      execute format('create policy admin_access on public.%I for all to authenticated using ((select epi_private.is_admin())) with check ((select epi_private.is_admin()))',t);
    else
      execute format('create policy authorized_read on public.%I for select to authenticated using ((select epi_private.is_authorized()))',t);
      execute format('create policy admin_write on public.%I for all to authenticated using ((select epi_private.is_admin())) with check ((select epi_private.is_admin()))',t);
    end if;
  end loop;
end;
$$;

-- Arquivos: fotos do catálogo privadas, avatares públicos conforme o app existente.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values
  ('epi-imagens','epi-imagens',false,5242880,array['image/jpeg','image/png','image/webp']),
  ('profile-avatars','profile-avatars',true,2097152,array['image/jpeg','image/png','image/webp'])
on conflict(id) do nothing;
create policy epi_images_read on storage.objects for select to authenticated
  using(bucket_id='epi-imagens' and (select epi_private.is_authorized()));
create policy epi_images_admin on storage.objects for all to authenticated
  using(bucket_id='epi-imagens' and (select epi_private.is_admin()))
  with check(bucket_id='epi-imagens' and (select epi_private.is_admin()));
create policy own_avatar on storage.objects for all to authenticated
  using(bucket_id='profile-avatars' and (storage.foldername(name))[1]=(select auth.uid())::text)
  with check(bucket_id='profile-avatars' and (storage.foldername(name))[1]=(select auth.uid())::text);

alter publication supabase_realtime add table public.movimentacoes_epi,public.colaboradores,public.epis;
notify pgrst,'reload schema';
