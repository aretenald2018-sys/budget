// ================================================================
// choice/conditions.js — selection pact and condition domain helpers
// ================================================================

import { fmtKRW } from '../utils/format.js';

export function isBinaryConditionType(type) {
  return ['check', 'date', 'diet'].includes(type);
}

function makeId(prefix) {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

export function withPactRuntime(pact) {
  const progress = computePactProgress(pact);
  return { ...pact, runtimeProgress: progress };
}

export function computePactProgress(pact) {
  if (pact?.status === 'fulfilled') return 1;
  const conditions = pactConditions(pact);
  if (conditions.length) {
    const total = conditions.reduce((sum, condition) => sum + conditionProgress(condition), 0);
    return total / conditions.length;
  }
  return legacyPactProgress(pact);
}

export function legacyPactProgress(pact) {
  const trigger = pact?.trigger || {};
  const cfg = trigger.config || {};
  if (pact?.status === 'fulfilled') return 1;
  if (trigger.type === 'time') {
    const due = cfg.date ? new Date(`${cfg.date}T23:59:59`) : null;
    if (!due || Number.isNaN(due.getTime())) return 0;
    const created = timestampMs(pact.createdAt) || Date.now();
    const span = Math.max(1, due.getTime() - created);
    return Math.max(0, Math.min(1, (Date.now() - created) / span));
  }
  if (trigger.type === 'savings') return ratio(cfg.currentAmount, cfg.targetAmount);
  if (trigger.type === 'streak') return ratio(cfg.currentCount, cfg.count);
  if (trigger.type === 'measure') {
    const target = Number(cfg.value) || 0;
    const current = Number(cfg.currentValue) || 0;
    if (!target) return 0;
    if (cfg.op === '<=') return current <= target ? 1 : Math.max(0, Math.min(0.95, target / current));
    return current >= target ? 1 : Math.max(0, Math.min(0.95, current / target));
  }
  if (trigger.type === 'event') return cfg.done ? 1 : 0;
  if (trigger.type === 'manual') return 1;
  return cfg.done ? 1 : Number(trigger.progress) || 0;
}

export function pactConditionStats(pact) {
  const conditions = pactConditions(pact);
  const total = conditions.length;
  const done = conditions.filter(condition => conditionProgress(condition) >= 1).length;
  const progress = total
    ? conditions.reduce((sum, condition) => sum + conditionProgress(condition), 0) / total
    : legacyPactProgress(pact);
  return {
    conditions,
    total,
    done,
    progress,
    progressPct: Math.round(progress * 100),
    ready: total ? done === total : progress >= 1,
  };
}

export function pactConditions(pact) {
  const explicit = Array.isArray(pact?.conditions)
    ? pact.conditions.map(normalizeChoicePactCondition).filter(Boolean)
    : [];
  if (explicit.length) return explicit;
  if (isTravelPact(pact)) return suggestedTravelConditions(pact);
  const legacy = legacyTriggerCondition(pact);
  return legacy ? [legacy] : [];
}

export function normalizeChoicePactCondition(value) {
  if (!value) return null;
  const label = String(value.label || value.name || '').trim();
  if (!label) return null;
  const type = normalizeChoiceConditionType(value.type);
  const dueDate = String(value.dueDate || value.date || '').trim();
  const due = type === 'date' && dueDate ? isDateConditionDue(dueDate) : false;
  const done = !!value.done || due || Number(value.current) >= Math.max(1, Number(value.target) || 0);
  if (isBinaryConditionType(type)) {
    return {
      id: String(value.id || makeId('cond')),
      type,
      label,
      current: done ? 1 : 0,
      target: 1,
      unit: '',
      done,
      dueDate,
      note: String(value.note || '').trim(),
    };
  }
  return {
    id: String(value.id || makeId('cond')),
    type,
    label,
    current: Math.max(0, Number(value.current) || 0),
    target: Math.max(0, Number(value.target) || 0),
    unit: String(value.unit || (type === 'amount' ? '원' : '')).trim(),
    done,
    note: String(value.note || '').trim(),
  };
}

export function normalizeChoiceConditionType(value) {
  const type = String(value || 'amount').toLowerCase();
  return ['amount', 'check', 'date', 'diet', 'number'].includes(type) ? type : 'amount';
}

export function legacyTriggerCondition(pact) {
  const trigger = pact?.trigger || {};
  const cfg = trigger.config || {};
  if (trigger.type === 'savings') {
    return {
      id: 'legacy_savings',
      type: 'amount',
      label: isTravelPact(pact) ? '여행 예산' : '구매 예산',
      current: Math.max(0, Number(cfg.currentAmount) || 0),
      target: Math.max(0, Number(cfg.targetAmount) || Number(pact?.what?.cost) || 0),
      unit: '원',
      done: ratio(cfg.currentAmount, cfg.targetAmount || pact?.what?.cost) >= 1,
      note: '',
    };
  }
  if (trigger.type === 'time') {
    const progress = legacyPactProgress(pact);
    return {
      id: 'legacy_time',
      type: 'date',
      label: cfg.date ? `${cfg.date} 도래` : '날짜 도래',
      current: progress >= 1 ? 1 : 0,
      target: 1,
      unit: '',
      done: progress >= 1,
      dueDate: cfg.date || '',
      note: '',
    };
  }
  if (trigger.type === 'streak') {
    return {
      id: 'legacy_streak',
      type: 'number',
      label: cfg.metric || '루틴 달성',
      current: Math.max(0, Number(cfg.currentCount) || 0),
      target: Math.max(1, Number(cfg.count) || 1),
      unit: cfg.of === 'days' ? '일' : '회',
      done: ratio(cfg.currentCount, cfg.count) >= 1,
      note: '',
    };
  }
  if (trigger.type === 'measure') {
    const progress = legacyPactProgress(pact);
    return {
      id: 'legacy_measure',
      type: 'number',
      label: `${cfg.metric || '측정값'} ${cfg.op || '<='} ${cfg.value || 0}${cfg.unit || ''}`,
      current: Math.round(progress * 100),
      target: 100,
      unit: '%',
      done: progress >= 1,
      note: '',
    };
  }
  if (trigger.type === 'event') {
    return {
      id: 'legacy_event',
      type: 'check',
      label: cfg.eventName || '이벤트 완료',
      current: cfg.done ? 1 : 0,
      target: 1,
      unit: '',
      done: !!cfg.done,
      note: '',
    };
  }
  if (trigger.type === 'manual') {
    return {
      id: 'legacy_manual',
      type: 'check',
      label: '수동 확인',
      current: 1,
      target: 1,
      unit: '',
      done: true,
      note: '',
    };
  }
  return null;
}

export function suggestedTravelConditions(pact) {
  const legacy = legacyTriggerCondition(pact);
  const budgetCurrent = legacy?.type === 'amount'
    ? legacy.current
    : Math.max(0, Number(pact?.trigger?.config?.currentAmount) || 0);
  const budgetTarget = legacy?.type === 'amount'
    ? legacy.target
    : Math.max(0, Number(pact?.trigger?.config?.targetAmount) || Number(pact?.what?.cost) || 0);
  return [
    {
      id: 'travel_budget',
      type: 'amount',
      label: '여행 예산',
      current: budgetCurrent,
      target: budgetTarget,
      unit: '원',
      done: budgetTarget > 0 && budgetCurrent >= budgetTarget,
      note: '',
    },
    { id: 'travel_ticket', type: 'check', label: '항공권/동선 확정', current: 0, target: 1, unit: '', done: false, note: '' },
    { id: 'travel_stay', type: 'check', label: '숙소 후보 확정', current: 0, target: 1, unit: '', done: false, note: '' },
    { id: 'travel_schedule', type: 'check', label: '휴가/일정 확정', current: 0, target: 1, unit: '', done: false, note: '' },
  ];
}

export function isTravelPact(pact) {
  const text = [
    pact?.what?.title,
    pact?.what?.note,
    pact?.signature?.message,
    pact?.sourceUrl,
  ].filter(Boolean).join(' ').toLowerCase();
  return /일본|도쿄|오사카|교토|후쿠오카|여행|travel|japan|tokyo|osaka|kyoto/.test(text);
}

export function conditionProgress(condition) {
  if (!condition) return 0;
  if (condition.done) return 1;
  if (condition.type === 'date') {
    if (!condition.dueDate) return 0;
    const due = new Date(`${condition.dueDate}T23:59:59`).getTime();
    if (Number.isNaN(due)) return 0;
    const now = Date.now();
    if (now >= due) return 1;
    // 생성일이 있으면 그것을 기준, 없으면 만기일 90일 전을 기준으로 진행률 계산
    const createdMs = condition.createdAt ? timestampMs(condition.createdAt) : 0;
    const start = createdMs > 0 ? createdMs : due - 90 * 24 * 60 * 60 * 1000;
    if (now <= start) return 0.05;
    return Math.max(0.05, Math.min(0.97, (now - start) / (due - start)));
  }
  if (isBinaryConditionType(condition.type)) return condition.done ? 1 : 0;
  return ratio(condition.current, condition.target);
}

export function conditionValueLabel(condition) {
  return conditionRemainingLabel(condition);
}

export function choiceConditionSummary(stats = {}) {
  const conditions = Array.isArray(stats.conditions) ? stats.conditions : [];
  const primary = conditions.find(condition => conditionProgress(condition) < 1) || conditions[0];
  if (!primary) {
    return {
      label: '조건',
      badge: '조건',
      value: '조건 없음',
      meta: '0/0 조건',
    };
  }
  const value = conditionRemainingLabel(primary);
  const label = conditionTypeCardLabel(primary);
  return {
    label,
    badge: conditionBadgeLabel(primary),
    value,
    meta: `${stats.done || 0}/${stats.total || conditions.length} 조건 · ${label} ${value}`,
  };
}

export function conditionRemainingLabel(condition) {
  if (!condition) return '조건 없음';
  const current = Math.max(0, Number(condition.current) || 0);
  const target = Math.max(0, Number(condition.target) || 0);
  if (condition.type === 'date') return dateRemainingLabel(condition.dueDate, conditionProgress(condition) >= 1);
  if (condition.type === 'diet') return conditionProgress(condition) >= 1 ? '성공 완료' : '성공 여부 대기';
  if (condition.type === 'check') return conditionProgress(condition) >= 1 ? '완료' : '체크 필요';
  if (condition.type === 'amount') {
    if (!target) return '목표 금액 필요';
    const remain = Math.max(0, target - current);
    return remain ? `${fmtKRW(remain)} 남음` : '금액 완료';
  }
  const unit = condition.unit || '';
  if (!target) return '목표 수치 필요';
  const remain = Math.max(0, target - current);
  return remain ? `${remain.toLocaleString('ko-KR')}${unit} 남음` : '달성 완료';
}

export function dateRemainingLabel(value, done = false) {
  if (!value) return '날짜 미정';
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const due = new Date(`${value}T00:00:00`);
  if (Number.isNaN(due.getTime())) return value;
  const days = Math.ceil((due.getTime() - today.getTime()) / 86400000);
  if (done || days <= 0) return '오늘 도래';
  if (days === 1) return '내일 도래';
  return `D-${days}`;
}

export function conditionTypeCardLabel(condition) {
  if (!condition) return '조건';
  if (condition.type === 'amount') return '예산';
  if (condition.type === 'date') return '날짜';
  if (condition.type === 'diet') return '다이어트';
  if (condition.type === 'check') return '체크';
  if (condition.type === 'number') return condition.unit ? `수치(${condition.unit})` : '수치';
  return '조건';
}

export function conditionBadgeLabel(condition) {
  if (!condition) return '조건';
  if (condition.type === 'amount') return '예산';
  if (condition.type === 'date') return dateRemainingLabel(condition.dueDate, conditionProgress(condition) >= 1).replace(' 도래', '');
  if (condition.type === 'diet') return '식단';
  if (condition.type === 'check') return '체크';
  if (condition.type === 'number') return '수치';
  return '조건';
}

export function isDateConditionDue(value) {
  if (!value) return false;
  const due = new Date(`${value}T23:59:59`);
  return !Number.isNaN(due.getTime()) && Date.now() >= due.getTime();
}

export function hasPactTriggerConflict(next, pacts = []) {
  const nextSig = pactTriggerSignature(next);
  if (!nextSig) return false;
  return pacts.some(pact => {
    if (['fulfilled', 'broken', 'archived'].includes(pact.status)) return false;
    return pactTriggerSignature(pact) === nextSig;
  });
}

export function pactTriggerSignature(pact) {
  const trigger = pact?.trigger || {};
  const cfg = trigger.config || {};
  if (!trigger.type) return '';
  if (trigger.type === 'time') return cfg.date ? `time:${cfg.date}` : '';
  if (trigger.type === 'savings') return cfg.targetAmount ? `savings:${cfg.targetAmount}` : '';
  if (trigger.type === 'streak') return `streak:${cfg.metric || ''}:${cfg.count || ''}`;
  if (trigger.type === 'measure') return `measure:${cfg.metric || ''}:${cfg.op || ''}:${cfg.value || ''}:${cfg.unit || ''}`;
  if (trigger.type === 'event') return cfg.eventName ? `event:${String(cfg.eventName).toLowerCase()}` : '';
  return '';
}

export function effectivePactStatus(pact) {
  if (['fulfilled', 'broken', 'archived'].includes(pact.status)) return pact.status;
  if (isPactOverdue(pact)) return 'broken';
  const stats = pactConditionStats(pact);
  if (stats.ready) return 'ready';
  if (stats.progress >= 0.5) return 'ripening';
  return 'active';
}

export function isPactOverdue(pact) {
  const cfg = pact.trigger?.config || {};
  if (pact.trigger?.type !== 'time' || !cfg.date) return false;
  const due = new Date(`${cfg.date}T23:59:59`);
  return !Number.isNaN(due.getTime()) && Date.now() - due.getTime() > 14 * 86400000;
}

export function ratio(current, target) {
  const t = Number(target) || 0;
  if (!t) return 0;
  return Math.max(0, Math.min(1, (Number(current) || 0) / t));
}

export function timestampMs(value) {
  if (!value) return 0;
  if (value.toMillis) return value.timestampMs();
  if (value.seconds) return value.seconds * 1000;
  const ms = new Date(value).getTime();
  return Number.isNaN(ms) ? 0 : ms;
}

export function triggerLabel(pact) {
  const conditions = pactConditions(pact);
  if (conditions.length > 1) {
    const done = conditions.filter(condition => conditionProgress(condition) >= 1).length;
    return `${done}/${conditions.length} 조건`;
  }
  const t = pact.trigger?.type;
  const cfg = pact.trigger?.config || {};
  if (t === 'time') return cfg.date || '날짜';
  if (t === 'savings') return `${fmtKRW(cfg.currentAmount || 0)} / ${fmtKRW(cfg.targetAmount || 0)}`;
  if (t === 'streak') return `${cfg.metric || '스트릭'} ${cfg.currentCount || 0}/${cfg.count || 0}`;
  if (t === 'measure') return `${cfg.metric || '측정'} ${cfg.currentValue || 0}${cfg.unit || ''} → ${cfg.value || 0}${cfg.unit || ''}`;
  if (t === 'event') return cfg.eventName || '이벤트';
  return '수동';
}

export function triggerIcon(type) {
  if (type === 'time') return '◷';
  if (type === 'savings') return '₩';
  if (type === 'streak') return '▰';
  if (type === 'measure') return '↗';
  if (type === 'event') return '◆';
  return '✓';
}

export function pactCategoryLabel(value) {
  if (value === 'experience') return '경험';
  if (value === 'action') return '행동';
  if (value === 'relation') return '관계';
  if (value === 'restraint') return '금지';
  return '구매';
}

export function pactCategoryToTxCategory(value) {
  if (value === 'experience') return '여가·취미';
  if (value === 'action') return '생활비용';
  if (value === 'relation') return '식비';
  if (value === 'restraint') return '와인/야식';
  return '취미/여가/의류/쇼핑/기타';
}

export function pactCostSourceLabel(value) {
  if (value === 'mindbank') return '감각뱅크';
  if (value === 'envelope') return '저축통';
  if (value === 'external') return '외부 지원';
  return '예산';
}

export function pactCooloffLabel(pact) {
  const hours = Math.max(0, Number(pact.signature?.cooloffHours) || 0);
  if (!hours) return '없음';
  const created = timestampMs(pact.createdAt);
  if (!created) return `${hours}시간`;
  const end = created + hours * 3600000;
  const remain = end - Date.now();
  if (remain <= 0) return '종료됨';
  const remainHours = Math.ceil(remain / 3600000);
  return `${remainHours}시간 남음`;
}

export function statusLabel(value) {
  if (value === 'ready') return '실현 가능';
  if (value === 'ripening') return '숙성 중';
  if (value === 'fulfilled') return '실현됨';
  if (value === 'broken') return '깨짐';
  if (value === 'archived') return '보관됨';
  return '진행 중';
}

export function statusMessage(value) {
  if (value === 'ready') return '조건을 채웠어요. 이제 실행 여부를 결정할 차례입니다.';
  if (value === 'ripening') return '절반 이상 왔습니다. 충동이 아니라 계획으로 바뀌는 중이에요.';
  if (value === 'fulfilled') return '지킨 약속으로 남겨두었습니다.';
  if (value === 'broken') return '깨진 약속도 다음 판단의 데이터입니다.';
  return '미래의 나와 합의한 조건을 따라갑니다.';
}

