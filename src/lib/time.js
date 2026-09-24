// time.js — 15分スロットの生成・整形ヘルパ（純関数のみ・依存なし） #time #slot
// 打ち合わせの候補期間(日付範囲)×1日の時間帯を、15分刻みのスロット配列へ落とす。

export const STEP_MIN = 15;
export const DURATION_OPTIONS = [15, 30, 60, 120]; // 打ち合わせダイアログの所要時間ボタン
const WEEKDAY_JA = ['日', '月', '火', '水', '木', '金', '土'];

/** "HH:mm" → 0時からの分 */
export function timeToMin(t) {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
}

/** 分 → "HH:mm" */
export function minToTime(min) {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/** "YYYY-MM-DD" と "HH:mm" からスロットキー "YYYY-MM-DDTHH:mm" */
export function slotKey(dateStr, timeStr) {
  return `${dateStr}T${timeStr}`;
}

/** スロットキーを {date, time} に分解 */
export function parseSlotKey(key) {
  const [date, time] = key.split('T');
  return { date, time };
}

/** "YYYY-MM-DD" の日付配列（両端含む） */
export function dateRange(startDate, endDate) {
  const out = [];
  const cur = new Date(`${startDate}T00:00:00`);
  const end = new Date(`${endDate}T00:00:00`);
  while (cur <= end) {
    out.push(toDateStr(cur));
    cur.setDate(cur.getDate() + 1);
  }
  return out;
}

/** Date → "YYYY-MM-DD"（ローカル） */
export function toDateStr(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** 1日の時間帯 dayStart..dayEnd を 15分刻みの "HH:mm" 配列に。終端(dayEnd)は含めない */
export function timeSlots(dayStart, dayEnd) {
  const out = [];
  for (let m = timeToMin(dayStart); m < timeToMin(dayEnd); m += STEP_MIN) {
    out.push(minToTime(m));
  }
  return out;
}

/** "YYYY-MM-DD" → "9/25(木)" 表示ラベル */
export function dateLabel(dateStr) {
  const d = new Date(`${dateStr}T00:00:00`);
  return `${d.getMonth() + 1}/${d.getDate()}(${WEEKDAY_JA[d.getDay()]})`;
}

/** duration(分) を占めるのに必要な連続スロット数 */
export function slotsForDuration(durationMin) {
  return Math.ceil(durationMin / STEP_MIN);
}

/**
 * 全参加者の可否から、durationMin が収まる連続ブロックの候補を集計してランキング。
 * @param {string[]} days           候補日 ["YYYY-MM-DD", ...]
 * @param {string[]} times          "HH:mm" 昇順（timeSlots の結果）
 * @param {Map<string, string[]>} slotVoters  slotKey -> 可能なユーザー名の配列
 * @param {number} durationMin
 * @param {number} totalParticipants 参加(希望提出)人数
 * @returns {{key,date,time,endTime,count,voters}[]} count 降順
 */
export function rankBlocks(days, times, slotVoters, durationMin, totalParticipants) {
  const need = slotsForDuration(durationMin);
  const results = [];
  for (const date of days) {
    for (let i = 0; i + need <= times.length; i++) {
      // ブロック内の 15分スロットが時間的に連続しているか（昼休みなどの穴を跨がない）
      const startMin = timeToMin(times[i]);
      const contiguous = times
        .slice(i, i + need)
        .every((t, j) => timeToMin(t) === startMin + j * STEP_MIN);
      if (!contiguous) continue;

      // ブロック内の全スロットで「全員可能」な人だけを数える（積集合）
      let voters = null;
      for (let j = 0; j < need; j++) {
        const key = slotKey(date, times[i + j]);
        const v = new Set(slotVoters.get(key) || []);
        voters = voters === null ? v : new Set([...voters].filter((x) => v.has(x)));
        if (voters.size === 0) break;
      }
      const count = voters ? voters.size : 0;
      if (count === 0) continue;
      results.push({
        key: slotKey(date, times[i]),
        date,
        time: times[i],
        endTime: minToTime(startMin + durationMin),
        count,
        voters: voters ? [...voters] : [],
        full: count === totalParticipants && totalParticipants > 0,
      });
    }
  }
  results.sort((a, b) => b.count - a.count || a.key.localeCompare(b.key));
  return results;
}

/** "YYYY-MM-DD" + "HH:mm" + duration → ISO 開始/終了（タイムゾーンはカレンダー側で付与） */
export function toLocalIso(dateStr, timeStr) {
  return `${dateStr}T${timeStr}:00`;
}

/** 確定枠の人間可読表示: "9/26(金) 14:00〜15:00" */
export function confirmedLabel(dateStr, timeStr, durationMin) {
  const end = minToTime(timeToMin(timeStr) + durationMin);
  return `${dateLabel(dateStr)} ${timeStr}〜${end}`;
}
