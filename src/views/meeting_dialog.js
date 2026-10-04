// meeting_dialog.js — 打ち合わせの「新規作成／編集」共通ダイアログ。 #ui #meeting
// dashboard(新規) と meeting(編集) の両方がここを通す（フォーム重複を作らない・§13）。
import { h, toast, openDialog } from '../lib/dom.js';
import { auth } from '../lib/firebase.js';
import { createMeeting, updateMeeting, addEmailsToHistory } from '../lib/store.js';
import { DURATION_OPTIONS, toDateStr } from '../lib/time.js';

const EMAIL_DL_ID = 'email-history-list';

/**
 * 参加者メールを「1人1行」で編集する部品。
 * ＋/− ボタン、Enter で次行追加、空欄で Backspace/Delete すると行削除。
 * @returns {{el:HTMLElement, getValues:()=>string[]}}
 */
function makeEmailList(initial) {
  const list = h('div.email-list');

  const addRowAfter = (row) => {
    const nr = mkRow('');
    if (row && row.nextSibling) list.insertBefore(nr, row.nextSibling);
    else list.append(nr);
    nr._input.focus();
  };
  const removeRow = (row, dir) => {
    const rows = [...list.querySelectorAll('.email-row')];
    if (rows.length <= 1) { row._input.value = ''; row._input.focus(); return; } // 最後の1行は残す
    const idx = rows.indexOf(row);
    row.remove();
    const rest = [...list.querySelectorAll('.email-row')];
    const target = dir === 'next' ? rest[Math.min(idx, rest.length - 1)] : rest[Math.max(0, idx - 1)];
    if (target) target._input.focus();
  };
  function mkRow(value) {
    // list= で datalist（過去に使ったメールの履歴）を候補表示
    const input = h('input', { type: 'email', placeholder: 'name@example.com', value: value || '', list: EMAIL_DL_ID });
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        addRowAfter(row);
      } else if ((e.key === 'Backspace' || e.key === 'Delete') && input.value === '') {
        e.preventDefault();
        removeRow(row, e.key === 'Delete' ? 'next' : 'prev');
      }
    });
    const row = h('div.email-row', {}, input,
      h('button.email-del', { type: 'button', title: '削除', onclick: () => removeRow(row, 'prev') }, '−'));
    row._input = input;
    return row;
  }

  (initial && initial.length ? initial : ['']).forEach((v) => list.append(mkRow(v)));
  const addBtn = h('button.email-add', { type: 'button', onclick: () => addRowAfter(list.lastChild) }, '＋ 参加者を追加');

  return {
    el: h('div', {}, list, addBtn),
    getValues: () => [...new Set([...list.querySelectorAll('input')].map((i) => i.value.trim()).filter(Boolean))],
  };
}

/**
 * @param {object} opts
 *   - master: マスター設定（新規時の既定値）
 *   - meeting?: 既存打ち合わせ（渡すと編集モード。id 必須）
 *   - prefillDate?: 新規時の候補開始日
 *   - onDone?: 保存後コールバック
 */
