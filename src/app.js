// app.js — エントリ。認証状態の監視・ヘッダ・ハッシュルーティング。 #app #router #auth
import { auth, onAuthStateChanged, logout } from './lib/firebase.js';
import { h, mount, toast } from './lib/dom.js';
import { renderLogin } from './views/login.js';
import { renderDashboard } from './views/dashboard.js';
import { renderMaster } from './views/master.js';
import { renderMeeting, cleanupMeeting } from './views/meeting.js';

const app = document.getElementById('app');
let currentUser = null;

function header() {
  return h('header.appbar', {},
    h('a.brand', { href: '#/' }, '📅 Scheduler'),
    currentUser
      ? h('nav', {},
          h('a', { href: '#/' }, '一覧'),
          h('a', { href: '#/master' }, 'マスター設定'),
          h('span.user', {}, currentUser.displayName || currentUser.email),
          h('button.ghost.small', { onclick: () => logout() }, 'ログアウト')
        )
      : null
  );
}

function shell(view) {
  mount(app, header(), h('main.container', {}, view));
}

async function route() {
  cleanupMeeting();
  if (!currentUser) {
    const box = h('div');
    shell(box);
    renderLogin(box);
    return;
  }
  const hash = location.hash || '#/';
  const box = h('div');
  shell(box);

  try {
    const meetingMatch = hash.match(/^#\/m\/(.+)$/);
    if (meetingMatch) {
      await renderMeeting(box, meetingMatch[1]);
    } else if (hash === '#/master') {
      await renderMaster(box);
    } else {
      await renderDashboard(box);
    }
  } catch (e) {
    console.error(e);
    mount(box, h('div.card', {}, h('p', {}, 'エラー: ' + e.message)));
    toast('エラー: ' + e.message, 'error');
  }
}

window.addEventListener('hashchange', route);

onAuthStateChanged(auth, (user) => {
  currentUser = user;
  route();
});
