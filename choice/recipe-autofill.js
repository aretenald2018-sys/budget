// ================================================================
// choice/recipe-autofill.js - static-host recipe metadata fallback
// ================================================================

import {
  domainFromUrl,
  safeExternalUrl,
} from './share-preview.js?v=20260514-vercel-api';

const YOUTUBE_OEMBED_ENDPOINT = 'https://www.youtube.com/oembed?format=json&url=';
const NOEMBED_ENDPOINT = 'https://noembed.com/embed?url=';

const BASE_PRESETS = [
  {
    pattern: /(광어|흰살생선|white\s*fish).{0,16}(카르파|carpaccio)|카르파.{0,16}(광어|흰살생선|white\s*fish)/i,
    title: '광어 카르파초',
    summary: '영상 제목에서 광어 카르파초로 인식해 기본 재료 후보를 채웠어요.',
    ingredients: [
      ['광어', '회 또는 필렛'],
      ['올리브오일', ''],
      ['레몬즙', ''],
      ['소금', ''],
      ['후추', ''],
      ['딜', '선택'],
      ['핑크페퍼', '선택'],
      ['래디시', '선택'],
    ],
    steps: ['광어를 얇게 펼치기', '올리브오일과 레몬즙을 뿌리기', '소금, 후추, 허브로 마무리하기'],
  },
  {
    pattern: /(연어).{0,16}(카르파|carpaccio)|카르파.{0,16}(연어)/i,
    title: '연어 카르파초',
    summary: '영상 제목에서 연어 카르파초로 인식해 기본 재료 후보를 채웠어요.',
    ingredients: [
      ['연어', ''],
      ['올리브오일', ''],
      ['레몬즙', ''],
      ['소금', ''],
      ['후추', ''],
      ['케이퍼', '선택'],
      ['딜', '선택'],
    ],
    steps: ['연어를 얇게 펼치기', '오일과 산미를 더하기', '허브와 향신료로 마무리하기'],
  },
  {
    pattern: /(알리오\s*올리오|aglio|오일\s*파스타)/i,
    title: '알리오 올리오',
    summary: '영상 제목에서 오일 파스타로 인식해 기본 재료 후보를 채웠어요.',
    ingredients: [
      ['파스타면', ''],
      ['마늘', ''],
      ['올리브오일', ''],
      ['페페론치노', ''],
      ['소금', ''],
      ['후추', '선택'],
      ['파슬리', '선택'],
    ],
    steps: ['면 삶기', '마늘과 오일 향 내기', '면수와 함께 섞기'],
  },
  {
    pattern: /(토마토).{0,12}(파스타)|파스타.{0,12}(토마토)/i,
    title: '토마토 파스타',
    summary: '영상 제목에서 토마토 파스타로 인식해 기본 재료 후보를 채웠어요.',
    ingredients: [
      ['파스타면', ''],
      ['토마토소스', ''],
      ['마늘', ''],
      ['양파', '선택'],
      ['올리브오일', ''],
      ['소금', ''],
      ['후추', ''],
    ],
    steps: ['면 삶기', '소스를 데우고 재료 볶기', '면과 소스를 섞기'],
  },
  {
    pattern: /(다이어트|저칼로리|단백질).{0,16}(파스타)|파스타.{0,16}(다이어트|저칼로리|단백질)/i,
    title: '다이어트 파스타',
    summary: '영상 제목에서 파스타 레시피로 인식해 기본 재료 후보를 채웠어요.',
    ingredients: [
      ['파스타면', ''],
      ['올리브오일', ''],
      ['마늘', '선택'],
      ['방울토마토', '선택'],
      ['닭가슴살', '선택'],
      ['소금', ''],
      ['후추', ''],
    ],
    steps: ['면을 삶기', '오일과 재료를 가볍게 볶기', '면과 함께 섞어 간 맞추기'],
  },
  {
    pattern: /(된장찌개|된장\s*찌개)/i,
    title: '된장찌개',
    summary: '영상 제목에서 된장찌개로 인식해 기본 재료 후보를 채웠어요.',
    ingredients: [
      ['된장', ''],
      ['두부', ''],
      ['애호박', ''],
      ['양파', ''],
      ['대파', ''],
      ['마늘', ''],
      ['멸치육수', ''],
    ],
    steps: ['육수 끓이기', '된장을 풀고 채소 넣기', '두부와 대파로 마무리하기'],
  },
  {
    pattern: /(김치찌개|김치\s*찌개)/i,
    title: '김치찌개',
    summary: '영상 제목에서 김치찌개로 인식해 기본 재료 후보를 채웠어요.',
    ingredients: [
      ['김치', ''],
      ['돼지고기', '선택'],
      ['두부', ''],
      ['대파', ''],
      ['마늘', ''],
      ['고춧가루', ''],
      ['국간장', '선택'],
    ],
    steps: ['김치와 고기 볶기', '물을 넣고 끓이기', '두부와 대파로 마무리하기'],
  },
  {
    pattern: /(카레|curry)/i,
    title: '카레',
    summary: '영상 제목에서 카레로 인식해 기본 재료 후보를 채웠어요.',
    ingredients: [
      ['카레가루', ''],
      ['양파', ''],
      ['감자', ''],
      ['당근', ''],
      ['고기', '선택'],
      ['버터', '선택'],
    ],
    steps: ['재료 볶기', '물을 넣고 익히기', '카레를 풀어 농도 맞추기'],
  },
  {
    pattern: /(스테이크|steak)/i,
    title: '스테이크',
    summary: '영상 제목에서 스테이크로 인식해 기본 재료 후보를 채웠어요.',
    ingredients: [
      ['스테이크용 소고기', ''],
      ['소금', ''],
      ['후추', ''],
      ['버터', ''],
      ['마늘', '선택'],
      ['로즈마리', '선택'],
    ],
    steps: ['고기 밑간하기', '팬에 굽기', '버터와 허브로 베이스팅하기'],
  },
];