export function openMeetingDialog(opts = {}) {
  const { master = {}, meeting = null, prefillDate, onDone, history = [] } = opts;
  const isEdit = !!meeting;
  const emailDatalist = h('datalist', { id: EMAIL_DL_ID }, ...history.map((e) => h('option', { value: e })));

  openDialog(isEdit ? '打ち合わせを編集' : '新規スケジュール調整', (close) => {
    const state = { duration: isEdit ? meeting.durationMin : 60 };

    const title = h('input', { type: 'text', placeholder: '例: 定例ミーティング', value: isEdit ? meeting.title : '' });
    // textarea は value 属性では中身が入らないので子テキストで初期化
    const desc = h('textarea', { rows: '2', placeholder: '議題やメモ（任意）' }, isEdit ? meeting.description || '' : '');

    const durationBtns = DURATION_OPTIONS.map((d) =>
      h(`button.chip${d === state.duration ? '.on' : ''}`, {
        type: 'button',
        onclick: (e) => {
          state.duration = d;
          durRow.querySelectorAll('button').forEach((b) => b.classList.remove('on'));
          e.target.classList.add('on');
        },
      }, `${d}分`)
    );
    const durRow = h('div.chips', {}, ...durationBtns);

    const initStart = isEdit ? meeting.candidateStartDate : prefillDate || toDateStr(new Date());
    const initEnd = isEdit ? meeting.candidateEndDate : prefillDate || toDateStr(new Date());
    const start = h('input', { type: 'date', value: initStart });
    const end = h('input', { type: 'date', value: initEnd });
    const dayStart = h('input', { type: 'time', step: '900', value: isEdit ? meeting.dayStart : master.dayStart });
    const dayEnd = h('input', { type: 'time', step: '900', value: isEdit ? meeting.dayEnd : master.dayEnd });

    const chk = (on) => h('input', { type: 'checkbox', ...(on ? { checked: true } : {}) });
    const excludeSat = chk(isEdit ? meeting.excludeSat : false);
    const excludeSun = chk(isEdit ? meeting.excludeSun : false);
    const excludeHoliday = chk(isEdit ? meeting.excludeHoliday : false);
    const excludeRow = h('div.chips', {},
      h('label.check', {}, excludeSat, ' 土を除く'),
      h('label.check', {}, excludeSun, ' 日を除く'),
      h('label.check', {}, excludeHoliday, ' 祝を除く')
    );

    const emailCtl = makeEmailList(isEdit ? meeting.participantEmails || [] : []);

    const notifyEmail = chk(isEdit ? !!(meeting.notify && meeting.notify.email) : master.notifyEmail);
    const notifyDiscord = chk(isEdit ? !!(meeting.notify && meeting.notify.discord) : master.notifyDiscord);

    const submit = h('button.primary', {
      onclick: async () => {
        if (!title.value.trim()) return toast('タイトルを入力してください', 'error');
        if (end.value < start.value) return toast('終了日は開始日以降にしてください', 'error');
        if (dayEnd.value <= dayStart.value) return toast('時間帯の終了は開始より後にしてください', 'error');
        const participantEmails = emailCtl.getValues();
        const payload = {
          title: title.value.trim(),
          description: desc.value.trim(),
          durationMin: state.duration,
          candidateStartDate: start.value,
          candidateEndDate: end.value,
          dayStart: dayStart.value,
          dayEnd: dayEnd.value,
          excludeSat: excludeSat.checked,
          excludeSun: excludeSun.checked,
          excludeHoliday: excludeHoliday.checked,
          participantEmails,
          notify: { email: notifyEmail.checked, discord: notifyDiscord.checked },
        };
        try {
          submit.disabled = true;
          if (isEdit) {
            await updateMeeting(meeting.id, payload);
            close();
            toast('保存しました', 'success');
            onDone && onDone();
          } else {
            const id = await createMeeting(payload);
            close();
            toast('作成しました', 'success');
            location.hash = `#/m/${id}`;
            onDone && onDone();
            // 招待は打ち合わせ画面の「📨 招待を送る」(mailto) で行う（作成時の自動送信はしない）。
          }
          // 使ったメールを履歴へ（次回の候補用・失敗しても致命でない）
          addEmailsToHistory(auth.currentUser.uid, participantEmails).catch(() => {});
        } catch (e) {
          submit.disabled = false;
          toast((isEdit ? '保存' : '作成') + 'に失敗: ' + e.message, 'error');
        }
      },
    }, isEdit ? '保存' : '作成');

    const field = (label, input) => h('label.field', {}, h('span', {}, label), input);
    return h('div.form', {},
      field('タイトル', title),
      field('内容', desc),
      h('label.field', {}, h('span', {}, '所要時間'), durRow),
      h('div.row2', {}, field('候補開始日', start), field('候補終了日', end)),
      h('div.row2', {}, field('時間帯 開始', dayStart), field('時間帯 終了', dayEnd)),
      h('label.field', {}, h('span', {}, '除外する曜日・祝日'), excludeRow),
      h('label.field', {}, h('span', {}, '参加者メール（1人1行・Enterで追加）'), emailCtl.el, emailDatalist),
      h('label.check', {}, notifyEmail, ' 確定時にメール通知'),
      h('label.check', {}, notifyDiscord, ' 確定時に Discord 通知'),
      h('div.dialog-actions', {}, submit)
    );
  });
}
