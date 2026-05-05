import {
  isBinaryConditionType,
  normalizeChoiceConditionType,
  pactConditions,
} from './conditions.js?v=20260505-visual-modal';
import { numberFromInput } from './pact-form.js?v=20260505-visual-modal';

export function itemConditionsFromForm(item, fd, fallbackConditions) {
  const conditions = conditionIdsFromForm(fd)
    .map(id => conditionFromForm(id, fd))
    .filter(Boolean);
  const next = newConditionFromForm(fd);
  if (next) conditions.push(next);
  if (conditions.length) return conditions;
  return fallbackConditions ? fallbackConditions(item) : [];
}

export function pactConditionsFromForm(pact, fd) {
  const conditions = conditionIdsFromForm(fd)
    .map(id => conditionFromForm(id, fd))
    .filter(Boolean);
  const next = newConditionFromForm(fd);
  if (next) conditions.push(next);
  if (conditions.length) return conditions;
  return pactConditions(pact);
}

export function conditionFromForm(id, fd) {
  const type = normalizeChoiceConditionType(fd.get(`conditionType:${id}`));
  const label = String(fd.get(`conditionLabel:${id}`) || '').trim();
  if (!label) return null;
  const done = fd.get(`conditionDone:${id}`) === 'on';
  if (isBinaryConditionType(type)) {
    return {
      id,
      type,
      label,
      current: done ? 1 : 0,
      target: 1,
      unit: '',
      done,
      dueDate: String(fd.get(`conditionDueDate:${id}`) || '').trim(),
      note: String(fd.get(`conditionNote:${id}`) || '').trim(),
    };
  }
  return {
    id,
    type,
    label,
    current: numberFromInput(fd.get(`conditionCurrent:${id}`)),
    target: numberFromInput(fd.get(`conditionTarget:${id}`)),
    unit: String(fd.get(`conditionUnit:${id}`) || (type === 'amount' ? '원' : '')).trim(),
    done,
    note: String(fd.get(`conditionNote:${id}`) || '').trim(),
  };
}

export function newConditionFromForm(fd) {
  const label = String(fd.get('newConditionLabel') || '').trim();
  if (!label) return null;
  const type = normalizeChoiceConditionType(fd.get('newConditionType'));
  const done = fd.get('newConditionDone') === 'on';
  const dueDate = String(fd.get('newConditionDueDate') || '').trim();
  if (isBinaryConditionType(type)) {
    return {
      id: makeConditionId(),
      type,
      label,
      current: done ? 1 : 0,
      target: 1,
      unit: '',
      done,
      dueDate,
      note: '',
    };
  }
  const target = numberFromInput(fd.get('newConditionTarget'));
  const current = Math.max(
    numberFromInput(fd.get('newConditionCurrent')),
    done && target ? target : 0,
  );
  return {
    id: makeConditionId(),
    type,
    label,
    current,
    target,
    unit: String(fd.get('newConditionUnit') || (type === 'amount' ? '원' : '')).trim(),
    done,
    note: '',
  };
}

function conditionIdsFromForm(fd) {
  return String(fd.get('conditionIds') || '').split(',').map(id => id.trim()).filter(Boolean);
}

function makeConditionId() {
  return `cond_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}
