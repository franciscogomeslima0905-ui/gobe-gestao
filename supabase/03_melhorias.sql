-- =====================================================================
--  GB GOBÊ · Parte 3: entrega/retirada, endereço e configurações
--  Rode DEPOIS dos arquivos 1 e 2. Pode rodar mais de uma vez.
-- =====================================================================

-- Pedido: entrega ou retirada + endereço
alter table public.orders add column if not exists fulfillment text not null default 'entrega';
alter table public.orders add column if not exists address text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'orders_fulfillment_check') then
    alter table public.orders add constraint orders_fulfillment_check check (fulfillment in ('entrega','retirada'));
  end if;
end $$;

-- Configurações do sistema (chave Pix, limite de produção por dia…)
create table if not exists public.app_settings (
  id         text primary key,
  value      jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists app_settings_touch on public.app_settings;
create trigger app_settings_touch before update on public.app_settings
  for each row execute function public.touch_updated_at();

alter table public.app_settings enable row level security;
drop policy if exists "equipe_select" on public.app_settings;
drop policy if exists "equipe_insert" on public.app_settings;
drop policy if exists "equipe_update" on public.app_settings;
drop policy if exists "equipe_delete" on public.app_settings;
create policy "equipe_select" on public.app_settings for select to authenticated using (public.is_staff());
create policy "equipe_insert" on public.app_settings for insert to authenticated with check (public.is_staff());
create policy "equipe_update" on public.app_settings for update to authenticated using (public.is_staff()) with check (public.is_staff());
create policy "equipe_delete" on public.app_settings for delete to authenticated using (public.is_staff());
revoke all on public.app_settings from anon;
grant select, insert, update, delete on public.app_settings to authenticated;

do $$
begin
  if not exists (select 1 from pg_publication_tables
                 where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'app_settings') then
    alter publication supabase_realtime add table public.app_settings;
  end if;
end $$;
