// 실행: node tests/verdict.test.js  (Apps Script 파일을 가짜 환경에서 불러와 판정 계산을 검증)
const vm = require('vm'), fs = require('fs'), path = require('path'), assert = require('assert');

const ctx = { Logger: { log() {} }, Utilities: { formatDate: () => '' } };
vm.createContext(ctx);
for (const f of ['Config.gs', 'Collect.gs', 'Verdict.gs']) {
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'src', f), 'utf8'), ctx, { filename: f });
}
const run = (code) => vm.runInContext(code, ctx);
const settings = JSON.parse(run('JSON.stringify(parseSettings_([]))'));
const WEEKS = ['2026-10-05', '2026-10-12', '2026-10-19', '2026-10-26'];

function row(product, id, since, imp, clk, rank = 0) {
  return { since, until: since, product, campaign: 'C', adgroup: 'G', creativeId: id, imp, clk, cost: clk * 100, conv: 1, convAmt: 5000, rank };
}
const map = (workId, creativeId, extra = {}) => Object.assign({ workId, creativeId, product: '', postedAt: '', replacedAt: '', memo: '' }, extra);
const SH = '쇼핑검색', PI = '파워링크 확장소재', PT = '파워링크 텍스트';
const compute = (raw, mapping, s = settings) => { ctx.__r = raw; ctx.__m = mapping; ctx.__s = s; return JSON.parse(run('JSON.stringify(computeVerdicts_(__r, __m, __s))')); };
const find = (res, work, week) => res.rows.find((r) => r[0] === work && r[1] === week);
const COL = { ctr: 2, base: 3, ratio: 4, verdict: 5, rank: 9, trend: 10, alert: 12, note: 13 };

// ---- 기본 시나리오: 쇼핑검색 소재 6개 x 4주, 기본 CTR 2% ----
const raw = [], mapping = [];
for (let i = 1; i <= 6; i++) {
  mapping.push(map('W' + i, 'S' + i));
  WEEKS.forEach((w) => {
    let imp = 10000, clk = 200, rank = 0;
    if (i === 1 && w === WEEKS[3]) clk = 100;                         // S1: 마지막 주 CTR 1%  -> 개선 필요
    if (i === 2 && w === WEEKS[3]) clk = 300;                         // S2: 3%  -> 성공
    if (i === 3) clk = { '2026-10-05': 200, '2026-10-12': 240, '2026-10-19': 220, '2026-10-26': 180 }[w]; // S3: 피로
    if (i === 4 && w === WEEKS[3]) { imp = 500; clk = 5; }            // S4: 노출 부족
    if (i === 5) rank = w === WEEKS[3] ? 4.5 : 2;                     // S5: 순위 하락
    if (i === 6) rank = 2;
    raw.push(row(SH, 'S' + i, w, imp, clk, rank));
  });
}
raw.push(row(SH, 'U1', WEEKS[3], 10000, 200));                         // 미매핑
raw.push(row(PT, 'T1', WEEKS[3], 10000, 10));                          // 텍스트: 판정 제외
const res = compute(raw, mapping);
const last = WEEKS[3];

assert.strictEqual(find(res, 'W1', last)[COL.verdict], '개선 필요');
assert.strictEqual(find(res, 'W1', last)[COL.alert], '개선 필요');
assert.strictEqual(find(res, 'W2', last)[COL.verdict], '성공');
assert.strictEqual(find(res, 'W2', last)[COL.alert], '');
assert.strictEqual(find(res, 'W4', last)[COL.verdict], '데이터 부족');
assert.strictEqual(find(res, 'W4', last)[COL.ratio], '');
assert.strictEqual(find(res, 'W5', last)[COL.rank], '순위 영향 가능');
assert.strictEqual(find(res, 'W6', last)[COL.rank], '');
assert.strictEqual(find(res, 'W6', last)[COL.verdict], '보통');
console.log('OK 성공/보통/개선 필요/데이터 부족/순위 영향');

