# SPECIFICATION — ShiraseLab Scheduler 仕様書（正本）

> このファイルが仕様の正本。仕様変更・処理変更・不具合修正をしたら、同じ作業で
> ①下の更新履歴に1行追記（最新を先頭へ）②本文の該当節を更新③最終更新日を当日に。

最終更新日: 2026-09-24

## 更新履歴

| 日付 | 区分 | 内容 | 該当節 |
| --- | --- | --- | --- |
| 2026-09-24 | 新規 | 初版。要件1〜8を実装（15分希望収集/GitHub Pages+Firebase/新規調整ダイアログ/マスター/Google認証/メール・Discord/Googleカレンダー） | 全体 |

---

## 1. 目的・要件

複数ユーザーの希望日時を 15 分単位で集約し、打ち合わせ日程を確定・関係者へ通知・カレンダー反映する Web アプリ。

| # | 要件 | 実装 |
| --- | --- | --- |
| 1 | 複数ユーザーが希望日時を15分単位で提出 | 15分グリッド（`views/meeting.js`）。ドラッグ選択→`availabilities/{uid}` に保存。全員分をリアルタイム購読して重なりを集計 |
| 2 | ホスティング=GitHub Pages/さくら | GitHub Pages（静的）。バックエンドは Firebase（サーバーレス） |
| 3 | 打ち合わせ毎のダイアログ・15/30/60/120分 | `views/dashboard.js` の新規作成ダイアログ。所要時間はチップボタン |
| 4 | マスターをユーザーごと設定 | `users/{uid}.master`（`views/master.js`）。新規作成の初期値に流用 |
| 5 | ユーザー登録=Google認証 | Firebase Authentication Google プロバイダ（`lib/firebase.js`） |
| 6 | メール・Discord 通知 | 確定時に Gmail 送信＋Discord Webhook（`lib/notify.js` に集約） |
| 7 | 作業ルール正本 | `AGENTS.md`（マスター `UchiwaTukool/AGENTS.md` の規律を踏襲） |
| 8 | Google カレンダー反映 | 確定枠を Calendar API で登録・参加者招待・Meet 付与（`lib/google.js`） |

## 2. 用語

- **打ち合わせ (meeting)**: 調整単位。所要時間・候補期間・1日の時間帯・参加者・通知設定を持つ。
- **可否 (availability)**: 各ユーザーが打ち合わせに対して提出する「可能な15分スロット」の集合。
- **マスター (master)**: ユーザーごとの既定設定（時間帯・TZ・通知・カレンダー・Discord）。
- **確定枠 (confirmed)**: 主催者が選んだ開始スロット。所要時間ぶんのブロックを占める。

## 3. データモデル（Firestore）

```
users/{uid}
  displayName, email, photoURL
  master: { timezone, dayStart, dayEnd, notifyEmail, notifyDiscord,
            discordWebhook, calendarId, createMeet }
  createdAt, updatedAt

meetings/{meetingId}
  title, description, durationMin(15|30|60|120)
  organizerUid, organizerName, organizerEmail
  candidateStartDate, candidateEndDate            // "YYYY-MM-DD"
  dayStart, dayEnd                                 // "HH:mm"（1日の対象時間帯）
  participantEmails[]                              // 招待・通知先
  notify: { email, discord }
  status: "collecting" | "confirmed" | "cancelled"
  confirmedStart, confirmedEnd                     // スロットキー "YYYY-MM-DDTHH:mm" | null
  createdAt, updatedAt

  availabilities/{uid}
    uid, displayName, email
    slots[]                                        // 可能な15分スロットキー配列
    updatedAt
```

## 4. スロットとブロックの規約

- スロット = 15分（`time.js` の `STEP_MIN`）。スロットキーは `"YYYY-MM-DDTHH:mm"`。
- 1日の対象は `dayStart`（含む）〜`dayEnd`（含まない）を15分刻み。
- 所要時間 `durationMin` は `ceil(duration/15)` 個の**連続**スロットを占める（昼休み等の穴を跨ぐ枠は候補にしない）。
- おすすめ枠 = ブロック内の**全スロットで可能**な人（積集合）が多い順（`time.js` の `rankBlocks`）。全員可能な枠は強調表示。

## 5. 画面

- **ログイン**（未認証）: Google ログインのみ。
- **ダッシュボード** `#/`: 自分が作成した打ち合わせ一覧＋新規作成ダイアログ。
- **マスター設定** `#/master`: ユーザー別既定値の編集。
- **打ち合わせ** `#/m/{id}`: 左=15分グリッド（希望入力・ヒートマップ）、右=おすすめ枠＆確定。主催者のみ確定/再収集/削除。

## 6. 確定フロー（要件6・8）

`meeting.js` 確定 → `store.confirmMeeting` で status/枠を保存 → `notify.dispatchConfirmation`:
1. **Google カレンダー**: `calendarId` にイベント作成、`participantEmails`＋主催者を招待（`sendUpdates=all`）、`createMeet` なら Meet 付与。
2. **メール**: `notify.email` が真なら、主催者の Gmail から確定内容を送信。
3. **Discord**: `notify.discord` が真なら、主催者マスターの Webhook へ投稿。
各連携は独立に成否を返し、UI にまとめて表示（1つ失敗しても他は続行）。

## 7. 認証・権限

- Firebase Auth（Google）でログイン＝ユーザー登録。
- Google API アクセストークンは GIS トークンクライアントで都度取得（初回のみ同意）。恒久トークンは保持しない。
- Firestore ルール（`firestore.rules`）: users は本人のみ。meetings は read=ログイン済み/write=作成者のみ。availabilities は read=ログイン済み/write=本人のみ。

## 8. 未実装・今後の候補

- リマインド通知（前日・N時間前）: 静的構成では実行者が不在のためスケジューラ（例: Cloud Functions + Cloud Scheduler、または GitHub Actions cron）が必要。**現状は確定時の即時通知のみ**。
- 参加者側にも自分のカレンダーへ書き込む導線（現状は主催者カレンダーへ登録＋招待メールで各自取り込み）。
- ラボメンバー名簿からの参加者選択（現状はメール直接入力）。
- 打ち合わせの「中止(cancelled)」UI（データモデルは対応済み）。
