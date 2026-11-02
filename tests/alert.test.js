// 실행: node tests/alert.test.js  (알림 선택·진단·메일 본문·최신성 검사)
const assert = require('assert');
const { load } = require('./helpers');
const { call } = load(['Config.gs', 'Collect.gs', 'Verdict.gs', 'Ai.gs', 'Alert.gs']);

const T = (o) => Object.assign({
  workId: 'W1', week: '2026-09-14', ctr: 0.01, baseCtr: 0.02, ratio: 0.5, verdict: '개선 필요', convRate: 0.05, cpc: 100,
  roas: 3, rankFlag: '', trend: '2.00% → 1.50% → 1.00%', product: '쇼핑검색', alertType: '개선 필요', note: '', baseConv: 0.03,
}, o);

// 진단
assert.match(call('diagnose_(t)', { t: T({}) }), /클릭 후 전환율은 기준 이상 → 썸네일·이미지 첫인상/);
assert.match(call('diagnose_(t)', { t: T({ convRate: 0.01 }) }), /전환율도 기준 미달/);
assert.match(call('diagnose_(t)', { t: T({ rankFlag: '순위 영향 가능' }) }), /입찰·순위 확인 먼저/);
assert.match(call('diagnose_(t)', { t: T({ verdict: '보통', alertType: '소재 피로' }) }), /소재 피로/);
assert.strictEqual(call('diagnose_(t)', { t: T({ verdict: '보통', alertType: '소재 피로', convRate: '', baseConv: '' }) }).indexOf('전환율'), -1);
console.log('OK 규칙 기반 진단');

// 메일 제목: 9/14~9/20, 건수
const mail = call('buildAlertMail_(t, u, "2026-09-14", "https://sheet", a)', {
  t: [T({}), T({ workId: 'W2', verdict: '보통', alertType: '소재 피로', rankFlag: '순위 영향 가능' })],
  u: [{ creativeId: 'nad-9', product: '쇼핑검색', memo: '미매핑(자동 추가) | C / G' }],
  a: { W1: '원인 가설: 첫인상이 약함' },
});
assert.strictEqual(mail.subject, '[네이버 광고 알림] 기준 이하 소재 2건 (9/14~9/20)');
assert.ok(mail.text.includes('W1 | 쇼핑검색 | CTR 1.00% (기준선 2.00%, 기준선 대비 -50%) | 개선 필요'));
assert.ok(mail.text.includes('[AI 개선안 초안]') && mail.text.includes('원인 가설: 첫인상이 약함'));
assert.ok(mail.text.includes('미매핑 소재 1건') && mail.text.includes('nad-9'));
assert.ok(mail.text.includes('판정 탭: https://sheet'));
assert.ok(mail.html.includes('href="https://sheet"'));
// AI 없는 소재(W2)는 개선안 블록이 없다
assert.strictEqual((mail.text.match(/\[AI 개선안 초안\]/g) || []).length, 1);
console.log('OK 메일 제목/본문');

// HTML 이스케이프
const evil = call('buildAlertMail_(t, [], "2026-09-14", "u", {})', { t: [T({ workId: '<script>x</script>' })] });
assert.ok(!evil.html.includes('<script>') && evil.html.includes('&lt;script&gt;'));
console.log('OK HTML 이스케이프');

// 대상 선택: 최신 주 + 알림 유형 있는 것만
const V = [T({}), T({ workId: 'W2', alertType: '' }), T({ workId: 'W3', week: '2026-09-07' })];
assert.deepStrictEqual(call('selectAlertTargets_(v, "2026-09-14")', { v: V }).map((x) => x.workId), ['W1']);

// 알림 주차: 2026-09-21(월) 기준 지난주 = 09-14
const now = new Date('2026-09-21T11:00:00+09:00');
assert.strictEqual(call('pickAlertWeek_(v, n, true)', { v: V, n: now }), '2026-09-14');
assert.throws(() => call('pickAlertWeek_(v, n, true)', { v: [T({ week: '2026-09-07' })], n: now }), /지난주\(2026-09-14\) 결과가 없습니다/);
assert.strictEqual(call('pickAlertWeek_(v, n, false)', { v: V, n: now }), '2026-09-14');
console.log('OK 대상 선택 / 주차 결정 / 이전 주 데이터 금지');

// 최신성 검사
const raw = (since) => [{ since }];
assert.strictEqual(call('checkFreshness_(r, n).ok', { r: raw('2026-09-14'), n: now }), true);
assert.strictEqual(call('checkFreshness_(r, n).ok', { r: raw('2026-09-07'), n: now }), false);
assert.strictEqual(call('checkFreshness_([], n).ok', { n: now }), false);
console.log('OK 최신성 검사');

// 판정 탭 파싱 (15번째 열이 없는 구버전 행도 허용)
const parsed = call('parseVerdictRows_([["W1","2026-09-14",0.01,0.02,0.5,"개선 필요",0.05,100,3,"","a","쇼핑검색","개선 필요",""]])');
assert.strictEqual(parsed[0].baseConv, '');
assert.strictEqual(call('parseRecipients_("a@x.com, b@y.com;bad")'), 'a@x.com,b@y.com');
console.log('OK 파싱');
console.log('\nALL PASSED');
