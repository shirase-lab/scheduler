// dom.js — 依存なしの極小 DOM ヘルパ。 #dom #ui
// フレームワークを足さず素の DOM で組む方針（§ ビルド無し）。

/** 要素生成: h('button.primary', {onclick}, '送信') */
export function h(tagSelector, props = {}, ...children) {
  const [tag, ...classes] = tagSelector.split('.');
  const el = document.createElement(tag || 'div');
  if (classes.length) el.className = classes.join(' ');
  for (const [k, v] of Object.entries(props || {})) {
    if (k === 'onclick' || k.startsWith('on')) {
      el.addEventListener(k.slice(2).toLowerCase(), v);
    } else if (k === 'html') {
      el.innerHTML = v;
    } else if (k === 'dataset') {
      Object.assign(el.dataset, v);
    } else if (v !== null && v !== undefined && v !== false) {
      el.setAttribute(k, v === true ? '' : v);
    }
  }
  for (const c of children.flat()) {
    if (c === null || c === undefined || c === false) continue;
    el.append(c.nodeType ? c : document.createTextNode(String(c)));
  }
  return el;
}

/** 中身を差し替え */
export function mount(root, ...nodes) {
  root.replaceChildren(...nodes.flat().filter(Boolean));
}

/** 簡易トースト */
export function toast(msg, kind = 'info') {
  const t = h(`div.toast.${kind}`, {}, msg);
  document.body.append(t);
  setTimeout(() => t.classList.add('show'), 10);
  setTimeout(() => {
    t.classList.remove('show');
    setTimeout(() => t.remove(), 300);
  }, 3800);
}

/** モーダルダイアログを開く。contentBuilder(close) が本文を返す */
export function openDialog(title, contentBuilder) {
  const overlay = h('div.overlay');
  const close = () => overlay.remove();
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) close();
  });
  const box = h(
    'div.dialog',
    {},
    h('div.dialog-head', {}, h('h2', {}, title), h('button.icon', { onclick: close }, '×')),
    contentBuilder(close)
  );
  overlay.append(box);
  document.body.append(overlay);
  return close;
}
