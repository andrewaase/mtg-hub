-- Mana Mint — full Supabase schema (rebuilt from the app code).
-- Run this ONCE in a brand-new project: Supabase dashboard → SQL Editor → New query → paste → Run.
-- Safe to re-run (everything is IF NOT EXISTS / CREATE OR REPLACE).
--
-- The Netlify functions use the service-role key and bypass RLS. The browser
-- uses the anon/publishable key, so every table the browser touches has RLS
-- policies below.

create extension if not exists pgcrypto;

-- ───────────────────────────────────────────────────────────────────────────
-- Profiles (one row per auth user; created by trigger on signup)
-- ───────────────────────────────────────────────────────────────────────────
create table if not exists public.profiles (
  id                     uuid primary key references auth.users(id) on delete cascade,
  username               text,
  avatar_color           text,
  full_name              text,
  address_line1          text,
  address_city           text,
  address_state          text,
  address_zip            text,
  address_country        text,
  tos_agreed_at          timestamptz,
  membership_tier        text not null default 'free',
  membership_end         timestamptz,
  stripe_customer_id     text,
  stripe_subscription_id text,
  free_months_remaining  integer not null default 0,
  is_admin               boolean not null default false,
  created_at             timestamptz not null default now()
);

-- Admin check used by RLS policies. The primary admin email is also honoured
-- so the admin works before any profiles.is_admin flag exists.
create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select p.is_admin from public.profiles p where p.id = auth.uid()), false)
      or coalesce(auth.jwt() ->> 'email', '') = 'mtgvaultedsingles@gmail.com'
$$;

create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, username, avatar_color)
  values (
    new.id,
    split_part(coalesce(new.email, ''), '@', 1),
    (array['#16a389','#6366f1','#f59e0b','#ec4899','#0ea5e9','#8b5cf6','#ef4444'])[1 + floor(random()*7)::int]
  )
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- Friend search: returns only non-PII columns.
create or replace function public.search_usernames(q text)
returns table (id uuid, username text, avatar_color text)
language sql stable security definer set search_path = public as $$
  select p.id, p.username, p.avatar_color
  from public.profiles p
  where p.username ilike '%' || q || '%' and p.id <> auth.uid()
  order by p.username
  limit 20
$$;

-- ───────────────────────────────────────────────────────────────────────────
-- Per-user data (browser reads/writes directly, scoped by RLS)
-- ───────────────────────────────────────────────────────────────────────────
create table if not exists public.collection (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users(id) on delete cascade,
  name            text not null,
  qty             integer not null default 1,
  condition       text default 'NM',
  set_name        text,
  img             text,
  colors          text[] default '{}',
  price           numeric,
  tcgplayer_url   text,
  scryfall_id     text,
  is_foil         boolean not null default false,
  language        text not null default 'EN',
  in_trade_binder boolean not null default false,
  created_at      timestamptz not null default now()
);
create index if not exists collection_user_idx on public.collection(user_id);

create table if not exists public.wishlist (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  name          text not null,
  target_price  numeric,
  current_price numeric,
  img           text,
  set_name      text,
  added_at      timestamptz not null default now()
);
create index if not exists wishlist_user_idx on public.wishlist(user_id);

