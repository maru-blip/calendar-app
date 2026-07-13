-- カレンダーアプリ: Todo/期限リスト用テーブル
create table todos (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  category text not null check (category in ('study','work')), -- 勉強 / 仕事
  due_date date,               -- nullなら期限なしTodo、値があれば期限リストへ昇格
  due_time time,               -- 任意（時刻まで指定する場合）
  completed boolean not null default false,
  sort_order integer not null default 0,  -- 期限なしTodoの並び替え用
  created_at timestamptz not null default now()
);

-- まる専用の個人アプリなので、RLSを有効にしつつ全操作を許可するシンプルなポリシーにする
alter table todos enable row level security;

create policy "allow all for anon" on todos
  for all
  using (true)
  with check (true);
