# ShiraseLab Scheduler

複数ユーザーの希望日時を **15分単位** で集めて、打ち合わせの日程を確定する Web スケジューラ。
**ビルド不要の静的サイト**（HTML + 素の ES モジュール）で、GitHub Pages にそのまま置けます。

## 特徴（要件対応）

1. 複数ユーザーが希望日時を **15分刻みのグリッド**でドラッグ入力 → 全員の重なりをリアルタイム集計（ヒートマップ）
2. ホスティングは **GitHub Pages**（静的）。バックエンドは **Firebase**（サーバー不要・無料枠）
3. 「＋新規スケジュール調整」ダイアログで打ち合わせを作成。所要時間は **15 / 30 / 60 / 120分**のボタン選択
4. **マスター設定**（既定の時間帯・タイムゾーン・通知先・カレンダー）を**ユーザーごと**に保存
5. ユーザー登録・ログインは **Google 認証**（Firebase Authentication）
6. 確定時に **メール**（ログインユーザーの Gmail 送信）と **Discord**（Webhook）へ通知
7. 作業ルールの正本は `AGENTS.md`（`d:\ShiraseLab\UchiwaTukool\AGENTS.md` の規律を踏襲）
8. 確定枠を **Google カレンダー**へ登録（参加者招待＋Google Meet 付与）

## セットアップ

初回のみ Firebase / Google OAuth の用意が必要です → **[docs/SETUP.md](docs/SETUP.md)**。
`config.example.js` を `config.js` にコピーして値を入れ、`python -m http.server 8000` で起動。

## 使い方

1. Google でログイン（初回にカレンダー/Gmail の同意）
2. 「マスター設定」で既定値（時間帯・TZ・Discord Webhook 等）を保存
3. 「＋新規スケジュール調整」で打ち合わせを作成 → 表示された URL を参加者へ共有
4. 各参加者がグリッドで希望を保存
5. 主催者が「おすすめ枠」から確定 → カレンダー登録・メール/Discord 通知が自動送信

## ドキュメント

- 仕様の正本: [docs/SPECIFICATION.md](docs/SPECIFICATION.md)
- コードの地図: [CodeMap.md](CodeMap.md)
- 作業ルール: [AGENTS.md](AGENTS.md)
- プライバシー: [docs/PRIVACY_POLICY.md](docs/PRIVACY_POLICY.md) / [利用規約](docs/TERMS_OF_USE.md)

## 技術構成

- フロント: 素の HTML/CSS/JavaScript（ES Modules、フレームワーク・ビルド無し）
- 認証: Firebase Authentication（Google）
- DB: Cloud Firestore（リアルタイム購読）
- 連携: Google Calendar API / Gmail API（GIS でトークン取得）/ Discord Webhook
