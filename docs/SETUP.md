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
| メール送信 | Gmail API（ログインユーザーの Gmail から送信） |
| Discord 通知 | Discord Webhook（マスター設定に URL を登録・コンソール作業不要） |

---

## 1. Firebase プロジェクト作成

1. https://console.firebase.google.com/ → 「プロジェクトを追加」。名前は任意（例 `shiraselab-scheduler`）。
2. 作成後、左メニュー **Authentication** → 「始める」→ **Sign-in method** → **Google** を有効化 → プロジェクトのサポートメールを選んで保存。
3. **Firestore Database** → 「データベースを作成」→ 本番モード → ロケーション `asia-northeast1`（東京）推奨。
4. 作成できたら **ルール** タブに、リポジトリ直下 `firestore.rules` の内容を貼り付けて「公開」。
5. 左上ギア → **プロジェクトの設定** → 「マイアプリ」で **ウェブアプリ（`</>`）を追加** → 表示される `firebaseConfig`（apiKey 等）を控える。

## 2. 承認済みドメインの登録

Authentication → Settings → **承認済みドメイン** に、公開先を追加:
- ローカル確認用: `localhost`
- 本番: `<ユーザー名>.github.io`（例 `shirase-lab.github.io`）

## 3. Google Cloud 側で API と OAuth クライアント

Firebase プロジェクトは同名の Google Cloud プロジェクトを持ちます。https://console.cloud.google.com/ で**同じプロジェクト**を選択:

1. **API とサービス → ライブラリ** で次を「有効にする」:
   - **Google Calendar API**
   - **Gmail API**（メール送信を使う場合）
2. **API とサービス → OAuth 同意画面**:
   - ユーザーの種類: 社内なら「内部」、外部の参加者も使うなら「外部」。
   - スコープに `.../auth/calendar.events` と `.../auth/gmail.send` を追加。
   - 「外部」でテスト中の場合は、使う人の Google アカウントを**テストユーザー**に追加（または本番公開する）。
3. **API とサービス → 認証情報 → 認証情報を作成 → OAuth クライアント ID**:
   - 種類: **ウェブ アプリケーション**。
   - **承認済みの JavaScript 生成元** に公開URLを追加:
     - `http://localhost:8000`（ローカル確認のポートに合わせる）
     - `https://<ユーザー名>.github.io`
   - 作成後の **クライアント ID**（`....apps.googleusercontent.com`）を控える。

> 補足: Firebase の Google ログインは内部で別の OAuth クライアントを使いますが、カレンダー/Gmail の**アクセストークン取得（GIS）**には、この手順で作った**ウェブ クライアント ID** を `googleClientId` に設定します。

## 4. config.js を作成

リポジトリ直下で `config.example.js` を `config.js` にコピーし、1・3で控えた値を入れます（`config.js` は `.gitignore` 済み＝公開されません）:

```js
window.SCHEDULER_CONFIG = {
  firebase: { apiKey: '…', authDomain: '…', projectId: '…', storageBucket: '…', messagingSenderId: '…', appId: '…' },
  googleClientId: '…apps.googleusercontent.com',
  googleScopes: 'https://www.googleapis.com/auth/calendar.events https://www.googleapis.com/auth/gmail.send',
};
```

## 5. ローカルで動作確認

`file://` では ES モジュール/認証が動かないので簡易サーバで開きます:

```
cd D:\ShiraseLab\Scheduler
python -m http.server 8000
```

ブラウザで http://localhost:8000 → 「Google でログイン」。初回はカレンダー/Gmail の同意が出ます。
（ポートを変えたら手順3の「承認済み JavaScript 生成元」も合わせて更新。）

## 6. GitHub Pages へ公開

1. GitHub で新規リポジトリ（例 `shirase-lab/scheduler`）を作成し push。
2. リポジトリ **Settings → Pages** → Source: `Deploy from a branch` → Branch `main` / `/(root)` → Save。
3. 数分後 `https://<ユーザー名>.github.io/scheduler/` で公開。
4. **公開URLを 手順2（承認済みドメイン）と手順3（JavaScript 生成元）に必ず追加**（未登録だとログイン/トークン取得が失敗）。

> ⚠ `config.js` はコミットしないので、GitHub Pages 上では**別途 config.js を配置する必要**があります。選択肢:
> - a) `config.js` の中身は公開されても致命的ではない（Firebase apiKey・OAuth クライアント ID は「公開前提の識別子」。実アクセス制御は Firestore ルールと承認済みドメイン/生成元が担う）。運用を簡単にするなら **`.gitignore` から `config.js` を外してコミット**してよい。
> - b) 厳格にしたいなら、公開ブランチにだけ `config.js` を置く／CI で生成する。
> 本番運用では **(a) が手軽で安全**（鍵の秘匿ではなくルールとドメイン制限で守る設計のため）。

---

## トラブルシュート

| 症状 | 原因/対処 |
| --- | --- |
| ログインポップアップが即閉じる/失敗 | 承認済みドメインに現在のホスト名が未登録。手順2。 |
| `redirect_uri_mismatch` / トークン取得失敗 | OAuth クライアントの「JavaScript 生成元」に現URLが未登録。手順3。 |
| カレンダー登録 403 | Calendar API 未有効 or 同意スコープ不足。手順3-1,3-2。 |
| メール送信 403 | Gmail API 未有効 or `gmail.send` 未同意。 |
| Firestore 権限エラー | ルール未公開。手順1-4。 |
| Discord 通知失敗 | マスター設定の Webhook URL 形式を確認。 |