const EXTRA_PRESETS = [
  preset(/(떡볶이|tteokbokki)/i, '떡볶이', [['떡볶이떡', ''], ['어묵', ''], ['고추장', ''], ['고춧가루', ''], ['설탕', ''], ['대파', '']], ['양념장 풀기', '떡과 어묵 넣고 졸이기', '대파로 마무리하기']),
  preset(/(라볶이|라면.{0,8}떡볶이)/i, '라볶이', [['라면사리', ''], ['떡볶이떡', ''], ['어묵', ''], ['고추장', ''], ['대파', '']], ['떡볶이 국물을 만들기', '떡과 어묵을 먼저 익히기', '라면사리를 넣어 마무리하기']),
  preset(/(순두부찌개|순두부\s*찌개)/i, '순두부찌개', [['순두부', ''], ['돼지고기', '선택'], ['계란', ''], ['대파', ''], ['고춧가루', ''], ['마늘', '']], ['고추기름 내기', '육수와 순두부 넣고 끓이기', '계란과 대파로 마무리하기']),
  preset(/(부대찌개|부대\s*찌개)/i, '부대찌개', [['햄', ''], ['소시지', ''], ['김치', ''], ['두부', '선택'], ['라면사리', ''], ['고추장', '']], ['재료를 냄비에 담기', '양념과 육수를 넣고 끓이기', '라면사리를 넣어 마무리하기']),
  preset(/(미역국|미역\s*국)/i, '미역국', [['미역', ''], ['소고기', '선택'], ['국간장', ''], ['참기름', ''], ['마늘', '']], ['미역 불리기', '고기와 미역을 볶기', '물을 넣고 푹 끓이기']),
  preset(/(소고기무국|무국|무\s*국)/i, '소고기무국', [['무', ''], ['소고기', ''], ['대파', ''], ['마늘', ''], ['국간장', '']], ['소고기와 무 볶기', '물을 넣고 끓이기', '대파로 마무리하기']),
  preset(/(갈비찜|갈비\s*찜)/i, '갈비찜', [['소갈비', ''], ['간장', ''], ['설탕', ''], ['배', '선택'], ['무', ''], ['당근', '']], ['갈비 핏물 빼기', '양념에 재우기', '채소와 함께 부드럽게 조리기']),
  preset(/(제육볶음|제육\s*볶음)/i, '제육볶음', [['돼지고기', ''], ['고추장', ''], ['고춧가루', ''], ['간장', ''], ['양파', ''], ['대파', '']], ['고기에 양념하기', '채소와 함께 볶기', '불맛 나게 마무리하기']),
  preset(/(불고기|bulgogi)/i, '불고기', [['소고기', ''], ['간장', ''], ['설탕', ''], ['배', '선택'], ['양파', ''], ['대파', '']], ['고기를 양념에 재우기', '채소와 함께 볶기', '국물 농도 맞추기']),
  preset(/(닭볶음탕|닭도리탕)/i, '닭볶음탕', [['닭고기', ''], ['감자', ''], ['당근', ''], ['양파', ''], ['고추장', ''], ['간장', '']], ['닭을 데치기', '양념과 채소를 넣고 끓이기', '국물을 졸여 마무리하기']),
  preset(/(닭갈비|닭\s*갈비)/i, '닭갈비', [['닭다리살', ''], ['고추장', ''], ['양배추', ''], ['고구마', '선택'], ['깻잎', ''], ['떡', '선택']], ['닭을 양념에 버무리기', '채소와 함께 볶기', '깻잎을 넣어 마무리하기']),
  preset(/(잡채|japchae)/i, '잡채', [['당면', ''], ['소고기', '선택'], ['시금치', ''], ['당근', ''], ['양파', ''], ['간장', ''], ['참기름', '']], ['당면 삶기', '채소와 고기 볶기', '양념에 버무리기']),
  preset(/(비빔밥|bibimbap)/i, '비빔밥', [['밥', ''], ['고추장', ''], ['계란', ''], ['시금치', '선택'], ['콩나물', '선택'], ['당근', '선택']], ['나물 준비하기', '밥 위에 재료 올리기', '고추장과 참기름으로 비비기']),
  preset(/(김밥|kimbap)/i, '김밥', [['김', ''], ['밥', ''], ['단무지', ''], ['계란', ''], ['당근', ''], ['햄', '선택']], ['밥 밑간하기', '김 위에 재료 올리기', '단단히 말아 썰기']),
  preset(/(계란말이|달걀말이|omelette)/i, '계란말이', [['계란', ''], ['대파', '선택'], ['청양고추', '선택'], ['소금', ''], ['식용유', '']], ['계란물 풀기', '약불에서 접어가며 익히기', '한 김 식힌 뒤 썰기']),
  preset(/(김치볶음밥|김치\s*볶음밥)/i, '김치볶음밥', [['밥', ''], ['김치', ''], ['대파', ''], ['계란', '선택'], ['고춧가루', '선택'], ['참기름', '']], ['대파와 김치 볶기', '밥을 넣고 볶기', '계란과 참기름으로 마무리하기']),
  preset(/(볶음밥|fried\s*rice)/i, '볶음밥', [['밥', ''], ['계란', ''], ['대파', ''], ['당근', '선택'], ['간장', ''], ['식용유', '']], ['대파기름 내기', '계란과 밥을 볶기', '간장으로 간 맞추기']),
  preset(/(김치전|김치\s*전)/i, '김치전', [['김치', ''], ['부침가루', ''], ['물', ''], ['대파', '선택'], ['식용유', '']], ['반죽 만들기', '김치를 섞기', '팬에 바삭하게 부치기']),
  preset(/(부추전|부추\s*전)/i, '부추전', [['부추', ''], ['부침가루', ''], ['양파', '선택'], ['청양고추', '선택'], ['식용유', '']], ['반죽 만들기', '부추와 채소 섞기', '얇게 부쳐 마무리하기']),
  preset(/(비빔국수|비빔\s*국수)/i, '비빔국수', [['소면', ''], ['고추장', ''], ['식초', ''], ['설탕', ''], ['오이', '선택'], ['계란', '선택']], ['면 삶아 헹구기', '양념장 만들기', '면과 고명을 버무리기']),
  preset(/(잔치국수|잔치\s*국수)/i, '잔치국수', [['소면', ''], ['멸치육수', ''], ['애호박', '선택'], ['계란', '선택'], ['김가루', '선택']], ['육수 끓이기', '면 삶기', '고명과 육수를 올리기']),
  preset(/(콩나물국|콩나물\s*국)/i, '콩나물국', [['콩나물', ''], ['대파', ''], ['마늘', ''], ['국간장', ''], ['청양고추', '선택']], ['콩나물 끓이기', '간 맞추기', '대파와 고추로 마무리하기']),
  preset(/(감자조림|감자\s*조림)/i, '감자조림', [['감자', ''], ['간장', ''], ['설탕', ''], ['마늘', '선택'], ['참기름', '']], ['감자 썰기', '양념과 함께 조리기', '참기름으로 마무리하기']),
  preset(/(장조림|메추리알\s*장조림)/i, '장조림', [['소고기', '선택'], ['메추리알', '선택'], ['간장', ''], ['마늘', ''], ['청양고추', '선택']], ['재료 삶기', '간장 양념에 조리기', '먹기 좋게 찢거나 담기']),
  preset(/(크림\s*파스타|크림파스타)/i, '크림 파스타', [['파스타면', ''], ['생크림', ''], ['우유', '선택'], ['마늘', ''], ['베이컨', '선택'], ['파마산치즈', '선택']], ['면 삶기', '크림 소스 만들기', '면과 소스를 섞기']),
  preset(/(까르보나라|carbonara)/i, '까르보나라', [['파스타면', ''], ['계란노른자', ''], ['베이컨', ''], ['파마산치즈', ''], ['후추', '']], ['면 삶기', '베이컨 볶기', '불을 줄이고 계란 소스와 섞기']),
  preset(/(봉골레|vongole)/i, '봉골레', [['파스타면', ''], ['바지락', ''], ['마늘', ''], ['올리브오일', ''], ['화이트와인', '선택'], ['페페론치노', '선택']], ['바지락 해감하기', '마늘과 바지락을 볶기', '면과 면수를 넣어 섞기']),
  preset(/(라자냐|lasagna)/i, '라자냐', [['라자냐면', ''], ['토마토소스', ''], ['다진소고기', ''], ['양파', ''], ['모차렐라치즈', ''], ['리코타치즈', '선택']], ['미트소스 만들기', '면과 소스를 층층이 쌓기', '치즈 올려 굽기']),
  preset(/(리조또|risotto)/i, '리조또', [['쌀', ''], ['육수', ''], ['양파', ''], ['버터', ''], ['파마산치즈', ''], ['버섯', '선택']], ['양파와 쌀 볶기', '육수를 나눠 넣어 익히기', '버터와 치즈로 마무리하기']),
  preset(/(감바스|gambas)/i, '감바스', [['새우', ''], ['마늘', ''], ['올리브오일', ''], ['페페론치노', ''], ['바게트', '선택']], ['오일에 마늘 향 내기', '새우를 익히기', '빵과 함께 담기']),
  preset(/(시저\s*샐러드|시저샐러드|caesar)/i, '시저 샐러드', [['로메인', ''], ['크루통', ''], ['파마산치즈', ''], ['닭가슴살', '선택'], ['시저드레싱', '']], ['채소 손질하기', '토핑 준비하기', '드레싱과 버무리기']),
  preset(/(샐러드|salad)/i, '샐러드', [['양상추', '선택'], ['로메인', '선택'], ['토마토', '선택'], ['오이', '선택'], ['올리브오일', ''], ['식초', '선택']], ['채소 손질하기', '드레싱 만들기', '가볍게 버무리기']),
  preset(/(피자토스트|피자\s*토스트)/i, '피자토스트', [['식빵', ''], ['토마토소스', ''], ['모차렐라치즈', ''], ['햄', '선택'], ['양파', '선택']], ['식빵에 소스 바르기', '토핑과 치즈 올리기', '노릇하게 굽기']),
  preset(/(샌드위치|sandwich)/i, '샌드위치', [['식빵', ''], ['계란', '선택'], ['햄', '선택'], ['치즈', '선택'], ['양상추', '선택'], ['마요네즈', '']], ['재료 준비하기', '빵에 소스 바르기', '재료를 끼워 담기']),
  preset(/(짜장면|짜장|jajang)/i, '짜장면', [['춘장', ''], ['돼지고기', ''], ['양파', ''], ['애호박', '선택'], ['중화면', '']], ['춘장 볶기', '고기와 채소 볶기', '면에 소스를 올리기']),
  preset(/(마파두부|마파\s*두부|mapo)/i, '마파두부', [['두부', ''], ['다진돼지고기', ''], ['두반장', ''], ['대파', ''], ['마늘', ''], ['전분', '선택']], ['고기와 향신채 볶기', '양념과 두부 넣기', '전분물로 농도 맞추기']),
  preset(/(짬뽕|jjamppong)/i, '짬뽕', [['중화면', ''], ['오징어', '선택'], ['새우', '선택'], ['양배추', ''], ['고춧가루', ''], ['대파', '']], ['해산물과 채소 볶기', '육수 넣고 끓이기', '면에 국물 담기']),
  preset(/(탕수육|tangsuyuk)/i, '탕수육', [['돼지고기', ''], ['전분', ''], ['식용유', ''], ['식초', ''], ['설탕', ''], ['간장', '']], ['고기 밑간과 튀김옷 입히기', '두 번 튀기기', '소스 끓여 곁들이기']),
  preset(/(가지볶음|가지\s*볶음)/i, '가지볶음', [['가지', ''], ['간장', ''], ['마늘', ''], ['대파', ''], ['굴소스', '선택']], ['가지를 썰기', '향신채 볶기', '가지와 양념을 넣어 볶기']),
  preset(/(라멘|ramen)/i, '라멘', [['라면사리', ''], ['육수', ''], ['차슈', '선택'], ['계란', '선택'], ['대파', '']], ['육수 준비하기', '면 삶기', '고명 올려 담기']),
  preset(/(카츠동|가츠동|katsudon)/i, '카츠동', [['돈까스', ''], ['밥', ''], ['계란', ''], ['양파', ''], ['간장', ''], ['쯔유', '선택']], ['양파와 소스 끓이기', '돈까스와 계란을 넣기', '밥 위에 올리기']),
  preset(/(오야코동|oyakodon)/i, '오야코동', [['닭고기', ''], ['밥', ''], ['계란', ''], ['양파', ''], ['쯔유', '선택']], ['닭고기와 양파 익히기', '계란을 풀어 넣기', '밥 위에 올리기']),
  preset(/(오므라이스|오무라이스|omurice)/i, '오므라이스', [['밥', ''], ['계란', ''], ['양파', ''], ['케첩', ''], ['햄', '선택'], ['버터', '선택']], ['케첩밥 만들기', '계란 지단 만들기', '밥을 감싸 소스 올리기']),
  preset(/(우동|udon)/i, '우동', [['우동면', ''], ['쯔유', ''], ['대파', ''], ['어묵', '선택'], ['유부', '선택']], ['국물 끓이기', '면 데우기', '고명 올려 담기']),
  preset(/(돈까스|돈가스|tonkatsu)/i, '돈까스', [['돼지고기', ''], ['밀가루', ''], ['계란', ''], ['빵가루', ''], ['식용유', '']], ['고기 두드려 밑간하기', '튀김옷 입히기', '노릇하게 튀기기']),
  preset(/(브라우니|brownie)/i, '브라우니', [['초콜릿', ''], ['버터', ''], ['설탕', ''], ['계란', ''], ['밀가루', ''], ['코코아파우더', '선택']], ['초콜릿과 버터 녹이기', '반죽 섞기', '틀에 넣어 굽기']),
  preset(/(쿠키|cookie)/i, '쿠키', [['밀가루', ''], ['버터', ''], ['설탕', ''], ['계란', '선택'], ['초콜릿칩', '선택']], ['버터와 설탕 섞기', '가루 재료 넣기', '모양 잡아 굽기']),
  preset(/(팬케이크|pancake)/i, '팬케이크', [['밀가루', ''], ['계란', ''], ['우유', ''], ['설탕', ''], ['버터', '']], ['반죽 만들기', '팬에 굽기', '버터나 시럽 곁들이기']),
  preset(/(프렌치토스트|프렌치\s*토스트|french\s*toast)/i, '프렌치토스트', [['식빵', ''], ['계란', ''], ['우유', ''], ['설탕', ''], ['버터', '']], ['계란물 만들기', '빵을 적시기', '버터에 노릇하게 굽기']),
  preset(/(티라미수|tiramisu)/i, '티라미수', [['마스카포네', ''], ['생크림', ''], ['커피', ''], ['레이디핑거', ''], ['코코아파우더', '']], ['크림 만들기', '커피에 적신 과자 쌓기', '차갑게 굳혀 코코아 뿌리기']),
  preset(/(푸딩|pudding)/i, '푸딩', [['우유', ''], ['계란', ''], ['설탕', ''], ['바닐라익스트랙', '선택']], ['카라멜 만들기', '우유 계란물 섞기', '중탕으로 익혀 식히기']),
  preset(/(바나나브레드|바나나\s*브레드|banana\s*bread)/i, '바나나브레드', [['바나나', ''], ['밀가루', ''], ['계란', ''], ['버터', ''], ['설탕', '']], ['바나나 으깨기', '반죽 섞기', '틀에 넣어 굽기']),
];

