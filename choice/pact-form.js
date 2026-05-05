import { legacyTriggerCondition } from './conditions.js?v=20260505-visual-modal';

export const PACT_TRIGGER_ORDER = ['time', 'savings', 'streak', 'measure', 'event', 'manual'];

export function getSelectedPactTriggerTypes(form) {
  const selected = [...form.querySelectorAll('input[name="triggerType"]:checked')]
    .map(input => input.value);
  return normalizePactTriggerTypes(selected);
}

export function selectedTriggerTypesFromFormData(fd) {
  return normalizePactTriggerTypes(fd.getAll('triggerType'));
}

export function normalizePactTriggerTypes(values) {
  const selected = values
    .map(value => String(value || '').trim())
    .filter(value => PACT_TRIGGER_ORDER.includes(value));
  const unique = PACT_TRIGGER_ORDER.filter(type => selected.includes(type));
  if (!unique.length) return ['manual'];
  if (unique.includes('manual') && unique.length > 1) return unique.filter(type => type !== 'manual');
  return unique;
}

export function primaryPactTriggerType(triggerTypes) {
  const selected = normalizePactTriggerTypes(triggerTypes);
  return selected.find(type => type !== 'manual') || 'manual';
}

export function formDataToPact(fd) {
  const triggerTypes = selectedTriggerTypesFromFormData(fd);
  const type = primaryPactTriggerType(triggerTypes);
  const pact = {
    what: {
      title: fd.get('title'),
      category: fd.get('category'),
      cost: numberFromInput(fd.get('cost')),
      note: '',
    },
    trigger: { type, config: triggerConfigFromForm(type, fd) },
    cost: { source: fd.get('costSource') || 'mindbank' },
    signature: { message: fd.get('message') || '', cooloffHours: 24 },
    status: 'active',
  };
  pact.conditions = pactConditionsFromTriggerTypes(pact, triggerTypes, fd);
  return pact;
}

export function pactConditionsFromTriggerTypes(pact, triggerTypes, fd) {
  return normalizePactTriggerTypes(triggerTypes)
    .map(type => legacyTriggerCondition({
      ...pact,
      trigger: { type, config: triggerConfigFromForm(type, fd) },
    }))
    .filter(Boolean);
}

export function triggerConfigFromForm(type, fd) {
  if (type === 'time') return { date: fd.get('date'), recurrence: 'none' };
  if (type === 'savings') return { targetAmount: numberFromInput(fd.get('targetAmount')), currentAmount: numberFromInput(fd.get('currentAmount')) };
  if (type === 'streak') return { metric: fd.get('streakMetric') || fd.get('metric'), count: numberFromInput(fd.get('count')) || 1, currentCount: numberFromInput(fd.get('currentCount')), of: 'days' };
  if (type === 'measure') return { metric: fd.get('measureMetric') || fd.get('metric'), op: fd.get('op') || '<=', value: Number(fd.get('value')) || 0, currentValue: Number(fd.get('currentValue')) || 0, unit: fd.get('unit') };
  if (type === 'event') return { eventName: fd.get('eventName'), done: false };
  return { manual: true, done: false };
}

export function numberFromInput(value) {
  return Math.max(0, Math.round(Number(String(value || '').replace(/[^\d.-]/g, '')) || 0));
}