const w3 = find(res, 'W3', last);
assert.strictEqual(w3[COL.verdict], '보통');                  // 판정은 보통이어도
assert.strictEqual(w3[COL.alert], '소재 피로');               // 피로로 알림
assert.strictEqual(w3[COL.trend], '2.40% → 2.20% → 1.80%');
assert.strictEqual(find(res, 'W3', WEEKS[2])[COL.alert], '');  // 2.4->2.2 만 하락, 3주 연속 아님
console.log('OK 소재 피로');

assert.ok(!res.rows.some((r) => r[0] === 'T1'), '텍스트 소재는 판정 제외');
assert.deepStrictEqual(res.unmapped.map((u) => u.creativeId), ['U1']);
assert.deepStrictEqual(res.mappingRate, { total: 7, unmapped: 1 });
assert.strictEqual(res.rows[0][1], last);                      // 최신 주 먼저
console.log('OK 텍스트 제외 / 미매핑 / 매핑률 / 정렬');

// ---- 경계값: 정확히 +20%, -20% ----
{
  const r2 = [], m2 = [];
  // 소재 A(1000 노출 중 클릭 x)와 B(기준선 소재) 구성: 풀 CTR이 정확히 2%가 되도록 조정
  for (let i = 1; i <= 5; i++) { m2.push(map('E' + i, 'E' + i)); r2.push(row(SH, 'E' + i, last, 10000, 200)); }
  const base = compute(r2, m2);
  assert.strictEqual(find(base, 'E1', last)[COL.verdict], '보통');
  // 풀 CTR=2% 를 유지한 채 한 소재만 2.4%, 다른 하나 1.6% -> 비율 1.2 / 0.8
  r2[0] = row(SH, 'E1', last, 10000, 240); r2[1] = row(SH, 'E2', last, 10000, 160);
  const edge = compute(r2, m2);
  assert.strictEqual(find(edge, 'E1', last)[COL.verdict], '성공');
  assert.strictEqual(find(edge, 'E2', last)[COL.verdict], '개선 필요');
  console.log('OK 경계값 +20% / -20% 포함');
}

// ---- 교체 매핑: 같은 소재 ID, 작업물 ID 교체 ----
{
  const r3 = [], m3 = [map('OLD', 'X', { replacedAt: '2026-10-19' }), map('NEW', 'X', { postedAt: '2026-10-19' })];
  WEEKS.forEach((w) => r3.push(row(SH, 'X', w, 10000, 200)));
  const c = compute(r3, m3);
  const weeksOf = (id) => c.rows.filter((r) => r[0] === id).map((r) => r[1]).sort();
  assert.deepStrictEqual(weeksOf('OLD'), ['2026-10-05', '2026-10-12']);
  assert.deepStrictEqual(weeksOf('NEW'), ['2026-10-19', '2026-10-26']);
  assert.strictEqual(c.unmapped.length, 0);
  console.log('OK 교체일 기준 작업물 ID 분리');
}

// ---- 기준선 소재 수 부족: 판정은 하되 알림 끔 ----
{
  const r4 = [], m4 = [];
  for (let i = 1; i <= 3; i++) { m4.push(map('P' + i, 'P' + i)); r4.push(row(PI, 'P' + i, last, 10000, i === 1 ? 20 : 300, 2)); }
  const c = compute(r4, m4);
  const p1 = find(c, 'P1', last);
  assert.strictEqual(p1[COL.verdict], '개선 필요');
  assert.strictEqual(p1[COL.alert], '');
  assert.ok(p1[COL.note].indexOf('알림 끔') >= 0);
  console.log('OK 소재 수 부족 시 알림 끔');
}

// ---- 설정 파싱: 비어 있으면 기본값, 20 입력은 20% ----
{
  const s = JSON.parse(run("JSON.stringify(parseSettings_([['성공 기준', 20, ''], ['최소 노출', '', ''], ['AI 사용 여부', true, '']]))"));
  assert.strictEqual(s.successRate, 0.2);
  assert.strictEqual(s.minImpressions, 1000);
  assert.strictEqual(s.aiEnabled, true);
  console.log('OK 설정 파싱');
}
console.log('\nALL PASSED');
