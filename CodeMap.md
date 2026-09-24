# CodeMap.md — Scheduler コードの地図（公開 API 索引）

> 「どの機能はどのファイルのどの関数/画面から入るか」の索引。grep 総当たりの前にここを引く。
> ファイルを足した／責務を変えた／消したら、同じ作業でここを更新し最終更新日を当日にする（AGENTS §0）。

最終更新日: 2026-09-24

## タグ凡例

`#app` 起点/ルーティング ・ `#ui` 画面 ・ `#auth` 認証 ・ `#db` Firestore ・ `#time` 時間計算 ・
`#calendar` Googleカレンダー ・ `#gmail` メール ・ `#discord` Discord ・ `#notify` 確定時連携 ・ `#config` 設定

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
- **メール送信** → `#gmail` `lib/google.js` の `sendGmail()`
- **Discord 通知** → `#discord` `lib/discord.js` の `sendDiscord()`
- **確定時の連携一括（カレンダー+メール+Discord）** → `#notify` `lib/notify.js` の `dispatchConfirmation()`
- **打ち合わせ CRUD / 可否の保存・購読** → `#db` `lib/store.js`
- **マスター設定の取得・保存** → `#db` `lib/store.js` の `getOrCreateUser()` / `saveMaster()` / `defaultMaster()`
- **15分スロット生成・おすすめ枠集計** → `#time` `lib/time.js` の `timeSlots()` / `dateRange()` / `rankBlocks()`
- **新規打ち合わせダイアログ（15/30/60/120分）** → `#ui` `views/dashboard.js`
- **希望入力グリッド・確定** → `#ui` `views/meeting.js`

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

### src/lib/google.js `#calendar #gmail #auth`
- Purpose: GIS でアクセストークン取得、Calendar/Gmail REST 呼び出し（401 リトライ付き）。
- API: `getAccessToken(forceConsent?)` / `createCalendarEvent(p)` / `sendGmail(p)`

### src/lib/discord.js `#discord`
- Purpose: Discord Webhook 送信・URL 形式チェック。
- API: `sendDiscord(webhookUrl, content, username?)` / `isDiscordWebhook(url)`

### src/lib/store.js `#db`
- Purpose: Firestore 読み書きの単一経路（users/meetings/availabilities）。
- API: `defaultMaster()` / `getOrCreateUser(user)` / `saveMaster(uid, master)` /
  `createMeeting(m)` / `getMeeting(id)` / `listMyMeetings(uid)` / `confirmMeeting(id,s,e)` /
  `reopenMeeting(id)` / `deleteMeeting(id)` / `saveAvailability(id, slots)` /
  `getMyAvailability(id)` / `watchAvailabilities(id, cb)`

### src/lib/notify.js `#notify #calendar #gmail #discord`
- Purpose: 確定時の外部連携を集約（カレンダー→メール→Discord、独立に成否返却）。
- API: `dispatchConfirmation(meeting, master, date, time, attendeeEmails)`

### src/lib/time.js `#time`
- Purpose: 15分スロット/日付レンジ生成、所要時間ブロックの集計・整形（純関数）。
- API: `STEP_MIN` / `DURATION_OPTIONS` / `timeToMin` / `minToTime` / `slotKey` / `parseSlotKey` /
  `dateRange` / `toDateStr` / `timeSlots` / `dateLabel` / `slotsForDuration` / `rankBlocks` /
  `toLocalIso` / `confirmedLabel`

### src/lib/dom.js `#ui`
- Purpose: 依存なし DOM ヘルパ。
- API: `h(sel, props, ...children)` / `mount(root, ...nodes)` / `toast(msg, kind)` / `openDialog(title, builder)`

### src/views/login.js `#ui #auth`
- Purpose: 未認証画面。`renderLogin(root)`。

### src/views/dashboard.js `#ui`
- Purpose: 打ち合わせ一覧＋新規作成ダイアログ（所要時間 15/30/60/120 分チップ）。`renderDashboard(root)`。

### src/views/meeting.js `#ui #time #notify #db`
- Purpose: 15分グリッド入力（ドラッグ）・リアルタイム集計ヒートマップ・おすすめ枠・確定。
- API: `renderMeeting(root, id)` / `cleanupMeeting()`

### src/views/master.js `#ui #db`
- Purpose: ユーザー別マスター設定編集。`renderMaster(root)`。

### firestore.rules
- Purpose: Firestore セキュリティルール（users=本人のみ / meetings=read:ログイン,write:作成者 / availabilities=read:ログイン,write:本人）。