const PRESETS = BASE_PRESETS.concat(EXTRA_PRESETS);

const INGREDIENT_NAMES = uniqueStrings([
  '엑스트라버진 올리브오일', '스테이크용 소고기', '다진돼지고기', '다진소고기', '계란노른자',
  '토마토소스', '멸치육수', '올리브오일', '페페론치노', '방울토마토', '파스타면', '고춧가루', '국간장',
  '레몬즙', '핑크페퍼', '파마산치즈', '모차렐라치즈', '리코타치즈', '마스카포네', '코코아파우더',
  '바닐라익스트랙', '화이트와인', '시저드레싱', '라자냐면', '라면사리', '떡볶이떡', '중화면',
  '우동면', '라면', '소면', '당면', '춘장', '두반장', '쯔유', '굴소스', '전분', '부침가루',
  '빵가루', '밀가루', '코코아', '초콜릿칩', '초콜릿', '토마토', '래디시', '케이퍼', '파슬리',
  '로즈마리', '바질', '딜', '광어', '연어', '도미', '참치', '관자', '새우', '오징어', '바지락',
  '소갈비', '차돌박이', '소고기', '돼지고기', '닭다리살', '닭가슴살', '닭고기', '돈까스', '차슈',
  '고기', '햄', '소시지', '베이컨', '어묵', '유부', '김치', '순두부', '두부', '된장', '고추장',
  '간장', '식초', '설탕', '꿀', '소금', '후추', '마늘', '양파', '대파', '쪽파', '부추', '청양고추',
  '고추', '양배추', '양상추', '로메인', '애호박', '가지', '감자', '고구마', '당근', '무', '오이',
  '콩나물', '시금치', '미역', '버섯', '깻잎', '김', '김가루', '단무지', '배', '레몬', '라임',
  '바나나', '쌀', '밥', '떡', '계란', '달걀', '메추리알', '버터', '생크림', '우유', '치즈',
  '마요네즈', '케첩', '식빵', '바게트', '크루통', '레이디핑거', '커피', '육수', '식용유', '참기름',
]);

