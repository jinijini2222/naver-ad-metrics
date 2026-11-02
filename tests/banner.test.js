// 실행: node tests/banner.test.js  (성과기록_배너 자동 열 계산)
const assert = require('assert');
const { load } = require('./helpers');
const { call } = load(['Config.gs', 'Collect.gs', 'Verdict.gs', 'Banner.gs']);

// 판정 행: [작업물, 주차, CTR, 기준선, 비율, 판정, 전환율, CPC, ROAS, 순위, 추이, 상품, 알림, 비고, 기준전환율]
const V = (id, week, o = {}) => [id, week, o.ctr ?? 0.01, 0.02, o.ratio ?? 0.5, o.verdict ?? '개선 필요', 0.05, 120, 3.2, o.rank ?? '', 'a → b → c', '쇼핑검색', o.alert ?? '개선 필요', '', 0.03];
const M = (workId, o = {}) => Object.assign({ row: 2, workId, creativeId: 'x', product: '', postedAt: '', replacedAt: '', memo: '' }, o);

// 최신 주 선택 (정렬되지 않은 입력도)
let out = call('computeBannerAutoCols_(ids, v, m)', {
  ids: ['W1'],
  v: [V('W1', '2026-10-12', { ctr: 0.03, verdict: '성공', alert: '' }), V('W1', '2026-10-26', { ctr: 0.01 }), V('W1', '2026-10-19', { ctr: 0.02 })],
  m: [M('W1', { postedAt: '2026-10-05' })],
});
assert.strictEqual(out[0].length, 13);
assert.strictEqual(out[0][2], '2026-10-26');            // 최근 주차
assert.strictEqual(out[0][3], 0.01);                    // CTR은 최신 주 값
assert.strictEqual(out[0][5], -0.5);                    // 기준선 대비 = 비율 - 1
assert.strictEqual(out[0][6], '개선 필요');
assert.strictEqual(out[0][12], '개선 필요');             // 알림 유형
assert.strictEqual(out[0][1], '2026-10-05');            // 게시일
console.log('OK 최신 주 선택 / 기준선 대비 / 게시일');

// 게시일: 교체된 작업물은 가장 이른 게시일, 판정 없는 작업물은 매핑의 상품만
out = call('computeBannerAutoCols_(ids, v, m)', {
  ids: ['A', 'NEW', ''],
  v: [V('A', '2026-10-19', { ratio: '', verdict: '데이터 부족', alert: '' })],
  m: [M('A', { postedAt: '2026-10-19' }), M('A', { postedAt: '2026-10-05' }), M('NEW', { product: '파워링크 확장소재' })],
});
assert.strictEqual(out[0][1], '2026-10-05');            // 가장 이른 게시일
assert.strictEqual(out[0][5], '');                      // 비율이 없으면 기준선 대비도 빈칸
assert.deepStrictEqual(out[1], ['파워링크 확장소재', '', '', '', '', '', '', '', '', '', '', '', '']);
assert.deepStrictEqual(out[2], new Array(13).fill(''));  // 빈 행은 모두 빈칸
console.log('OK 판정 없는 작업물 / 빈 행');
console.log('\nALL PASSED');
