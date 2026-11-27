-- =====================================================================
--  GB GOBÊ · Parte 4: pedidos feitos pelos clientes no site (/pedir)
--  Rode DEPOIS dos arquivos 1, 2 e 3. Pode rodar mais de uma vez.
--
--  Segurança: o visitante do site NÃO acessa nenhuma tabela. Ele só pode
--  chamar duas funções: ver o cardápio e enviar um pedido novo. Os preços
--  e as regras (datas, limite diário) são conferidos aqui no banco.
-- =====================================================================

alter table public.orders add column if not exists source text not null default 'sistema';

-- ---------------------------------------------------------------------
-- Cardápio público + próximos dias de entrega
-- ---------------------------------------------------------------------
create or replace function public.get_site_menu()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with hoje as (select (now() at time zone 'America/Sao_Paulo')::date as d),
  cap as (select coalesce((select (value->>'value')::int from app_settings where id = 'capacity'), 0) as c)
  select jsonb_build_object(
    'products', coalesce((
      select jsonb_agg(jsonb_build_object('id', id, 'name', name, 'flavor', flavor, 'price', price) order by sort_order, name)
      from products where active), '[]'::jsonb),
    'days', coalesce((
      select jsonb_agg(jsonb_build_object(
               'date', g.d::date,
               'full', (select c from cap) > 0 and coalesce((
                 select sum(oi.quantity) from order_items oi join orders o on o.id = oi.order_id
                 where o.delivery_date = g.d::date and o.cancelled_at is null), 0) >= (select c from cap)
             ) order by g.d)
      from generate_series((select d from hoje) + 1, (select d from hoje) + 21, interval '1 day') as g(d)
      where extract(dow from g.d) not in (2, 4)), '[]'::jsonb)
  );
$$;

-- ---------------------------------------------------------------------
-- Envio de pedido pelo site
-- ---------------------------------------------------------------------
create or replace function public.submit_site_order(p jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_today  date := (now() at time zone 'America/Sao_Paulo')::date;
  v_name   text := left(trim(coalesce(p->>'customer_name', '')), 80);
  v_phone  text := regexp_replace(coalesce(p->>'phone', ''), '\D', '', 'g');
  v_date   date;
  v_time   text;
  v_ful    text := case when p->>'fulfillment' = 'retirada' then 'retirada' else 'entrega' end;
  v_addr   text := nullif(left(trim(coalesce(p->>'address', '')), 200), '');
  v_notes  text := nullif(left(trim(coalesce(p->>'notes', '')), 400), '');
  v_pay    text := case when p->>'payment_method' in ('pix', 'dinheiro') then p->>'payment_method' else 'a_definir' end;
  v_item   jsonb;
  v_prod   products%rowtype;
  v_qty    integer;
  v_sub    numeric := 0;
  v_slices integer := 0;
  v_cap    integer;
  v_load   integer;
  v_recent integer;
  v_order  uuid;
begin
  if length(v_name) < 2 then raise exception 'Informe seu nome.'; end if;
  if length(v_phone) < 10 or length(v_phone) > 13 then raise exception 'Informe um WhatsApp válido, com DDD.'; end if;

  begin
    v_date := (p->>'delivery_date')::date;
  exception when others then
    raise exception 'Escolha a data de entrega.';
  end;
  if v_date is null then raise exception 'Escolha a data de entrega.'; end if;
  if v_date <= v_today then raise exception 'Os pedidos são feitos com pelo menos 1 dia de antecedência.'; end if;
  if v_date > v_today + 60 then raise exception 'Escolha uma data mais próxima.'; end if;
  if extract(dow from v_date) in (2, 4) then raise exception 'Não fazemos entregas às terças e quintas.'; end if;
  if v_ful = 'entrega' and v_addr is null then raise exception 'Informe o endereço de entrega.'; end if;
  if coalesce(p->>'delivery_time', '') ~ '^\d{2}:\d{2}$' then v_time := p->>'delivery_time'; end if;

  -- proteção contra envios repetidos
  select count(*) into v_recent from orders
   where source = 'site' and regexp_replace(coalesce(phone, ''), '\D', '', 'g') = v_phone
     and created_at > now() - interval '1 hour';
  if v_recent >= 3 then raise exception 'Recebemos vários pedidos seguidos deste número. Fale com a gente pelo WhatsApp.'; end if;

  if jsonb_typeof(p->'items') is distinct from 'array' or jsonb_array_length(p->'items') = 0 then
    raise exception 'Escolha pelo menos um brownie.';
  end if;

  -- confere produtos e preços do próprio cardápio
  for v_item in select * from jsonb_array_elements(p->'items') loop
    begin
      select * into v_prod from products where id = (v_item->>'product_id')::uuid and active;
    exception when others then
      raise exception 'Produto inválido.';
    end;
    if not found then raise exception 'Um dos produtos não está mais disponível. Atualize a página.'; end if;
    v_qty := greatest(1, least(50, coalesce(nullif(v_item->>'quantity', '')::integer, 1)));
    v_sub := v_sub + v_prod.price * v_qty;
    v_slices := v_slices + v_qty;
  end loop;
  if v_slices > 150 then raise exception 'Para pedidos grandes, fale com a gente pelo WhatsApp.'; end if;

  -- limite de produção do dia
  select coalesce((select (value->>'value')::int from app_settings where id = 'capacity'), 0) into v_cap;
  if v_cap > 0 then
    select coalesce(sum(oi.quantity), 0) into v_load
      from order_items oi join orders o on o.id = oi.order_id
     where o.delivery_date = v_date and o.cancelled_at is null;
    if v_load + v_slices > v_cap then raise exception 'Esse dia já está com a produção lotada. Escolha outra data.'; end if;
  end if;

  insert into orders (customer_name, phone, order_date, delivery_date, delivery_time, fulfillment, address,
                      subtotal, discount, delivery_fee, total, payment_method, payment_status, notes, source, created_by)
  values (v_name, v_phone, v_today, v_date, v_time, v_ful, case when v_ful = 'entrega' then v_addr end,
          v_sub, 0, 0, v_sub, v_pay, 'pendente', v_notes, 'site', null)
  returning id into v_order;

  for v_item in select * from jsonb_array_elements(p->'items') loop
    select * into v_prod from products where id = (v_item->>'product_id')::uuid;
    v_qty := greatest(1, least(50, coalesce(nullif(v_item->>'quantity', '')::integer, 1)));
    insert into order_items (order_id, product_id, product_name, flavor, unit_price, quantity)
    values (v_order, v_prod.id, v_prod.name, v_prod.flavor, v_prod.price, v_qty);
  end loop;

  return jsonb_build_object('id', v_order, 'code', upper(left(v_order::text, 6)), 'total', v_sub);
end $$;

-- ---------------------------------------------------------------------
-- Permissões: visitante só chama as duas funções acima
-- ---------------------------------------------------------------------
revoke execute on all functions in schema public from public, anon;
grant execute on all functions in schema public to authenticated;
grant execute on function public.get_site_menu() to anon;
grant execute on function public.submit_site_order(jsonb) to anon;
alter default privileges in schema public revoke execute on functions from public;
