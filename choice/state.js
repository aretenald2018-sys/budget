export const STATE = {
  segment: localStorage.getItem('budget.planSegment') || 'want',
  filter: 'all',
  pactFilter: 'active',
  bankRange: localStorage.getItem('budget.choiceBankRange') || 'biweek',
  heroIndex: 0,
  actionSheetTarget: null,
  reflectionTarget: null,
  visualPickerItemId: null,
  visualPickerPactId: null,
  visualSearchQueries: {},
  visualCandidates: {},
  visualCandidateSources: {},
  items: [],
  pacts: [],
  categories: [],
  mindbankEntries: [],
  urges: [],
};

export const LEGACY_CATEGORY_LABELS = {
  buy: '기타',
  eat: '식재료',
  wear: '의류',
  wine: '와인',
  home: '생활',
  other: '기타',
};

export const FALLBACK_CART_CATEGORIES = [
  { id: 'wear', name: '의류', emoji: '👕' },
  { id: 'eat', name: '식재료', emoji: '🥬' },
  { id: 'wine', name: '와인', emoji: '🍷' },
  { id: 'home', name: '생활', emoji: '🧺' },
  { id: 'other', name: '기타', emoji: '□' },
];
