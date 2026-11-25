-- =====================================================================
--  GB GOBÊ · Parte 2: Estoque, Receitas, Compras, Despesas e Custos
--  Rode DEPOIS do schema.sql: SQL Editor > New query > cole tudo > Run
--  Pode ser executado mais de uma vez sem duplicar nada.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 0. Conversão de unidades (g/kg, ml/l, un)
-- ---------------------------------------------------------------------
create or replace function public.unit_factor(u text)
returns numeric language sql immutable as $$
  select case lower(coalesce(u, 'un')) when 'kg' then 1000 when 'l' then 1000 else 1 end::numeric;
$$;

-- ---------------------------------------------------------------------
-- 1. INGREDIENTES E MATERIAIS
--    stock_qty é sempre a soma das movimentações (não edite à mão)
-- ---------------------------------------------------------------------
create table if not exists public.ingredients (
  id                  uuid primary key default gen_random_uuid(),
  name                text not null,
  category            text not null default 'ingrediente'
                      check (category in ('ingrediente','embalagem','adesivo','outro')),
  unit                text not null default 'kg' check (unit in ('g','kg','ml','l','un')),
  stock_qty           numeric(14,4) not null default 0,
  min_stock           numeric(14,4) not null default 0 check (min_stock >= 0),
  unit_cost           numeric(14,6) not null default 0 check (unit_cost >= 0),
  last_purchase_price numeric(12,2),
  last_purchase_date  date,
  supplier            text,
  active              boolean not null default true,
  notes               text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

drop trigger if exists ingredients_touch on public.ingredients;
create trigger ingredients_touch before update on public.ingredients
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------
-- 2. MOVIMENTAÇÕES DE ESTOQUE (entradas, consumo da produção, ajustes)
-- ---------------------------------------------------------------------
create table if not exists public.stock_movements (
  id            uuid primary key default gen_random_uuid(),
  ingredient_id uuid not null references public.ingredients (id) on delete cascade,
  type          text not null check (type in ('compra','consumo','estorno_consumo','ajuste')),
  quantity      numeric(14,4) not null,          -- positivo entra, negativo sai
  unit_cost     numeric(14,6),
  total_cost    numeric(14,4),
  ref_type      text,                            -- purchase | order_item | manual
  ref_id        uuid,
  occurred_at   date not null default current_date,
  notes         text,
  created_by    uuid references auth.users (id) default auth.uid(),
  created_at    timestamptz not null default now()
);
create index if not exists stock_mov_ing_idx on public.stock_movements (ingredient_id, occurred_at);
create index if not exists stock_mov_ref_idx on public.stock_movements (ref_type, ref_id);

create or replace function public.apply_stock_movement()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    update ingredients set stock_qty = stock_qty + new.quantity where id = new.ingredient_id;
    return new;
  elsif tg_op = 'DELETE' then
    update ingredients set stock_qty = stock_qty - old.quantity where id = old.ingredient_id;
    return old;
  end if;
  return null;
end $$;

drop trigger if exists stock_movements_apply on public.stock_movements;
create trigger stock_movements_apply after insert or delete on public.stock_movements
  for each row execute function public.apply_stock_movement();

create or replace function public.recalc_stock()
returns void language sql security invoker set search_path = public as $$
  update ingredients i
     set stock_qty = coalesce((select sum(m.quantity) from stock_movements m where m.ingredient_id = i.id), 0);
$$;

-- ---------------------------------------------------------------------
-- 3. FICHAS TÉCNICAS (receitas)
-- ---------------------------------------------------------------------
create table if not exists public.recipes (
  id             uuid primary key default gen_random_uuid(),
  product_id     uuid not null unique references public.products (id) on delete cascade,
  yield_pans     numeric(10,2) not null default 1 check (yield_pans > 0),
  slices_per_pan integer not null default 12 check (slices_per_pan > 0),
  notes          text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

drop trigger if exists recipes_touch on public.recipes;
create trigger recipes_touch before update on public.recipes
  for each row execute function public.touch_updated_at();

create table if not exists public.recipe_items (
  id            uuid primary key default gen_random_uuid(),
  recipe_id     uuid not null references public.recipes (id) on delete cascade,
  ingredient_id uuid not null references public.ingredients (id) on delete restrict,
  quantity      numeric(14,4) not null check (quantity > 0),
  unit          text not null check (unit in ('g','kg','ml','l','un')),
  scope         text not null default 'receita' check (scope in ('receita','fatia')),
  created_at    timestamptz not null default now()
);
create index if not exists recipe_items_recipe_idx on public.recipe_items (recipe_id);

-- Custo atual de uma fatia do produto (null = produto sem ficha técnica)
create or replace function public.slice_cost(p_product uuid)
returns numeric language sql stable security definer set search_path = public as $$
  select case when r.id is null then null else coalesce((
    select sum(
      (ri.quantity * unit_factor(ri.unit) / unit_factor(i.unit)) * i.unit_cost
      / case when ri.scope = 'receita' then (r.yield_pans * r.slices_per_pan) else 1 end
    )
    from recipe_items ri join ingredients i on i.id = ri.ingredient_id
    where ri.recipe_id = r.id), 0)
  end
  from (select 1) x left join recipes r on r.product_id = p_product;
$$;

-- ---------------------------------------------------------------------
-- 4. PEDIDOS: custo congelado por fatia e consumo automático
-- ---------------------------------------------------------------------
alter table public.order_items add column if not exists unit_cost numeric(12,4);
alter table public.order_items add column if not exists consumed_qty integer not null default 0;

-- Pedidos antigos: considera o que já estava produzido como já consumido
update public.order_items set consumed_qty = produced_qty
 where consumed_qty = 0 and produced_qty > 0
   and not exists (select 1 from public.stock_movements m where m.ref_type = 'order_item' and m.ref_id = order_items.id);

create or replace function public.order_item_consumption()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  d        integer;
  v_recipe recipes%rowtype;
  v_yield  numeric;
  v_qty    numeric;
  v_date   date;
  r        record;
begin
  -- custo da fatia congelado no momento do pedido
  if tg_op = 'INSERT' and new.unit_cost is null then
    new.unit_cost := slice_cost(new.product_id);
  elsif tg_op = 'UPDATE' and new.product_id is distinct from old.product_id and new.consumed_qty = 0 then
    new.unit_cost := slice_cost(new.product_id);
  end if;

  -- diferença entre o que está produzido e o que já foi baixado do estoque
  d := new.produced_qty - coalesce(new.consumed_qty, 0);
  if d = 0 then return new; end if;

  select * into v_recipe from recipes where product_id = new.product_id;
  if not found then
    new.consumed_qty := new.produced_qty;
    return new;
  end if;
  v_yield := v_recipe.yield_pans * v_recipe.slices_per_pan;
  select delivery_date into v_date from orders where id = new.order_id;

  for r in
    select ri.quantity, ri.unit, ri.scope, ri.ingredient_id, i.unit as ing_unit, i.unit_cost
      from recipe_items ri join ingredients i on i.id = ri.ingredient_id
     where ri.recipe_id = v_recipe.id
  loop
    v_qty := r.quantity * unit_factor(r.unit) / unit_factor(r.ing_unit);
    if r.scope = 'receita' then v_qty := v_qty / v_yield; end if;
    v_qty := v_qty * d;
    insert into stock_movements (ingredient_id, type, quantity, unit_cost, total_cost, ref_type, ref_id, occurred_at)
    values (r.ingredient_id, case when d > 0 then 'consumo' else 'estorno_consumo' end,
            -v_qty, r.unit_cost, v_qty * r.unit_cost, 'order_item', new.id, coalesce(v_date, current_date));
  end loop;

  new.consumed_qty := new.produced_qty;
  return new;
end $$;

drop trigger if exists order_items_consumption on public.order_items;
create trigger order_items_consumption before insert or update on public.order_items
  for each row execute function public.order_item_consumption();

-- ---------------------------------------------------------------------
-- 5. COMPRAS (notas fiscais, lista de compras ou cadastro manual)
-- ---------------------------------------------------------------------
create table if not exists public.purchases (
  id              uuid primary key default gen_random_uuid(),
  purchase_date   date not null default current_date,
  supplier        text,
  description     text,
  subtotal        numeric(12,2) not null default 0,
  discount        numeric(12,2) not null default 0,
  total           numeric(12,2) not null default 0,
  payment_method  text not null default 'outro',
  receipt_path    text,
  file_hash       text unique,            -- impede registrar a mesma nota duas vezes
  idempotency_key text unique,            -- impede salvar a mesma tela duas vezes
  source          text not null default 'manual' check (source in ('manual','nota','lista')),
  notes           text,
  created_by      uuid references auth.users (id) default auth.uid(),
  created_at      timestamptz not null default now()
);
create index if not exists purchases_date_idx on public.purchases (purchase_date);

create table if not exists public.purchase_items (
  id            uuid primary key default gen_random_uuid(),
  purchase_id   uuid not null references public.purchases (id) on delete cascade,
  ingredient_id uuid references public.ingredients (id) on delete set null,
  description   text not null,
  quantity      numeric(14,4) not null default 1,
  unit          text,
  unit_price    numeric(12,4) not null default 0,
  total         numeric(12,2) not null default 0,
  stock_qty     numeric(14,4) not null default 0,  -- quanto entrou no estoque, na unidade do ingrediente
  category      text not null default 'ingredientes',
  created_at    timestamptz not null default now()
);
create index if not exists purchase_items_purchase_idx on public.purchase_items (purchase_id);

-- ---------------------------------------------------------------------
-- 6. DESPESAS
-- ---------------------------------------------------------------------
create table if not exists public.expenses (
  id             uuid primary key default gen_random_uuid(),
  expense_date   date not null default current_date,
  description    text not null,
  category       text not null check (category in
                 ('ingredientes','embalagens','adesivos','transporte','energia','agua','gas','marketing','equipamentos','outras')),
  amount         numeric(12,2) not null check (amount >= 0),
  supplier       text,
  payment_method text not null default 'outro'
                 check (payment_method in ('pix','dinheiro','cartao_debito','cartao_credito','boleto','transferencia','outro')),
  receipt_path   text,
  purchase_id    uuid references public.purchases (id) on delete cascade,
  notes          text,
  created_by     uuid references auth.users (id) default auth.uid(),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  constraint expense_once_per_purchase_category unique (purchase_id, category)
);
create index if not exists expenses_date_idx on public.expenses (expense_date);

drop trigger if exists expenses_touch on public.expenses;
create trigger expenses_touch before update on public.expenses
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------
-- 7. ITENS MANUAIS DA LISTA DE COMPRAS
-- ---------------------------------------------------------------------
create table if not exists public.shopping_items (
  id            uuid primary key default gen_random_uuid(),
  ingredient_id uuid references public.ingredients (id) on delete cascade,
  description   text,
  quantity      numeric(14,4) not null default 1,
  unit          text,
  estimated     numeric(12,2),
  created_at    timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- 8. REGISTRO DE COMPRA (tudo ou nada, numa única transação)
--    Cria a compra, os itens, a entrada no estoque, atualiza custos
--    e lança as despesas por categoria.
-- ---------------------------------------------------------------------
create or replace function public.register_purchase(p jsonb)
returns uuid language plpgsql security invoker set search_path = public as $$
declare
  v_id        uuid;
  v_item      jsonb;
  v_items_sum numeric := 0;
  v_discount  numeric := coalesce(nullif(p->>'discount','')::numeric, 0);
  v_total     numeric;
  v_factor    numeric := 1;
  v_line      numeric;
  v_stock     numeric;
  v_ing       uuid;
  v_date      date := coalesce(nullif(p->>'purchase_date','')::date, current_date);
  v_supplier  text := nullif(trim(p->>'supplier'), '');
  v_desc      text;
  v_method    text := coalesce(nullif(p->>'payment_method',''), 'outro');
begin
  if not public.is_staff() then
    raise exception 'Sem permissão';
  end if;

  -- mesma tela enviada duas vezes: devolve a compra já criada
  if nullif(p->>'idempotency_key','') is not null then
    select id into v_id from purchases where idempotency_key = p->>'idempotency_key';
    if found then return v_id; end if;
  end if;

  -- mesma nota (mesmo arquivo) já registrada
  if nullif(p->>'file_hash','') is not null
     and exists (select 1 from purchases where file_hash = p->>'file_hash') then
    raise exception 'NOTA_DUPLICADA';
  end if;

  select coalesce(sum(coalesce(nullif(x->>'total','')::numeric, 0)), 0)
    into v_items_sum
    from jsonb_array_elements(coalesce(p->'items', '[]'::jsonb)) x;

  v_total := coalesce(nullif(p->>'total','')::numeric, v_items_sum - v_discount);
  if v_items_sum > 0 then v_factor := v_total / v_items_sum; end if;
  v_desc := coalesce(nullif(trim(p->>'description'), ''), 'Compra' || coalesce(' · ' || v_supplier, ''));

  insert into purchases (purchase_date, supplier, description, subtotal, discount, total, payment_method,
                         receipt_path, file_hash, idempotency_key, source, notes)
  values (v_date, v_supplier, v_desc, v_items_sum, v_discount, v_total, v_method,
          nullif(p->>'receipt_path',''), nullif(p->>'file_hash',''), nullif(p->>'idempotency_key',''),
          coalesce(nullif(p->>'source',''), 'manual'), nullif(p->>'notes',''))
  returning id into v_id;

  for v_item in select * from jsonb_array_elements(coalesce(p->'items', '[]'::jsonb)) loop
    v_ing   := nullif(v_item->>'ingredient_id','')::uuid;
    v_line  := coalesce(nullif(v_item->>'total','')::numeric, 0) * v_factor;  -- já com desconto rateado
    v_stock := coalesce(nullif(v_item->>'stock_qty','')::numeric, 0);

    insert into purchase_items (purchase_id, ingredient_id, description, quantity, unit, unit_price, total, stock_qty, category)
    values (v_id, v_ing, coalesce(nullif(v_item->>'description',''), 'Item'),
            coalesce(nullif(v_item->>'quantity','')::numeric, 1), nullif(v_item->>'unit',''),
            coalesce(nullif(v_item->>'unit_price','')::numeric, 0),
            coalesce(nullif(v_item->>'total','')::numeric, 0), v_stock,
            coalesce(nullif(v_item->>'category',''), 'outras'));

    if v_ing is not null and v_stock > 0 then
      insert into stock_movements (ingredient_id, type, quantity, unit_cost, total_cost, ref_type, ref_id, occurred_at)
      values (v_ing, 'compra', v_stock, case when v_line > 0 then v_line / v_stock end, v_line, 'purchase', v_id, v_date);

      update ingredients
         set unit_cost           = case when v_line > 0 then round(v_line / v_stock, 6) else unit_cost end,
             last_purchase_price = round(v_line, 2),
             last_purchase_date  = v_date,
             supplier            = coalesce(v_supplier, supplier)
       where id = v_ing;
    end if;
  end loop;

  -- despesas (uma por categoria, nunca duplicadas: unique purchase_id + category)
  if v_items_sum > 0 then
    insert into expenses (expense_date, description, category, amount, supplier, payment_method, receipt_path, purchase_id)
    select v_date, v_desc, s.cat, round(sum(s.t), 2), v_supplier,
           case when v_method in ('pix','dinheiro','cartao_debito','cartao_credito','boleto','transferencia') then v_method else 'outro' end,
           nullif(p->>'receipt_path',''), v_id
      from (select coalesce(nullif(x->>'category',''), 'outras') as cat,
                   coalesce(nullif(x->>'total','')::numeric, 0) * v_factor as t
              from jsonb_array_elements(p->'items') x) s
     group by s.cat
    having sum(s.t) > 0;
  elsif v_total > 0 then
    insert into expenses (expense_date, description, category, amount, supplier, payment_method, receipt_path, purchase_id)
    values (v_date, v_desc, coalesce(nullif(p->>'category',''), 'outras'), round(v_total, 2), v_supplier,
            case when v_method in ('pix','dinheiro','cartao_debito','cartao_credito','boleto','transferencia') then v_method else 'outro' end,
            nullif(p->>'receipt_path',''), v_id);
  end if;

  return v_id;
end $$;

-- Exclui uma compra e desfaz a entrada no estoque e as despesas
create or replace function public.delete_purchase(p_id uuid)
returns void language plpgsql security invoker set search_path = public as $$
begin
  if not public.is_staff() then raise exception 'Sem permissão'; end if;
  delete from stock_movements where ref_type = 'purchase' and ref_id = p_id;
  delete from purchases where id = p_id;   -- itens e despesas saem em cascata
end $$;

grant execute on function public.register_purchase(jsonb) to authenticated;
grant execute on function public.delete_purchase(uuid) to authenticated;
grant execute on function public.recalc_stock() to authenticated;
grant execute on function public.slice_cost(uuid) to authenticated;

-- ---------------------------------------------------------------------
-- 9. SEGURANÇA (RLS) das novas tabelas
-- ---------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['ingredients','stock_movements','recipes','recipe_items','purchases','purchase_items','expenses','shopping_items'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "equipe_select" on public.%I', t);
    execute format('drop policy if exists "equipe_insert" on public.%I', t);
    execute format('drop policy if exists "equipe_update" on public.%I', t);
    execute format('drop policy if exists "equipe_delete" on public.%I', t);
    execute format('create policy "equipe_select" on public.%I for select to authenticated using (public.is_staff())', t);
    execute format('create policy "equipe_insert" on public.%I for insert to authenticated with check (public.is_staff())', t);
    execute format('create policy "equipe_update" on public.%I for update to authenticated using (public.is_staff()) with check (public.is_staff())', t);
    execute format('create policy "equipe_delete" on public.%I for delete to authenticated using (public.is_staff())', t);
    execute format('revoke all on public.%I from anon', t);
  end loop;
end $$;

-- Movimentações não podem ser editadas, só criadas/excluídas
drop policy if exists "equipe_update" on public.stock_movements;

-- ---------------------------------------------------------------------
-- 10. TEMPO REAL
-- ---------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['ingredients','recipes','recipe_items','purchases','purchase_items','expenses','shopping_items'] loop
    if not exists (select 1 from pg_publication_tables
                   where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- 11. ARQUIVOS DAS NOTAS (Storage privado)
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit)
values ('comprovantes', 'comprovantes', false, 10485760)
on conflict (id) do nothing;

drop policy if exists "comprovantes_select" on storage.objects;
drop policy if exists "comprovantes_insert" on storage.objects;
drop policy if exists "comprovantes_delete" on storage.objects;
create policy "comprovantes_select" on storage.objects for select to authenticated
  using (bucket_id = 'comprovantes' and public.is_staff());
create policy "comprovantes_insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'comprovantes' and public.is_staff());
create policy "comprovantes_delete" on storage.objects for delete to authenticated
  using (bucket_id = 'comprovantes' and public.is_staff());

-- ---------------------------------------------------------------------
-- 12. INGREDIENTES INICIAIS (estoque zero e custo zero: preencha com os seus)
-- ---------------------------------------------------------------------
insert into public.ingredients (name, category, unit)
select * from (values
  ('Ovos',                   'ingrediente', 'un'),
  ('Açúcar',                 'ingrediente', 'kg'),
  ('Farinha de trigo',       'ingrediente', 'kg'),
  ('Manteiga',               'ingrediente', 'kg'),
  ('Chocolate em pó',        'ingrediente', 'kg'),
  ('Chocolate meio amargo',  'ingrediente', 'kg'),
  ('Chocolate ao leite',     'ingrediente', 'kg'),
  ('Chocolate branco',       'ingrediente', 'kg'),
  ('Creme de leite',         'ingrediente', 'kg'),
  ('Nutella',                'ingrediente', 'kg'),
  ('Doce de leite',          'ingrediente', 'kg'),
  ('Kinder Bueno',           'ingrediente', 'un'),
  ('Embalagem individual',   'embalagem',   'un'),
  ('Adesivo GOBÊ',           'adesivo',     'un'),
  ('Sacola',                 'embalagem',   'un')
) as v(name, category, unit)
where not exists (select 1 from public.ingredients);

-- ---------------------------------------------------------------------
-- 13. PERMISSÕES DA API para usuários logados (RLS continua valendo)
-- ---------------------------------------------------------------------
grant usage on schema public to authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant execute on all functions in schema public to authenticated;
