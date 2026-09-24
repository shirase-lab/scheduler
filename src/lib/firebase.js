// firebase.js — Firebase 初期化。Auth(Google) と Firestore を公開する。 #firebase #auth #db
// 設定は index.html が読み込む config.js の window.SCHEDULER_CONFIG.firebase から取る（ビルド無し）。
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js';
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signOut,
  onAuthStateChanged,
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';
import { getFirestore } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';

const cfg = window.SCHEDULER_CONFIG;
if (!cfg || !cfg.firebase || !cfg.firebase.apiKey) {
  throw new Error('config.js が未設定です。config.example.js をコピーして値を入れてください（docs/SETUP.md 参照）。');
}

export const app = initializeApp(cfg.firebase);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const CONFIG = cfg;

const provider = new GoogleAuthProvider();

/** Google ログイン（ポップアップ）。Firestore 用のID確立に使う。API アクセストークンは google.js の GIS 側で別途取得。 */
export function loginWithGoogle() {
  return signInWithPopup(auth, provider);
}

export function logout() {
  return signOut(auth);
}

export { onAuthStateChanged };