export async function buildStaticRecipePreview(url, rawText = '', visual = null) {
  const safeUrl = safeExternalUrl(url);
  if (!safeUrl) return null;
  const youtubeId = youtubeIdFromUrl(safeUrl);
  if (!youtubeId && !isVideoRecipeUrl(safeUrl)) return null;

  const meta = youtubeId ? await fetchYouTubeMetadata(youtubeId).catch(() => ({})) : {};
  const sourceText = [
    rawText,
    meta.title,
    meta.author_name,
    visual?.title,
    visual?.summary,
    visual?.note,
  ].filter(Boolean).join('\n');
  const preset = PRESETS.find(row => row.pattern.test(sourceText));
  const ingredients = ingredientsForPreset(preset, sourceText);
  const title = cleanRecipeTitle(preset?.title || meta.title || visual?.title || '영상 레시피');
  const imageUrl = safeExternalUrl(visual?.imageUrl) || safeExternalUrl(meta.thumbnail_url) || (youtubeId ? youtubeThumb(youtubeId) : '');

  return {
    ok: true,
    title,
    url: youtubeId ? `https://www.youtube.com/watch?v=${youtubeId}` : safeUrl,
    domain: domainFromUrl(safeUrl),
    imageUrl,
    source: {
      platform: youtubeId ? 'youtube' : sourcePlatformFromUrl(safeUrl),
      id: youtubeId,
      caption: String(sourceText || '').slice(0, 1200),
    },
    ingredients,
    steps: preset?.steps || [],
    summary: preset?.summary || (ingredients.length
      ? '영상 제목/공유 텍스트에서 재료 후보를 자동으로 뽑았어요.'
      : '대표 이미지는 담았고, 재료는 영상 확인 후 직접 보완해야 합니다.'),
    provider: 'static-title-heuristic',
    transcriptAvailable: false,
    warning: ingredients.length
      ? '자막 대신 제목/공유 텍스트 기반으로 재료 후보를 채웠어요.'
      : '영상 자막을 읽지 못해 재료 후보를 만들지 못했어요.',
  };
}

