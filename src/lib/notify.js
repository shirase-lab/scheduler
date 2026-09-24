// notify.js — 確定時の外部連携(カレンダー/メール/Discord)を1経路に集約。 #notify #calendar #gmail #discord
// meeting.js の確定処理からのみ呼ぶ。各連携は独立に成否を返し、UI 側でまとめて表示する。
import { createCalendarEvent, sendGmail } from './google.js';
import { sendDiscord } from './discord.js';
import { confirmedLabel, toLocalIso, minToTime, timeToMin } from './time.js';

/**
 * 確定した打ち合わせを外部へ反映する。
 * @param {object} meeting  Firestore の meeting ドキュメント（id 含む）
 * @param {object} master   作成者のマスター設定（calendarId/timezone/createMeet/discordWebhook 等）
 * @param {string} date     "YYYY-MM-DD"
 * @param {string} time     "HH:mm"
 * @param {string[]} attendeeEmails 招待メール（参加者＋作成者）
 * @returns {Promise<{calendar,email,discord}>} 各連携の {ok, detail|error}
 */
export async function dispatchConfirmation(meeting, master, date, time, attendeeEmails) {
  const durationMin = meeting.durationMin;
  const endTime = minToTime(timeToMin(time) + durationMin);
  const startIso = toLocalIso(date, time);
  const endIso = toLocalIso(date, endTime);
  const when = confirmedLabel(date, time, durationMin);
  const result = { calendar: null, email: null, discord: null };

  const meetLine = ''; // Meet リンクはカレンダー作成後に本文へ足す
  const bodyLines = [
    `打ち合わせ「${meeting.title}」の日程が確定しました。`,
    '',
    `日時: ${when}（${master.timezone}）`,
    `所要時間: ${durationMin}分`,
    meeting.description ? `内容: ${meeting.description}` : '',
    `主催: ${meeting.organizerName || meeting.organizerEmail}`,
  ].filter(Boolean);

  // 1) Google カレンダー（参加者を招待＋Meet）
  let meetUrl = '';
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
    meetUrl = ev.hangoutLink || '';
    result.calendar = { ok: true, detail: ev.htmlLink || 'created', meetUrl };
  } catch (e) {
    result.calendar = { ok: false, error: e.message };
  }

  const fullBody = [...bodyLines, meetUrl ? `\nGoogle Meet: ${meetUrl}` : ''].join('\n');

  // 2) メール（Gmail 送信）
  if (meeting.notify && meeting.notify.email) {
    try {
      await sendGmail({
        to: attendeeEmails,
        subject: `【日程確定】${meeting.title} — ${when}`,
        body: fullBody,
      });
      result.email = { ok: true, detail: `${attendeeEmails.length}件へ送信` };
    } catch (e) {
      result.email = { ok: false, error: e.message };
    }
  }

  // 3) Discord（作成者マスターの Webhook）
  if (meeting.notify && meeting.notify.discord) {
    try {
      const content =
        `📅 **日程確定: ${meeting.title}**\n` +
        `🕒 ${when}（${master.timezone}） / ${durationMin}分\n` +
        (meeting.description ? `📝 ${meeting.description}\n` : '') +
        (meetUrl ? `🔗 ${meetUrl}` : '');
      await sendDiscord(master.discordWebhook, content);
      result.discord = { ok: true, detail: '送信' };
    } catch (e) {
      result.discord = { ok: false, error: e.message };
    }
  }

  return result;
}
