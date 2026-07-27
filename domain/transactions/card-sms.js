// ================================================================
// domain/transactions/card-sms.js — 카드 결제 문자에서 가맹점을 뽑는다 (순수 함수)
//
// 왜 여기 있나: 안드로이드 쪽 PaymentNotificationParser(Java)가 1차로 뽑지만
// 그 값은 기기에서만 만들어져 테스트할 수 없다. 실제로 신한카드 문자의 가맹점이
// 전부 "07"로 저장되는 버그가 오래 살아남은 것도 그래서다.
//   원인: 금액 뒤 문자열을 '/' 로 잘라 첫 조각을 쓰는데, 앞에 날짜 07/27 이
//   남아 있으면 첫 조각이 그대로 "07" 이 된다.
// 그래서 판정을 이 순수 모듈로 옮기고, Java 값은 '힌트'로만 쓴다.
//
// 한국 카드사 문자 공통 구조(가계부 앱들이 쓰는 관례):
//   [Web발신]
//   OO카드(1234)승인 홍*동        ← 카드사·마스킹된 카드번호·마스킹된 이름
//   12,000원 일시불               ← 금액 + 결제구분
//   07/27 14:32                   ← 월/일 시:분
//   스타벅스강남점                 ← 가맹점 (보통 마지막 의미 있는 줄)
//   누적 1,234,567원              ← 꼬리표
//
// 규칙: 줄 단위로 보고, '가맹점이 될 수 없는 줄'을 걸러낸 뒤 남은 마지막 줄을
// 쓴다. 한 줄로 뭉쳐 온 문자는 구분자로 다시 쪼갠다.
// ================================================================

const WEB_PREFIX_RE = /\[(web발신|국제발신|국외발신|광고|web|Web)\]/gi;
const URL_RE = /https?:\/\/\S+|\b[\w.-]+\.(com|net|kr|co|io|me)\b\S*/gi;

// 카드사·간편결제 발신자. 가맹점 자리에 오면 안 된다.
const ISSUERS = [
  '신한', '삼성', '현대', '국민', 'KB국민', 'KB', '롯데', '하나', '우리', 'BC', '비씨',
  'NH농협', '농협', '씨티', '카카오뱅크', '케이뱅크', '토스뱅크', '토스', '네이버페이',
  '카카오페이', '페이코', '핀크', '신협', '새마을금고', '우체국',
];

// 이 토큰이 들어간 줄은 가맹점이 아니다(꼬리표·안내문).
const NOISE_TOKENS = [
  '누적', '잔액', '잔고', '승인번호', '이용금액', '카드번호', '결제예정', '청구',
  '한도', '포인트', '적립', '할인', '무이자', '고객센터', '문의', '안내', '수수료',
  '이용내역', '조회', '앱', '설치', '알림', '수신거부', '광고',
];

// 결제 구분·상태 낱말만 있는 줄도 가맹점이 아니다.
const STATUS_ONLY_RE = /^(승인|취소|결제|사용|출금|입금|이체|송금|완료|일시불|체크|신용|해외|국내|정상)[\s·)\]]*$/;
const INSTALLMENT_RE = /^\d{1,2}개월(\s*(무이자|할부))?$/;
const AMOUNT_LINE_RE = /^[\d,.\s]*원[\s(]*(일시불|할부|체크|신용)?[\s)]*$/;
const DATE_LINE_RE = /^\d{1,2}[./-]\d{1,2}([./-]\d{2,4})?(\s*\d{1,2}:\d{2}(:\d{2})?)?$/;
const TIME_LINE_RE = /^\d{1,2}:\d{2}(:\d{2})?$/;
const MASKED_NAME_RE = /^[가-힣]\*+[가-힣]?(님)?$/;
const DIGITS_ONLY_RE = /^[\d,.*\s-]+$/;

// 가맹점 바로 뒤에 공백 없이 붙어 오는 꼬리표들. 여기서만 줄을 끊는다.
const TAIL_TOKENS = ['누적', '잔액', '잔고', '승인번호', '카드번호', '이용금액'];

export const CANCEL_TOKENS = ['취소', '환불', '승인취소', '매입취소'];

function stripNoise(text) {
  return String(text || '')
    .replace(WEB_PREFIX_RE, ' ')
    .replace(URL_RE, ' ')
    .replace(/\u00a0/g, ' ');  // NBSP → 보통 공백
}