export function recipePresetPreviewFromText(text = '', url = '', visual = null) {
  const safeUrl = safeExternalUrl(url);
  const sourceText = [
    text,
    visual?.title,
    visual?.summary,
    visual?.note,
    visual?.source?.caption,
  ].filter(Boolean).join('\n');
  const preset = PRESETS.find(row => row.pattern.test(sourceText));
  const youtubeId = youtubeIdFromUrl(safeUrl);
  const ingredients = ingredientsForPreset(preset, sourceText);
  const candidateOnly = !preset;
  if (candidateOnly && ingredients.length < 2) return null;
  return {
    ok: true,
    title: cleanRecipeTitle(preset?.title || visual?.title || '후보 재료 레시피'),
    url: youtubeId ? `https://www.youtube.com/watch?v=${youtubeId}` : safeUrl,
    domain: domainFromUrl(safeUrl),
    imageUrl: safeExternalUrl(visual?.imageUrl) || (youtubeId ? youtubeThumb(youtubeId) : ''),
    source: {
      platform: youtubeId ? 'youtube' : sourcePlatformFromUrl(safeUrl),
      id: youtubeId,
      caption: String(sourceText || '').slice(0, 1200),
    },
    ingredients,
    steps: preset?.steps || [],
    summary: preset?.summary || `영상 제목/공유 텍스트에서 후보 재료 ${ingredients.length}개를 찾았어요. 조리순서는 영상이나 자막을 확인해 보완해 주세요.`,
    provider: candidateOnly ? 'static-ingredient-candidates' : 'static-title-heuristic',
    transcriptAvailable: false,
    warning: candidateOnly
      ? '정확한 요리 프리셋은 못 찾았지만, 제목/공유 텍스트에서 재료 후보를 채웠어요.'
      : ingredients.length
        ? '자막 대신 제목/공유 텍스트 기반으로 재료 후보를 채웠어요.'
      : '영상 자막을 읽지 못해 재료 후보를 만들지 못했어요.',
  };
}

