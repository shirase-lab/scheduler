# SPECIFICATION — ShiraseLab Scheduler 仕様書（正本）

> このファイルが仕様の正本。仕様変更・処理変更・不具合修正をしたら、同じ作業で
> ①下の更新履歴に1行追記（最新を先頭へ）②本文の該当節を更新③最終更新日を当日に。

最終更新日: 2026-10-04

## 更新履歴

| 日付 | 区分 | 内容 | 該当節 |
| --- | --- | --- | --- |
| 2026-10-04 | 変更 | **メール送信を Gmail API(gmail.send) → Gmail作成画面の直接オープン（`view=cm`）に変更**。送信は本人実行＝スパム判定されにくく、OAuth 制限付きスコープ警告・審査・OS既定メーラー設定が不要に。`gmail.send`・`sendGmail`・作成時自動送信・`dispatchInvite` を撤去 | §6・§7 |
| 2026-10-03 | 追加 | 打ち合わせ画面に「📨 招待を送る」ボタン（主催者）。招待は作成時の自動送信だけでなく、いつでも明示送信/再送できる（メール送信の確認もこれで可能） | §5・§6 |
| 2026-10-03 | 変更 | 選択セルに薄い黄塗りを戻す（外周枠は維持）。消去時の視認性改善 | §5 |
| 2026-10-02 | 追加 | リンク共有時のプレビュー（OGP/Twitter Card）を `index.html` に追加。※ハッシュルーティングのためカードはサイト共通（個別打ち合わせ別カードは静的配信では不可） | index.html |
| 2026-09-30 | 追加 | ホームに「自分が参加する打ち合わせ」も表示（主催 or `participantEmails` に自分のメール）。B・Cも自分の予定として見える | §5 |
| 2026-09-30 | 追加 | 確定枠を各参加者の予定に「確定・埋」として色分け表示（カレンダーは実線緑チップ、グリッドは緑塗り）。候補(希望)は**消さない** | §5・§6 |
| 2026-09-30 | 追加 | 作成時に参加者へ**招待通知**（候補選択URL付き・メール/Discord、通知トグルに従う）。`notify.js` の `dispatchInvite` | §6 |
| 2026-09-26 | 変更 | おすすめ枠に説明文を追加。同人数・同じ顔ぶれで連続する開始時刻を1件にまとめて表示（`groupRanked`） | §5 |
| 2026-09-26 | 変更 | 参加者メール入力を「1人1行」に（＋/−ボタン・Enterで追加・空欄で Backspace/Delete 削除） | §5 |
| 2026-09-26 | 追加 | 参加者メールに**入力履歴の候補表示**（過去に使ったメールを `datalist` で補完。`users/{uid}.emailHistory` に蓄積） | §3・§5 |
| 2026-09-26 | 変更 | 選択の黄色枠を各マスから「選択領域の外周のみ」に変更 | §5 |
| 2026-09-25 | 変更 | 希望入力を「**1マス選択＝所要時間ぶん自動選択**（開始は15分刻み・末尾はスナップ）」に変更。「60分なのに15分マス」の違和感を解消しつつ 19:15 等の15分刻み開始を維持 | §4・§5 |
| 2026-09-25 | 追加 | 打ち合わせの**編集**（主催者）。新規/編集を共通ダイアログ `meeting_dialog.js` に集約 | §5 |
| 2026-09-24 | 追加 | ホーム画面に月間カレンダー表示（打ち合わせを日付にチップ表示・空き日クリックで新規） | §5 |
| 2026-09-24 | 追加 | 新規作成ダイアログに「土/日/祝を除く」を追加（祝日は holidays-jp API）。希望入力グリッドの候補日から除外 | §4・§5 |
| 2026-09-24 | 変更 | 希望入力を1セルずつ→**矩形（ドラッグで四角）選択**に変更 | §5 |
| 2026-09-24 | 変更 | ホスティングを GitHub Pages → **Firebase Hosting** に変更（既存 `shirase-lab.github.io` がカスタムドメイン `oshimite.jp` にリダイレクトされ製品サイトと混線するため分離。公開URL `shiraselab-scheduler.web.app`） | §1(#2) |
| 2026-09-24 | 新規 | 初版。要件1〜8を実装（15分希望収集/静的+Firebase/新規調整ダイアログ/マスター/Google認証/メール・Discord/Googleカレンダー） | 全体 |

---

## 1. 目的・要件

複数ユーザーの希望日時を 15 分単位で集約し、打ち合わせ日程を確定・関係者へ通知・カレンダー反映する Web アプリ。

| # | 要件 | 実装 |
| --- | --- | --- |
| 1 | 複数ユーザーが希望日時を15分単位で提出 | 15分グリッド（`views/meeting.js`）。ドラッグ選択→`availabilities/{uid}` に保存。全員分をリアルタイム購読して重なりを集計 |
| 2 | ホスティング=GitHub Pages/さくら | **Firebase Hosting**（静的・`firebase deploy`）を採用。バックエンドも Firebase（サーバーレス）。当初案の GitHub Pages は `oshimite.jp` 混線回避のため不採用 |
| 3 | 打ち合わせ毎のダイアログ・15/30/60/120分 | `views/dashboard.js` の新規作成ダイアログ。所要時間はチップボタン |
| 4 | マスターをユーザーごと設定 | `users/{uid}.master`（`views/master.js`）。新規作成の初期値に流用 |
| 5 | ユーザー登録=Google認証 | Firebase Authentication Google プロバイダ（`lib/firebase.js`） |
| 6 | メール・Discord 通知 | メールは mailto（メーラー起動・`lib/mailto.js`）、Discord は Webhook。確定時はカレンダー＋Discord（`lib/notify.js`） |
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
  emailHistory[]                                   // 過去に使った参加者メール（入力候補用）
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
- 候補日は作成時の除外設定（`excludeSat`/`excludeSun`/`excludeHoliday`）で絞り込む（`time.js` の `filterDays`。祝日は `holidays.js` の holidays-jp API）。
- 所要時間 `durationMin` は `ceil(duration/15)` 個の**連続**スロットを占める（昼休み等の穴を跨ぐ枠は候補にしない）。
- おすすめ枠 = ブロック内の**全スロットで可能**な人（積集合）が多い順（`time.js` の `rankBlocks`）。全員可能な枠は強調表示。

## 5. 画面

- **ログイン**（未認証）: Google ログインのみ。
- **ホーム** `#/`: 月間カレンダー。**主催 or 参加（`participantEmails` に自分）**の打ち合わせを日付にチップ表示（**確定=実線緑チップ＝予約済み/埋**、調整中=薄色。確定日/候補開始日に配置）、前後月移動・今日ハイライト、チップで打ち合わせへ、空き日クリックでその日を候補開始にした新規作成）＋下部に一覧。新規作成ダイアログは所要時間 15/30/60/120分・**土/日/祝を除く**・参加者メール(1人1行・履歴候補)を持つ。
- **マスター設定** `#/master`: ユーザー別既定値の編集。
- **打ち合わせ** `#/m/{id}`: 左=15分グリッド（希望入力＝**開始時刻をドラッグ選択すると所要時間ぶん自動で塗られる**。開始は15分刻み、時間帯末尾は収まる最後の開始へスナップ・ヒートマップ。**確定後は確定枠を緑塗り＝埋**として表示し、各自の希望は残す）、右=おすすめ枠＆確定。主催者は **招待送信(📨)**/確定/再収集/**編集**/削除（編集は共通ダイアログ）。候補日は土/日/祝の除外を反映。

## 6. 招待〜確定フロー（要件3・6・8）

**フロー全体**: A が作成（候補期間・時間帯・参加者）→ 参加者へ**招待**（候補選択URL）→ B・C が希望を入力 → A が確定 → 確定枠が全員の予定に「埋」として反映（希望は消さない）。

**メール送信方式**: **Gmail の作成画面を直接開く**（`view=cm` の作成URLを新規タブで。`lib/mailto.js` の `openCompose`/`reserveTab`+`fillTab`）。Gmail API 送信（gmail.send）は廃止。宛先・件名・本文をプリフィルして開くだけで、送信は本人が実行＝スパム判定されにくく、OAuth の制限付きスコープ警告・審査も不要。OS既定メーラー/ハンドラ設定も不要。

**招待** 打ち合わせ画面の「📨 招待を送る」で送信（`meeting.js`）:
- `participantEmails` 宛に **mailto を起動**（件名・本文・候補選択URL をプリフィル）→ 主催者が送信。マスターに Discord Webhook があれば Discord にも自動投稿。
- ※作成時の自動メール送信は廃止（📨 ボタンで明示送信/再送）。

**確定** `meeting.js` 確定 → `store.confirmMeeting` で status/枠を保存 → `notify.dispatchConfirmation`（カレンダー＋Discord）＋ 確定メールは mailto 起動:
1. **Google カレンダー**: `calendarId` にイベント作成、`participantEmails`＋主催者を招待（`sendUpdates=all`）、`createMeet` なら Meet 付与。
2. **メール**: 確定内容を **mailto で起動**（宛先＝参加者＋主催者）。
3. **Discord**: `notify.discord` が真なら、主催者マスターの Webhook へ投稿。

**確定枠の「埋」表示**: 確定後、各参加者のホーム（`listMyMeetings` が主催＋参加を返す）と打ち合わせグリッド（`bookedKeys`）に確定枠を色分け表示。**availability（各自の希望）は削除しない**（経緯を残す＝要件）。

## 7. 認証・権限

- Firebase Auth（Google）でログイン＝ユーザー登録。
- Google API アクセストークンは GIS トークンクライアントで都度取得（初回のみ同意）。恒久トークンは保持しない。スコープは **`calendar.events` のみ**（メールは mailto なので Gmail スコープ不要）。
- Firestore ルール（`firestore.rules`）: users は本人のみ。meetings は read=ログイン済み/write=作成者のみ。availabilities は read=ログイン済み/write=本人のみ。

## 8. 未実装・今後の候補

- リマインド通知（前日・N時間前）: 静的構成では実行者が不在のためスケジューラ（例: Cloud Functions + Cloud Scheduler、または GitHub Actions cron）が必要。**現状は確定時の即時通知のみ**。
- 参加者側にも自分のカレンダーへ書き込む導線（現状は主催者カレンダーへ登録＋招待メールで各自取り込み）。
- ラボメンバー名簿からの参加者選択（現状はメール直接入力）。
- 打ち合わせの「中止(cancelled)」UI（データモデルは対応済み）。