// 한 줄로 뭉쳐 온 문자를 다시 줄로 쪼갠다. 줄바꿈이 없으면 날짜/금액 경계로 나눈다.
function toLines(text) {
  const normalized = stripNoise(text);
  if (/[\n\r]/.test(normalized)) {
    return normalized.split(/[\n\r]+/).map(line => line.trim()).filter(Boolean);
  }
  return normalized
    // 금액·날짜·시각 앞뒤에서 끊는다
    .replace(/([\d,]+원)/g, '\n$1\n')
    .replace(/(\d{1,2}[./-]\d{1,2}(?:\s*\d{1,2}:\d{2}(?::\d{2})?)?)/g, '\n$1\n')
    // 꼬리표는 가맹점에 붙어서 온다("테스트 누적2,664,049원") — 앞에서 끊어야
    // 가맹점만 남는다. 줄째로 버리면 가맹점까지 같이 사라진다.
    // 실제로 붙어 오는 것만 자른다. NOISE_TOKENS 전체로 자르면 '안내'·'문의' 같은
    // 문장 속 낱말에서 끊겨 엉뚱한 조각이 가맹점 후보가 된다.
    .replace(new RegExp(`(${TAIL_TOKENS.join('|')})`, 'g'), '\n$1')
    .split(/[\n\r]+/)
    .map(line => line.trim())
    .filter(Boolean);
}

// 이 줄이 가맹점이 될 수 있는가.
export function isMerchantLine(line) {
  const value = String(line || '').trim();
  if (value.length < 2) return false;
  if (DIGITS_ONLY_RE.test(value)) return false;      // "07", "1234", "12,000"
  if (DATE_LINE_RE.test(value)) return false;        // "07/27", "07/27 14:32"
  if (TIME_LINE_RE.test(value)) return false;
  if (AMOUNT_LINE_RE.test(value)) return false;      // "12,000원 일시불"
  if (INSTALLMENT_RE.test(value)) return false;      // "3개월 무이자"
  if (STATUS_ONLY_RE.test(value)) return false;
  if (MASKED_NAME_RE.test(value)) return false;      // "홍*동"
  if (NOISE_TOKENS.some(token => value.includes(token))) return false;
  // 발신 헤더. "신한카드(1234)승인" 뿐 아니라 "하나2*0*승인 김*우" 처럼
  // 카드번호가 마스킹돼 '카드' 라는 낱말이 없는 양식도 있다.
  if (ISSUERS.some(issuer => value.startsWith(issuer))
    && /(카드|은행|페이|뱅크|승인|취소|[*\d])/.test(value)) return false;
  return true;
}

// 줄 안에 붙어 있는 군더더기를 떼어낸다.
export function cleanMerchant(line) {
  return String(line || '')
    .replace(/^\((주|유|재|사)\)\s*/, '')            // (주) 접두
    .replace(/^(승인|취소|결제|사용|일시불|할부|체크|신용)\s+/, '')
    .replace(/\s*\d{1,2}개월(\s*무이자)?\s*$/, '')
    .replace(/[.,·]+$/, '')
    .replace(/\s{2,}/g, ' ')
    .trim()
    .slice(0, 40);
}

// 문자에서 가맹점을 고른다. 못 고르면 '' 를 돌려준다(호출자가 힌트로 대체).
//
// 가맹점은 대개 마지막 의미 있는 줄이지만, 누적/잔액 같은 꼬리표가 뒤에 붙는다.
// 그래서 뒤에서부터 훑되 '가맹점이 될 수 없는 줄'은 건너뛴다.
export function merchantFromCardSms(rawText) {
  const lines = toLines(rawText);
  for (let i = lines.length - 1; i >= 0; i -= 1) {
    if (!isMerchantLine(lines[i])) continue;
    const cleaned = cleanMerchant(lines[i]);
    if (cleaned.length >= 2 && isMerchantLine(cleaned)) return cleaned;
  }
  return '';
}

// Java 파서가 넘긴 값이 쓸 만한가. "07" 처럼 날짜 조각이면 버린다.
export function isUsableMerchant(value) {
  const text = String(value || '').trim();
  if (text.length < 2) return false;
  return isMerchantLine(text);
}

// 최종 판정: 문자 본문에서 뽑은 값을 우선하고, 없으면 기기가 준 힌트를 검증해 쓴다.
export function resolveCardSmsMerchant(rawText, hint = '') {
  const parsed = merchantFromCardSms(rawText);
  if (parsed) return parsed;
  if (isUsableMerchant(hint)) return cleanMerchant(hint);
  return '';
}

// 취소/환불 문자인가 — 환불은 별도 수입이 아니라 원거래를 되돌리는 것이다.
export function isCancelSms(rawText) {
  const text = stripNoise(rawText);
  return CANCEL_TOKENS.some(token => text.includes(token));
}