export function recipeMemoFromParts({ summary = '', ingredients = [], steps = [], extra = '' } = {}) {
  const cleanSummary = String(summary || '').trim();
  const cleanExtra = String(extra || '').trim();
  const ingredientLines = (Array.isArray(ingredients) ? ingredients : [])
    .map(ing => {
      const name = String(ing?.name || '').trim();
      if (!name) return '';
      const quantity = String(ing?.quantity || '').trim();
      return quantity ? `- ${name}: ${quantity}` : `- ${name}`;
    })
    .filter(Boolean);
  const stepLines = (Array.isArray(steps) ? steps : [])
    .map((step, index) => String(step || '').trim() ? `${index + 1}. ${String(step || '').trim()}` : '')
    .filter(Boolean);
  const blocks = [];
  if (cleanSummary) blocks.push(`요약\n${cleanSummary}`);
  if (ingredientLines.length) blocks.push(`재료\n${ingredientLines.join('\n')}`);
  if (stepLines.length) blocks.push(`조리순서 요약\n${stepLines.join('\n')}`);
  if (cleanExtra && !blocks.some(block => block.includes(cleanExtra))) blocks.push(`원문 메모\n${cleanExtra}`);
  return blocks.join('\n\n').trim();
}

export function recipePartsFromManualText(text = '') {
  const source = String(text || '').replace(/\r/g, '').trim();
  const empty = { summary: '', ingredients: [], steps: [] };
  if (!source) return empty;
  const buckets = { summary: [], ingredients: [], steps: [] };
  let mode = '';
  const push = (target, value) => {
    const clean = String(value || '').trim();
    if (clean) buckets[target].push(clean);
  };
  source.split('\n').map(line => line.trim()).filter(Boolean).forEach(line => {
    const withInlineHeader = line.match(/^(요약|설명|summary|재료|재료목록|ingredients?|조리순서|조리법|만드는\s*법|순서|steps?|방법)\s*[:：]\s*(.*)$/i);
    const header = normalizeManualHeader(withInlineHeader ? withInlineHeader[1] : line);
    if (header) {
      mode = header;
      if (withInlineHeader?.[2]) push(mode, withInlineHeader[2]);
      return;
    }
    if (!mode) {
      if (/^\s*\d+[.)]\s+/.test(line)) {
        push('steps', line);
      } else if (/^\s*[-*•]\s+/.test(line) || quantityNear(line, '')) {
        push('ingredients', line);
      } else {
        push('summary', line);
      }
      return;
    }
    push(mode, line);
  });
  const ingredients = buckets.ingredients
    .flatMap(parseManualIngredientLine)
    .map((ing, index) => ({
      id: `ing_manual_${index}`,
      name: ing.name,
      quantity: ing.quantity,
      decidedSourceId: '',
      acquired: false,
      sources: [],
    }))
    .filter(ing => ing.name)
    .slice(0, 30);
  const steps = buckets.steps
    .map(parseManualStepLine)
    .filter(Boolean)
    .slice(0, 30);
  return {
    summary: buckets.summary.join('\n').trim(),
    ingredients,
    steps,
  };
}

