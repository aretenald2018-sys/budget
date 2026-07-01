// ================================================================
// urge/render-urge-alternatives.js — Step 2: reframe choices
// ================================================================

import { updateUrge, saveMindbankEntry, listMindbankEntries, savePact } from '../data.js?v=20260701-toss-kim-taewoo';
import { badgesForChoice } from '../utils/mindbank.js?v=20260502-deep-violet';
import { fmtKRW } from '../utils/format.js';
import { $, escHtml } from '../utils/dom.js';
import { showToast } from '../utils/toast.js';
import { renderUrgeResult } from './render-urge-result.js?v=20260701-thread-complete';

const ROUTINES = [
  {
    id: 'tea-reset',
    title: '따뜻한 음료 + 10분 정리',
    desc: '물이나 차를 마시고 책상 위 물건 5개만 제자리로 돌려요.',
    emoji: '◌',
  },
  {
    id: 'body-reset',
    title: '샤워 또는 세수 리셋',
    desc: '몸 감각을 먼저 바꿔요. 구매 결정은 씻고 난 뒤로 미뤄요.',
    emoji: '◒',
  },
  {
    id: 'message-reset',
    title: '믿는 사람에게 한 줄 보내기',
    desc: '“지금 뭔가 사고 싶다”라고만 보내도 충동이 한 번 밖으로 나와요.',
    emoji: '◇',
  },
];

export function renderUrgeAlternatives(urge) {
  const root = $('#tab-urge');
  root.innerHTML = `
    <div class="urge-screen">
      <div class="urge-topbar">
        <button type="button" class="urge-back" onclick="startUrgeFlow()">‹</button>
        <div>2/3 단계</div>
        <span></span>
      </div>

      <div class="breath-card">
        <div class="icon">✦</div>
        <div class="h">${/긴장|허전|지쳐|보상/.test(String(urge.mood || '')) ? '마음이 많이 쓰였군요' : '마음을 같이 볼게요'}</div>
        <div class="desc">${escHtml(urge.what)}이 지금 끌리는 게 자연스러워요.<br>다른 길도 같이 둘러볼게요. 끌리는 걸 골라보세요.</div>
      </div>

      <div class="alt-h">
        <div class="h">긴장을 풀 수 있는 4가지</div>
        <div class="sub">강도순이 아니에요. 끌리는 걸 골라보세요.</div>
      </div>

      <div class="alt-list">
        ${urge.alternatives.map(choice => altCard(choice)).join('')}
      </div>

      <form class="custom-alt-form" id="custom-alt-form">
        <label>직접 대안 쓰기</label>
        <textarea name="customAlternative" placeholder="예: 오늘은 구매 대신 셀러 후보로만 남기고, 주말에 다시 보기"></textarea>
        <div class="custom-alt-row">
          <input name="customSavedAmount" inputmode="numeric" placeholder="절약액 선택">
          <button type="submit">이걸로 기록</button>
        </div>
      </form>

      <button type="button" class="delay-purchase-btn" id="urge-delay-btn">
        <span>
          <strong>2주 뒤 다시 보기</strong>
          <em>오늘 결정하지 않고 구매 후보로 예약해둘게요.</em>
        </span>
        <b>예약</b>
      </button>
      <button type="button" class="delay-purchase-btn pact-delay-btn" id="urge-pact-btn">
        <span>
          <strong>약속으로 미루기</strong>
          <em>조건을 붙여 미래의 내가 다시 결정하게 합니다.</em>
        </span>
        <b>약속</b>
      </button>
    </div>
  `;

  root.querySelectorAll('[data-choice-id]').forEach(btn => {
    btn.addEventListener('click', async () => chooseAlternative(urge, btn.dataset.choiceId));
  });
  $('#custom-alt-form', root).addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const title = String(fd.get('customAlternative') || '').trim();
    if (!title) {
      showToast('직접 쓸 대안을 한 줄 남겨주세요.', 1800, 'warning');
      return;
    }
    const savedAmount = Math.max(0, Math.round(Number(String(fd.get('customSavedAmount') || '').replace(/[^\d.-]/g, '')) || 0));
    await completeChoice(urge, {
      id: `custom-${Date.now()}`,
      type: savedAmount > 0 ? 'substitute' : 'custom',
      emoji: '✎',
      title,
      desc: '직접 정한 대안이에요. 선택지보다 지금 마음에 맞는 방식으로 남겼어요.',
      savedAmount,
      badge: '직접 선택',
    });
  });
  $('#urge-delay-btn', root).addEventListener('click', () => schedulePurchaseDelay(urge));
  $('#urge-pact-btn', root).addEventListener('click', () => createPactFromUrge(urge));
}

