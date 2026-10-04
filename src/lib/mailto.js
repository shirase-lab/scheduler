// mailto.js — メール作成画面を開く。Gmail の作成画面を直接開く方式（OS既定メーラー/ハンドラ設定が不要）。 #mailto #notify
// Gmail API 送信はしない（スパム判定・OAuth警告・審査を回避）。宛先・件名・本文をプリフィルして作成画面を開くだけ。

/** Gmail の作成画面URL（view=cm）。to はカンマ区切り、件名/本文は URL エンコード。 */
export function gmailComposeUrl(to, subject, body) {
  const addr = encodeURIComponent((to || []).filter(Boolean).join(','));
  return `https://mail.google.com/mail/?view=cm&fs=1&to=${addr}&su=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

/**
 * Gmail 作成画面を新規タブで開く。
 * ※ポップアップブロック回避のため、クリックハンドラ内の "await より前" に呼ぶこと。
 * await 後に開く場合は reserveTab()→fillTab() を使う。
 */
export function openCompose(to, subject, body) {
  return window.open(gmailComposeUrl(to, subject, body), '_blank');
}

/** クリック直後に空タブを確保（await をまたいで後から URL を入れるため） */
export function reserveTab() {
  return window.open('about:blank', '_blank');
}

/** 確保済みタブに Gmail 作成URLを流し込む（確保失敗時は直接 open にフォールバック） */
export function fillTab(win, to, subject, body) {
  const url = gmailComposeUrl(to, subject, body);
  if (win && !win.closed) win.location.href = url;
  else window.open(url, '_blank');
}
