// discord.js — Discord Webhook へ通知を投げる。 #discord #notify
// Webhook URL はユーザーが自分のマスター設定に登録したものを使う（作成者ごと）。

/**
 * Discord Webhook へメッセージ送信。
 * @param {string} webhookUrl https://discord.com/api/webhooks/... 形式
 * @param {string} content    本文（Markdown 可）
 * @param {string} [username] 表示名（省略可）
 */
export async function sendDiscord(webhookUrl, content, username = 'Scheduler') {
  if (!webhookUrl) return null;
  const res = await fetch(webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, content }),
  });
  if (!res.ok) {
    throw new Error(`Discord Webhook ${res.status}: ${await res.text()}`);
  }
  return true;
}

/** URL が Discord Webhook 形式か軽くチェック */
export function isDiscordWebhook(url) {
  return /^https:\/\/(discord|discordapp)\.com\/api\/webhooks\//.test(url || '');
}
