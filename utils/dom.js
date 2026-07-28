// ================================================================
// utils/dom.js — DOM 헬퍼
// ================================================================

export function $(sel, root = document) { return root.querySelector(sel); }
export function $$(sel, root = document) { return Array.from(root.querySelectorAll(sel)); }

export function el(tag, attrs = {}, children = []) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') e.className = v;
    else if (k === 'style' && typeof v === 'object') Object.assign(e.style, v);
    else if (k.startsWith('on') && typeof v === 'function') e.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === 'dataset') Object.assign(e.dataset, v);
    else e.setAttribute(k, v);
  }
  for (const c of [].concat(children)) {
    if (c == null || c === false) continue;
    e.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
  }
  return e;
}

// 폼 식별은 반드시 이걸로 한다. `form.id` 는 믿을 수 없다 — HTMLFormElement 는
// 자식 컨트롤을 name 으로 노출하고(legacy named getter), 그 이름이 id·action·method
// 같은 내장 속성보다 우선한다. 즉 <input name="id"> 하나만 있어도 form.id 는 문자열이
// 아니라 그 input 이 된다. 그러면 submit 핸들러의 `event.target.id !== 'x-form'` 가
// 항상 참이 되어 preventDefault 가 걸리지 않고, 저장 버튼이 네이티브 GET 전송으로
// 페이지를 새로고침한다(입력은 사라지고 앱은 초기화된다).
export function isFormWithId(node, formId) {
  return node?.nodeName === 'FORM' && node.getAttribute('id') === formId;
}

export function escHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  }[c]));
}
