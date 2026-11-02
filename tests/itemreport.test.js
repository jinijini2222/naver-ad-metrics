// 실행: node tests/itemreport.test.js  (소재별 성과 주간 리포트: 합산, 비율, 소계·합계, 이미지 수식)
const assert = require('assert');
const { load } = require('./helpers');
const { call } = load(['Config.gs', 'Collect.gs', 'Verdict.gs', 'Banner.gs', 'ItemReport.gs']);

const SH = '쇼핑검색', PI = '파워링크 확장소재', PT = '파워링크 텍스트';
const row = (product, id, since, imp, clk, conv, cost) => ({ since, until: since, product, campaign: 'C', adgroup: 'G', creativeId: id, imp, clk, cost, conv, convAmt: conv * 30000, rank: 0 });
const map = (workId, creativeId, o = {}) => Object.assign({ row: 2, workId, creativeId, product: '', postedAt: '', replacedAt: '', memo: '', imageUrl: '', spec: '' }, o);
const W1 = '2026-10-19', W2 = '2026-10-26';

// ---- 합산: 같은 작업물의 여러 소재를 합치고, 텍스트·미매핑·게시 전 주는 제외, 전환은 '총 전환수' ----
const raw = [
  row(SH, 'a1', W2, 1000, 20, 2, 2400), row(SH, 'a2', W2, 500, 10, 1, 1200),   // 같은 작업물 SH_A 에 소재 2개
  row(SH, 'a1', W1, 800, 16, 1, 1900),
  row(PI, 'p1', W2, 2000, 60, 3, 6000),
  row(PT, 't1', W2, 9999, 99, 9, 9999),                                         // 텍스트: 제외
  row(SH, 'x9', W2, 700, 7, 0, 700),                                            // 미매핑: 제외
  row(SH, 'b1', W1, 300, 3, 0, 300),                                            // 게시 전 주: 제외
];
const mapping = [map('SH_A', 'a1'), map('SH_A', 'a2'), map('PI_A', 'p1', { imageUrl: 'https://img.example/p1.png' }), map('SH_B', 'b1', { postedAt: W2 })];
const stats = call('computeWorkWeekStats_(r, m)', { r: raw, m: mapping });
const get = (id, w) => stats.find((s) => s.workId === id && s.week === w);
assert.deepStrictEqual([get('SH_A', W2).imp, get('SH_A', W2).clk, get('SH_A', W2).conv, get('SH_A', W2).cost], [1500, 30, 3, 3600]);
assert.strictEqual(get('SH_A', W1).imp, 800);
assert.ok(!stats.some((s) => s.workId === 'SH_B'), '게시 전 주 제외');
assert.strictEqual(stats.length, 3, '작업물×주 3개 (SH_A 2주, PI_A 1주)');
console.log('OK 작업물×주 합산 (여러 소재 합산, 텍스트·미매핑·게시 전 제외, 총 전환수)');

// ---- 비율·판정·이미지·이름 ----
const verdicts = [{ workId: 'SH_A', week: W2, verdict: '개선 필요', alertType: '개선 필요' }];
const items = call('buildItemRows_(s, v, m, n)', { s: stats, v: verdicts, m: mapping, n: { SH_A: '추석 메인 배너' } });
const a = items.find((i) => i.workId === 'SH_A' && i.week === W2);
assert.strictEqual(a.ctr, 30 / 1500); assert.strictEqual(a.cvr, 3 / 30); assert.strictEqual(a.cpc, 3600 / 30);
assert.strictEqual(a.verdict, '개선 필요'); assert.strictEqual(a.alertType, '개선 필요'); assert.strictEqual(a.name, '추석 메인 배너');
assert.strictEqual(items.find((i) => i.workId === 'PI_A').imageUrl, 'https://img.example/p1.png');
assert.strictEqual(items.find((i) => i.workId === 'PI_A').verdict, '');                       // 판정이 없으면 빈칸
const zero = call('buildItemRows_(s, [], [], {})', { s: [{ workId: 'Z', week: W2, product: SH, imp: 0, clk: 0, cost: 0, conv: 0, convAmt: 0 }] })[0];
assert.strictEqual(zero.ctr, null); assert.strictEqual(zero.cvr, null); assert.strictEqual(zero.cpc, null);   // 0으로 나누지 않음
console.log('OK 비율 / 판정·이름·이미지 연결 / 0으로 나누기 방지');

// ---- 이미지 수식: http(s)만, 수식을 깨는 문자는 거부 ----
assert.strictEqual(call('imageFormula_(u)', { u: 'https://img.example/a.png' }), '=IMAGE("https://img.example/a.png")');
['', 'javascript:alert(1)', 'ftp://x/y.png', 'https://a b.png', 'https://x/"),A1("', 'https://x/y"z'].forEach((u) => assert.strictEqual(call('imageFormula_(u)', { u }), '', '거부: ' + u));
console.log('OK 이미지 수식 (http/https만, 따옴표·공백 거부)');

// ---- 탭 행: 상품별 정렬 + 소계 + 합계 ----
const t = call('itemReportSheetRows_(i, w)', { i: items, w: W2 });
assert.deepStrictEqual(t.kinds, ['item', 'sub', 'item', 'sub', 'total']);            // 쇼핑검색(1) → 소계 → 파워링크(1) → 소계 → 합계
assert.strictEqual(t.rows[0][2], 'SH_A'); assert.strictEqual(t.rows[0][3], '추석 메인 배너');
assert.strictEqual(t.rows[0][1], ''); assert.strictEqual(t.rows[2][1], '=IMAGE("https://img.example/p1.png")');
const total = t.rows[4];
assert.strictEqual(total[2], '합계');
assert.deepStrictEqual([total[5], total[6], total[8], total[10]], [3500, 90, 6, 9600]);   // 노출 1500+2000, 클릭 30+60, 전환 3+3, 광고비 3600+6000
assert.strictEqual(total[7], 90 / 3500); assert.strictEqual(total[9], 6 / 90);             // 합계의 비율은 합산한 값으로 다시 계산
assert.strictEqual(t.rows[1][2], '소계 · 쇼핑검색');
assert.strictEqual(call('itemReportSheetRows_(i, "2099-01-05").rows.length', { i: items }), 0);
console.log('OK 탭 행 (상품별 정렬, 소계, 합계는 합산값으로 재계산)');

// 노출 많은 순
const many = call('itemReportSheetRows_(i, w)', { w: W2, i: [
  { workId: 'LOW', week: W2, product: SH, imp: 100, clk: 1, conv: 0, cost: 10, ctr: 0.01, cvr: 0, cpc: 10, verdict: '', alertType: '', name: '', imageUrl: '' },
  { workId: 'HIGH', week: W2, product: SH, imp: 900, clk: 9, conv: 1, cost: 90, ctr: 0.01, cvr: 0.11, cpc: 10, verdict: '', alertType: '', name: '', imageUrl: '' }] });
assert.deepStrictEqual(many.rows.filter((r, i) => many.kinds[i] === 'item').map((r) => r[2]), ['HIGH', 'LOW']);
console.log('OK 노출 많은 순');
console.log('\nALL PASSED');