create table if not exists public.decks (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  name       text not null,
  format     text,
  commander  text,
  mainboard  jsonb not null default '[]',
  sideboard  jsonb not null default '[]',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists decks_user_idx on public.decks(user_id);

create table if not exists public.matches (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid not null references auth.users(id) on delete cascade,
  format             text,
  my_deck            text,
  opponent_deck      text,
  my_deck_type       text,
  opponent_deck_type text,
  played_date        date,
  result             text,
  notes              text,
  created_at         timestamptz not null default now()
);
create index if not exists matches_user_idx on public.matches(user_id);

create table if not exists public.trade_wants (
  id        uuid primary key default gen_random_uuid(),
  user_id   uuid not null references auth.users(id) on delete cascade,
  card_name text not null,
  unique (user_id, card_name)
);

create table if not exists public.notifications (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  type       text,
  title      text,
  body       text,
  data       jsonb not null default '{}',
  read       boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists notifications_user_idx on public.notifications(user_id, created_at desc);

create table if not exists public.friends (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  friend_id  uuid not null references auth.users(id) on delete cascade,
  status     text not null default 'pending',
  created_at timestamptz not null default now(),
  unique (user_id, friend_id)
);

create table if not exists public.trades (
  id           uuid primary key default gen_random_uuid(),
  sender_id    uuid not null references auth.users(id) on delete cascade,
  recipient_id uuid not null references auth.users(id) on delete cascade,
  status       text not null default 'pending',
  message      text,
  created_at   timestamptz not null default now()
);

create table if not exists public.trade_items (
  id        bigint generated always as identity primary key,
  trade_id  uuid not null references public.trades(id) on delete cascade,
  card_name text not null,
  qty       integer not null default 1,
  condition text,
  is_foil   boolean not null default false,
  price     numeric,
  img       text
);

create table if not exists public.reports (
  id               uuid primary key default gen_random_uuid(),
  reporter_id      uuid references auth.users(id) on delete set null,
  reporter_email   text,
  reported_user_id uuid,
  reported_email   text,
  reason           text,
  created_at       timestamptz not null default now()
);

create table if not exists public.scan_logs (
  id         bigint generated always as identity primary key,
  user_id    uuid not null references auth.users(id) on delete cascade,
  scan_date  date not null default current_date,
  created_at timestamptz not null default now()
);
create index if not exists scan_logs_user_date_idx on public.scan_logs(user_id, scan_date);

-- ───────────────────────────────────────────────────────────────────────────
-- Store
-- ───────────────────────────────────────────────────────────────────────────
create table if not exists public.store_listings (
  id               uuid primary key default gen_random_uuid(),
  product_type     text not null default 'single',
  product_format   text,
  name             text not null,
  set_name         text,
  condition        text,
  is_foil          boolean not null default false,
  price            numeric not null default 0,
  qty_available    integer not null default 0,
  img_url          text,
  scryfall_id      text,
  description      text,
  active           boolean not null default true,
  last_exported_at timestamptz,
  created_at       timestamptz not null default now()
);

create table if not exists public.store_settings (
  key        text primary key,
  value      text,
  updated_at timestamptz not null default now()
);
insert into public.store_settings (key, value) values ('shipping_cost', '4.99'), ('handling_fee', '0')
  on conflict (key) do nothing;

create table if not exists public.orders (
  id                    uuid primary key default gen_random_uuid(),
  stripe_payment_intent text unique,
  customer_email        text,
  customer_name         text,
  shipping_line1        text,
  shipping_city         text,
  shipping_state        text,
  shipping_zip          text,
  shipping_country      text default 'US',
  subtotal              numeric,
  shipping_cost         numeric,
  total                 numeric,
  status                text not null default 'paid',
  tracking_number       text,
  tracking_carrier      text,
  created_at            timestamptz not null default now()
);

create table if not exists public.order_items (
  id         uuid primary key default gen_random_uuid(),
  order_id   uuid not null references public.orders(id) on delete cascade,
  listing_id uuid references public.store_listings(id) on delete set null,
  name       text,
  set_name   text,
  condition  text,
  is_foil    boolean not null default false,
  img_url    text,
  price      numeric,
  qty        integer not null default 1
);

create table if not exists public.waitlist (
  id         uuid primary key default gen_random_uuid(),
  listing_id uuid references public.store_listings(id) on delete cascade,
  email      text not null,
  created_at timestamptz not null default now(),
  unique (listing_id, email)
);

create table if not exists public.price_history (
  id          bigint generated always as identity primary key,
  scryfall_id text not null,
  is_foil     boolean not null default false,
  price       numeric not null,
  recorded_at date not null,
  unique (scryfall_id, is_foil, recorded_at)
);

-- ───────────────────────────────────────────────────────────────────────────
-- Admin / computed datasets
-- ───────────────────────────────────────────────────────────────────────────
create table if not exists public.sealed_ev (
  id                 uuid primary key default gen_random_uuid(),
  set_code           text not null,
  set_name           text,
  released_at        date,
  booster_type       text not null,
  ev_per_pack        numeric,
  packs_per_box      integer,
  ev_per_box         numeric,
  box_price          numeric,
  box_price_override numeric,
  top_cards          jsonb,
  detail             jsonb,
  computed_at        timestamptz not null default now(),
  unique (set_code, booster_type)
);

create table if not exists public.commander_deck_ev (
  id                      uuid primary key default gen_random_uuid(),
  set_code                text not null,
  set_name                text,
  released_at             date,
  deck_name               text not null,
  commander_names         text,
  card_count              integer,
  sell_value              numeric,
  sell_value_mp           numeric,
  cards                   jsonb,
  purchase_price_override numeric,
  computed_at             timestamptz not null default now(),
  unique (set_code, deck_name)
);

create table if not exists public.deal_stores (
  id                uuid primary key default gen_random_uuid(),
  name              text,
  domain            text not null unique,
  platform          text,
  active            boolean not null default false,
  status            text,
  last_harvested_at timestamptz,
  product_count     integer,
  created_at        timestamptz not null default now()
);

create table if not exists public.sealed_listings (
  id           uuid primary key default gen_random_uuid(),
  store_id     uuid references public.deal_stores(id) on delete cascade,
  store_name   text,
  title        text,
  norm_key     text,
  price        numeric,
  in_stock     boolean,
  url          text,
  image        text,
  market_price numeric,
  harvested_at timestamptz
);
create index if not exists sealed_listings_store_idx on public.sealed_listings(store_id);

create table if not exists public.price_daily_snapshots (
  snapshot_date date primary key,
  prices        jsonb,
  card_count    integer
);

create table if not exists public.market_movers (
  computed_date date primary key,
  gainers       jsonb,
  losers        jsonb,
  ref_date      date,
  days_apart    integer
);

create table if not exists public.meta_decks (
  id            uuid primary key default gen_random_uuid(),
  format        text,
  deck_name     text not null,
  archetype     text,
  meta_share    numeric,
  avg_price     numeric,
  updated_at    date,
  decklist_link text,
  art_card      text,
  colors        text,
  key_cards     jsonb not null default '[]',
  decklist      jsonb not null default '{}',
  created_at    timestamptz not null default now()
);

create table if not exists public.meta_card_snapshots (
  card_name    text not null,
  format       text not null,
  week         date not null,
  pct_of_decks numeric,
  price        numeric,
  source       text,
  primary key (card_name, format, week)
);

create table if not exists public.meta_archetype_snapshots (
  archetype_name text not null,
  format         text not null,
  week           date not null,
  category       text,
  pct            numeric,
  trend          text,
  source         text,
  primary key (archetype_name, format, week)
);

-- ───────────────────────────────────────────────────────────────────────────
-- Row Level Security
-- ───────────────────────────────────────────────────────────────────────────
do $$
declare t text;
begin
  foreach t in array array[
    'profiles','collection','wishlist','decks','matches','trade_wants','notifications','friends',
    'trades','trade_items','reports','scan_logs','store_listings','store_settings','orders',
    'order_items','waitlist','price_history','sealed_ev','commander_deck_ev','deal_stores',
    'sealed_listings','price_daily_snapshots','market_movers','meta_decks','meta_card_snapshots',
    'meta_archetype_snapshots'
  ] loop
    execute format('alter table public.%I enable row level security', t);
  end loop;
end $$;

-- Own-rows tables: full access to your own rows only.
do $$
declare t text;
begin
  foreach t in array array['collection','wishlist','decks','matches','trade_wants'] loop
    execute format('drop policy if exists %I on public.%I', t || '_own', t);
    execute format('create policy %I on public.%I for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid())', t || '_own', t);
  end loop;
end $$;

-- notifications: read / mark-read / delete your own. Inserts happen server-side.
drop policy if exists notifications_select on public.notifications;
create policy notifications_select on public.notifications for select to authenticated using (user_id = auth.uid());
drop policy if exists notifications_update on public.notifications;
create policy notifications_update on public.notifications for update to authenticated using (user_id = auth.uid());
drop policy if exists notifications_delete on public.notifications;
create policy notifications_delete on public.notifications for delete to authenticated using (user_id = auth.uid());

-- friends: either side can read/update; you can only create requests from yourself.
drop policy if exists friends_select on public.friends;
create policy friends_select on public.friends for select to authenticated using (user_id = auth.uid() or friend_id = auth.uid());
drop policy if exists friends_insert on public.friends;
create policy friends_insert on public.friends for insert to authenticated with check (user_id = auth.uid());
drop policy if exists friends_update on public.friends;
create policy friends_update on public.friends for update to authenticated using (user_id = auth.uid() or friend_id = auth.uid());
drop policy if exists friends_delete on public.friends;
create policy friends_delete on public.friends for delete to authenticated using (user_id = auth.uid() or friend_id = auth.uid());

-- profiles: read your own row. The browser may only write the harmless columns —
-- membership / admin / Stripe columns are service-role only.
drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles for select to authenticated using (id = auth.uid() or public.is_admin());
drop policy if exists profiles_insert on public.profiles;
create policy profiles_insert on public.profiles for insert to authenticated with check (id = auth.uid());
drop policy if exists profiles_update on public.profiles;
create policy profiles_update on public.profiles for update to authenticated using (id = auth.uid()) with check (id = auth.uid());
revoke insert, update on public.profiles from authenticated, anon;
grant insert (id, username, avatar_color, full_name, address_line1, address_city, address_state, address_zip, address_country, tos_agreed_at) on public.profiles to authenticated;
grant update (username, avatar_color, full_name, address_line1, address_city, address_state, address_zip, address_country, tos_agreed_at) on public.profiles to authenticated;

-- Public-read tables (storefront + computed datasets); writes are service-role or admin.
do $$
declare t text;
begin
  foreach t in array array[
    'store_listings','store_settings','price_history','sealed_ev','commander_deck_ev',
    'market_movers','meta_decks','meta_card_snapshots','meta_archetype_snapshots'
  ] loop
    execute format('drop policy if exists %I on public.%I', t || '_public_read', t);
    execute format('create policy %I on public.%I for select to anon, authenticated using (true)', t || '_public_read', t);
  end loop;
end $$;

-- Tables the admin panel reads/writes from the browser.
do $$
declare t text;
begin
  foreach t in array array[
    'store_listings','store_settings','orders','order_items','sealed_listings','deal_stores',
    'meta_decks','sealed_ev','commander_deck_ev','reports'
  ] loop
    execute format('drop policy if exists %I on public.%I', t || '_admin_all', t);
    execute format('create policy %I on public.%I for all to authenticated using (public.is_admin()) with check (public.is_admin())', t || '_admin_all', t);
  end loop;
end $$;

-- Back-in-stock waitlist: anyone may sign up; only admins can read.
drop policy if exists waitlist_insert on public.waitlist;
create policy waitlist_insert on public.waitlist for insert to anon, authenticated with check (true);
drop policy if exists waitlist_admin_read on public.waitlist;
create policy waitlist_admin_read on public.waitlist for select to authenticated using (public.is_admin());

-- ───────────────────────────────────────────────────────────────────────────
-- Storage: public bucket for store product images (admin uploads)
-- ───────────────────────────────────────────────────────────────────────────
insert into storage.buckets (id, name, public) values ('product-images', 'product-images', true)
  on conflict (id) do nothing;
drop policy if exists product_images_read on storage.objects;
create policy product_images_read on storage.objects for select to anon, authenticated using (bucket_id = 'product-images');
drop policy if exists product_images_admin_write on storage.objects;
create policy product_images_admin_write on storage.objects for all to authenticated
  using (bucket_id = 'product-images' and public.is_admin())
  with check (bucket_id = 'product-images' and public.is_admin());
