// google.js — Google API アクセストークン(GIS)取得＋カレンダー作成＋Gmail送信。 #google #calendar #gmail #oauth
// 恒久トークン(refresh)は持たず、Google Identity Services のトークンクライアントで都度取得(初回のみ同意)。
import { auth, CONFIG } from './firebase.js';

let tokenClient = null;
let accessToken = null;
let tokenExpiry = 0;

/** GIS のトークンクライアントを遅延初期化（gsi/client スクリプトは index.html で読込済み前提） */
function ensureTokenClient() {
  if (tokenClient) return;
  if (!window.google || !google.accounts || !google.accounts.oauth2) {
    throw new Error('Google Identity Services が未ロードです。ネットワーク/スクリプト読込を確認してください。');
  }
  tokenClient = google.accounts.oauth2.initTokenClient({
    client_id: CONFIG.googleClientId,
    scope: CONFIG.googleScopes,
    callback: () => {}, // requestAccessToken 毎に差し替える
  });
}

/**
 * Google REST API 用のアクセストークンを取得。キャッシュが有効ならそれを返す。
 * @param {boolean} forceConsent 401 リカバリ時などに同意画面を強制
 */
export function getAccessToken(forceConsent = false) {
  if (!forceConsent && accessToken && Date.now() < tokenExpiry - 60_000) {
    return Promise.resolve(accessToken);
  }
  ensureTokenClient();
  return new Promise((resolve, reject) => {
    tokenClient.callback = (resp) => {
      if (resp.error) return reject(new Error(resp.error));
      accessToken = resp.access_token;
      tokenExpiry = Date.now() + (resp.expires_in ? resp.expires_in * 1000 : 3600_000);
      resolve(accessToken);
    };
    const hint = auth.currentUser ? auth.currentUser.email : undefined;
    tokenClient.requestAccessToken({
      prompt: forceConsent || !accessToken ? 'consent' : '',
      login_hint: hint,
    });
  });
}

/** トークン付き fetch。401 なら一度だけ同意付きで再取得してリトライ。 */
async function apiFetch(url, options = {}) {
  let token = await getAccessToken();
  let res = await doFetch(url, options, token);
  if (res.status === 401) {
    token = await getAccessToken(true);
    res = await doFetch(url, options, token);
  }
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Google API ${res.status}: ${body}`);
  }
  return res.json();
}

function doFetch(url, options, token) {
  const headers = { ...(options.headers || {}), Authorization: `Bearer ${token}` };
  return fetch(url, { ...options, headers });
}

/**
 * 確定した打ち合わせを Google カレンダーへ登録。参加者を招待し、Google Meet を付与。
 * @param {object} p {calendarId, summary, description, startIso, endIso, timeZone, attendees[], createMeet}
 * @returns {Promise<object>} 作成イベント（htmlLink / hangoutLink を含む）
 */
export async function createCalendarEvent(p) {
  const calId = encodeURIComponent(p.calendarId || 'primary');
  const event = {
    summary: p.summary,
    description: p.description || '',
    start: { dateTime: p.startIso, timeZone: p.timeZone },
    end: { dateTime: p.endIso, timeZone: p.timeZone },
    attendees: (p.attendees || []).filter(Boolean).map((email) => ({ email })),
  };
  if (p.createMeet) {
    event.conferenceData = {
      createRequest: { requestId: `meet-${p.startIso}`, conferenceSolutionKey: { type: 'hangoutsMeet' } },
    };
  }
  const url =
    `https://www.googleapis.com/calendar/v3/calendars/${calId}/events` +
    `?sendUpdates=all&conferenceDataVersion=1`;
  return apiFetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(event),
  });
}

/** UTF-8 文字列を base64url に */
function base64url(str) {
  const bytes = new TextEncoder().encode(str);
  let bin = '';
  bytes.forEach((b) => (bin += String.fromCharCode(b)));
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** 日本語件名を MIME encoded-word で */
function encodeSubject(subject) {
  return `=?UTF-8?B?${btoa(String.fromCharCode(...new TextEncoder().encode(subject)))}?=`;
}

/**
 * ログイン中ユーザーの Gmail から送信。
 * @param {object} p {to[], subject, body} body はプレーンテキスト
 */
export async function sendGmail(p) {
  const to = (p.to || []).filter(Boolean).join(', ');
  if (!to) return null;
  const from = auth.currentUser ? auth.currentUser.email : '';
  const raw = [
    `From: ${from}`,
    `To: ${to}`,
    `Subject: ${encodeSubject(p.subject)}`,
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset="UTF-8"',
    'Content-Transfer-Encoding: 8bit',
    '',
    p.body,
  ].join('\r\n');
  return apiFetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ raw: base64url(raw) }),
  });
}
