# CodeMap.md — Scheduler コードの地図（公開 API 索引）

> 「どの機能はどのファイルのどの関数/画面から入るか」の索引。grep 総当たりの前にここを引く。
> ファイルを足した／責務を変えた／消したら、同じ作業でここを更新し最終更新日を当日にする（AGENTS §0）。

最終更新日: 2026-10-04

## タグ凡例

`#app` 起点/ルーティング ・ `#ui` 画面 ・ `#auth` 認証 ・ `#db` Firestore ・ `#time` 時間計算 ・
`#calendar` Googleカレンダー ・ `#mailto` メール(メーラー起動) ・ `#discord` Discord ・ `#notify` 確定時連携 ・ `#config` 設定

## レイヤ依存（上→下の一方向）

```
index.html / config.js
   └─ src/app.js (#app)                 ルーティング・認証監視・ヘッダ
        ├─ src/views/*.js (#ui)         画面（login/dashboard/meeting/master）
        │     └─ src/lib/dom.js         DOM ヘルパ（h/mount/toast/openDialog）
        └─ src/lib/*.js                 firebase/auth/store/google/discord/notify/time
```
`views` は `lib` を使うが、`lib` は `views` を参照しない。

---

## 機能別 API エントリ（やりたいこと → 入口）

- **ログイン/ログアウト** → `#auth` `lib/firebase.js` の `loginWithGoogle()` / `logout()` / `onAuthStateChanged`
- **Googleカレンダー/Gmail のトークン取得** → `#calendar` `lib/google.js` の `getAccessToken()`
- **確定枠をカレンダー登録** → `#calendar` `lib/google.js` の `createCalendarEvent()`
- **メール送信（Gmail作成画面を開く）** → `#mailto` `lib/mailto.js` の `openCompose()` / `reserveTab`+`fillTab`
- **Discord 通知** → `#discord` `lib/discord.js` の `sendDiscord()`
- **確定時の連携一括（カレンダー+メール+Discord）** → `#notify` `lib/notify.js` の `dispatchConfirmation()`
- **打ち合わせ CRUD / 可否の保存・購読** → `#db` `lib/store.js`
- **マスター設定の取得・保存** → `#db` `lib/store.js` の `getOrCreateUser()` / `saveMaster()` / `defaultMaster()`
- **15分スロット生成・おすすめ枠集計** → `#time` `lib/time.js` の `timeSlots()` / `dateRange()` / `rankBlocks()`
- **打ち合わせの新規作成／編集ダイアログ（15/30/60/120分・土日祝除外）** → `#ui` `views/meeting_dialog.js` の `openMeetingDialog()`
- **希望入力グリッド（開始選択で所要時間ぶん自動選択）・確定・編集** → `#ui` `views/meeting.js`

---

## ファイル別 API エントリ

### index.html / config.js `#config`
- Purpose: 静的エントリ。`config.js`（gitignore）が `window.SCHEDULER_CONFIG` を定義。GIS スクリプトと `src/app.js` を読む。

### src/app.js `#app`
- Purpose: 認証状態監視・ハッシュルーティング（`#/` 一覧 / `#/master` / `#/m/{id}`）・共通ヘッダ。
- API: （モジュール副作用で起動）`onAuthStateChanged` → `route()`。

### src/lib/firebase.js `#auth #db #config`
- Purpose: Firebase 初期化。`config.js` の設定で app/auth/db を作る。
- API: `app` / `auth` / `db` / `CONFIG` / `loginWithGoogle()` / `logout()` / `onAuthStateChanged`

### src/lib/google.js `#calendar #auth`
- Purpose: GIS でアクセストークン取得、Calendar REST 呼び出し（401 リトライ付き）。※メールは mailto に移行し Gmail 送信は廃止。
- API: `getAccessToken(forceConsent?)` / `createCalendarEvent(p)`

### src/lib/mailto.js `#mailto #notify`
- Purpose: Gmail の作成画面を直接開く（`view=cm`。実クライアント送信＝スパム/OAuth警告/審査/既定メーラー設定を回避）。
- API: `gmailComposeUrl(to, subject, body)` / `openCompose(...)`（クリック直後用）/ `reserveTab()`＋`fillTab(win, to, subject, body)`（await をまたぐ時）

### src/lib/discord.js `#discord`
- Purpose: Discord Webhook 送信・URL 形式チェック。
- API: `sendDiscord(webhookUrl, content, username?)` / `isDiscordWebhook(url)`

