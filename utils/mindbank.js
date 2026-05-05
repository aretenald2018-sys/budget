// ================================================================
// utils/mindbank.js — Mind Bank summaries and fallback alternatives
// ================================================================

export function summarizeMindbank(entries = []) {
  const total = entries.reduce((sum, entry) => sum + (Number(entry.savedAmount) || 0), 0);
  const totalKcalSaved = entries.reduce((sum, entry) => sum + (Number(entry.savedKcal) || 0), 0);
  const goodChoices = entries.filter(entry => (Number(entry.savedAmount) || 0) > 0 || ['scheduled', 'pact_fulfilled'].includes(entry.choiceType)).length;
  const urges = entries.length;
  const bypassRate = urges ? Math.round((goodChoices / urges) * 100) : 0;
  return { total, totalKcalSaved, goodChoices, urges, bypassRate };
}

export function buildFallbackAlternatives({ what, price = 0, category, mood, desireType, originalPortion, plannedPortion }) {
  if (isWineUrge({ what, category })) return buildWineAlternatives({ what, price });
  if (desireType === 'eat') return buildEatingAlternatives({ what, price, originalPortion, plannedPortion });
  if (desireType === 'sense') return buildSensoryAlternatives({ what, price });
  const stress = /긴장|허전|지쳐|보상/.test(String(mood || ''));
  const activityA = stress
    ? { id: 'walk', type: 'substitute', emoji: '◌', title: '짧은 산책 (15분)', desc: '바람을 쐬고 와도 괜찮아요. 마음이 조금 가라앉은 뒤 다시 봐요.', savedAmount: price, badge: '균형 선택' }
    : { id: 'pause', type: 'pause', emoji: '✦', title: '10분만 미루기', desc: '장바구니에 담아두고 물 한 잔 마신 뒤 다시 선택해요.', savedAmount: price, badge: '잠깐 멈춤' };
  const activityB = {
    id: 'drive',
    type: 'substitute',
    emoji: '◇',
    title: stress ? '밤 드라이빙' : '가벼운 루틴 바꾸기',
    desc: stress ? '목적지는 짧게 잡고 돌아와요. 다녀와서도 마음이 같으면 그때 다시 봐도 돼요.' : '집 근처에서 기분 전환할 수 있는 작은 루틴을 골라봐요.',
    savedAmount: price,
    badge: stress ? '스트레스 우회' : '균형 선택',
  };
  const reduced = price ? Math.max(0, Math.round(price * 0.375 / 1000) * 1000) : 0;
  const reducedPrice = Math.max(0, price - reduced);
  return [
    activityA,
    activityB,
    {
      id: 'reduce',
      type: 'reduce',
      emoji: category?.includes('와인') ? '◈' : '◒',
      title: reducedPrice > 0 ? `${reducedPrice.toLocaleString('ko-KR')}원짜리 선택` : '더 가벼운 선택',
      desc: '같은 만족을 남기되 이번 선택의 무게만 조금 줄여요.',
      savedAmount: reduced,
      badge: '가벼운 선택',
    },
    {
      id: 'allow',
      type: 'allow',
      emoji: category?.includes('와인') ? '◈' : '◌',
      title: `그래도 ${what || '사고 싶은 것'} 살래요`,
      desc: '한 번의 선택일 뿐이에요. 거래가 들어오면 연결해서 기록할게요.',
      savedAmount: 0,
      badge: '한 번의 선택',
    },
  ];
}

function buildEatingAlternatives({ what, price, originalPortion, plannedPortion }) {
  const kcal = estimateLocalKcalSaving({ what, originalPortion, plannedPortion });
  return [
    {
      id: 'savor-eat',
      type: 'allow',
      emoji: '◌',
      title: '의식적으로 맛보기',
      desc: `${what || '먹고 싶은 것'}을 금지하지 않고, 첫 맛과 만족감을 천천히 느끼기로 해요.`,
      savedAmount: 0,
      savedKcal: 0,
      badge: '향유 선택',
    },
    {
      id: 'portion',
      type: 'reduce',
      emoji: '◒',
      title: '양을 작게 해서 즐기기',
      desc: '욕구를 없애기보다 몸이 편한 만큼만 맛봐요.',
      savedAmount: price ? Math.round(price * 0.35 / 1000) * 1000 : 0,
      savedKcal: Math.round(kcal * 0.65),
      badge: '가벼운 향유',
    },
    {
      id: 'sensory-check',
      type: 'substitute',
      emoji: '✦',
      title: '몸 감각 먼저 확인하기',
      desc: '배고픔인지, 피곤함인지, 자극이 필요한 건지 물 한 잔 마시고 5분만 느껴봐요.',
      savedAmount: price || 0,
      savedKcal: kcal,
      badge: '감각 확인',
    },
    {
      id: 'later-note',
      type: 'pause',
      emoji: '✎',
      title: '먹고 싶은 이유만 남기기',
      desc: '지금의 맛 욕구를 기록해두고, 조금 뒤에도 같으면 다시 선택해요.',
      savedAmount: price || 0,
      savedKcal: kcal,
      badge: '욕구 기록',
    },
  ];
}

export function estimateLocalKcalSaving({ what = '', originalPortion = '', plannedPortion = '' } = {}) {
  const text = [what, originalPortion, plannedPortion].join(' ').toLowerCase();
  const base = [
    [/팝콘|popcorn/, 520],
    [/치킨|닭강정|fried chicken/, 290],
    [/피자|pizza/, 270],
    [/라면|ramen/, 500],
    [/떡볶이/, 220],
    [/케이크|cake/, 360],
    [/초콜릿|chocolate/, 540],
    [/아이스크림|ice.?cream/, 210],
    [/과자|스낵|칩|chip/, 520],
    [/버거|햄버거|burger/, 260],
    [/와인|wine/, 85],
  ].find(([re]) => re.test(text))?.[1] || 300;
  const originalG = parsePortionGrams(originalPortion || what, 250);
  const plannedG = parsePortionGrams(plannedPortion, Math.round(originalG * 0.35));
  return Math.max(0, Math.round((originalG - plannedG) * base / 100));
}

