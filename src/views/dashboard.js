// dashboard.js — 打ち合わせ一覧と「新規スケジュール調整」ダイアログ。 #ui #meeting #dashboard
import { h, mount, toast, openDialog } from '../lib/dom.js';
import { auth } from '../lib/firebase.js';
import {
  listMyMeetings,
  createMeeting,
  getOrCreateUser,
  defaultMaster,
} from '../lib/store.js';
import { DURATION_OPTIONS, toDateStr, confirmedLabel, parseSlotKey } from '../lib/time.js';

export async function renderDashboard(root) {
  mount(root, h('div.loading', {}, '読み込み中…'));
  const user = await getOrCreateUser(auth.currentUser);
  const master = { ...defaultMaster(), ...(user.master || {}) };

  const list = await listMyMeetings(auth.currentUser.uid);

  const newBtn = h('button.primary', { onclick: () => openNewMeetingDialog(master, () => renderDashboard(root)) }, '＋ 新規スケジュール調整');

  const items = list.length
    ? list.map((m) => meetingCard(m))
    : [h('p.muted', {}, 'まだ打ち合わせがありません。「新規スケジュール調整」から作成してください。')];

  mount(
    root,
    h('div.head-row', {}, h('h2', {}, '打ち合わせ'), newBtn),
    h('div.meeting-list', {}, ...items)
  );
}

function meetingCard(m) {
  const statusText =
    m.status === 'confirmed'
      ? '確定'
      : m.status === 'cancelled'
      ? '中止'
      : '希望収集中';
  const when =
    m.status === 'confirmed' && m.confirmedStart
      ? confirmedLabel(parseSlotKey(m.confirmedStart).date, parseSlotKey(m.confirmedStart).time, m.durationMin)
      : `${m.candidateStartDate} 〜 ${m.candidateEndDate}`;
  return h(
    'a.card.meeting',
    { href: `#/m/${m.id}` },
    h('div.meeting-top', {}, h('h3', {}, m.title), h(`span.badge.${m.status}`, {}, statusText)),
    h('p.muted', {}, `${m.durationMin}分 ・ ${when}`),
    m.description ? h('p.small', {}, m.description) : null
  );
}

/** 新規作成ダイアログ。所要時間は 15/30/60/120 のボタン選択。 */
function openNewMeetingDialog(master, onCreated) {
  openDialog('新規スケジュール調整', (close) => {
    const state = { duration: 60 };

    const title = h('input', { type: 'text', placeholder: '例: 定例ミーティング', required: true });
    const desc = h('textarea', { rows: '2', placeholder: '議題やメモ（任意）' });

    const durationBtns = DURATION_OPTIONS.map((d) =>
      h(
        `button.chip${d === state.duration ? '.on' : ''}`,
        {
          type: 'button',
          onclick: (e) => {
            state.duration = d;
            durRow.querySelectorAll('button').forEach((b) => b.classList.remove('on'));
            e.target.classList.add('on');
          },
        },
        `${d}分`
      )
    );
    const durRow = h('div.chips', {}, ...durationBtns);

    const today = toDateStr(new Date());
    const start = h('input', { type: 'date', value: today });
    const end = h('input', { type: 'date', value: today });
    const dayStart = h('input', { type: 'time', step: '900', value: master.dayStart });
    const dayEnd = h('input', { type: 'time', step: '900', value: master.dayEnd });
    const emails = h('textarea', { rows: '2', placeholder: '参加者メール（カンマまたは改行区切り）' });

    const notifyEmail = h('input', { type: 'checkbox', ...(master.notifyEmail ? { checked: true } : {}) });
    const notifyDiscord = h('input', { type: 'checkbox', ...(master.notifyDiscord ? { checked: true } : {}) });

    const submit = h(
      'button.primary',
      {
        onclick: async () => {
          if (!title.value.trim()) return toast('タイトルを入力してください', 'error');
          if (end.value < start.value) return toast('終了日は開始日以降にしてください', 'error');
          if (dayEnd.value <= dayStart.value) return toast('時間帯の終了は開始より後にしてください', 'error');
          const participantEmails = emails.value
            .split(/[,\n、]+/)
            .map((s) => s.trim())
            .filter(Boolean);
          try {
            submit.disabled = true;
            const id = await createMeeting({
              title: title.value.trim(),
              description: desc.value.trim(),
              durationMin: state.duration,
              candidateStartDate: start.value,
              candidateEndDate: end.value,
              dayStart: dayStart.value,
              dayEnd: dayEnd.value,
              participantEmails,
              notify: { email: notifyEmail.checked, discord: notifyDiscord.checked },
            });
            close();
            toast('作成しました', 'success');
            location.hash = `#/m/${id}`;
            onCreated && onCreated();
          } catch (e) {
            submit.disabled = false;
            toast('作成に失敗: ' + e.message, 'error');
          }
        },
      },
      '作成'
    );

    const field = (label, input) => h('label.field', {}, h('span', {}, label), input);
    return h(
      'div.form',
      {},
      field('タイトル', title),
      field('内容', desc),
      h('label.field', {}, h('span', {}, '所要時間'), durRow),
      h('div.row2', {}, field('候補開始日', start), field('候補終了日', end)),
      h('div.row2', {}, field('時間帯 開始', dayStart), field('時間帯 終了', dayEnd)),
      field('参加者メール', emails),
      h('label.check', {}, notifyEmail, ' 確定時にメール通知'),
      h('label.check', {}, notifyDiscord, ' 確定時に Discord 通知'),
      h('div.dialog-actions', {}, submit)
    );
  });
}
