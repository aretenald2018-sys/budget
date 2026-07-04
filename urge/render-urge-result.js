// ================================================================
// urge/render-urge-result.js — Step 3: deposit result
// ================================================================

import { fmtKRW } from '../utils/format.js';
import { $, escHtml } from '../utils/dom.js';
import { saveMindbankEntry, savePact, updateUrge } from '../data.js?v=20260704-telegram-newsfeed-v2';
import { showToast } from '../utils/toast.js';

export function renderUrgeResult(urge, choice, result) {
  const root = $('#tab-urge');
  const saved = Number(choice.savedAmount) || 0;
  const savedKcal = Number(choice.savedKcal) || 0;
  const isAllow = choice.type === 'allow';
  const isScheduled = choice.type === 'scheduled';
  const isSavor = choice.type === 'savor' || (saved <= 0 && savedKcal <= 0);
  const hasPrice = Number(urge.estimatedPrice || 0) > 0;
  const isWine = /와인|wine|주류|바틀|보틀|피노|샤르도네|리슬링|까베르네|메를로|피노누아/i
    .test([urge.what, urge.category].filter(Boolean).join(' '));
  const primaryAction = isScheduled
    ? "switchTab('home')"
    : isAllow && isWine
    ? "window.openSensoryBank('wine')"
    : `switchTab('${isAllow ? 'home' : 'mindbank'}')`;
  const primaryLabel = isScheduled ? '홈으로' : (isAllow && isWine ? '와인 셀러로 →' : (isAllow ? '홈으로' : '감각뱅크 보기 →'));
  root.innerHTML = `
    <div class="result-wrap">
      <div class="urge-topbar">
        <span></span>
        <div>3/3 단계</div>
        <span></span>
      </div>
      <div class="result-emoji">${choice.emoji || '✦'}${isAllow ? '' : '✦'}</div>
      <div class="result-h">${isScheduled ? '2주 뒤 다시 볼게요' : (isAllow ? (isWine ? '향유할 선택으로 기록해둘게요' : '기록해둘게요') : (isSavor ? '끌림을 잘 남겼어요' : '좋은 선택이에요'))}</div>
      <div class="result-sub">${resultSubtitle(urge, choice, isAllow, isSavor, isWine, isScheduled)}</div>

      <div class="deposit-card">
        <div class="label">${isScheduled ? '끌림 예약' : (isAllow || isSavor ? '감각뱅크 향유 기록' : (saved > 0 ? '감각뱅크에 입금됐어요' : '감각뱅크에 기록됐어요'))}</div>
        ${saved > 0 ? `
          <div class="amount-row">
            <span class="plus">+</span>
            <span class="amt">${fmtKRW(saved).replace('원', '')}</span>
            <span class="won">원</span>
          </div>
        ` : `
          <div class="record-row">${isScheduled ? '예약 완료' : '욕구 기록'}</div>
        `}
        ${savedKcal > 0 ? `<div class="kcal-row"><span>-</span>${savedKcal.toLocaleString('ko-KR')}<em>kcal</em></div>` : ''}
        <div class="meta">${resultMeta(urge, choice, isAllow, isSavor, isWine, hasPrice, isScheduled)}</div>
        <div class="badge-row">
          ${result.badges.map(badge => `<span class="badge"><span class="em">${badgeIcon(badge)}</span>${escHtml(badge)}</span>`).join('')}
        </div>
      </div>

      <div class="coach-card">
        <div class="talk">
          <div class="av">✦</div>
          <div class="text">${coachText(urge, choice, isAllow, isSavor)}</div>
        </div>
      </div>

      <div class="result-spacer"></div>
      <div class="result-btn-row">
        <button type="button" class="result-btn ghost" onclick="startUrgeFlow()">${isAllow ? '다시 보기' : '역시 사고 싶어요'}</button>
        ${!isScheduled ? '<button type="button" class="result-btn pact" onclick="window.createPactFromUrgeResult?.()">약속으로 미루기</button>' : ''}
        <button type="button" class="result-btn primary" onclick="${primaryAction}">${primaryLabel}</button>
      </div>
    </div>
  `;
  window.createPactFromUrgeResult = async () => {
    try {
      const price = Math.max(0, Math.round(Number(urge.estimatedPrice) || Number(choice.savedAmount) || 0));
      const fallbackDate = new Date();
      fallbackDate.setDate(fallbackDate.getDate() + 30);
      const pactTitle = `${urge.what || choice.title || '하고픈 것'} 미루기`;
      const pactId = await savePact({
        what: {
          title: pactTitle,
          category: pactCategoryFromUrge(urge, choice),
          cost: price,
          note: choice.title || '',
        },
        trigger: price > 0
          ? { type: 'savings', config: { targetAmount: price, currentAmount: 0 } }
          : { type: 'time', config: { date: fallbackDate.toISOString().slice(0, 10), recurrence: 'none' } },
        cost: { source: price > 0 ? 'mindbank' : 'budget' },
        signature: { message: '지금 바로 실행하지 않고, 조건을 채운 뒤 다시 결정한다.', cooloffHours: 24 },
        linkedUrgeId: urge.id,
        status: 'active',
      });
      if (urge.id) {
        await updateUrge(urge.id, {
          status: 'scheduled',
          chosenAlternativeId: 'pact',
          resolvedAt: new Date().toISOString(),
        });
      }
      await saveMindbankEntry({
        urgeId: urge.id || null,
        urgeWhat: urge.what,
        urgePrice: urge.estimatedPrice,
        desireType: urge.desireType || null,
        choiceType: 'scheduled',
        choiceTitle: '약속으로 미루기',
        choiceDesc: choice.title || '조건을 채운 뒤 다시 결정합니다.',
        savedAmount: price,
        badges: ['약속 전환', '좋은 선택'],
        pactId,
        pactTitle,
        pactStatus: 'active',
        mood: urge.mood,
        category: urge.category,
        occurredAt: new Date(),
      });
      showToast('욕구를 약속으로 옮겼어요.', 1500, 'success');
      switchTab('mindbank');
    } catch (err) {
      showToast(err.message || '약속 저장 실패', 2400, 'error');
    }
  };
}

