// 실행: node tests/collect.test.js  (네이버 API 호출을 가짜로 바꿔 수집 로직 검증)
const assert = require('assert');
const { load } = require('./helpers');

const calls = [];
const FAKE = {
  '/ncc/campaigns': [
    { nccCampaignId: 'c1', name: '쇼핑캠', campaignTp: 'SHOPPING' },
    { nccCampaignId: 'c2', name: '파워캠', campaignTp: 'WEB_SITE' },
    { nccCampaignId: 'c3', name: '브랜드', campaignTp: 'BRAND_SEARCH' },
  ],
  '/ncc/adgroups': { c1: [{ nccAdgroupId: 'g1', name: '쇼핑그룹' }], c2: [{ nccAdgroupId: 'g2', name: '파워그룹' }] },
  '/ncc/ads': { g1: [{ nccAdId: 'ad-s1' }, { nccAdId: 'ad-s2' }], g2: [{ nccAdId: 'ad-t1' }] },
  '/ncc/ad-extensions': { g2: [
    { nccAdExtensionId: 'ext-img', type: 'POWER_LINK_IMAGE' },
    { nccAdExtensionId: 'ext-sub', type: 'IMAGE_SUB_LINKS' },
    { nccAdExtensionId: 'ext-tel', type: 'PHONE' },
  ] },
};
function naverGet_(path, q) {
  calls.push({ path, q });
  if (path === '/ncc/campaigns') return FAKE[path];
  if (path === '/ncc/adgroups') return FAKE[path][q.nccCampaignId];
  if (path === '/ncc/ads') return FAKE[path][q.nccAdgroupId] || [];
  if (path === '/ncc/ad-extensions') return FAKE[path][q.ownerId] || [];
  if (path === '/stats') return globalThis.__statsHandler(q);
  throw new Error('unexpected ' + path);
}
const { ctx, call } = load(['Config.gs', 'Collect.gs'], { naverGet_ });

// 소재 목록: 범위 밖 캠페인 제외, 이미지 확장소재만, 상품 구분
const list = call('fetchCreativeList_(Date.now())');
assert.deepStrictEqual(list.map((c) => c.id + ':' + c.product), [
  'ad-s1:쇼핑검색', 'ad-s2:쇼핑검색', 'ad-t1:파워링크 텍스트', 'ext-img:파워링크 확장소재', 'ext-sub:파워링크 확장소재',
]);
assert.ok(!calls.some((c) => c.q && c.q.nccCampaignId === 'c3'), '브랜드검색은 조회하지 않음');
console.log('OK 소재 목록 / 필터');

// stats: 상품별 분리, allDays, 감싸진 응답, 없는 소재 0
const statCalls = [];
globalThis.__statsHandler = (q) => {
  statCalls.push(q);
  const ids = q.ids.split(',');
  const rows = ids.filter((id) => id !== 'ad-s2').map((id) => ({ id, impCnt: 1000, clkCnt: 20, salesAmt: 5000, ccnt: 1, convAmt: 9000, avgRnk: 2.5 }));
  return q.ids.includes('ad-t1') ? { summaryStatResponse: { data: rows } } : { data: rows };
};
const stats = call('fetchStats_(creatives, {since:"2026-10-26", until:"2026-11-01"}, Date.now())', { creatives: list });
assert.strictEqual(statCalls.length, 3, '쇼핑 / 텍스트 / 확장소재 3묶음');
statCalls.forEach((q) => {
  assert.strictEqual(q.timeIncrement, 'allDays');
  assert.deepStrictEqual(JSON.parse(q.timeRange), { since: '2026-10-26', until: '2026-11-01' });
  assert.deepStrictEqual(JSON.parse(q.fields), ['impCnt', 'clkCnt', 'salesAmt', 'ccnt', 'convAmt', 'avgRnk']);
});
assert.ok(stats['ad-t1'] && stats['ext-img'] && stats['ad-s1']);
console.log('OK stats 상품별 분리 / allDays / 감싸진 응답');

const rows = call('buildRawRows_(creatives, stats, {since:"2026-10-26", until:"2026-11-01"}, "x")', { creatives: list, stats });
const s2 = rows.find((r) => r[6] === 'ad-s2');
assert.deepStrictEqual(s2.slice(7), [0, 0, 0, 0, 0, 0]);       // 응답에 없는 소재는 0
assert.strictEqual(rows.find((r) => r[6] === 'ad-s1')[8], 20);  // 클릭수
console.log('OK 조인 / 누락 소재 0');

// 배치 분할 (50개씩)
const many = Array.from({ length: 120 }, (_, i) => ({ id: 'm' + i, product: '쇼핑검색', campaign: 'c', adgroup: 'g' }));
statCalls.length = 0;
globalThis.__statsHandler = (q) => { statCalls.push(q); return { data: [] }; };
call('fetchStats_(many, {since:"a", until:"b"}, Date.now())', { many });
assert.deepStrictEqual(statCalls.map((q) => q.ids.split(',').length), [50, 50, 20]);
console.log('OK 50개씩 분할');

// 확장소재 stats 실패 시 안내 문구
globalThis.__statsHandler = (q) => { throw new Error('네이버 API 오류 400'); };
assert.throws(() => call('fetchStats_(ext, {since:"a", until:"b"}, Date.now())', { ext: [{ id: 'e1', product: '파워링크 확장소재' }] }), /STAT-REPORT ADEXTENSION/);
console.log('OK 확장소재 실패 안내');

console.log('\nALL PASSED');
