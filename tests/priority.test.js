// 실행: node tests/priority.test.js  (디자인 우선순위: 규칙 경계값, 지속, 드릴다운, 메일, 설정)
const assert = require('assert');
const { load } = require('./helpers');
const { call } = load(['Config.gs', 'Collect.gs', 'Verdict.gs', 'ItemReport.gs', 'Priority.gs', 'Alert.gs', 'Ai.gs']);

const row = (campaign, id, since, imp, clk, conv, cost, product = '쇼핑검색') => ({ since, until: since, product, campaign, adgroup: 'G', creativeId: id, imp, clk, cost, conv, convAmt: 0, rank: 0 });
const map = (workId, creativeId) => ({ row: 2, workId, creativeId, product: '', postedAt: '', replacedAt: '', memo: '', imageUrl: '', spec: '' });
const S = (o = {}) => Object.assign(JSON.parse(JSON.stringify(call('parseSettings_([])'))), o);
const P0 = '2026-10-19', P1 = '2026-10-26';
const evalWeek = (raw, week = P1, s = S(), m = []) => call('evaluatePriority_(r, m, w, s)', { r: raw, m, w: week, s });
const names = (l) => l.map((i) => i.campaign);

// ---- 설정 파싱 ----
let s = call('parseSettings_([])');
assert.deepStrictEqual([s.prioShare, s.prioMinClicks, s.prioCvr, s.dropRate], [0.1, 100, 0.005, 0.5]);
const cv = (v) => call('parseSettings_(r).prioCvr', { r: [['우선순위 전환율 기준', v, '']] });
assert.strictEqual(cv(0.005), 0.005);      // 0.5% 를 % 서식 칸에 입력
assert.strictEqual(cv(0.5), 0.005);        // 0.5 라고만 써도 0.5%
assert.strictEqual(cv(0.01), 0.01);        // 1%
assert.strictEqual(cv(1), 0.01);
assert.strictEqual(cv(''), 0.005);         // 비면 기본값
assert.strictEqual(call('parseSettings_(r).prioShare', { r: [['우선순위 광고비 비중', 10, '']] }), 0.1);   // 10 → 10%
console.log('OK 설정 파싱 (전환율 0.5 → 0.5%, 비율 10 → 10%)');

// ---- 규칙 A 경계값: 비중 10%, 클릭 100, 전환율 0.5% 모두 '이상/이하'에 포함 ----
// 캠페인 X: 광고비 100(비중 10%), 클릭 100, 전환 0.5 → 전환 5건 / 클릭 1000이면 0.5%... 클릭 100에서 0.5%는 0.5건이라 불가 → 클릭 200, 전환 1
const base = [row('Y', 'y1', P1, 5000, 500, 40, 900)];                    // 나머지 광고비 900 → X 비중 정확히 10%
const A = (x) => names(evalWeek(base.concat([x])).A);
assert.deepStrictEqual(A(row('X', 'x1', P1, 5000, 200, 1, 100)), ['X'], '경계: 비중 10%, 클릭 200, 전환율 0.5%');
assert.deepStrictEqual(A(row('X', 'x1', P1, 5000, 200, 2, 100)), [], '전환율 1% → 아님');
assert.deepStrictEqual(A(row('X', 'x1', P1, 5000, 200, 1, 99)), [], '비중 9.9% → 아님');
assert.deepStrictEqual(A(row('X', 'x1', P1, 5000, 100, 0, 100)), ['X'], '경계: 클릭 정확히 100, 전환 0');
assert.deepStrictEqual(A(row('X', 'x1', P1, 5000, 99, 0, 100)), [], '클릭 99 → 전환율을 판단하지 않음');
console.log('OK 규칙 A 경계값 (비중 10% · 클릭 100 · 전환율 0.5%)');

// ---- 규칙 B 경계값: 전주 노출 ≥ 최소 노출, 감소 정확히 50% 이상 ----
const prev = (imp) => row('Z', 'z0', P0, imp, 0, 0, 0);
const cur = (imp) => row('Z', 'z1', P1, imp, 0, 0, 0);
const other = [row('Y', 'y0', P0, 9000, 0, 0, 0), row('Y', 'y1', P1, 9000, 0, 0, 0)];
const B = (p, c) => names(evalWeek(other.concat([prev(p)], c === null ? [] : [cur(c)])).B);
assert.deepStrictEqual(B(2000, 1000), ['Z'], '경계: 정확히 -50%');
assert.deepStrictEqual(B(2000, 1001), [], '-49.95% → 아님');
assert.deepStrictEqual(B(999, 0), [], '전주 노출 1,000 미만 → 판단하지 않음');
assert.deepStrictEqual(B(1000, 500), ['Z'], '경계: 전주 정확히 1,000');
assert.deepStrictEqual(B(2000, null), ['Z'], '이번 주 데이터가 아예 없으면 -100%');
const drop = evalWeek(other.concat([prev(2000), cur(500)])).B[0];
assert.strictEqual(drop.drop, 0.75); assert.strictEqual(drop.prevImp, 2000); assert.strictEqual(drop.imp, 500);
// 전주 데이터가 전혀 없으면 규칙 B는 평가하지 않는다
assert.deepStrictEqual(evalWeek([row('Z', 'z1', P1, 10, 0, 0, 0)]).B, []);
// 이번 주 데이터가 전혀 없으면 둘 다 비어 있음
assert.deepStrictEqual(JSON.parse(JSON.stringify(evalWeek([prev(5000)], '2026-11-02'))), { week: '2026-11-02', A: [], B: [] });
console.log('OK 규칙 B 경계값 (-50% · 전주 최소 노출 · 데이터 없음)');

