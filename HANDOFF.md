# カレンダーアプリ 引き継ぎメモ

まる専用の個人カレンダーアプリ。スマホでも使う前提の単一`index.html`構成。
時間割アプリ（`rapid-frost-2328.maru-7b2.workers.dev`）とは別プロジェクト。

## 技術構成

- **フロントエンド**: 単一`index.html`（HTML/CSS/JSのみ、フレームワークなし）
- **予定データ**: Googleカレンダー（Calendar API、OAuthはGoogle Identity Services使用）
- **Todo/期限リスト**: Supabase（実装済み。予定＝Google、Todo/期限＝Supabaseという役割分担）
- **デプロイ先**: Cloudflare Pages（本番URL: `https://calendar-app-cav.pages.dev`）。GitHub（`maru-blip/calendar-app`、Public）にpushすると`.github/workflows/deploy.yml`のGitHub Actionsが自動デプロイ（`CLOUDFLARE_API_TOKEN`をリポジトリSecretに登録済み）
- **フォント**: Kiwi Maru（丸くてポップな書体、Google Fonts CDN経由）
- **デザイン**: くっきりボタニカル配色 — 勉強=青(accent) / 仕事=緑(success) / 締切=赤(danger)。色・余白はファイル冒頭の`:root`のCSS変数にまとめてある
- **ログイン**: Supabase Auth（メールのマジックリンク方式、パスワードなし）。`allowed_emails`テーブルに登録されたメールアドレスのみログイン・データアクセス可能

## Google Cloud Console 設定状況（設定済み）

- プロジェクト名: `my-calendar-app`
- Google Calendar API: 有効化済み
- OAuth同意画面: 外部 / テストモード、テストユーザーとしてまる本人のGoogleアカウントを登録済み
- スコープ: `https://www.googleapis.com/auth/calendar`（フルアクセス）
- OAuthクライアントID: `356778122638-4u3spagvtmjbjfnm3ck70uqise7tmapd.apps.googleusercontent.com`
- クライアントシークレットは未取得・不要（ブラウザ完結型アプリのため使わない方針）
- 承認済みのJavaScript生成元に`https://calendar-app-cav.pages.dev`を登録済み

## Supabase設定状況（設定済み）

- プロジェクトURL: `https://ixkxavusivoeafmmunqn.supabase.co`
- anon/publishable key: `index.html`内の`SUPABASE_KEY`に直書き（公開前提の値。実際のアクセス制御はSupabase AuthのログインとRLSで行っている）
- Auth: メールのマジックリンク方式（`create_user:false`固定、未登録メールでは新規アカウントを作らせない）。CAPTCHA保護は個人アプリのため無効化。Site URL/Redirect URLsは本番URLと`localhost`テスト用を登録済み
- RLS: `allowed_emails`テーブルに登録されたメールでログインしている人だけ、`todos`/`settings`/`push_subscriptions`/`todo_notifications`/`backgrounds`ストレージへアクセス可能（`is_allowed_member()`というsecurity definer関数で判定）
- テーブル作成SQL: `supabase_setup.sql`（`todos`）→`supabase_setup_2.sql`（`settings`/`push_subscriptions`/`backgrounds`）→`supabase_setup_3.sql`（`allowed_emails`/`todo_notifications`/RLS統一/cron拡張の有効化）の順に適用済み
- `due_date`がある行＝期限リスト、nullの行＝期限なしTodo、という単一テーブルでの役割分担
- Edge Functions: `invite-member`（共有メンバー招待）、`send-notifications`（Push通知配信、pg_cronで15分おきに呼び出し）をデプロイ済み。ソースは`supabase/functions/`配下にも保存
- cron呼び出し用の共有シークレットはSupabase Vaultに保存（`cron_secret`という名前、`cron.job`テーブルには平文で残らない設計）

## テスト時の注意

GoogleログインはOAuthの制約上、`https://`または`http://localhost`でしか動かない。
`index.html`をダブルクリックしてブラウザで開く（`file://`）だけではGoogleログインボタンが機能しないので、Netlify DropやCloudflare Pagesなど実際にホスティングした状態でテストする必要がある。

## 実装済み

### 日表示
- Googleカレンダーからその日の予定を取得して表示
- タイムライン上での時間の重なりを自動で横並びに調整（何件重なってもOK）
- 現在時刻の赤いライン表示（今日を見ているときだけ）
- タイムラインの空欄をタップ→その時刻（10分刻みで丸め）が入った状態で予定追加ポップアップが開く
- 予定追加はボトムシート型のポップアップ（背景タップ or ✕で閉じる、背景スクロールもロック）
- 予定タップで吹き出し表示（タイトル・時間・場所）、編集・削除ボタンでGoogleカレンダーの予定を実際に更新／削除
- 予定の追加・編集はGoogleカレンダーに実際に書き込み（カテゴリは`extendedProperties.private.category`に保存）。編集は既存値を入れた状態で追加ポップアップを流用し、保存時はPOSTではなくPATCHで該当予定のみ更新
- 前の日／次の日／今日ボタンでの日付移動
- 終日・締切系の予定は上部に専用の帯で表示（🚩アイコン）
- Google未連携時は「連携する」ボタン付きのバナーを表示

