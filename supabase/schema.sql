-- =====================================================================
--  GB GOBÊ – Confeitaria Artesanal · Estrutura do banco de dados
--  Rode este arquivo inteiro no Supabase: SQL Editor > New query > Run
-- =====================================================================

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------
-- 1. EQUIPE AUTORIZADA
--    Só quem estiver nesta tabela consegue ver ou alterar qualquer dado.
-- ---------------------------------------------------------------------
create table if not exists public.staff (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  email      text not null,
  name       text,
  created_at timestamptz not null default now()
);

-- Função usada pelas políticas de segurança (RLS)
create or replace function public.is_staff()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.staff where user_id = auth.uid());
$$;

revoke all on function public.is_staff() from public;
grant execute on function public.is_staff() to authenticated;

-- ---------------------------------------------------------------------
-- 2. PRODUTOS
-- ---------------------------------------------------------------------
create table if not exists public.products (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  flavor     text,
  price      numeric(10,2) not null check (price >= 0),
  active     boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- 3. PEDIDOS
-- ---------------------------------------------------------------------
create table if not exists public.orders (
  id                uuid primary key default gen_random_uuid(),
  customer_name     text not null,
  phone             text,
  order_date        date not null default current_date,
  delivery_date     date not null,
  delivery_time     text,
  subtotal          numeric(10,2) not null default 0,
  discount          numeric(10,2) not null default 0 check (discount >= 0),
  delivery_fee      numeric(10,2) not null default 0 check (delivery_fee >= 0),
  total             numeric(10,2) not null default 0,
  payment_method    text not null default 'a_definir'
                    check (payment_method in ('pix','dinheiro','a_definir')),
  payment_status    text not null default 'pendente'
                    check (payment_status in ('pago','pendente','parcial')),
  production_status text not null default 'pendente'
                    check (production_status in ('pendente','em_producao','pronto')),
  delivery_status   text not null default 'pendente'
                    check (delivery_status in ('pendente','entregue')),
  delivered_at      date,
  cancelled_at      timestamptz,
  cancel_reason     text,
  notes             text,
  created_by        uuid references auth.users (id) default auth.uid(),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index if not exists orders_delivery_date_idx on public.orders (delivery_date);
create index if not exists orders_customer_idx      on public.orders (lower(customer_name));

-- ---------------------------------------------------------------------
-- 4. ITENS DO PEDIDO
--    Nome, sabor e preço são copiados no momento do pedido, assim
--    alterar o preço de um produto nunca muda pedidos antigos.
-- ---------------------------------------------------------------------
create table if not exists public.order_items (
  id           uuid primary key default gen_random_uuid(),
  order_id     uuid not null references public.orders (id) on delete cascade,
  product_id   uuid references public.products (id) on delete set null,
  product_name text not null,
  flavor       text,
  unit_price   numeric(10,2) not null check (unit_price >= 0),
  quantity     integer not null check (quantity > 0),
  produced_qty integer not null default 0 check (produced_qty >= 0),
  created_at   timestamptz not null default now(),
  constraint produced_lte_quantity check (produced_qty <= quantity)
);

create index if not exists order_items_order_idx on public.order_items (order_id);

-- ---------------------------------------------------------------------
-- 5. PAGAMENTOS (recebimentos e estornos)
-- ---------------------------------------------------------------------
create table if not exists public.payments (
  id         uuid primary key default gen_random_uuid(),
  order_id   uuid not null references public.orders (id) on delete cascade,
  amount     numeric(10,2) not null check (amount > 0),
  method     text not null check (method in ('pix','dinheiro','a_definir')),
  kind       text not null default 'recebimento' check (kind in ('recebimento','estorno')),
  paid_at    date not null default current_date,
  notes      text,
  created_by uuid references auth.users (id) default auth.uid(),
  created_at timestamptz not null default now()
);

create index if not exists payments_order_idx   on public.payments (order_id);
create index if not exists payments_paid_at_idx on public.payments (paid_at);

-- ---------------------------------------------------------------------
-- 6. updated_at automático
-- ---------------------------------------------------------------------
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists orders_touch on public.orders;
create trigger orders_touch before update on public.orders
  for each row execute function public.touch_updated_at();

drop trigger if exists products_touch on public.products;
create trigger products_touch before update on public.products
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------
-- 7. SEGURANÇA (Row Level Security)
--    Ninguém de fora da equipe acessa nada, nem com a chave pública.
-- ---------------------------------------------------------------------
alter table public.staff       enable row level security;
alter table public.products    enable row level security;
alter table public.orders      enable row level security;
alter table public.order_items enable row level security;
alter table public.payments    enable row level security;

drop policy if exists "staff_select_self" on public.staff;
create policy "staff_select_self" on public.staff
  for select to authenticated using (public.is_staff());

do $$
declare t text;
begin
  foreach t in array array['products','orders','order_items','payments'] loop
    execute format('drop policy if exists "equipe_select" on public.%I', t);
    execute format('drop policy if exists "equipe_insert" on public.%I', t);
    execute format('drop policy if exists "equipe_update" on public.%I', t);
    execute format('drop policy if exists "equipe_delete" on public.%I', t);
    execute format('create policy "equipe_select" on public.%I for select to authenticated using (public.is_staff())', t);
    execute format('create policy "equipe_insert" on public.%I for insert to authenticated with check (public.is_staff())', t);
    execute format('create policy "equipe_update" on public.%I for update to authenticated using (public.is_staff()) with check (public.is_staff())', t);
    execute format('create policy "equipe_delete" on public.%I for delete to authenticated using (public.is_staff())', t);
  end loop;
end $$;

-- Remove qualquer acesso do usuário anônimo
revoke all on public.products, public.orders, public.order_items, public.payments, public.staff from anon;

-- ---------------------------------------------------------------------
-- 8. SINCRONIZAÇÃO EM TEMPO REAL entre dispositivos
-- ---------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['products','orders','order_items','payments'] loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- 9. PRODUTOS INICIAIS (só insere se a tabela estiver vazia)
-- ---------------------------------------------------------------------
insert into public.products (name, flavor, price, sort_order)
select * from (values
  ('Brownie',               'Clássico',     10.00, 1),
  ('Recheadíssimo',         'Meio amargo',  13.90, 2),
  ('Recheadíssimo',         'Ao leite',     13.90, 3),
  ('Recheadíssimo',         'Branco',       13.90, 4),
  ('Nutella',               null,           15.90, 5),
  ('Doce de leite',         null,           15.90, 6),
  ('Branco & Kinder Bueno', null,           15.90, 7),
  ('Double Kinder',         null,           17.90, 8)
) as v(name, flavor, price, sort_order)
where not exists (select 1 from public.products);

-- =====================================================================
--  DEPOIS DE CRIAR OS USUÁRIOS (Authentication > Users > Add user),
--  libere o acesso de cada um rodando:
--
--  insert into public.staff (user_id, email, name)
--  select id, email, 'Nome da pessoa' from auth.users
--  where email = 'email@exemplo.com';
-- =====================================================================
