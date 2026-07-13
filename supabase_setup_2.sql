-- カレンダーアプリ: 設定画面・Push通知用の追加テーブル/バケット
-- supabase_setup.sql に続けて実行してください

-- 設定（背景写真・通知タイミング・色分けしきい値）。1行のみ使う想定
create table settings (
  id integer primary key default 1,
  bg_photo_url text,
  bg_pos_x integer not null default 50,   -- 背景写真の横位置（%）
  bg_pos_y integer not null default 50,   -- 背景写真の縦位置（%）
  bg_opacity numeric not null default 0.3, -- 背景写真の濃さ（0〜1）
  notify_days_before integer not null default 1,  -- 期限の◯日前に通知
  notify_hours_before integer not null default 3, -- 当日◯時間前に通知
  threshold_red_days integer not null default 1,  -- 赤色にするしきい値（◯日以内）
  threshold_yellow_days integer not null default 3, -- 黄色にするしきい値（◯日以内）
  updated_at timestamptz not null default now(),
  constraint single_row check (id = 1)
);
insert into settings (id) values (1);

alter table settings enable row level security;
create policy "allow all for anon" on settings
  for all using (true) with check (true);

-- Push通知の購読情報
create table push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now()
);

alter table push_subscriptions enable row level security;
create policy "allow all for anon" on push_subscriptions
  for all using (true) with check (true);

-- 背景写真アップロード用のストレージバケット
insert into storage.buckets (id, name, public)
values ('backgrounds', 'backgrounds', true)
on conflict (id) do nothing;

create policy "backgrounds anon all" on storage.objects
  for all
  using (bucket_id = 'backgrounds')
  with check (bucket_id = 'backgrounds');
