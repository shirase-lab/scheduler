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
  filterDays,
  slotsForDuration,
  STEP_MIN,
} from '../lib/time.js';
import { loadHolidays } from '../lib/holidays.js';
import { dispatchConfirmation } from '../lib/notify.js';
import { openCompose, reserveTab, fillTab } from '../lib/mailto.js';
import { sendDiscord } from '../lib/discord.js';
import { openMeetingDialog } from './meeting_dialog.js';

let unsubscribe = null;
let onWindowPointerUp = null;

// 矩形ドラッグ選択の状態はビュー内で1つだけ持つ（グリッド再描画のたびに増やさない）
const drag = { painting: false, paintVal: true, startR: 0, startC: 0, lastR: -1, lastC: -1, base: null };

/**
 * rankBlocks の結果を「同日・同人数・同じ顔ぶれで連続する開始時刻」ごとに1件へまとめる。
 * 15分刻みの近接候補が大量に並ぶノイズを畳む。返りは人数降順。
 */
function groupRanked(ranked) {
  const byTime = [...ranked].sort(
    (a, b) => a.date.localeCompare(b.date) || timeToMin(a.time) - timeToMin(b.time)
  );
  const groups = [];
  for (const b of byTime) {
    const sig = b.voters.slice().sort().join('|');
    const last = groups[groups.length - 1];
    if (last && last.date === b.date && last.count === b.count && last.sig === sig &&
        timeToMin(b.time) === timeToMin(last.lastTime) + STEP_MIN) {
      last.lastTime = b.time; // 連続する開始をまとめる
    } else {
      groups.push({ date: b.date, time: b.time, lastTime: b.time, count: b.count, full: b.full, sig });
    }
  }
  groups.sort(
    (a, b) => b.count - a.count || a.date.localeCompare(b.date) || timeToMin(a.time) - timeToMin(b.time)
  );
  return groups;
}

