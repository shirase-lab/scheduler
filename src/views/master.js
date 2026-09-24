// master.js — ユーザーごとの「マスター設定」（デフォルト）を編集する画面。 #ui #master
import { h, mount, toast } from '../lib/dom.js';
import { auth } from '../lib/firebase.js';
import { getOrCreateUser, saveMaster, defaultMaster } from '../lib/store.js';
import { isDiscordWebhook } from '../lib/discord.js';

export async function renderMaster(root) {
  mount(root, h('div.loading', {}, '読み込み中…'));
  const user = await getOrCreateUser(auth.currentUser);
  const m = { ...defaultMaster(), ...(user.master || {}) };

  const f = {};
  const field = (label, input, hint) =>
    h('label.field', {}, h('span', {}, label), input, hint ? h('span.hint', {}, hint) : null);

  f.timezone = h('input', { type: 'text', value: m.timezone });
  f.dayStart = h('input', { type: 'time', step: '900', value: m.dayStart });
  f.dayEnd = h('input', { type: 'time', step: '900', value: m.dayEnd });
  f.calendarId = h('input', { type: 'text', value: m.calendarId });
  f.createMeet = h('input', { type: 'checkbox', ...(m.createMeet ? { checked: true } : {}) });
  f.notifyEmail = h('input', { type: 'checkbox', ...(m.notifyEmail ? { checked: true } : {}) });
  f.notifyDiscord = h('input', { type: 'checkbox', ...(m.notifyDiscord ? { checked: true } : {}) });
  f.discordWebhook = h('input', { type: 'url', value: m.discordWebhook, placeholder: 'https://discord.com/api/webhooks/...' });

  const save = h(
    'button.primary',
    {
      onclick: async () => {
        const next = {
          timezone: f.timezone.value.trim() || 'Asia/Tokyo',
          dayStart: f.dayStart.value || '09:00',
          dayEnd: f.dayEnd.value || '18:00',
          calendarId: f.calendarId.value.trim() || 'primary',
          createMeet: f.createMeet.checked,
          notifyEmail: f.notifyEmail.checked,
          notifyDiscord: f.notifyDiscord.checked,
          discordWebhook: f.discordWebhook.value.trim(),
        };
        if (next.dayEnd <= next.dayStart) return toast('終了は開始より後にしてください', 'error');
        if (next.notifyDiscord && !isDiscordWebhook(next.discordWebhook))
          return toast('Discord Webhook URL の形式が正しくありません', 'error');
        try {
          await saveMaster(auth.currentUser.uid, next);
          toast('マスター設定を保存しました', 'success');
        } catch (e) {
          toast('保存に失敗: ' + e.message, 'error');
        }
      },
    },
    '保存'
  );

  mount(
    root,
    h(
      'div.card.form',
      {},
      h('h2', {}, 'マスター設定（あなたの既定値）'),
      h('p.muted', {}, '新規の打ち合わせ作成時にここの値が初期値として使われます。'),
      field('タイムゾーン', f.timezone, '例: Asia/Tokyo'),
      h('div.row2', {}, field('既定の開始', f.dayStart), field('既定の終了', f.dayEnd)),
      field('カレンダーID', f.calendarId, 'primary か、書き込むカレンダーのID'),
      h('label.check', {}, f.createMeet, ' 確定時に Google Meet リンクを付ける'),
      h('hr'),
      h('h3', {}, '通知の既定'),
      h('label.check', {}, f.notifyEmail, ' メール通知（あなたの Gmail から送信）'),
      h('label.check', {}, f.notifyDiscord, ' Discord 通知'),
      field('Discord Webhook URL', f.discordWebhook),
      save
    )
  );
}
