-- Profiles table — one row per authenticated user
create table if not exists profiles (
  id uuid references auth.users on delete cascade primary key,
  email text,
  plan text not null default 'free',          -- 'free' | 'pro'
  stripe_customer_id text,
  stripe_subscription_id text,
  cases_today int not null default 0,
  cases_reset_date date not null default current_date,
  created_at timestamptz not null default now()
);

-- Auto-create a profile when a user signs up
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, email)
  values (new.id, new.email)
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- RLS
alter table profiles enable row level security;

create policy "Users can read own profile"
  on profiles for select
  using (auth.uid() = id);

create policy "Users can update own profile"
  on profiles for update
  using (auth.uid() = id);

-- Backend service role can do anything (needed for webhook upserts)
create policy "Service role full access"
  on profiles for all
  using (true)
  with check (true);
