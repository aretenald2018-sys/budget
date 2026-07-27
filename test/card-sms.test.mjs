import test from 'node:test';
import assert from 'node:assert/strict';

import {
  cleanMerchant,
  isCancelSms,
  isMerchantLine,
  isUsableMerchant,
  merchantFromCardSms,
  resolveCardSmsMerchant,
} from '../domain/transactions/card-sms.js';

// 실제로 보고된 버그: 신한카드 문자의 가맹점이 전부 "07" 로 저장됐다.
// 금액 뒤 문자열을 '/' 로 잘라 첫 조각을 쓰는 방식이라, 날짜 07/27 이 남으면
// 첫 조각이 그대로 "07" 이 된다.
test('신한카드 승인 문자에서 가맹점을 뽑는다 (07 버그)', () => {
  const sms = [
    '[Web발신]',
    '신한카드(1234)승인 홍*동',
    '12,000원 일시불',
    '07/27 14:32',
    '스타벅스강남점',
    '누적 1,234,567원',
  ].join('\n');
  assert.equal(merchantFromCardSms(sms), '스타벅스강남점');
  assert.notEqual(merchantFromCardSms(sms), '07');
});

test('날짜만 있고 시각이 없어도 날짜를 가맹점으로 쓰지 않는다', () => {
  const sms = '[Web발신]\n신한카드승인\n12,000원 일시불\n07/27\n배달의민족';
  assert.equal(merchantFromCardSms(sms), '배달의민족');
});

test('한 줄로 뭉쳐 온 문자도 쪼개서 가맹점을 찾는다', () => {
  const sms = '[Web발신] 신한카드(1234)승인 홍*동 12,000원 일시불 07/27 14:32 쿠팡이츠';
  assert.equal(merchantFromCardSms(sms), '쿠팡이츠');
});

test('여러 카드사 양식에서 가맹점을 뽑는다', () => {
  const cases = [
    ['KB국민카드\n승인 5,500원\n07/27 09:10\n메가커피역삼', '메가커피역삼'],
    ['[Web발신]\n삼성카드 승인\n홍*동님\n38,000원\n07/17 21:40\n와인앤모어\n누적 2,000,000원', '와인앤모어'],
    ['현대카드 승인\n120,000원 3개월 할부\n07/21 11:00\n온라인클래스', '온라인클래스'],
    ['[Web발신]\n롯데카드승인\n4,800원 체크\n07/16 09:05\n(주)스타벅스커피코리아', '스타벅스커피코리아'],
  ];
  for (const [sms, expected] of cases) {
    assert.equal(merchantFromCardSms(sms), expected, sms.split('\n')[1]);
  }
});

test('꼬리표 줄(누적·잔액·승인번호)은 가맹점이 되지 않는다', () => {
  assert.equal(isMerchantLine('누적 1,234,567원'), false);
  assert.equal(isMerchantLine('잔액 500,000원'), false);
  assert.equal(isMerchantLine('승인번호 12345678'), false);
  assert.equal(isMerchantLine('카드번호 1234-****'), false);
});

test('날짜·시각·금액·마스킹된 이름은 가맹점이 되지 않는다', () => {
  for (const bad of ['07', '07/27', '07/27 14:32', '14:32', '12,000원', '12,000원 일시불', '홍*동', '홍*동님', '3개월 무이자', '1234']) {
    assert.equal(isMerchantLine(bad), false, bad);
  }
});

test('카드사 발신 헤더는 가맹점이 되지 않는다', () => {
  assert.equal(isMerchantLine('신한카드(1234)승인'), false);
  assert.equal(isMerchantLine('KB국민카드'), false);
  assert.equal(isMerchantLine('토스뱅크'), false);
});

test('가맹점 앞뒤 군더더기를 떼어낸다', () => {
  assert.equal(cleanMerchant('(주)무신사'), '무신사');
  assert.equal(cleanMerchant('승인 이마트성수'), '이마트성수');
  assert.equal(cleanMerchant('무신사 3개월'), '무신사');
});

test('기기가 준 힌트는 검증한 뒤에만 쓴다', () => {
  // 본문에서 뽑히면 힌트를 무시한다
  assert.equal(resolveCardSmsMerchant('12,000원\n07/27 14:32\n스타벅스', '07'), '스타벅스');
  // 본문에서 못 뽑으면 힌트를 쓰되, 쓸 수 없는 값이면 버린다
  assert.equal(resolveCardSmsMerchant('12,000원', '이마트'), '이마트');
  assert.equal(resolveCardSmsMerchant('12,000원', '07'), '');
  assert.equal(isUsableMerchant('07'), false);
  assert.equal(isUsableMerchant('이마트'), true);
});

test('취소·환불 문자를 알아본다', () => {
  assert.equal(isCancelSms('신한카드 승인취소 12,000원 07/27 스타벅스'), true);
  assert.equal(isCancelSms('신한카드 승인 12,000원 07/27 스타벅스'), false);
});

// 실제 하나카드 문자: 가맹점이 꼬리표와 공백 없이 붙어서 온다.
// 줄째로 버리면 가맹점까지 사라지므로 꼬리표 앞에서 끊어야 한다.
test('꼬리표가 가맹점에 붙어 와도 가맹점만 남긴다', () => {
  const sms = '[Web발신] 하나2*0*승인 김*우 141,000원 일시불 07/02 19:55 테스트 누적2,664,049원';
  assert.equal(merchantFromCardSms(sms), '테스트');
});

// 문장 속 낱말에서 끊으면 엉뚱한 조각이 후보가 된다(네이버페이 알림에서 발견).
test('안내문 낱말에서는 줄을 끊지 않는다', () => {
  const notice = '[네이버페이] 결제 완료 안내 문정식당 12,800원';
  assert.equal(resolveCardSmsMerchant(notice, '문정식당'), '문정식당');
});