export function shouldReplaceAutoRecipeTitle(value) {
  const title = String(value || '').trim();
  return !title || /^(YouTube Shorts|YouTube 영상|Instagram 게시물|Instagram Reels|TikTok|영상 레시피)$/i.test(title);
}

export function shouldReplaceAutoRecipeMemo(value) {
  const memo = String(value || '').trim();
  return !memo
    || /^(요약|재료|조리순서 요약)\n/.test(memo)
    || PRESETS.some(row => normalizeText(row.summary) === normalizeText(memo))
    || /^영상\s*제목에서.+기본\s*재료\s*후보를\s*채웠어요\.?$/i.test(memo);
}

export function extractCandidateIngredientsFromText(text = '') {
  const source = normalizeText(text);
  const found = [];
  for (const name of [...INGREDIENT_NAMES].sort((a, b) => b.length - a.length)) {
    const compactName = normalizeText(name);
    if (!source.includes(compactName)) continue;
    if (found.some(item => item.name.includes(name) || name.includes(item.name))) continue;
    found.push({ name, quantity: quantityNear(text, name) });
  }
  return found.slice(0, 18);
}

function inferIngredients(text) {
  return extractCandidateIngredientsFromText(text);
}

function ingredientsForPreset(preset, sourceText) {
  const inferred = inferIngredients(sourceText);
  if (!preset) return inferred.length >= 2 ? mergeIngredients(inferred) : [];
  return mergeIngredients(preset.ingredients?.map(([name, quantity]) => ({ name, quantity })) || [], inferred);
}

