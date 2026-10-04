// holidays.js — 日本の祝日データ取得（holidays-jp API）。 #holiday
// API: https://holidays-jp.github.io/api/v1/date.json → {"YYYY-MM-DD":"祝日名", ...}
// 取得はセッション内でキャッシュ。失敗しても空マップで縮退（祝日除外が効かないだけ）。
const API = 'https://holidays-jp.github.io/api/v1/date.json';
let cache = null;

/** 祝日マップ {"YYYY-MM-DD": name} を取得（キャッシュあり） */
export async function loadHolidays() {
  if (cache) return cache;
  try {
    const res = await fetch(API);
    cache = res.ok ? await res.json() : {};
  } catch (_) {
    cache = {};
  }
  return cache;
}
