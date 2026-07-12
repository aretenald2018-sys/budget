export const UNASSIGNED_SUBCATEGORY_LABEL = '상세분류 미지정';

const DEFAULT_SUBCATEGORY_OPTIONS_BY_CATEGORY = {
  교통비용: [
    { id: 'public_transit', name: '대중교통' },
    { id: 'taxi', name: '택시' },
    { id: 'transport_card_recharge', name: '교통카드충전' },
    { id: 'other_transport', name: '기타교통' },
  ],
};

export function isUnassignedSubcategory(value) {
  const normalized = String(value || '').trim();
  return !normalized || normalized === UNASSIGNED_SUBCATEGORY_LABEL;
}

export function normalizeSubcategoryOptions(value) {
  return Array.isArray(value)
    ? value.map((item, index) => typeof item === 'string'
      ? { id: `legacy_${index}`, name: item }
      : { id: item.id || `legacy_${index}`, name: item.name || '' })
      .filter(item => String(item.name || '').trim())
    : [];
}

export function subcategoryOptionsForCategory(category) {
  const existing = normalizeSubcategoryOptions(category?.subcategories);
  const defaults = DEFAULT_SUBCATEGORY_OPTIONS_BY_CATEGORY[category?.name] || [];
  const missingDefaults = defaults.filter(sub => !existing.some(item => item.name === sub.name));
  return [...existing, ...missingDefaults];
}