function parsePortionGrams(value, fallback) {
  const text = String(value || '').toLowerCase();
  const gram = text.match(/(\d+(?:\.\d+)?)\s*(g|그램|그람)/);
  if (gram) return Math.round(Number(gram[1]));
  const kg = text.match(/(\d+(?:\.\d+)?)\s*(kg|킬로)/);
  if (kg) return Math.round(Number(kg[1]) * 1000);
  if (/라지|large|전체|한\s*통|한통/.test(text)) return 250;
  if (/미디엄|medium|보통/.test(text)) return 180;
  if (/스몰|small|작게|조금|소량/.test(text)) return 100;
  if (/반|절반/.test(text)) return Math.round(fallback * 0.5);
  return fallback;
}

function buildSensoryAlternatives({ what, price }) {
  return [
    {
      id: 'savor-sense',
      type: 'allow',
      emoji: '✦',
      title: '그 감각을 의식적으로 누리기',
      desc: `${what || '필요한 감각'}을 억누르지 않고, 몸에서 어떻게 느껴지는지 기록해요.`,
      savedAmount: 0,
      badge: '감각 향유',
    },
    {
      id: 'warm-reset',
      type: 'substitute',
      emoji: '◒',
      title: '따뜻한 감각으로 바꾸기',
      desc: '샤워, 차, 담요처럼 몸을 직접 풀어주는 감각으로 먼저 돌려봐요.',
      savedAmount: price || 0,
      badge: '감각 전환',
    },
    {
      id: 'music-light',
      type: 'substitute',
      emoji: '◇',
      title: '소리와 빛 바꾸기',
      desc: '음악, 조명, 산책처럼 돈과 무관한 감각을 10분만 만들어봐요.',
      savedAmount: price || 0,
      badge: '환경 조절',
    },
    {
      id: 'sense-note',
      type: 'pause',
      emoji: '✎',
      title: '감각 이름 붙이기',
      desc: '바삭함, 따뜻함, 쌉싸름함, 부드러움처럼 지금 원하는 감각을 단어로 남겨요.',
      savedAmount: price || 0,
      badge: '욕구 기록',
    },
  ];
}

function buildWineAlternatives({ what, price }) {
  const reduced = price ? Math.max(0, Math.round(price * 0.35 / 1000) * 1000) : 0;
  const reducedPrice = Math.max(0, price - reduced);
  return [
    {
      id: 'savor',
      type: 'allow',
      emoji: '◈',
      title: '오늘 의식적으로 향유하기',
      desc: '금지하지 않고, 이 병을 고른 이유와 기대하는 감각을 남겨요. 구매 후 셀러에 담을 수 있어요.',
      savedAmount: 0,
      badge: '향유 선택',
    },
    {
      id: 'cellar',
      type: 'pause',
      emoji: '✎',
      title: '셀러 후보로 담아두기',
      desc: `${what || '그 와인'}을 바로 사지 않고, 마시고 싶은 이유만 먼저 적어둬요.`,
      savedAmount: price,
      badge: '취향 보류',
    },
    {
      id: 'reduce',
      type: 'reduce',
      emoji: '◈',
      title: reducedPrice > 0 ? `${reducedPrice.toLocaleString('ko-KR')}원대 병으로 즐기기` : '더 가벼운 병으로 즐기기',
      desc: '향유는 살리고 선택의 무게만 낮춰요. 감각을 줄이는 게 아니라 밀도를 조절하는 선택이에요.',
      savedAmount: reduced,
      badge: '가벼운 향유',
    },
    {
      id: 'sensory-routine',
      type: 'substitute',
      emoji: '✦',
      title: '오늘은 다른 감각으로 돌리기',
      desc: '향, 온도, 음악처럼 바로 느낄 수 있는 감각으로 몸을 먼저 풀어줘요.',
      savedAmount: price,
      badge: '감각 전환',
    },
  ];
}

function isWineUrge({ what, category }) {
  return /와인|wine|주류|바틀|보틀|피노|샤르도네|리슬링|까베르네|메를로|피노누아/i
    .test([what, category].filter(Boolean).join(' '));
}

export function badgesForChoice(choice, urge, similarCount = 0) {
  if (choice.type === 'allow') return ['한 번의 선택'];
  if (choice.type === 'savor') return ['향유 기록'];
  const badges = ['균형 선택'];
  if (urge?.mood) badges.push(`${urge.mood} 돌봄`);
  if (similarCount > 0) badges.push(`${similarCount + 1}번째 ${choice.title.replace(/\s*\(.+\)/, '')}`);
  return badges.slice(0, 3);
}

export function weekdayPattern(urges = []) {
  const labels = ['일', '월', '화', '수', '목', '금', '토'];
  const counts = labels.map(label => ({ label, count: 0 }));
  for (const urge of urges) {
    const date = normalizeDate(urge.occurredAt || urge.createdAt);
    if (date) counts[date.getDay()].count += 1;
  }
  const max = Math.max(1, ...counts.map(row => row.count));
  return counts.map(row => ({ ...row, pct: Math.round((row.count / max) * 100) }));
}

export function normalizeDate(value) {
  if (!value) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (value.toDate) return value.toDate();
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}
