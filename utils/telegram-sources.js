export const TELEGRAM_PUBLIC_SOURCE_VERSION = '20260704-public-preview-v2';

export const TELEGRAM_PUBLIC_SOURCES = Object.freeze([
  source('report-gallery', '리포트 갤러리', 'report_figure_by_offset', '리포트 및 요약 분석'),
  source('sunstudy', '선진짱 주식공부방', 'sunstudy', '리포트 및 요약 분석'),
  source('paha-archive', '파하의 아카이빙 노트', 'paranhanl20', '리포트 및 요약 분석'),
  source('free-life', '프리라이프', 'free_life59', '리포트 및 요약 분석'),
  source('seohwabaek', '서화백의 그림놀이', 'easobi', '리포트 및 요약 분석'),
  source('jay-stock-class', '엄브렐라리서치 Jay의 주식투자교실', 'Jstockclass', '리포트 및 요약 분석'),
  source('lupin', '루팡', 'bornlupin', '리포트 및 요약 분석'),
  source('tambangwang', '탐방왕', 'tambangwang', '리포트 및 요약 분석'),
  source('jason-market', '시장 이야기 by 제이슨', 'bumgore', '리포트 및 요약 분석'),
  source('aether-japan-us', '에테르의 일본&미국 리서치', 'aetherjapanresearch', '리포트 및 요약 분석'),
  source('woosan-nnn', '우산 X NNN의 아이디어', 'WoosanXNNN', '리포트 및 요약 분석'),
  source('yoga-analyst', '요가하는증권맨', 'yogahsd', '리포트 및 요약 분석'),
  source('wise-research', '투자자문 와이즈리서치 경제공부방', 'econostudy', '리포트 및 요약 분석'),
  source('young-tiger', '영리한타이거의 주식공부방', 'YoungTiger_stock', '리포트 및 요약 분석'),

  source('athletes-village', '선수촌', 'athletes_village', '종합시황'),
  source('tnbfolio', 'TNBfolio', 'TNBfolio', '종합시황'),
  source('redbird-stock', '레드버드 기업분석', 'redbirdstock', '종합시황'),
  source('dopb-survival', '도PB의 생존투자', 'survival_DoPB', '종합시황'),
  source('quantum-algo', '퀀텀 알고리즘', 'quantum_ALGO', '종합시황'),
  source('market-timing', '실전매매전략 : 마켓타이밍', 'stockgrandmaster', '종합시황'),
  source('jamsil-nerds', '잠실개미&10X’s N.E.R.D.S', 'jake8lee', '종합시황'),

  source('smart-zoo', '영리한 동물원', 'stockinvcowcow', '국내시황/스크랩'),
  source('tenlab', '텐렙', 'Ten_level', '국내시황/스크랩'),
  source('bbanjil-sklab', '뺀지뤼의 SKLab.', 'bbanjil', '국내시황/스크랩'),
  source('brain-body-research', 'Brain and Body Research', 'Brain_And_Body_Research', '국내시황/스크랩'),
  source('awake-disclosure', 'AWAKE - 실시간 주식 공시 정리채널', 'darthacking', '국내시황/스크랩'),
  source('core-value-club', '가치투자클럽', 'corevalue', '국내시황/스크랩'),
  source('beluga-investment', '벨루가의 주식 헤엄치기', 'beluga_investment', '국내시황/스크랩'),
  source('mimi-ath', '미미의 신고가', 'mimi_ATH', '국내시황/스크랩'),
  source('stock-pitch', '머지노의 Stock-Pitch', 'StockPitchPR', '국내시황/스크랩'),
  source('aegis-research', '이지스 리서치', 'jeilstock', '국내시황/스크랩'),
  source('upper-limit-research', '쩜상리서치', 'upper_limit_price', '국내시황/스크랩'),

  source('us-stocks-insider', 'US Stocks Insider', 'insidertracking', '미국시황'),
  source('allbareun', '올바른', 'allbareun', '미국시황'),
  source('yeonsour', '연수르 해외주식', 'yeonsour', '미국시황'),
  source('deans-ticker', 'Dean’s Ticker', 'd_ticker', '미국시황'),
  source('macro-trader', 'Macro Trader', 'MacroAllocation', 'Macro'),

  source('alpaca-farm', '알파카 주식 목장', 'foreconomy', '섹터'),
  source('kim-charger', '김찰저의 관심과 생각 저장소', 'kimcharger', '섹터'),
  source('granit34', 'Granit34의 투자스토리', 'Joorini34', '섹터'),
  source('cahier-de-market', '카이에 de market', 'cahier_de_market', '섹터'),
  source('pikachu-aje', '피카츄 아저씨', 'pikachu_aje', '섹터'),
  source('stock-easy', '스탁이지 - AI 투자 어시스턴트', 'maddingStock', '섹터'),
  source('stock-trip', 'Stock Trip', 'stocktrip', '섹터'),
  source('briller', 'BRILLER', 'BRILLER_Research', '섹터'),
  source('growth-research', '그로쓰리서치 [독립리서치]', 'growthresearch', '섹터'),
  source('desperate-study-cafe', '간절한 투자스터디카페', 'Desperatestudycafe', '섹터'),
  source('triple-eye', '트리플 아이 - Insight Information Indepth', 'triple_stock', '섹터'),
  source('mootda', '묻따방', 'mootda', '섹터'),
  source('neulbom', '늘- 봄처럼 따뜻한 투자 이야기 [ 지댕 / 늘봄 ]', 'NeulBom', '섹터'),
  source('benine-blog', '비나인의 블로그 스크랩', 'benineb9', '섹터'),
  source('defence-ai-robot', '우주방산AI로봇 아카이브', 'defence_24', '섹터'),
  source('arete-invest', '投資, 아레테', 'mstaryun', '섹터'),

  source('kb-egzion', 'KB전략 이그전', 'egzion', 'IB'),
  source('rafiki-research', 'Rafiki research', 'rafikiresearch', 'IB'),
  source('yield-spread', '채권 애널리스트 김성수', 'yieldnspread', 'IB'),
  source('hana-global-etf', '[하나 Global ETF] 박승진', 'globaletfi', 'IB'),
  source('shinhan-bio', '[신한 리서치본부] 제약/바이오', 'bio_shinhan', 'IB'),
  source('koreainvest-mk', '한국투자증권/기관영업부/이민근', 'mk81_koreainvestment', 'IB'),
  source('mirae-kim', '미래에셋증권 매크로/시황 김석환', 'globalmktinsight', 'IB'),
  source('hana-overseas-bond', '[하나증권 해외채권] 허성우', 'deandatbond', 'IB'),
  source('kiwoom-han', '키움증권 전략/시황 한지영', 'hedgecat0301', 'IB'),

  source('going-summary', '요약하는 고잉', 'one_going', '마인드 컨트롤'),
  source('one-step-record', '한걸음_적자생존 기록실', 'helpmeonestep', '마인드 컨트롤'),
  source('habit-rich', '습관이 부자를 만든다.', 'habit4117', '마인드 컨트롤'),
  source('be-independent', 'BI (Be Independent)', 'beindependent01', '마인드 컨트롤'),
  source('kyaooo', '캬오의 공부방', 'Kyaooo', '마인드 컨트롤'),
  source('quality-lab', '퀄리티기업연구소', 'QualityInvestingLaboratory', '마인드 컨트롤'),
  source('haesin-realestate', '해신 부동산 투자 스토리', 'dntjd0903', '부동산'),
  source('slowstock-realestate', '주식과 부동산', 'slowstockT', '부동산'),
  source('apt2me', '아파트미(me) 실거래 배포', 'apt2me', '부동산'),
]);

export function getTelegramPublicSourceById(id) {
  return TELEGRAM_PUBLIC_SOURCES.find(item => item.id === id) || null;
}

export function telegramPublicSourceUrl(sourceItem) {
  const handle = typeof sourceItem === 'string' ? sourceItem : sourceItem?.handle;
  return `https://t.me/s/${encodeURIComponent(String(handle || '').trim())}`;
}

export function telegramPublicPermalink(sourceItem, messageId) {
  const handle = typeof sourceItem === 'string' ? sourceItem : sourceItem?.handle;
  return `https://t.me/${String(handle || '').trim()}/${String(messageId || '').trim()}`;
}

function source(id, title, handle, category) {
  return Object.freeze({ id, title, handle, category, kind: 'telegram_public' });
}
