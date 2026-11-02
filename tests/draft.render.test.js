// 실행: node tests/draft.render.test.js  (Playwright 필요, 없으면 건너뜀)
// docs/draft/automation-screens.html 초안이 실제 브라우저에서 오류 없이 뜨고, 각 탭의 규칙 계산이 PRD와 맞는지 확인한다.
const assert = require('assert'), path = require('path'), fs = require('fs'), os = require('os');
let chromium; try { ({ chromium } = require('playwright')); } catch (e) { console.log('SKIP playwright 없음'); process.exit(0); }

(async () => {
  const shots = process.env.SHOT_DIR || fs.mkdtempSync(path.join(os.tmpdir(), 'draft-'));
  fs.mkdirSync(shots, { recursive: true });
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1100, height: 780 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto('file://' + path.join(__dirname, '..', 'docs', 'draft', 'automation-screens.html'));

  const names = await page.$$eval('[role=tab]', (t) => t.map((x) => x.textContent));
  assert.deepStrictEqual(names, ['1. 소재 주간 리포트', '2. 디자인 우선순위', '3. 규격 점검', '4. 교체 전후 기록', '5. 이상 징후', '6. 수집 현황']);
  assert.ok((await page.textContent('[role=note]')).includes('샘플 데이터'));
  console.log('OK 탭 6개, 초안·샘플 데이터 표시');

  // ① 합계 = 행의 합, 판정 규칙
  const sums = await page.$$eval('#panel0 tbody tr', (r) => r.map((x) => [x.cells[3].textContent, x.cells[4].textContent].map((v) => +v.replace(/,/g, ''))));
  const foot = await page.$$eval('#panel0 tfoot td', (c) => c.map((x) => x.textContent));
  assert.strictEqual(sums.reduce((a, r) => a + r[0], 0), +foot[3].replace(/,/g, ''), '노출 합계');
  assert.strictEqual(sums.reduce((a, r) => a + r[1], 0), +foot[4].replace(/,/g, ''), '클릭 합계');
  const verdicts = await page.$$eval('#panel0 tbody tr', (r) => Object.fromEntries(r.map((x) => [x.cells[1].textContent, x.cells[9].textContent])));
  assert.strictEqual(verdicts['SH_1026_A'], '데이터 부족');           // 노출 640
  assert.strictEqual(verdicts['SH_1012_A'], '개선 필요');
  assert.strictEqual(verdicts['SH_0928_A'], '성공');                    // 기준선 대비 +33%
  assert.strictEqual(verdicts['SH_1019_B'], '보통');                    // +14%: 성공 기준(+20%) 미달
  const alerts = await page.$$eval('#panel0 tbody tr', (r) => Object.fromEntries(r.map((x) => [x.cells[1].textContent, x.cells[10].textContent])));
  assert.strictEqual(alerts['SH_1012_A'], '개선 필요');                 // 쇼핑검색은 소재 5개 → 알림
  assert.match(alerts['PI_1005_B'], /알림 끔 \(소재 3개\)/);           // 파워링크 확장소재는 3개 → 알림 끔
  assert.strictEqual(alerts['PI_0928_A'], '소재 피로');
  await page.selectOption('#panel0 select >> nth=1', '파워링크 확장소재');
  assert.strictEqual((await page.$$('#panel0 tbody tr')).length, 3);
  await page.selectOption('#panel0 select >> nth=2', 'ctr');
  const first = await page.$eval('#panel0 tbody tr', (r) => r.cells[1].textContent);
  assert.strictEqual(first, 'PI_1019_A');                              // 파워링크 중 CTR 최고 (2.61%)
  console.log('OK ①: 합계 일치, 판정 규칙, 필터·정렬');
  await page.screenshot({ path: path.join(shots, 'draft-1.png') });

  // ② 기본 임계값 결과와 임계값 변경
  await page.click('#tab1');
  const a = await page.$$eval('#panel1 .box:nth-of-type(1) tbody tr, #panel1 .two > .box:first-child tbody tr', (r) => r.map((x) => x.cells[0].textContent));
  assert.deepStrictEqual(a.sort(), ['캠페인 A · 쇼핑 전체상품', '캠페인 C · 쇼핑 카테고리1']);   // 광고비 비중 ≥10%, 클릭 ≥100, 전환율 ≤0.5%
  const b = await page.$$eval('#panel1 .two > .box:nth-child(2) tbody tr', (r) => r.map((x) => x.cells[0].textContent));
  assert.deepStrictEqual(b.sort(), ['캠페인 B · 쇼핑 신제품', '캠페인 D · 쇼핑 카테고리2']);   // 전주 대비 -50% 이상
  await page.fill('#th-clicks', '50');                                  // 최소 클릭 낮춤 → 캠페인 D(클릭 90, 전환 0)도 A 조건(비중 ≥ 10%?)
  const a2 = await page.$$eval('#panel1 .two > .box:first-child tbody tr', (r) => r.map((x) => x.cells[0].textContent));
  assert.ok(a2.length >= 2, '임계값을 바꾸면 다시 계산됨: ' + a2.join(','));
  await page.fill('#th-drop', '80');
  assert.strictEqual((await page.$$('#panel1 .two > .box:nth-child(2) tbody tr')).length, 0);
  console.log('OK ②: 규칙 A/B 결과와 임계값 재계산');
  await page.fill('#th-clicks', '100'); await page.fill('#th-drop', '50');
  await page.screenshot({ path: path.join(shots, 'draft-2.png') });

  // ③ 규격: 교체 완료는 목록 맨 아래·D-day
  await page.click('#tab2');
  const lst = await page.$$eval('#panel2 .box:last-child tbody tr', (r) => r.map((x) => [x.cells[0].textContent, x.cells[3].textContent]));
  assert.deepStrictEqual(lst, [['BN_1001_A', 'D-29'], ['BN_1012_C', 'D-29'], ['BN_0915_B', '-']]);
  assert.ok((await page.textContent('#panel2 .warn')).includes('예시 데이터'));
  console.log('OK ③: 교체 목록, D-day, 교체 완료 분리');
  await page.screenshot({ path: path.join(shots, 'draft-3.png') });

  // ④ 결과 라벨과 선택
  await page.click('#tab3');
  const res = await page.$$eval('#panel3 tbody tr', (r) => r.map((x) => x.cells[9].textContent));
  assert.deepStrictEqual(res, ['개선', '악화', '변화 없음', '데이터 부족', '집계 중']);
  await page.click('#panel3 tbody tr:nth-child(2)');
  assert.ok((await page.textContent('#panel3 .box:last-child h2')).includes('PI_0914_A → PI_1005_B'));
  assert.ok((await page.textContent('#panel3 .box:last-child .note')).includes('악화'));
  console.log('OK ④: 결과 5종, 행 선택으로 전후 그래프 갱신');
  await page.screenshot({ path: path.join(shots, 'draft-4.png') });

  // ⑤ ⑥
  await page.click('#tab4');
  assert.strictEqual((await page.$$('#panel4 .feed li')).length, 4);
  await page.click('#tab5');
  const st = await page.$$eval('#panel5 tbody tr', (r) => r.map((x) => x.cells[4].textContent));
  assert.deepStrictEqual(st, ['완료', '완료', '경고', '형식 오류']);
  await page.screenshot({ path: path.join(shots, 'draft-6.png') });
  await page.click('#tab4'); await page.screenshot({ path: path.join(shots, 'draft-5.png') });
  console.log('OK ⑤⑥: 알림 목록, 파일 처리 상태');

  // 키보드: 방향키로 탭 이동
  await page.focus('#tab0'); await page.keyboard.press('ArrowRight');
  assert.strictEqual(await page.getAttribute('#tab1', 'aria-selected'), 'true');
  assert.strictEqual(await page.isVisible('#panel1'), true);
  assert.strictEqual(await page.isVisible('#panel0'), false);
  console.log('OK 키보드 탭 이동');

  assert.deepStrictEqual(errors, [], '브라우저 오류: ' + errors.join(' / '));
  await browser.close();
  console.log('\nALL PASSED  (스크린샷: ' + shots + ')');
})().catch((e) => { console.error(e); process.exit(1); });
