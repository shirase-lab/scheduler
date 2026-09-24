// meeting.js — 打ち合わせ画面。15分グリッドで希望入力／リアルタイム集計／確定と外部連携。 #ui #meeting #grid #availability #confirm
import { h, mount, toast } from '../lib/dom.js';
import { auth } from '../lib/firebase.js';
import {
  getMeeting,
  getMyAvailability,
  saveAvailability,
  watchAvailabilities,
  confirmMeeting,
  reopenMeeting,
  deleteMeeting,
  getOrCreateUser,
  defaultMaster,
} from '../lib/store.js';
import {
  dateRange,
  timeSlots,
  slotKey,
  parseSlotKey,
  dateLabel,
  rankBlocks,
  confirmedLabel,
  minToTime,
  timeToMin,
} from '../lib/time.js';
import { dispatchConfirmation } from '../lib/notify.js';

let unsubscribe = null;
let onWindowPointerUp = null;

// ドラッグ塗り状態はビュー内で1つだけ持つ（グリッド再描画のたびに増やさない）
const drag = { painting: false, paintVal: true };

export async function renderMeeting(root, id) {
  teardown();
  mount(root, h('div.loading', {}, '読み込み中…'));

  const meeting = await getMeeting(id);
  if (!meeting) return mount(root, h('div.card', {}, h('p', {}, '打ち合わせが見つかりません。')));

  const isOrganizer = meeting.organizerUid === auth.currentUser.uid;
  const days = dateRange(meeting.candidateStartDate, meeting.candidateEndDate);
  const times = timeSlots(meeting.dayStart, meeting.dayEnd);

  // 自分の可否（初期選択）
  const mine = await getMyAvailability(id);
  const selected = new Set(mine ? mine.slots : []);

  // 集計は全員の可否をリアルタイム購読
  let allRows = [];

  const gridWrap = h('div.grid-wrap');
  const summaryWrap = h('div.summary');
  const confirmWrap = h('div.confirm-area');

  function redrawSummary() {
    // slotKey -> voters[]
    const slotVoters = new Map();
    for (const r of allRows) {
      for (const s of r.slots || []) {
        if (!slotVoters.has(s)) slotVoters.set(s, []);
        slotVoters.get(s).push(r.displayName || r.email || '匿名');
      }
    }
    drawGrid(gridVoters(slotVoters));
    drawRanking(slotVoters, allRows.length);
  }

  // ---- グリッド描画（自分の入力＋人数ヒートマップの二層） ----
  function gridVoters(slotVoters) {
    return slotVoters;
  }

  function drawGrid(slotVoters) {
    const editable = meeting.status === 'collecting';
    const header = h('div.grid-row.grid-head', {}, h('div.time-cell', {}, ''),
      ...days.map((d) => h('div.day-cell', {}, dateLabel(d))));
    const rows = times.map((t) =>
      h(
        'div.grid-row',
        {},
        h('div.time-cell', {}, t),
        ...days.map((d) => {
          const key = slotKey(d, t);
          const voters = slotVoters.get(key) || [];
          const cell = h('div.slot', {
            dataset: { key },
            title: voters.length ? `${voters.length}人可: ${voters.join(', ')}` : '0人',
          });
          // ヒートマップ強度（0..1）
          const total = allRows.length || 1;
          const intensity = Math.min(voters.length / total, 1);
          if (voters.length) cell.style.setProperty('--heat', intensity.toFixed(2));
          cell.classList.toggle('heat', voters.length > 0);
          if (selected.has(key)) cell.classList.add('mine');
          if (voters.length) cell.append(h('span.count', {}, String(voters.length)));
          return cell;
        })
      )
    );
    const grid = h('div.grid', {}, header, ...rows);
    if (editable) attachDrag(grid);
    mount(gridWrap, grid);
  }

  // ---- ドラッグで塗り分け（可能/不可トグル） ----
  // window の pointerup リスナーはビューにつき1つだけ（teardown で解除）。
  function attachDrag(grid) {
    const apply = (cell) => {
      const key = cell.dataset.key;
      if (!key) return;
      if (drag.paintVal) selected.add(key);
      else selected.delete(key);
      cell.classList.toggle('mine', drag.paintVal);
    };
    const cellFrom = (target) => target.closest('.slot');
    grid.addEventListener('pointerdown', (e) => {
      const cell = cellFrom(e.target);
      if (!cell) return;
      drag.painting = true;
      drag.paintVal = !selected.has(cell.dataset.key);
      apply(cell);
      e.preventDefault();
    });
    grid.addEventListener('pointerover', (e) => {
      if (!drag.painting) return;
      const cell = cellFrom(e.target);
      if (cell) apply(cell);
    });
  }

  // ---- おすすめ枠ランキング＆確定 ----
  function drawRanking(slotVoters, totalParticipants) {
    const ranked = rankBlocks(days, times, slotVoters, meeting.durationMin, totalParticipants);
    if (meeting.status === 'confirmed' && meeting.confirmedStart) {
      const { date, time } = parseSlotKey(meeting.confirmedStart);
      mount(
        confirmWrap,
        h('div.card.confirmed-box', {},
          h('h3', {}, '✅ 確定済み'),
          h('p.big', {}, confirmedLabel(date, time, meeting.durationMin)),
          isOrganizer
            ? h('button.ghost', { onclick: async () => {
                await reopenMeeting(id); toast('収集を再開しました', 'success'); renderMeeting(root, id);
              } }, '確定を取り消して再収集')
            : null
        )
      );
      mount(summaryWrap, h('h3', {}, `参加者 ${totalParticipants}人`));
      return;
    }

    const top = ranked.slice(0, 8);
    const rows = top.length
      ? top.map((b) =>
          h('div.rank-row', {},
            h('span.rank-when', {}, `${dateLabel(b.date)} ${b.time}〜${minToTime(timeToMin(b.time) + meeting.durationMin)}`),
            h(`span.rank-count${b.full ? '.full' : ''}`, {}, `${b.count}/${totalParticipants}人`),
            isOrganizer
              ? h('button.small.primary', { onclick: () => doConfirm(b.date, b.time) }, 'ここで確定')
              : null
          )
        )
      : [h('p.muted', {}, 'まだ全員が可能な連続枠がありません。')];

    mount(summaryWrap,
      h('h3', {}, `おすすめ枠（参加 ${totalParticipants}人）`),
      h('div.ranking', {}, ...rows),
      !isOrganizer ? h('p.muted.small', {}, '確定は主催者が行います。') : null
    );
  }

  async function doConfirm(date, time) {
    if (!confirm(`${confirmedLabel(date, time, meeting.durationMin)} で確定し、カレンダー登録・通知を送ります。よろしいですか？`)) return;
    try {
      const endTime = minToTime(timeToMin(time) + meeting.durationMin);
      const confirmedStart = slotKey(date, time);
      const confirmedEnd = slotKey(date, endTime);
      await confirmMeeting(id, confirmedStart, confirmedEnd);

      const user = await getOrCreateUser(auth.currentUser);
      const master = { ...defaultMaster(), ...(user.master || {}) };
      const attendees = Array.from(new Set([
        ...(meeting.participantEmails || []),
        meeting.organizerEmail,
      ].filter(Boolean)));

      toast('確定しました。カレンダー登録・通知を送信中…', 'info');
      const res = await dispatchConfirmation(meeting, master, date, time, attendees);
      reportDispatch(res);
      renderMeeting(root, id);
    } catch (e) {
      toast('確定に失敗: ' + e.message, 'error');
    }
  }

  // ---- 保存ボタン（自分の可否） ----
  const saveBtn = h('button.primary', {
    onclick: async () => {
      try {
        saveBtn.disabled = true;
        await saveAvailability(id, [...selected]);
        toast('希望日時を保存しました', 'success');
      } catch (e) {
        toast('保存に失敗: ' + e.message, 'error');
      } finally {
        saveBtn.disabled = false;
      }
    },
  }, '希望を保存');

  const clearBtn = h('button.ghost', {
    onclick: () => { selected.clear(); redrawSummary(); },
  }, 'クリア');

  // ---- 主催者メニュー ----
  const organizerBar = isOrganizer
    ? h('div.organizer-bar', {},
        h('a.chip', { href: `#/m/${id}` }, '🔗 このURLを参加者へ共有'),
        h('button.ghost.danger', {
          onclick: async () => {
            if (!confirm('この打ち合わせを削除しますか？')) return;
            await deleteMeeting(id); toast('削除しました', 'success'); location.hash = '#/';
          },
        }, '削除')
      )
    : null;

  mount(root,
    h('div.meeting-head', {},
      h('h2', {}, meeting.title),
      h('p.muted', {}, `${meeting.durationMin}分 ・ ${meeting.candidateStartDate}〜${meeting.candidateEndDate} ・ ${meeting.dayStart}–${meeting.dayEnd}`),
      meeting.description ? h('p', {}, meeting.description) : null,
      organizerBar
    ),
    h('div.meeting-body', {},
      h('div.grid-col', {},
        meeting.status === 'collecting'
          ? h('p.hint', {}, '空いている枠をドラッグで選択 →「希望を保存」')
          : h('p.hint', {}, 'この打ち合わせは確定済みです。'),
        gridWrap,
        meeting.status === 'collecting' ? h('div.grid-actions', {}, saveBtn, clearBtn) : null
      ),
      h('div.side-col', {}, confirmWrap, summaryWrap)
    )
  );

  // ドラッグ終了は window で拾う（グリッド外で指を離しても止める）。ビューにつき1つ。
  onWindowPointerUp = () => { drag.painting = false; };
  window.addEventListener('pointerup', onWindowPointerUp);

  // リアルタイム購読開始
  unsubscribe = watchAvailabilities(id, (rows) => {
    allRows = rows;
    redrawSummary();
  });
}

function reportDispatch(res) {
  const parts = [];
  const line = (label, r) => {
    if (r === null) return;
    parts.push(`${label}: ${r.ok ? 'OK' : '失敗(' + r.error + ')'}`);
  };
  line('カレンダー', res.calendar);
  line('メール', res.email);
  line('Discord', res.discord);
  const anyFail = [res.calendar, res.email, res.discord].some((r) => r && !r.ok);
  toast(parts.join(' / ') || '通知なし', anyFail ? 'error' : 'success');
}

// 購読と window リスナーを解除（ルート遷移・再描画時に呼ぶ）
function teardown() {
  if (unsubscribe) { unsubscribe(); unsubscribe = null; }
  if (onWindowPointerUp) { window.removeEventListener('pointerup', onWindowPointerUp); onWindowPointerUp = null; }
  drag.painting = false;
}

export function cleanupMeeting() {
  teardown();
}