export async function renderMeeting(root, id) {
  teardown();
  mount(root, h('div.loading', {}, '読み込み中…'));

  const meeting = await getMeeting(id);
  if (!meeting) return mount(root, h('div.card', {}, h('p', {}, '打ち合わせが見つかりません。')));

  const isOrganizer = meeting.organizerUid === auth.currentUser.uid;
  // 候補日から 土/日/祝 を除外（作成時の設定）。祝日はチェック時のみ取得。
  const holidayMap = meeting.excludeHoliday ? await loadHolidays() : {};
  const days = filterDays(
    dateRange(meeting.candidateStartDate, meeting.candidateEndDate),
    { excludeSat: meeting.excludeSat, excludeSun: meeting.excludeSun, excludeHoliday: meeting.excludeHoliday },
    holidayMap
  );
  const times = timeSlots(meeting.dayStart, meeting.dayEnd);
  // 1マス選択＝所要時間ぶん自動で塗る。need=所要時間に必要な15分スロット数、maxStart=最後に選べる開始行。
  const need = slotsForDuration(meeting.durationMin);
  const maxStart = times.length - need;

  // 確定枠が占めるスロット（確定後に「埋」として色分け。候補＝availability は消さない）
  const bookedKeys = new Set();
  if (meeting.status === 'confirmed' && meeting.confirmedStart) {
    const cs = parseSlotKey(meeting.confirmedStart);
    const si = times.indexOf(cs.time);
    if (si >= 0) for (let k = 0; k < need; k++) { const tt = times[si + k]; if (tt) bookedKeys.add(slotKey(cs.date, tt)); }
  }

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
    if (!drag.painting) drawGrid(gridVoters(slotVoters)); // ドラッグ中は再描画で選択を壊さない
    drawRanking(slotVoters, allRows.length);
  }

  // ---- グリッド描画（自分の入力＋人数ヒートマップの二層） ----
  function gridVoters(slotVoters) {
    return slotVoters;
  }

  // 選択領域の「外周の辺だけ」を枠線として描く（隣が未選択の辺にだけ inline box-shadow）。
  function paintOutline(grid) {
    const sel = new Set();
    grid.querySelectorAll('.slot').forEach((cell) => {
      if (selected.has(cell.dataset.key)) sel.add(cell.dataset.r + ',' + cell.dataset.c);
    });
    grid.querySelectorAll('.slot').forEach((cell) => {
      const r = +cell.dataset.r, c = +cell.dataset.c;
      const on = sel.has(r + ',' + c);
      cell.classList.toggle('mine', on);
      if (!on) { cell.style.boxShadow = ''; return; }
      const edges = [];
      if (!sel.has(r - 1 + ',' + c)) edges.push('inset 0 2px 0 0 var(--mine)');   // 上
      if (!sel.has(r + 1 + ',' + c)) edges.push('inset 0 -2px 0 0 var(--mine)');  // 下
      if (!sel.has(r + ',' + (c - 1))) edges.push('inset 2px 0 0 0 var(--mine)'); // 左
      if (!sel.has(r + ',' + (c + 1))) edges.push('inset -2px 0 0 0 var(--mine)');// 右
      cell.style.boxShadow = edges.join(', ');
    });
  }

  function drawGrid(slotVoters) {
    const editable = meeting.status === 'collecting';
    const header = h('div.grid-row.grid-head', {}, h('div.time-cell', {}, ''),
      ...days.map((d) => h('div.day-cell', {}, dateLabel(d))));
    const rows = times.map((t, ti) =>
      h(
        'div.grid-row',
        {},
        h('div.time-cell', {}, t),
        ...days.map((d, di) => {
          const key = slotKey(d, t);
          const voters = slotVoters.get(key) || [];
          const cell = h('div.slot', {
            dataset: { key, r: ti, c: di },
            title: voters.length ? `${voters.length}人可: ${voters.join(', ')}` : '0人',
          });
          // ヒートマップ強度（0..1）
          const total = allRows.length || 1;
          const intensity = Math.min(voters.length / total, 1);
          if (voters.length) cell.style.setProperty('--heat', intensity.toFixed(2));
          cell.classList.toggle('heat', voters.length > 0);
          if (bookedKeys.has(key)) cell.classList.add('booked'); // 確定枠＝埋
          if (voters.length) cell.append(h('span.count', {}, String(voters.length)));
          return cell;
        })
      )
    );
    const grid = h('div.grid', {}, header, ...rows);
    if (editable) attachDrag(grid);
    paintOutline(grid); // 保存済み選択の外周枠を描く
    mount(gridWrap, grid);
  }

  // ---- 矩形（ドラッグで四角）選択 ----
  // 始点セルで塗り/消しを決め、ドラッグ中は「始点〜現在セル」の矩形を base に対して適用してプレビュー。
  // window の pointerup リスナーはビューにつき1つだけ（teardown で解除）。
  function attachDrag(grid) {
    const applyRect = (r1, c1) => {
      if (maxStart < 0) return; // 時間帯が所要時間より短い＝選べない
      // 開始行は maxStart までにクランプ（所要時間が収まらない開始は最後の有効開始へスナップ）
      const sMin = Math.max(0, Math.min(drag.startR, r1, maxStart));
      const sMax = Math.min(Math.max(drag.startR, r1), maxStart);
      const cMin = Math.min(drag.startC, c1), cMax = Math.max(drag.startC, c1);
      // 最終開始の所要時間ぶんの裾まで塗る
      const fillMax = Math.min(sMax + need - 1, times.length - 1);
      selected.clear();
      drag.base.forEach((k) => selected.add(k));
      grid.querySelectorAll('.slot').forEach((cell) => {
        const r = +cell.dataset.r, c = +cell.dataset.c;
        if (r >= sMin && r <= fillMax && c >= cMin && c <= cMax) {
          if (drag.paintVal) selected.add(cell.dataset.key);
          else selected.delete(cell.dataset.key);
        }
      });
      paintOutline(grid); // 選択が変わるたび外周枠を再描画
    };
    // 座標から現在セルを引く（pointerover はポインタキャプチャで別セルへ飛ばないことがあるため elementFromPoint を使う）
    const cellAt = (x, y) => {
      const el = document.elementFromPoint(x, y);
      return el && el.closest ? el.closest('.slot') : null;
    };
    grid.addEventListener('pointerdown', (e) => {
      const cell = e.target.closest && e.target.closest('.slot');
      if (!cell) return;
      drag.painting = true;
      drag.paintVal = !selected.has(cell.dataset.key); // 始点が未選択なら「塗る」、選択済みなら「消す」
      drag.startR = +cell.dataset.r;
      drag.startC = +cell.dataset.c;
      drag.lastR = drag.startR;
      drag.lastC = drag.startC;
      drag.base = new Set(selected);
      // タッチの暗黙ポインタキャプチャを解放し、ドラッグ中に他セルを拾えるようにする
      if (cell.hasPointerCapture && cell.hasPointerCapture(e.pointerId)) {
        cell.releasePointerCapture(e.pointerId);
      }
      applyRect(drag.startR, drag.startC);
      e.preventDefault();
    });
    grid.addEventListener('pointermove', (e) => {
      if (!drag.painting) return;
      const cell = cellAt(e.clientX, e.clientY);
      if (!cell || cell.dataset.r === undefined) return;
      const r = +cell.dataset.r, c = +cell.dataset.c;
      if (r === drag.lastR && c === drag.lastC) return;
      drag.lastR = r;
      drag.lastC = c;
      applyRect(r, c);
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

    // 同じ人数・同じ顔ぶれで連続する開始時刻は1件にまとめてノイズを減らす
    const groups = groupRanked(ranked);
    const top = groups.slice(0, 10);
    const rows = top.length
      ? top.map((g) => {
          const end = minToTime(timeToMin(g.time) + meeting.durationMin);
          const flex = g.lastTime !== g.time ? `（〜${g.lastTime}開始まで可）` : '';
          return h('div.rank-row', {},
            h('span.rank-when', {},
              `${dateLabel(g.date)} ${g.time}〜${end}`,
              flex ? h('span.rank-flex', {}, flex) : null),
            h(`span.rank-count${g.full ? '.full' : ''}`, {}, `${g.count}/${totalParticipants}人`),
            isOrganizer
              ? h('button.small.primary', { onclick: () => doConfirm(g.date, g.time) }, 'ここで確定')
              : null
          );
        })
      : [h('p.muted', {}, 'まだ参加できる枠がありません。参加者に希望を入力してもらってください。')];

    mount(summaryWrap,
      h('h3', {}, `おすすめ枠（参加 ${totalParticipants}人）`),
      h('p.muted.small', {}, '参加できる人が多い順の候補です。同じ人数で連続する開始時刻はまとめています（「〜◯◯開始まで可」）。' +
        (isOrganizer ? '「ここで確定」で日時を決定し、カレンダー登録・通知を送ります。' : '確定は主催者が行います。')),
      h('div.ranking', {}, ...rows)
    );
  }

  async function doConfirm(date, time) {
    if (!confirm(`${confirmedLabel(date, time, meeting.durationMin)} で確定し、カレンダー登録・メール作成を行います。よろしいですか？`)) return;
    // クリック直後にメール作成タブを確保（await 後のポップアップブロック回避）
    const mailTab = reserveTab();
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

      toast('確定しました。カレンダー登録中…', 'info');
      const res = await dispatchConfirmation(meeting, master, date, time, attendees);
      // 確定メールは Gmail 作成画面を開く（確保済みタブに流し込む）
      const when = confirmedLabel(date, time, meeting.durationMin);
      const body = [
        `打ち合わせ「${meeting.title}」の日程が確定しました。`,
        '',
        `日時: ${when}（${master.timezone}）`,
        `所要時間: ${meeting.durationMin}分`,
        meeting.description ? `内容: ${meeting.description}` : '',
        res.meetUrl ? `Google Meet: ${res.meetUrl}` : '',
      ].filter(Boolean).join('\n');
      fillTab(mailTab, attendees, `【日程確定】${meeting.title} — ${when}`, body);
      reportDispatch(res);
      renderMeeting(root, id);
    } catch (e) {
      if (mailTab && !mailTab.closed) mailTab.close();
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
        h('button.ghost', {
          onclick: async () => {
            const to = (meeting.participantEmails || []).filter(Boolean);
            if (!to.length) return toast('参加者メールが未設定です（「編集」で追加してください）', 'error');
            const url = location.href.split('#')[0] + `#/m/${id}`;
            const body = [
              `打ち合わせ「${meeting.title}」に招待されました。`,
              meeting.description ? `内容: ${meeting.description}` : '',
              `候補期間: ${meeting.candidateStartDate} 〜 ${meeting.candidateEndDate}（${meeting.dayStart}–${meeting.dayEnd}）`,
              `所要時間: ${meeting.durationMin}分`,
              '',
              '下のURLを開いて、参加できる時間を選んでください:',
              url,
            ].filter(Boolean).join('\n');
            // Gmail の作成画面を直接開く（実クライアントから送信＝スパム判定されにくい・OAuth不要）
            openCompose(to, `【日程調整のお願い】${meeting.title}`, body);
            // Discord は Webhook があれば自動送信
            const u = await getOrCreateUser(auth.currentUser);
            const master = { ...defaultMaster(), ...(u.master || {}) };
            if (master.discordWebhook) {
              try {
                await sendDiscord(master.discordWebhook,
                  `📨 **日程調整のお願い: ${meeting.title}**\n候補: ${meeting.candidateStartDate}〜${meeting.candidateEndDate} / ${meeting.durationMin}分\n🔗 ${url}`);
                toast('Gmail作成画面を開きました＋Discord送信', 'success');
              } catch (e) {
                toast('Gmail作成画面を開きました（Discord失敗: ' + e.message + '）', 'error');
              }
            } else {
              toast('Gmail作成画面を開きました', 'success');
            }
          },
        }, '📨 招待を送る'),
        h('button.ghost', {
          onclick: async () => {
            const u = await getOrCreateUser(auth.currentUser);
            const master = { ...defaultMaster(), ...(u.master || {}) };
            openMeetingDialog({ master, meeting, onDone: () => renderMeeting(root, id), history: u.emailHistory || [] });
          },
        }, '編集'),
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
          ? (maxStart < 0
              ? h('p.hint', {}, `時間帯（${meeting.dayStart}–${meeting.dayEnd}）が所要${meeting.durationMin}分より短いため選択できません。「編集」で時間帯を広げてください。`)
              : h('p.hint', {}, `参加できる開始時刻をドラッグで選択（1マス＝${meeting.durationMin}分ぶん自動で選択）→「希望を保存」`))
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
  const parts = ['メール:Gmail作成画面'];
  const line = (label, r) => {
    if (r === null) return;
    parts.push(`${label}: ${r.ok ? 'OK' : '失敗(' + r.error + ')'}`);
  };
  line('カレンダー', res.calendar);
  line('Discord', res.discord);
  const anyFail = [res.calendar, res.discord].some((r) => r && !r.ok);
  toast(parts.join(' / '), anyFail ? 'error' : 'success');
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