function altCard(choice) {
  const saved = Number(choice.savedAmount) || 0;
  const savedKcal = Number(choice.savedKcal) || 0;
  const saveLabel = choice.type === 'allow'
    ? '향유 기록'
    : (saved > 0 ? (choice.type === 'reduce' ? `${fmtKRW(saved)} 절약` : `감각뱅크 +${fmtKRW(saved)}`) : '욕구 기록');
  const saveClass = choice.type === 'allow' || saved <= 0 ? 'zero' : '';
  const kcalLabel = savedKcal > 0 ? `<span class="save kcal">-${savedKcal.toLocaleString('ko-KR')} kcal</span>` : '';
  const kcalBasis = savedKcal > 0 ? `<span class="kcal-basis">${escHtml(kcalBasisText(choice.calorieMeta))}</span>` : '';
  return `
    <button type="button" class="alt-card" data-choice-id="${escHtml(choice.id)}">
      <span class="ico">${choice.emoji || '✦'}</span>
      <span class="body">
        <span class="name">${escHtml(choice.title)}</span>
        <span class="desc">${escHtml(choice.desc)}</span>
        <span class="save-line">
          <span class="save ${saveClass}">${saved > 0 ? '₩' : '✎'} ${saveLabel}</span>
          ${kcalLabel}
        </span>
        ${kcalBasis}
      </span>
      <span class="arr">›</span>
    </button>
  `;
}

function kcalBasisText(meta = {}) {
  const before = meta.originalPortion || '처음 양';
  const after = meta.chosenPortion || '선택한 양';
  const original = Number(meta.originalKcal) || 0;
  const chosen = Number(meta.chosenKcal) || 0;
  const density = Number(meta.kcalPer100g) || 0;
  const densityText = density ? ` · 약 ${density.toLocaleString('ko-KR')}kcal/100g` : '';
  if (original || chosen) {
    return `추정 근거: ${before} ${original.toLocaleString('ko-KR')}kcal → ${after} ${chosen.toLocaleString('ko-KR')}kcal${densityText}`;
  }
  return `추정 근거: ${before} → ${after}${densityText}`;
}

async function chooseAlternative(urge, choiceId) {
  const choice = urge.alternatives.find(item => item.id === choiceId);
  if (!choice) return;
  if (choice.type === 'allow' && !Number(urge.estimatedPrice || 0)) {
    await completeChoice(urge, {
      ...choice,
      type: 'savor',
      savedAmount: 0,
    });
    return;
  }
  if (needsRoutineStep(choice)) {
    renderRoutineSuggestions(urge, choice);
    return;
  }
  await completeChoice(urge, choice);
}

