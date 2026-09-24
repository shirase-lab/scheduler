// login.js — 未ログイン時の画面。 #ui #auth
import { h, mount } from '../lib/dom.js';
import { loginWithGoogle } from '../lib/firebase.js';
import { toast } from '../lib/dom.js';

export function renderLogin(root) {
  const btn = h(
    'button.primary.big',
    {
      onclick: async () => {
        try {
          await loginWithGoogle();
          // onAuthStateChanged が拾って画面遷移する
        } catch (e) {
          toast('ログインに失敗しました: ' + e.message, 'error');
        }
      },
    },
    'Google でログイン'
  );
  mount(
    root,
    h(
      'div.login',
      {},
      h('h1', {}, '📅 ShiraseLab Scheduler'),
      h('p.muted', {}, '複数人の希望日時を15分単位で集めて、打ち合わせ日程を確定します。'),
      btn,
      h('p.muted.small', {}, 'ログインすると Google カレンダー連携・メール送信のためのアクセスを求められます。')
    )
  );
}
