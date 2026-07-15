-- カレンダーアプリ: 家族共有ログイン・Todo通知タイミング用の追加テーブル/関数
-- supabase_setup.sql / supabase_setup_2.sql に続けて実行してください
--
-- 注意: cron.scheduleによるsend-notifications関数の定期呼び出し設定はこのファイルには含めていません。
-- 共有シークレットをSupabase Vaultに保存した上でDBに直接設定済みです（HANDOFF.md参照）。

-- 許可されたログインメールアドレスの一覧（家族・パートナーと共有する用途）
create table allowed_emails (
  email text primary key,
  added_at timestamptz not null default now()
);
insert into allowed_emails (email) values ('maru@morethansix.jp');

alter table allowed_emails enable row level security;

-- RLSの自己参照の再帰を避けるため、security definer関数でallowed_emails所属を判定する
create or replace function is_allowed_member()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from allowed_emails
    where email = auth.jwt() ->> 'email'
  );
$$;

create policy "members can manage" on allowed_emails
  for all using (is_allowed_member()) with check (is_allowed_member());

-- 既存テーブルのRLSを、単一メール比較からis_allowed_member()ベースに統一
drop policy if exists "owner only" on todos;
create policy "members only" on todos
  for all using (is_allowed_member()) with check (is_allowed_member());

drop policy if exists "owner only" on settings;
create policy "members only" on settings
  for all using (is_allowed_member()) with check (is_allowed_member());

drop policy if exists "owner only" on push_subscriptions;
create policy "members only" on push_subscriptions
  for all using (is_allowed_member()) with check (is_allowed_member());

drop policy if exists "backgrounds owner write" on storage.objects;
create policy "backgrounds members write" on storage.objects
  for all
  using (bucket_id = 'backgrounds' and is_allowed_member())
  with check (bucket_id = 'backgrounds' and is_allowed_member());

-- 期限リスト/Todoごとに複数の通知タイミングを登録できるようにする
create table todo_notifications (
  id uuid primary key default gen_random_uuid(),
  todo_id uuid not null references todos(id) on delete cascade,
  days_before integer not null default 0,
  hours_before integer not null default 0,
  sent_at timestamptz,
  created_at timestamptz not null default now()
);

alter table todo_notifications enable row level security;
create policy "members only" on todo_notifications
  for all using (is_allowed_member()) with check (is_allowed_member());

-- 定期実行(cron)用の拡張機能
create extension if not exists pg_cron;
create extension if not exists pg_net;