async function completeChoice(urge, choice) {
  if (choice.type === 'allow') {
    await updateUrge(urge.id, {
      status: 'awaiting_purchase',
      chosenAlternativeId: choice.id,
      resolvedAt: new Date().toISOString(),
    });
    renderUrgeResult(urge, choice, { badges: ['한 번의 선택'], entryId: null });
    return;
  }

  const entries = await listMindbankEntries({ max: 100 });
  const similarCount = entries.filter(entry => entry.choiceTitle === choice.title).length;
  const badges = badgesForChoice(choice, urge, similarCount);
  const entryId = await saveMindbankEntry({
    urgeId: urge.id,
    urgeWhat: urge.what,
    urgePrice: urge.estimatedPrice,
    choiceType: choice.type,
    choiceTitle: choice.title,
    choiceDesc: choice.desc,
    routineTitle: choice.routineTitle || '',
    routineDesc: choice.routineDesc || '',
    savedAmount: choice.savedAmount || 0,
    savedKcal: choice.savedKcal || 0,
    calorieMeta: choice.calorieMeta || null,
    badges,
    desireType: urge.desireType || null,
    mood: urge.mood,
    category: urge.category,
    occurredAt: new Date(),
  });
  await updateUrge(urge.id, {
    status: 'resolved',
    chosenAlternativeId: choice.id,
    resolvedAt: new Date().toISOString(),
  });
  renderUrgeResult(urge, choice, { badges, entryId });
}

async function schedulePurchaseDelay(urge) {
  const reminderAt = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);
  const savedAmount = Math.max(0, Math.round(Number(urge.estimatedPrice) || 0));
  const choice = {
    id: 'two-week-delay',
    type: 'scheduled',
    emoji: '◌',
    title: '2주 뒤 다시 보기',
    desc: `${reminderAt.toLocaleDateString('ko-KR')}에 다시 살펴보기로 했어요.`,
    savedAmount,
    badge: '구매 지연',
  };
  await updateUrge(urge.id, {
    status: 'scheduled',
    chosenAlternativeId: choice.id,
    reminderAt: reminderAt.toISOString(),
    resolvedAt: new Date().toISOString(),
  });
  const entryId = await saveMindbankEntry({
    urgeId: urge.id,
    urgeWhat: urge.what,
    urgePrice: urge.estimatedPrice,
    choiceType: choice.type,
    choiceTitle: choice.title,
    choiceDesc: choice.desc,
    savedAmount,
    savedKcal: 0,
    calorieMeta: null,
    badges: ['구매 지연', '좋은 선택'],
    desireType: urge.desireType || null,
    mood: urge.mood,
    category: urge.category,
    occurredAt: new Date(),
    reminderAt: reminderAt.toISOString(),
  });
  scheduleBrowserNotification(urge, reminderAt);
  renderUrgeResult({ ...urge, reminderAt: reminderAt.toISOString() }, choice, { badges: ['구매 지연', '좋은 선택'], entryId });
}

async function createPactFromUrge(urge) {
  const price = Math.max(0, Math.round(Number(urge.estimatedPrice) || 0));
  const fallbackDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
  const title = `${urge.what || '끌림'} 약속`;
  const pactId = await savePact({
    what: {
      title,
      category: pactCategoryFromUrge(urge),
      cost: price,
      note: urge.context || '',
    },
    trigger: price > 0
      ? { type: 'savings', config: { targetAmount: price, currentAmount: 0 } }
      : { type: 'time', config: { date: fallbackDate.toISOString().slice(0, 10), recurrence: 'none' } },
    cost: { source: price > 0 ? 'mindbank' : 'budget' },
    signature: { message: '지금 바로 실행하지 않고, 조건을 채운 뒤 다시 결정한다.', cooloffHours: 24 },
    linkedUrgeId: urge.id,
    status: 'active',
  });
  await updateUrge(urge.id, {
    status: 'scheduled',
    chosenAlternativeId: 'pact',
    resolvedAt: new Date().toISOString(),
  });
  await saveMindbankEntry({
    urgeId: urge.id,
    urgeWhat: urge.what,
    urgePrice: urge.estimatedPrice,
    desireType: urge.desireType || null,
    choiceType: 'scheduled',
    choiceTitle: '약속으로 미루기',
    choiceDesc: `"${title}" 조건을 채운 뒤 다시 결정합니다.`,
    savedAmount: price,
    badges: ['약속 전환', '좋은 선택'],
    pactId,
    pactTitle: title,
    pactStatus: 'active',
    mood: urge.mood,
    category: urge.category,
    occurredAt: new Date(),
  });
  showToast('끌림을 약속으로 옮겼어요.', 1500, 'success');
  switchTab('mindbank');
}

