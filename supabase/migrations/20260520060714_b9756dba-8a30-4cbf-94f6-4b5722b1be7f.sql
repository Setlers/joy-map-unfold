
create type public.emotion_type as enum ('joy','calm','sadness','anger','anxiety','hope');

create table public.emotions (
  id uuid primary key default gen_random_uuid(),
  emotion public.emotion_type not null,
  lat double precision not null,
  lng double precision not null,
  created_at timestamptz not null default now(),
  constraint emotions_lat_range check (lat between -90 and 90),
  constraint emotions_lng_range check (lng between -180 and 180)
);

create index emotions_created_at_idx on public.emotions (created_at desc);

alter table public.emotions enable row level security;

create policy "Anyone can view emotions"
  on public.emotions for select
  using (true);

create policy "Anyone can add an emotion"
  on public.emotions for insert
  with check (true);

alter publication supabase_realtime add table public.emotions;