function pactCategoryFromUrge(urge, choice) {
  const text = [urge?.what, urge?.category, choice?.title].filter(Boolean).join(' ');
  if (/여행|공연|콘서트|전시|오마카세|식사|경험|trip|travel/i.test(text)) return 'experience';
  if (/운동|레시피|만들|읽기|공부|훈련|습관/i.test(text)) return 'action';
  if (/연락|친구|부모|가족|관계/i.test(text)) return 'relation';
  return 'purchase';
}

function resultSubtitle(urge, choice, isAllow, isSavor, isWine, isScheduled) {
  if (isScheduled) {
    return `${reminderLabel(urge.reminderAt)}에 다시 알려드릴게요.<br>오늘은 결정하지 않아도 됩니다.`;
  }
  if (isAllow && isWine) {
    return '샀는지와 마셨는지는 따로 관리할게요.<br>구매한 병은 셀러에, 마신 경험은 시음 노트에 남기면 돼요.';
  }
  if (isAllow) {
    return '한 번의 선택일 뿐이에요.<br>실제 결제가 들어오면 연결해서 마무리할게요.';
  }
  if (isSavor) {
    return `${escHtml(urge.what)}에 끌린 이유와 선택을 남겼어요.<br>금액 없이도 중요한 기록이에요.`;
  }
  return `${escHtml(choice.title)} 다녀오세요.<br>다녀와서도 마음이 같으면 그때 다시 봐도 돼요.`;
}

function resultMeta(urge, choice, isAllow, isSavor, isWine, hasPrice, isScheduled) {
  const priceText = hasPrice ? ` ${fmtKRW(urge.estimatedPrice)}` : '';
  if (isScheduled) return `${escHtml(urge.what)}${priceText}을 오늘 사지 않고 ${reminderLabel(urge.reminderAt)}에 다시 볼게요.`;
  if (isAllow && isWine) return `${escHtml(urge.what)}${priceText}을 의식적으로 향유할 선택으로 남겼어요.`;
  if (isAllow) return `${escHtml(urge.what)}${priceText}의 구매 의사를 기록했어요.`;
  if (isSavor) return `${escHtml(urge.what)}에 대한 끌림을 ${escHtml(choice.title)}으로 기록했어요.`;
  return `${escHtml(urge.what)}${priceText} 대신 ${escHtml(choice.title)}을 택했어요.`;
}

function reminderLabel(value) {
  const date = value ? new Date(value) : null;
  if (!date || Number.isNaN(date.getTime())) return '2주 뒤';
  return date.toLocaleDateString('ko-KR', { month: 'long', day: 'numeric', weekday: 'short' });
}

function badgeIcon(badge) {
  if (badge.includes('긴장') || badge.includes('허전') || badge.includes('지쳐') || badge.includes('보상')) return '✦';
  if (badge.includes('번째')) return '◇';
  if (badge.includes('한 번')) return '◌';
  return '✦';
}

function coachText(urge, choice, isAllow, isSavor) {
  if (isAllow && /와인|wine|주류|바틀|보틀|피노|샤르도네|리슬링|까베르네|메를로|피노누아/i.test([urge.what, urge.category].filter(Boolean).join(' '))) {
    return '이건 실패가 아니라 감각을 선택한 기록이에요. 병은 셀러에 담고, 실제로 마신 날에는 향과 맛과 기분을 따로 남겨둘게요.';
  }
  if (isAllow) return '금지하지 않을게요. 대신 지금의 기분과 맥락을 남겨두면 다음 선택이 조금 더 선명해져요.';
  if (isSavor) return '돈으로 환산되지 않는 욕구도 관리의 일부예요. 지금 무엇을 느끼고 싶은지 알아차린 것만으로도 다음 선택이 더 부드러워져요.';
  if (/긴장|허전|지쳐|보상/.test(String(urge.mood || ''))) return `${escHtml(urge.category || '이 카테고리')} 충동을 ${escHtml(choice.title)}으로 우회했어요. 지금 필요한 건 물건보다 회복일 수도 있어요.`;
  return '이 선택은 절약보다 자기 조절의 기록에 가까워요. 마인드 뱅크에 잘 쌓아둘게요.';
}