function pactCategoryFromUrge(urge) {
  const text = [urge?.what, urge?.category, urge?.desireType].filter(Boolean).join(' ');
  if (/여행|공연|콘서트|전시|경험|trip|travel/i.test(text)) return 'experience';
  if (/먹|레시피|운동|읽기|공부|습관|eat/i.test(text)) return 'action';
  if (/연락|친구|부모|가족|관계/i.test(text)) return 'relation';
  if (/와인|술|야식|끊|줄이|wine/i.test(text)) return 'restraint';
  return 'purchase';
}

function scheduleBrowserNotification(urge, reminderAt) {
  const delay = reminderAt.getTime() - Date.now();
  if (!('Notification' in window) || delay <= 0 || delay > 2147483647) return;
  const notify = () => {
    if (Notification.permission === 'granted') {
      new Notification('끌림 예약 시간이 왔어요', {
        body: `${urge.what || '예약한 끌림'}을 지금도 원하는지 가볍게 확인해볼까요?`,
      });
    }
    showToast('2주 전에 예약한 끌림을 다시 볼 시간이에요.', 4000, 'info');
  };
  if (Notification.permission === 'granted') {
    window.setTimeout(notify, delay);
  } else if (Notification.permission !== 'denied') {
    Notification.requestPermission().then(permission => {
      if (permission === 'granted') window.setTimeout(notify, delay);
    });
  }
}

function needsRoutineStep(choice) {
  return choice.type !== 'allow' && /루틴|기분 전환/.test(String(choice.title || ''));
}

function renderRoutineSuggestions(urge, choice) {
  const root = $('#tab-urge');
  root.innerHTML = `
    <div class="urge-screen">
      <div class="urge-topbar">
        <button type="button" class="urge-back" onclick="renderUrgeAlternatives(window.getCurrentUrgeFlow().urge)">‹</button>
        <div>루틴 고르기</div>
        <span></span>
      </div>

      <div class="breath-card">
        <div class="icon">✦</div>
        <div class="h">지금 바로 할 수 있는 루틴</div>
        <div class="desc">${escHtml(choice.title)}를 고르셨네요.<br>너무 큰 결심 말고, 10분 안에 시작할 수 있는 걸 골라봐요.</div>
      </div>

      <div class="alt-h">
        <div class="h">세 가지 중 하나만</div>
        <div class="sub">완벽하게 하지 않아도 괜찮아요. 시작하기 쉬운 걸 고르면 돼요.</div>
      </div>

      ${ROUTINES.map(routine => `
        <button type="button" class="alt-card routine-card" data-routine-id="${routine.id}">
          <span class="ico">${routine.emoji}</span>
          <span class="body">
            <span class="name">${escHtml(routine.title)}</span>
            <span class="desc">${escHtml(routine.desc)}</span>
            <span class="save-line">
              <span class="save">${choice.savedAmount ? '₩ 감각뱅크 +' + fmtKRW(choice.savedAmount || 0) : '✎ 욕구 기록'}</span>
              ${choice.savedKcal ? `<span class="save kcal">-${Number(choice.savedKcal).toLocaleString('ko-KR')} kcal</span>` : ''}
            </span>
          </span>
          <span class="arr">›</span>
        </button>
      `).join('')}
    </div>
  `;
  root.querySelectorAll('[data-routine-id]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const routine = ROUTINES.find(item => item.id === btn.dataset.routineId);
      await completeChoice(urge, {
        ...choice,
        title: routine.title,
        desc: routine.desc,
        emoji: routine.emoji,
        routineTitle: routine.title,
        routineDesc: routine.desc,
      });
    });
  });
}

window.renderUrgeAlternatives = renderUrgeAlternatives;