### 週表示
- 月曜始まりで7日分。日表示と同じ重なり自動調整・タップで吹き出し詳細（編集・削除も可）
- CSS Gridで実装、時刻列は横スクロールしても左に固定（sticky）
- 前週／今週／次週ボタン、曜日ヘッダーをタップするとその日の日表示に遷移
- 終日・締切予定は各日の列上部に🚩チップで表示
- 空欄タップでの予定追加も日表示と同様に対応

### 期限リスト・Todo（Supabase連携）
- 期限リストは「勉強」「仕事」を横並び表示（画面が狭いと自動で縦積み、CSS flex-wrapで対応）
- 行全体が期限に応じて色変化（1日以内=赤、3日以内=黄）
- 期限切れは専用セクションで別枠表示
- 各項目に完了チェック（チェックすると非表示、「完了を表示」ボタンで取り消し線付きで再表示）
- Todoは日付なしで登録可（追加フォームで日付欄を空にする）、上下ボタンで並び替え可能
- 追加フォームで日付を設定すればそのまま期限リスト側に入る（テーブル上は同じ行、`due_date`の有無で表示先が変わるだけ）
- 追加フォームのTodo選択時は「締切」カテゴリを無効化（Todoは勉強／仕事のみ）

### 設定画面（Supabase連携）
- 背景写真のアップロード（Supabase Storageの`backgrounds`バケットに保存、全端末で共通）、プレビュー、横/縦位置スライダー、濃さスライダー。保存した設定は全画面共通の背景として反映
- 通知タイミングの既定値（期限の◯日前 + 当日◯時間前）を保存でき、追加フォームの「＋設定の既定値を追加」ボタンで使われる
- 期限リストの色分けしきい値（赤=◯日以内、黄=◯日以内）を設定可能にし、期限リストの表示にも反映
- 共有メンバー管理: `allowed_emails`の一覧表示・削除、メールアドレスを指定して`invite-member` Edge Function経由で招待（招待されたメールは事前にパスワードなしのAuthユーザーとして作成され、以後マジックリンクでログイン可能）
- Push通知の購読ボタン: `sw.js`registration→通知許可→`pushManager.subscribe()`→`push_subscriptions`へ保存

### 期限リスト/Todoの通知タイミング（Supabase連携）
- 追加フォームでTodo種別＋日付ありのときだけ「通知タイミング」欄が出現。「◯日前」「◯時間前」を何回でも追加でき、チップ一覧で確認・個別削除できる
- `todo_notifications`テーブルに保存（`days_before`/`hours_before`/`sent_at`）。既存Todoの編集自体が未実装のため、通知タイミングの変更も新規作成時のみ
- 実配信は`send-notifications` Edge Function（pg_cronで15分おき）が担当。期限到来（Asia/Tokyo基準）した通知を`push_subscriptions`全件へ一斉送信し、届かなかった（410/404）購読は自動削除

## 未実装（優先順、モックアップでUI検証済み）

1. **繰り返し予定**: 追加フォームには「繰り返し（なし/毎日/毎週/毎月）」の選択項目自体はモックアップで存在。編集・削除時に「今回だけ」か「今後すべて」かを選ぶ分岐が必要（未設計）
2. Todoに日付を後から設定して期限リストへ「昇格」させるUI・既存Todoの編集全般（現状は新規作成時のみ対応）
3. 期限リストの`due_time`（時刻）欄は未使用（テーブルには列があるが、追加フォームでは入力させていない）
4. Push通知は「共有メンバー全員の全端末へ一斉送信」という設計。特定の人だけに送る、Google予定側の通知に対応する、といった細かい制御は未対応
5. **要対応（実装時に一度だけ）**: Supabase Edge Functionsのシークレット（`CRON_SECRET`＝Vaultに保存済みの値と同じもの, `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`）を、ダッシュボードのEdge Function Secretsへまだ登録していない。登録するまで`send-notifications`は500エラーを返す

## デザイン上の決定事項

- 締切・終日系の予定はタイムラインに埋め込まず、上部の専用帯に表示（タップしにくいため）
- 予定追加は空欄タップからの時刻自動入力を維持する方針で、ポップアップ化してもこの機能は活かす
- スマホ幅は自動追従（手動切り替えボタンは廃止）
- 月表示・ダークモード切り替えは実装しない方針（前者はGoogleカレンダー側で代替、後者は背景写真機能と役割が被るため）

## 添付ファイル

- `index.html`: 現在の実装（日表示・週表示・予定編集・期限リスト/Todo・設定画面・ログイン・共有メンバー・Push通知購読まで動作）
- `sw.js`: Push通知受信用のService Worker
- `supabase_setup.sql`: `todos`テーブルの作成SQL（適用済み）
- `supabase_setup_2.sql`: `settings`/`push_subscriptions`テーブル・`backgrounds`ストレージバケットの作成SQL（適用済み）
- `supabase_setup_3.sql`: `allowed_emails`/`todo_notifications`テーブル・RLS統一・cron拡張有効化のSQL（適用済み、cron.schedule本体とシークレットは含めていない）
- `supabase/functions/invite-member/index.ts`, `supabase/functions/send-notifications/index.ts`: デプロイ済みEdge Functionのソース
