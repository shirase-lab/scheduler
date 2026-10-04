// dashboard.js — ホーム画面。月間カレンダー＋打ち合わせ一覧＋新規作成（共通ダイアログ）。 #ui #meeting #dashboard #calendar
import { h, mount } from '../lib/dom.js';
import { auth } from '../lib/firebase.js';
import { listMyMeetings, getOrCreateUser, defaultMaster } from '../lib/store.js';
import { confirmedLabel, parseSlotKey, monthMatrix, WEEKDAY_JA, todayStr } from '../lib/time.js';
import { openMeetingDialog } from './meeting_dialog.js';

export async function renderDashboard(root) {
  mount(root, h('div.loading', {}, '読み込み中…'));
  const user = await getOrCreateUser(auth.currentUser);
  const master = { ...defaultMaster(), ...(user.master || {}) };
  const list = await listMyMeetings(auth.currentUser.uid, auth.currentUser.email);
  const refresh = () => renderDashboard(root);

  // 日付 → その日に置く打ち合わせ（確定は確定日、調整中は候補開始日）
  const byDate = new Map();
  for (const m of list) {
    const d =
      m.status === 'confirmed' && m.confirmedStart
        ? parseSlotKey(m.confirmedStart).date
        : m.candidateStartDate;
    if (!byDate.has(d)) byDate.set(d, []);
    byDate.get(d).push(m);
  }

  const today = new Date();
  let year = today.getFullYear();
  let month0 = today.getMonth();

  const calWrap = h('div');

  function drawCalendar() {
    const weeks = monthMatrix(year, month0);
    const todayS = todayStr();

    const head = h('div.cal-head', {},
      h('button.icon', { onclick: () => { month0--; if (month0 < 0) { month0 = 11; year--; } drawCalendar(); } }, '‹'),
      h('span.cal-title', {}, `${year}年 ${month0 + 1}月`),
      h('button.icon', { onclick: () => { month0++; if (month0 > 11) { month0 = 0; year++; } drawCalendar(); } }, '›'),
      h('button.small.ghost', { onclick: () => { year = today.getFullYear(); month0 = today.getMonth(); drawCalendar(); } }, '今日')
    );

    const weekday = h('div.cal-grid.cal-weekday', {},
      ...WEEKDAY_JA.map((w, i) => h(`div.cal-wd${i === 0 ? '.sun' : i === 6 ? '.sat' : ''}`, {}, w)));

    const rows = weeks.map((week) =>
      h('div.cal-grid', {},
        ...week.map((cell) => {
          const meetings = byDate.get(cell.dateStr) || [];
          const dow = new Date(`${cell.dateStr}T00:00:00`).getDay();
          const dayCls =
            'cal-day' +
            (cell.inMonth ? '' : '.other-month') +
            (cell.dateStr === todayS ? '.today' : '');
          const chips = meetings.map((m) =>
            h(`a.cal-chip.${m.status}`, {
              href: `#/m/${m.id}`,
              title: m.title,
              onclick: (e) => e.stopPropagation(),
            }, m.title)
          );
          return h(dayCls, {
            onclick: () => openMeetingDialog({ master, prefillDate: cell.dateStr, onDone: refresh, history: user.emailHistory || [] }),
          },
            h(`span.daynum${dow === 0 ? '.sun' : dow === 6 ? '.sat' : ''}`, {}, String(cell.day)),
            ...chips
          );
        })
      )
    );

    mount(calWrap, h('div.card.calendar', {}, head, weekday, ...rows));
  }
  drawCalendar();

  // 下部の一覧
  const items = list.length
    ? list.map((m) => meetingCard(m))
    : [h('p.muted', {}, 'まだ打ち合わせがありません。「新規スケジュール調整」から作成してください。')];

  const newBtn = h('button.primary', { onclick: () => openMeetingDialog({ master, onDone: refresh, history: user.emailHistory || [] }) }, '＋ 新規スケジュール調整');

  mount(root,
    h('div.head-row', {}, h('h2', {}, 'ホーム'), newBtn),
    calWrap,
    h('h3.list-title', {}, '打ち合わせ一覧'),
    h('div.meeting-list', {}, ...items)
  );
}

function meetingCard(m) {
  const statusText =
    m.status === 'confirmed' ? '確定' : m.status === 'cancelled' ? '中止' : '希望収集中';
  const when =
    m.status === 'confirmed' && m.confirmedStart
      ? confirmedLabel(parseSlotKey(m.confirmedStart).date, parseSlotKey(m.confirmedStart).time, m.durationMin)
      : `${m.candidateStartDate} 〜 ${m.candidateEndDate}`;
  return h('a.card.meeting', { href: `#/m/${m.id}` },
    h('div.meeting-top', {}, h('h3', {}, m.title), h(`span.badge.${m.status}`, {}, statusText)),
    h('p.muted', {}, `${m.durationMin}分 ・ ${when}`),
    m.description ? h('p.small', {}, m.description) : null
  );
}
