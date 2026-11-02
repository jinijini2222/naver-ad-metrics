// 실행: node tests/ai.test.js  (Claude API 호출을 가짜로 바꿔 요청 형태와 오류 처리를 검증)
const assert = require('assert');
const { load } = require('./helpers');

let responses = [], requests = [];
const resp = (code, body) => ({ getResponseCode: () => code, getContentText: () => JSON.stringify(body) });
const ok = (text, extra = {}) => resp(200, Object.assign({ stop_reason: 'end_turn', content: [{ type: 'thinking', thinking: '' }, { type: 'text', text }] }, extra));
const globals = {
  PropertiesService: { getScriptProperties: () => ({ getProperty: () => globals.__key }) },
  UrlFetchApp: { fetch: (url, opt) => { requests.push({ url, opt, body: JSON.parse(opt.payload) }); return responses.shift(); } },
};
globals.__key = 'sk-test';
const { call } = load(['Config.gs', 'Collect.gs', 'Verdict.gs', 'Ai.gs', 'Alert.gs'], globals);
const T = (o) => Object.assign({ workId: 'W1', product: '쇼핑검색', verdict: '개선 필요', alertType: '개선 필요', ctr: 0.01, baseCtr: 0.02,
  convRate: 0.05, baseConv: 0.03, trend: 'a → b → c', rankFlag: '', ratio: 0.5 }, o);
const reset = (...r) => { responses = r; requests = []; };

// 요청 형태
reset(ok('원인 가설: x'));
assert.strictEqual(call('generateAdvice_(t)', { t: T() }), '원인 가설: x');
const rq = requests[0];
assert.strictEqual(rq.url, 'https://api.anthropic.com/v1/messages');
assert.strictEqual(rq.opt.headers['x-api-key'], 'sk-test');
assert.strictEqual(rq.opt.headers['anthropic-version'], '2023-06-01');
assert.strictEqual(rq.body.model, 'claude-opus-5-5');
assert.deepStrictEqual(rq.body.output_config, { effort: 'medium' });
assert.strictEqual(rq.body.fallbacks, 'default');
['temperature', 'top_p', 'top_k', 'thinking', 'tool_choice'].forEach((k) => assert.ok(!(k in rq.body), k + ' 는 보내지 않음'));
assert.strictEqual(rq.body.messages.length, 1);
assert.strictEqual(rq.body.messages[0].role, 'user');                 // prefill 없음
assert.match(rq.body.messages[0].content, /<data>[\s\S]*작업물 ID: W1[\s\S]*<\/data>/);
assert.match(rq.body.system, /원인 가설[\s\S]*수정 제안[\s\S]*다음 A\/B 테스트[\s\S]*주의/);
console.log('OK 요청 형태 (금지 파라미터 없음)');

// 순위 영향: 프롬프트에 규칙 포함, 모델이 빠뜨려도 보강
reset(ok('원인 가설: x\n주의: 키워드 확인'));
const withRank = call('generateAdvice_(t)', { t: T({ rankFlag: '순위 영향 가능' }) });
assert.match(requests[0].body.messages[0].content, /반드시 "입찰·순위 확인 먼저"/);
assert.match(withRank, /입찰·순위 확인 먼저/);
reset(ok('주의: 입찰·순위 확인 먼저 하세요'));
assert.strictEqual((call('generateAdvice_(t)', { t: T({ rankFlag: '순위 영향 가능' }) }).match(/입찰·순위 확인 먼저/g) || []).length, 1);
console.log('OK 순위 영향 문장');

// 폴백 파라미터로 400 → 폴백 없이 재시도
reset(resp(400, { error: 'x' }), ok('두번째'));
assert.strictEqual(call('generateAdvice_(t)', { t: T() }), '두번째');
assert.strictEqual(requests.length, 2);
assert.ok('fallbacks' in requests[0].body && !('fallbacks' in requests[1].body));
assert.ok(!('anthropic-beta' in requests[1].opt.headers));
console.log('OK 400 시 폴백 없이 재시도');

// 실패는 null (알림은 계속)
reset(resp(400, {}), resp(401, {}));       assert.strictEqual(call('generateAdvice_(t)', { t: T() }), null);
reset(ok('x', { stop_reason: 'refusal', stop_details: { category: 'cyber' } })); assert.strictEqual(call('generateAdvice_(t)', { t: T() }), null);
reset(resp(200, { stop_reason: 'end_turn', content: [] })); assert.strictEqual(call('generateAdvice_(t)', { t: T() }), null);
globals.__key = '';  reset();               assert.strictEqual(call('generateAdvice_(t)', { t: T() }), null);
assert.strictEqual(requests.length, 0, '키가 없으면 호출하지 않음');
console.log('OK 오류/거절/키 없음 → null');
console.log('\nALL PASSED');