### src/lib/store.js `#db`
- Purpose: Firestore 読み書きの単一経路（users/meetings/availabilities）。
- API: `defaultMaster()` / `getOrCreateUser(user)` / `saveMaster(uid, master)` / `addEmailsToHistory(uid, emails)` /
  `createMeeting(m)` / `getMeeting(id)` / `updateMeeting(id, fields)` / `listMyMeetings(uid, email)`（主催＋参加） /
  `confirmMeeting(id,s,e)` / `reopenMeeting(id)` / `deleteMeeting(id)` / `saveAvailability(id, slots)` /
  `getMyAvailability(id)` / `watchAvailabilities(id, cb)`

### src/lib/notify.js `#notify #calendar #discord`
- Purpose: 確定時の外部連携（Google カレンダー登録＋Discord）。メールは mailto（views 側で `openMailer`）。
- API: `dispatchConfirmation(meeting, master, date, time, attendeeEmails)` → `{calendar, discord, meetUrl}`

### src/lib/time.js `#time`
- Purpose: 15分スロット/日付レンジ生成、月グリッド、除外フィルタ、ブロック集計・整形（純関数）。
- API: `STEP_MIN` / `DURATION_OPTIONS` / `WEEKDAY_JA` / `timeToMin` / `minToTime` / `slotKey` / `parseSlotKey` /
  `dateRange` / `toDateStr` / `filterDays`（土/日/祝の除外）/ `timeSlots` / `dateLabel` / `todayStr` /
  `monthMatrix`（月間カレンダー升目）/ `slotsForDuration` / `rankBlocks` / `toLocalIso` / `confirmedLabel`

### src/lib/holidays.js `#holiday`
- Purpose: 日本の祝日データ（holidays-jp API）取得＋セッションキャッシュ。失敗時は空マップで縮退。
- API: `loadHolidays()` → `{"YYYY-MM-DD": 祝日名}`

### src/lib/dom.js `#ui`
- Purpose: 依存なし DOM ヘルパ。
- API: `h(sel, props, ...children)` / `mount(root, ...nodes)` / `toast(msg, kind)` / `openDialog(title, builder)`

### src/views/login.js `#ui #auth`
- Purpose: 未認証画面。`renderLogin(root)`。

### src/views/dashboard.js `#ui #calendar`
- Purpose: ホーム。月間カレンダー（**主催＋参加**の打ち合わせを日付にチップ・確定=緑実線=埋/調整中=薄色・空き日クリックで新規）＋一覧。
  新規作成は共通ダイアログ（`meeting_dialog.js`）を開く。`renderDashboard(root)`。

### src/views/meeting_dialog.js `#ui #meeting`
- Purpose: 打ち合わせの新規作成／編集の共通ダイアログ（所要時間・土/日/祝除外・通知・参加者メールは1人1行＝＋/−・Enter/Backspace/Delete）。
- API: `openMeetingDialog({ master, meeting?, prefillDate?, onDone })`（meeting を渡すと編集モード＝`updateMeeting`）／内部 `makeEmailList(initial)`

### src/views/meeting.js `#ui #time #notify #db #holiday`
- Purpose: 15分グリッド入力（**開始時刻をドラッグ選択→所要時間ぶん自動拡張**・15分刻み開始・末尾スナップ・
  選択枠は領域の外周のみ `paintOutline`）・リアルタイム集計ヒートマップ・おすすめ枠（同人数連続を `groupRanked` でまとめ）・
  確定・**編集**（共通ダイアログ）・**📨招待を送る**（`openCompose`＝Gmail作成画面＋Webhookあればdiscord）・**確定枠は緑塗り＝埋（`bookedKeys`、希望は消さない）**。候補日は土/日/祝除外（`filterDays`＋`loadHolidays`）。確定時は `dispatchConfirmation`（カレンダー＋Discord）＋確定メールを Gmail作成画面(`reserveTab`/`fillTab`)で開く。
- API: `renderMeeting(root, id)` / `cleanupMeeting()`

### src/views/master.js `#ui #db`
- Purpose: ユーザー別マスター設定編集。`renderMaster(root)`。

### firestore.rules
- Purpose: Firestore セキュリティルール（users=本人のみ / meetings=read:ログイン,write:作成者 / availabilities=read:ログイン,write:本人）。
