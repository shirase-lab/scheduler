// config.example.js — これを config.js にコピーして値を埋める（config.js は gitignore 済み）。
// 取得手順は docs/SETUP.md を参照。
window.SCHEDULER_CONFIG = {
  // Firebase コンソール → プロジェクト設定 → マイアプリ(Web) の firebaseConfig
  firebase: {
    apiKey: 'YOUR_FIREBASE_API_KEY',
    authDomain: 'YOUR_PROJECT.firebaseapp.com',
    projectId: 'YOUR_PROJECT_ID',
    storageBucket: 'YOUR_PROJECT.appspot.com',
    messagingSenderId: 'YOUR_SENDER_ID',
    appId: 'YOUR_APP_ID',
  },
  // Google Cloud → 認証情報 → OAuth 2.0 クライアントID（ウェブ アプリケーション）
  // ※ Firebase と同じ GCP プロジェクトのもの。承認済み JavaScript 生成元に公開URLを登録すること。
  googleClientId: 'YOUR_OAUTH_CLIENT_ID.apps.googleusercontent.com',
  // カレンダー書き込みスコープ。メールは mailto（メーラー起動）で送るため Gmail スコープは不要。
  googleScopes: 'https://www.googleapis.com/auth/calendar.events',
};
