# SETUP — Firebase / Google Cloud セットアップ手順

> このアプリは「ビルド無しの静的サイト」です。動かすには **Firebase プロジェクト**と **Google OAuth クライアント**を1回だけ用意し、`config.js` に値を入れます。コンソール操作はあなた（オーナー）しかできないので、以下を順に実施してください。所要 15〜20分。

最終更新日: 2026-09-24

---

## 0. 全体像

| 要件 | 使うもの |
| --- | --- |
| Google 認証 / ユーザー登録 | Firebase Authentication（Google プロバイダ） |
| 希望日時・打ち合わせデータ | Cloud Firestore |
| Google カレンダー反映 | Google Calendar API（ログインユーザーの OAuth トークン） |
| メール送信 | Gmail の作成画面を直接開く（API不要・設定不要・送信は本人） |
| Discord 通知 | Discord Webhook（マスター設定に URL を登録・コンソール作業不要） |

---

## 1. Firebase プロジェクト作成

1. https://console.firebase.google.com/ → 「プロジェクトを追加」。名前は任意（例 `shiraselab-scheduler`）。
2. 作成後、左メニュー **Authentication** → 「始める」→ **Sign-in method** → **Google** を有効化 → プロジェクトのサポートメールを選んで保存。
3. **Firestore Database** → 「データベースを作成」→ 本番モード → ロケーション `asia-northeast1`（東京）推奨。
4. 作成できたら **ルール** タブに、リポジトリ直下 `firestore.rules` の内容を貼り付けて「公開」。
5. 左上ギア → **プロジェクトの設定** → 「マイアプリ」で **ウェブアプリ（`</>`）を追加** → 表示される `firebaseConfig`（apiKey 等）を控える。

## 2. 承認済みドメインの登録

Authentication → Settings → **承認済みドメイン** を確認（本アプリは **Firebase Hosting** で配信）:
- `localhost`・`shiraselab-scheduler.web.app`・`shiraselab-scheduler.firebaseapp.com` は Firebase が**既定で承認済み**＝追加不要。
- 独自ドメインを後で割り当てる場合はそのドメインをここに追加。

## 3. Google Cloud 側で API と OAuth クライアント

Firebase プロジェクトは同名の Google Cloud プロジェクトを持ちます。https://console.cloud.google.com/ で**同じプロジェクト**を選択:

1. **API とサービス → ライブラリ** で次を「有効にする」:
   - **Google Calendar API**（カレンダー反映用。メールは mailto なので Gmail API は不要）
2. **API とサービス → OAuth 同意画面**:
   - ユーザーの種類: 社内なら「内部」、外部の参加者も使うなら「外部」。
   - スコープは `.../auth/calendar.events` のみ（メールは mailto なので Gmail スコープ不要）。
   - 「外部」でテスト中の場合は、使う人の Google アカウントを**テストユーザー**に追加（または本番公開する）。
   - ※`calendar.events` は「機微」スコープのため未検証アプリでは初回に「このアプリは確認されていません」警告が出ます（主催者のみ・詳細→移動で続行）。カレンダー自動反映が不要なら Calendar API も省略可。
3. **OAuth クライアント ID**（新規作成は不要。Firebase が Google ログイン有効化時に自動生成した
   「Web client (auto created by Google Service)」を再利用する）:
   - **API とサービス → 認証情報**（新UIは Google Auth Platform → クライアント）でその Web クライアントを開く。
   - **承認済みの JavaScript 生成元** に次を追加:
     - `http://localhost:5000`（ローカル確認用のポート）
     - `https://shiraselab-scheduler.web.app`（本番＝Firebase Hosting）
   - **クライアント ID**（`....apps.googleusercontent.com`）を控えて `config.js` の `googleClientId` に設定。

> 補足: Firebase の Google ログインは内部でこの Web クライアントを使います。カレンダーの
> **アクセストークン取得（GIS）**にも**同じクライアント ID** を `googleClientId` に設定すればよい（別途作成不要）。

## 4. config.js を作成

リポジトリ直下で `config.example.js` を `config.js` にコピーし、1・3で控えた値を入れます（`config.js` は `.gitignore` 済み＝公開されません）:

```js
window.SCHEDULER_CONFIG = {
  firebase: { apiKey: '…', authDomain: '…', projectId: '…', storageBucket: '…', messagingSenderId: '…', appId: '…' },
  googleClientId: '…apps.googleusercontent.com',
  googleScopes: 'https://www.googleapis.com/auth/calendar.events',
};
```

## 5. ローカルで動作確認

`file://` では ES モジュール/認証が動かないので簡易サーバで開きます（ポートは OAuth 生成元に登録した **5000**）:

```
python -m http.server 5000 --directory D:\ShiraseLab\Scheduler
```

ブラウザで http://localhost:5000 → 「Google でログイン」。カレンダーの同意は「確定」操作時に出ます（メールは mailto でメールソフトが開くだけ）。
（別ポートを使うなら手順3の「承認済み JavaScript 生成元」にそのポートを追加。）

## 6. Firebase Hosting へ公開

配信は **Firebase Hosting**（`https://shiraselab-scheduler.web.app/`）。`oshimite.jp`（推しミテ本番サイト）とは分離。
`firebase deploy` は**ローカルのファイルを配信する**ため、`.gitignore` 済みの `config.js` もそのまま公開される（別途配置不要）。

```
npm install -g firebase-tools     # 初回のみ
firebase login                    # 初回のみ（対話。! で実行）
firebase deploy --only hosting            # 配信のみ
firebase deploy --only hosting,firestore  # ルールも一緒に反映する場合
```

- 配信設定は `firebase.json`（`public: "."`＋ `ignore` で docs/*.md/rules を除外）、プロジェクトは `.firebaserc`（`shiraselab-scheduler`）。
- 公開後 `https://shiraselab-scheduler.web.app/` を開いて確認。`web.app`・`firebaseapp.com` は Firebase Auth の承認ドメインに既定で入っているので追加不要。OAuth の JavaScript 生成元にだけ `https://shiraselab-scheduler.web.app` を入れておく（手順3）。

> メモ: `config.js` の中身（Firebase apiKey・OAuth クライアント ID）は「公開前提の識別子」で、実アクセス制御は Firestore ルールと承認済みドメイン/生成元が担う。Hosting で公開されても設計上問題ない。

---

## トラブルシュート

| 症状 | 原因/対処 |
| --- | --- |
| ログインポップアップが即閉じる/失敗 | 承認済みドメインに現在のホスト名が未登録。手順2。 |
| `redirect_uri_mismatch` / トークン取得失敗 | OAuth クライアントの「JavaScript 生成元」に現URLが未登録。手順3。 |
| カレンダー登録 403 | Calendar API 未有効 or 同意スコープ不足。手順3-1,3-2。 |
| Gmail作成画面が開かない | ブラウザのポップアップブロック。該当サイトのポップアップを許可（確定時は await をまたぐため特に）。 |
| Firestore 権限エラー | ルール未公開。手順1-4。 |
| Discord 通知失敗 | マスター設定の Webhook URL 形式を確認。 |