function mergeIngredients(...groups) {
  const seen = new Set();
  return groups.flat()
    .map((ing, index) => ({
      id: `ing_static_${index}`,
      name: String(ing?.name || '').trim(),
      quantity: String(ing?.quantity || '').trim(),
      decidedSourceId: '',
      acquired: !!ing?.acquired,
      sources: [],
    }))
    .filter(ing => {
      const key = normalizeText(ing.name);
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 20);
}

async function fetchYouTubeMetadata(videoId) {
  return fetchYouTubeOembed(videoId).catch(() => fetchYouTubeNoembed(videoId));
}

async function fetchYouTubeOembed(videoId) {
  const watchUrl = `https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}`;
  const res = await fetch(`${YOUTUBE_OEMBED_ENDPOINT}${encodeURIComponent(watchUrl)}`, {
    headers: { Accept: 'application/json' },
  });
  if (!res.ok) throw new Error(`youtube oembed ${res.status}`);
  return res.json();
}

async function fetchYouTubeNoembed(videoId) {
  const watchUrl = `https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}`;
  const res = await fetch(`${NOEMBED_ENDPOINT}${encodeURIComponent(watchUrl)}`, {
    headers: { Accept: 'application/json' },
  });
  if (!res.ok) throw new Error(`noembed ${res.status}`);
  return res.json();
}

function youtubeIdFromUrl(value) {
  try {
    const url = new URL(String(value || '').trim());
    const host = url.hostname.replace(/^www\./, '').toLowerCase();
    const parts = url.pathname.split('/').filter(Boolean);
    if (host === 'youtu.be') return normalizeYoutubeId(parts[0]);
    if (host.endsWith('youtube.com') || host.endsWith('youtube-nocookie.com')) {
      if (['shorts', 'embed', 'live'].includes(parts[0])) return normalizeYoutubeId(parts[1]);
      return normalizeYoutubeId(url.searchParams.get('v'));
    }
  } catch {}
  return '';
}

function normalizeYoutubeId(value) {
  const match = String(value || '').match(/[A-Za-z0-9_-]{11}/);
  return match ? match[0] : '';
}

function youtubeThumb(videoId) {
  return `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
}

function isVideoRecipeUrl(value) {
  return /(youtube\.com|youtu\.be|instagram\.com|tiktok\.com)/i.test(String(value || ''));
}

function sourcePlatformFromUrl(value) {
  const url = String(value || '').toLowerCase();
  if (/youtube\.com|youtu\.be/.test(url)) return 'youtube';
  if (/instagram\.com/.test(url)) return 'instagram';
  if (/tiktok\.com/.test(url)) return 'tiktok';
  return '';
}

function cleanRecipeTitle(value) {
  return String(value || '')
    .replace(/\s*#\S+/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 90);
}

function preset(pattern, title, ingredients, steps) {
  return {
    pattern,
    title,
    summary: `영상 제목에서 ${title}로 인식해 기본 재료 후보를 채웠어요.`,
    ingredients,
    steps,
  };
}

function uniqueStrings(values) {
  return [...new Set(values.map(value => String(value || '').trim()).filter(Boolean))];
}

function normalizeText(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/\s+/g, '')
    .replace(/[“”"']/g, '');
}

function quantityNear(text, name) {
  const source = String(text || '');
  const idx = name ? source.indexOf(name) : 0;
  if (idx === -1) return '';
  const near = source.slice(Math.max(0, idx - 24), idx + name.length + 42);
  const ratio = near.match(/(\d+\s*:\s*\d+)\s*비율/);
  if (ratio) return ratio[1].replace(/\s+/g, '');
  const qty = near.match(/(\d+(?:\.\d+)?\s*(?:g|그램|kg|개|큰술|작은술|스푼|컵|ml|mL|장|쪽|알|꼬집|봉|팩|캔|줌|술|대))/);
  return qty ? qty[1].replace(/\s+/g, '') : '';
}

function normalizeManualHeader(value) {
  const key = normalizeText(value).replace(/[:：]/g, '');
  if (/^(요약|설명|summary)$/.test(key)) return 'summary';
  if (/^(재료|재료목록|ingredient|ingredients)$/.test(key)) return 'ingredients';
  if (/^(조리순서|조리법|만드는법|순서|step|steps|방법)$/.test(key)) return 'steps';
  return '';
}

function parseManualIngredientLine(line) {
  const clean = String(line || '')
    .replace(/^\s*[-*•]\s*/, '')
    .replace(/^\s*\d+[.)]\s*/, '')
    .trim();
  if (!clean) return [];
  const parts = clean.split(/\s*(?:,|，|·|ㆍ)\s*/).map(part => part.trim()).filter(Boolean);
  return (parts.length > 1 ? parts : [clean]).map(parseManualIngredientPart).filter(row => row.name);
}

function parseManualIngredientPart(part) {
  const clean = String(part || '').trim();
  const explicit = clean.match(/^(.+?)\s*(?:[:|])\s*(.+)$/);
  if (explicit) return { name: explicit[1].trim(), quantity: explicit[2].trim() };
  const qty = clean.match(/(.+?)\s+(\d+(?:\.\d+)?\s*(?:g|그램|kg|개|큰술|작은술|스푼|컵|ml|mL|장|쪽|알|꼬집|봉|팩|캔|줌|술|대))$/);
  if (qty) return { name: qty[1].trim(), quantity: qty[2].replace(/\s+/g, '') };
  return { name: clean, quantity: '' };
}

function parseManualStepLine(line) {
  return String(line || '')
    .replace(/^\s*[-*•]\s*/, '')
    .replace(/^\s*\d+[.)]\s*/, '')
    .trim();
}