// ---- 임계값을 바꾸면 결과가 바뀐다 ----
const raw1 = base.concat([row('X', 'x1', P1, 5000, 200, 2, 100)]);        // 전환율 1%
assert.deepStrictEqual(names(evalWeek(raw1).A), []);
assert.deepStrictEqual(names(evalWeek(raw1, P1, S({ prioCvr: 0.01 })).A), ['X']);
console.log('OK 임계값 변경 반영');

// ---- 지속 표시, 드릴다운(작업물 ID 우선, 없으면 소재 ID), 문구 ----
const hist = [
  row('X', 'x1', P0, 5000, 200, 1, 100), row('Y', 'y1', P0, 5000, 500, 40, 900),
  row('X', 'x1', P1, 5000, 150, 0, 70), row('X', 'x2', P1, 5000, 50, 0, 30), row('Y', 'y1', P1, 5000, 500, 40, 900),
];
const ev = evalWeek(hist, P1, S(), [map('SH_X', 'x1')]);
const x = ev.A.find((i) => i.campaign === 'X');
assert.strictEqual(x.persist, true, '전주에도 걸렸으면 지속');
assert.deepStrictEqual(x.topWorks.map((w) => w.label), ['SH_X', 'x2']);   // 광고비 큰 순, 매핑된 건 작업물 ID
assert.strictEqual(x.text, call('PRIORITY_TEXT.A'));
assert.strictEqual(evalWeek(hist, P0).A.find((i) => i.campaign === 'X').persist, false);
console.log('OK 지속 표시 / 드릴다운 / 조치 후보 문구');

// ---- 메일: 제목 3가지, 본문 ----
const T = (id) => ({ workId: id, week: P1, ctr: 0.01, baseCtr: 0.02, ratio: 0.5, verdict: '개선 필요', convRate: 0.05, baseConv: 0.03, rankFlag: '', trend: 'a', product: '쇼핑검색', alertType: '개선 필요' });
const prio = JSON.parse(JSON.stringify(ev));
prio.B = [{ kind: 'B', campaign: '<b>Z</b>', products: [], prevImp: 12000, imp: 3000, drop: 0.75, persist: false, topWorks: [], text: call('PRIORITY_TEXT.B') }];
const m1 = call('buildAlertMail_(t, [], w, "u", {}, p)', { t: [T('W1')], w: P1, p: prio });
assert.strictEqual(m1.subject, '[네이버 광고 알림] 기준 이하 소재 1건 · 디자인 우선순위 2건 (10/26~11/1)');
assert.ok(m1.text.includes('■ 디자인 우선순위 · 비용은 큰데 전환율이 낮은 캠페인 (1건)'));
assert.ok(m1.text.includes('- X | 광고비 100원 (10%) | 클릭 200 | 전환 0 | 전환율 0.00% | 지속'), '본문: ' + m1.text);
assert.ok(m1.text.includes('광고비 상위 소재: SH_X, x2'));
assert.ok(m1.text.includes('→ ' + call('PRIORITY_TEXT.A')));
assert.ok(m1.text.includes('노출 12,000 → 3,000 (-75%)'));
assert.ok(!m1.html.includes('<b>Z</b>') && m1.html.includes('&lt;b&gt;Z&lt;/b&gt;'), 'HTML 이스케이프');
const m2 = call('buildAlertMail_([], [], w, "u", {}, p)', { w: P1, p: prio });
assert.strictEqual(m2.subject, '[네이버 광고 알림] 디자인 우선순위 2건 (10/26~11/1)');
const m3 = call('buildAlertMail_(t, [], w, "u", {})', { t: [T('W1')], w: P1 });
assert.strictEqual(m3.subject, '[네이버 광고 알림] 기준 이하 소재 1건 (10/26~11/1)');   // 우선순위가 없으면 기존 제목 그대로
assert.ok(!m3.text.includes('디자인 우선순위'));
assert.strictEqual(call('comma_(1234567.4)'), '1,234,567');
console.log('OK 메일 (제목 3가지, 본문, 지속, 이스케이프)');
console.log('\nALL PASSED');
