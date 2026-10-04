// notify.js — 確定時の外部連携(カレンダー/Discord)を集約。メールは mailto（views 側でメーラー起動）。 #notify #calendar #discord
import { createCalendarEvent } from './google.js';
import { sendDiscord } from './discord.js';
import { confirmedLabel, toLocalIso, minToTime, timeToMin } from './time.js';

/**
 * 確定した打ち合わせを外部へ反映する（Google カレンダー登録＋Discord 通知）。
 * メール通知は mailto（メーラー起動）で呼び出し側が行う。
 * @param {object} meeting  Firestore の meeting ドキュメント（id 含む）
 * @param {object} master   作成者のマスター設定（calendarId/timezone/createMeet/discordWebhook 等）
 * @param {string} date     "YYYY-MM-DD"
 * @param {string} time     "HH:mm"
 * @param {string[]} attendeeEmails 招待メール（参加者＋作成者）
 * @returns {Promise<{calendar,discord,meetUrl}>}
 */
export async function dispatchConfirmation(meeting, master, date, time, attendeeEmails) {
  const durationMin = meeting.durationMin;
  const endTime = minToTime(timeToMin(time) + durationMin);
  const startIso = toLocalIso(date, time);
  const endIso = toLocalIso(date, endTime);
  const when = confirmedLabel(date, time, durationMin);
  const result = { calendar: null, discord: null, meetUrl: '' };

  // 1) Google カレンダー（参加者を招待＋Meet）
  try {
    const ev = await createCalendarEvent({
      calendarId: master.calendarId,
      summary: meeting.title,
      description: meeting.description || '',
      startIso,
      endIso,
      timeZone: master.timezone,
      attendees: attendeeEmails,
      createMeet: !!master.createMeet,
    });
    result.meetUrl = ev.hangoutLink || '';
    result.calendar = { ok: true, detail: ev.htmlLink || 'created', meetUrl: result.meetUrl };
  } catch (e) {
    result.calendar = { ok: false, error: e.message };
  }

  // 2) Discord（作成者マスターの Webhook）
  if (meeting.notify && meeting.notify.discord) {
    try {
      const content =
        `📅 **日程確定: ${meeting.title}**\n` +
        `🕒 ${when}（${master.timezone}） / ${durationMin}分\n` +
        (meeting.description ? `📝 ${meeting.description}\n` : '') +
        (result.meetUrl ? `🔗 ${result.meetUrl}` : '');
      await sendDiscord(master.discordWebhook, content);
      result.discord = { ok: true, detail: '送信' };
    } catch (e) {
      result.discord = { ok: false, error: e.message };
    }
  }

  return result;
}
