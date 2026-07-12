import {
  extractCandidateIngredientsFromText,
  recipePresetPreviewFromText,
} from '../shared/recipe/autofill.js?v=verify-recipe-autofill';

const samples = [
  ['김치찌개 레시피', '김치찌개', 3],
  ['초간단 청양고추 계란말이', '계란말이', 3],
  ['라자냐 만드는 법', '라자냐', 4],
  ['마파두부 덮밥', '마파두부', 4],
  ['오므라이스 도시락', '오므라이스', 4],
  ['브라우니 홈베이킹', '브라우니', 4],
  ['떡볶이 황금레시피', '떡볶이', 4],
  ['잡채 쉽게 만들기', '잡채', 4],
  ['봉골레 파스타', '봉골레', 4],
  ['카츠동 한 그릇', '카츠동', 4],
  ['두부 청양고추 간장 다이어트 반찬', '후보 재료 레시피', 2],
];

let passed = 0;

for (const [text, expectedTitle, minIngredients] of samples) {
  const preview = recipePresetPreviewFromText(text, 'https://youtu.be/abcdefghijk');
  const ingredients = preview?.ingredients || [];
  const ok = preview?.title === expectedTitle && ingredients.length >= minIngredients;
  if (!ok) {
    throw new Error(`${text}: expected ${expectedTitle} with ${minIngredients}+ ingredients, got ${preview?.title || 'null'} with ${ingredients.length}`);
  }
  passed += 1;
}

const candidateNames = extractCandidateIngredientsFromText('초간단 청양고추 계란말이').map(row => row.name);
if (!candidateNames.includes('청양고추') || !candidateNames.includes('계란')) {
  throw new Error(`candidate extraction failed: ${candidateNames.join(', ')}`);
}

console.log(`verify-recipe-autofill passed (${passed} samples).`);
