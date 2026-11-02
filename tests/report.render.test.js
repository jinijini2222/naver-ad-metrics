// 실행: node tests/report.render.test.js   (Playwright + Chromium 필요, 없으면 건너뜀)
// 데모 데이터로 판정을 계산해 보고서 화면에 넣고, 수치·서브 창·상호작용을 실제 브라우저에서 확인한다.
const assert = require('assert'), path = require('path'), fs = require('fs'), os = require('os');
let chromium;
try { ({ chromium } = require('playwright')); } catch (e) { console.log('SKIP playwright 없음'); process.exit(0); }
const { load } = require('./helpers');

const { call } = load(['Config.gs', 'Collect.gs', 'Verdict.gs', 'Mapping.gs', 'Alert.gs', 'Ai.gs', 'Report.gs', 'Demo.gs']);
const demo = call('buildDemoData_(new Date())');
const res = call('computeVerdicts_(parseRaw_(r), parseMapping_(m), parseSettings_([]))', { r: demo.rows, m: demo.mapping });
const data = call('buildReportData_(parseVerdictRows_(v), parseMapping_(m), new Date())', { v: res.rows, m: demo.mapping.concat([['', 'demo-S6', '쇼핑검색', '', '', '미매핑(자동 추가) | 데모 캠페인 / 데모 그룹']]) });

(async () => {
  const shots = process.env.SHOT_DIR || fs.mkdtempSync(path.join(os.tmpdir(), 'report-'));
  fs.mkdirSync(shots, { recursive: true });
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1060, height: 760 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  // Apps Script 의 google.script.run 흉내
  await page.addInitScript((d) => {
    window.google = { script: { run: {
      withSuccessHandler(fn) { this._s = fn; return this; },
      withFailureHandler(fn) { this._f = fn; return this; },
      getReportData() { const s = this._s; setTimeout(() => s(JSON.parse(JSON.stringify(d))), 0); },
    } } };
  }, data);
  await page.goto('file://' + path.join(__dirname, '..', 'src', 'ReportGraph.html'));
  await page.waitForSelector('#kpis .kpi');

  const kpis = await page.$$eval('#kpis .kpi', (n) => n.map((k) => [k.querySelector('.l').textContent, k.querySelector('.n').textContent]));
  assert.deepStrictEqual(kpis, [['판정 대상', '10'], ['성공', '1'], ['보통', '6'], ['개선 필요', '2'], ['데이터 부족', '1'], ['알림 대상', '3']]);
  console.log('OK KPI 수치', JSON.stringify(Object.fromEntries(kpis)));

  // 판정 분포 막대: 수치 라벨
  const dist = await page.$$eval('#dist svg text', (t) => t.map((x) => x.textContent));
  assert.ok(dist.includes('6건 (60%)') && dist.includes('2건 (20%)') && dist.includes('1건 (10%)'), '분포 라벨: ' + dist.join('|'));
  console.log('OK 판정 분포 그래프 수치 라벨');

  // 작업물별 막대: 10행, 나쁜 순서, 값 텍스트
  const rows = await page.$$eval('#works .row', (n) => n.map((r) => [r.dataset.work, r.querySelector('.val').textContent]));
  assert.strictEqual(rows.length, 10);
  assert.ok(['DEMO_S1', 'DEMO_P1'].includes(rows[0][0]), '가장 낮은 작업물이 맨 위: ' + rows[0][0]);
  assert.match(rows[0][1], /^1\.00% \(-5\d%\)$/);
  assert.match(rows.find((r) => r[0] === 'DEMO_S4')[1], /데이터 부족/);
  assert.strictEqual(rows[rows.length - 1][0], 'DEMO_S4', '데이터 부족은 맨 아래');
  console.log('OK 작업물별 막대 (정렬, 수치)');

  // 추이 그래프: 기준선 2개 + 선택한 작업물, 점마다 수치
  const legend0 = await page.$$eval('#trendLegend span', (s) => s.map((x) => x.textContent));
  assert.ok(legend0.some((t) => t.startsWith('기준선 · 쇼핑검색')) && legend0.some((t) => t.startsWith('기준선 · 파워링크 확장소재')));
  assert.ok(legend0.includes(await page.$eval('#works .row.sel', (r) => r.dataset.work)), '선택 작업물이 범례에 있음');
  const labels = await page.$$eval('#trend svg text', (t) => t.map((x) => x.textContent));
  assert.ok(labels.includes('2.00%') && labels.some((x) => x.endsWith('주')), '추이 수치 라벨: ' + labels.join('|'));
  // 기준선 수치는 그래프 아래 표에 주차별로 표시
  const tbl = await page.$$eval('#trendTable tbody tr', (r) => r.map((x) => Array.from(x.cells).map((c) => c.textContent)));
  const shop = tbl.find((r) => r[0].startsWith('기준선 · 쇼핑검색'));
  assert.strictEqual(shop.length, 5, '이름 + 4주');
  assert.ok(shop[4].endsWith('%') && shop[4] !== '-', '쇼핑검색 기준선 수치: ' + shop.join('|'));
  await page.click('#works .row[data-work="DEMO_S3"]');
  assert.ok((await page.$$eval('#trendLegend span', (s) => s.map((x) => x.textContent))).includes('DEMO_S3'));
  const s3 = await page.$$eval('#trend svg text', (t) => t.map((x) => x.textContent));
  assert.ok(s3.includes('2.40%') && s3.includes('2.20%') && s3.includes('1.80%'), 'S3 3주 추이 수치: ' + s3.join('|'));
  console.log('OK 추이 그래프 (기준선 + 선택 작업물, 점별 수치)');

  await page.screenshot({ path: path.join(shots, '1-graph.png') });

  // 일반 보고서 서브 창
  assert.strictEqual(await page.isVisible('#sub'), false, '처음에는 서브 창이 닫혀 있음');
  await page.click('#openGeneral');
  assert.strictEqual(await page.isVisible('#sub'), true);
  assert.strictEqual(await page.textContent('#subbody h1'), '광고 소재 성과 주간 보고서');
  const heads = await page.$$eval('#subbody h3', (h) => h.map((x) => x.textContent));
  assert.deepStrictEqual(heads, ['1. 요약', '2. 광고 상품별 기준선', '3. 알림 대상 (3건)', '4. 전체 작업물', '5. 미매핑 소재 (1건)']);
  const tables = await page.$$eval('#subbody table', (t) => t.map((x) => x.querySelectorAll('tbody tr').length));
  assert.deepStrictEqual(tables, [4, 2, 3, 10, 1]);
  const summary = await page.$eval('#subbody p:nth-of-type(2)', (p) => p.textContent);
  assert.match(summary, /판정 대상 10건 중 성공 1건, 보통 6건, 개선 필요 2건, 데이터 부족 1건/);
  const alertRows = await page.$$eval('#subbody table:nth-of-type(3) tbody tr', (r) => r.map((x) => x.cells[0].textContent));
  assert.deepStrictEqual(alertRows.sort(), ['DEMO_P1', 'DEMO_S1', 'DEMO_S3']);
  const diag = await page.$eval('#subbody', (b) => b.textContent);
  assert.ok(diag.includes('입찰·순위 확인 먼저') && diag.includes('소재 피로'), '진단 문구');
  console.log('OK 일반 보고서 서브 창 (섹션 5개, 표 행 수, 요약, 알림 대상, 진단)');
  await page.screenshot({ path: path.join(shots, '2-general.png') });

  // 서브 창 닫기: Esc, 배경 클릭, 닫기 버튼
  await page.keyboard.press('Escape');
  assert.strictEqual(await page.isVisible('#sub'), false);
  await page.click('#openGeneral'); await page.click('#closeSub');
  assert.strictEqual(await page.isVisible('#sub'), false);
  await page.click('#openGeneral'); await page.mouse.click(8, 8);
  assert.strictEqual(await page.isVisible('#sub'), false);
  console.log('OK 서브 창 닫기 (Esc / 닫기 / 배경)');

  // 제목 줄을 끌어 이동
  await page.click('#openGeneral');
  const before = await page.$eval('#sub', (e) => e.getBoundingClientRect().left);
  const bar = await page.$eval('#subbar', (e) => { const r = e.getBoundingClientRect(); return [r.left + 40, r.top + 10]; });
  await page.mouse.move(bar[0], bar[1]); await page.mouse.down(); await page.mouse.move(bar[0] - 60, bar[1] + 30); await page.mouse.up();
  const after = await page.$eval('#sub', (e) => e.getBoundingClientRect().left);
  assert.ok(Math.abs((before - after) - 60) < 3, `서브 창 이동 ${before} → ${after}`);
  await page.keyboard.press('Escape');
  console.log('OK 서브 창 이동');

  // 주차·상품 필터
  const weeks = await page.$$eval('#week option', (o) => o.map((x) => x.value));
  assert.strictEqual(weeks.length, 4);
  await page.selectOption('#week', weeks[1]);
  assert.ok((await page.textContent('#meta')).includes(data.weekLabels[weeks[1]]));
  await page.selectOption('#week', weeks[0]);
  await page.selectOption('#product', '파워링크 확장소재');
  const k2 = await page.$$eval('#kpis .n', (n) => n.map((x) => x.textContent));
  assert.deepStrictEqual(k2, ['5', '0', '4', '1', '0', '1']);
  assert.strictEqual((await page.$$('#works .row')).length, 5);
  console.log('OK 주차·상품 필터');

  // 데이터 없음 / 오류 상태
  const page2 = await browser.newPage({ viewport: { width: 1060, height: 400 } });
  await page2.addInitScript(() => { window.google = { script: { run: {
    withSuccessHandler(fn) { this._s = fn; return this; }, withFailureHandler(fn) { this._f = fn; return this; },
    getReportData() { const f = this._f; setTimeout(() => f(new Error('권한 오류')), 0); } } } }; });
  await page2.goto('file://' + path.join(__dirname, '..', 'src', 'ReportGraph.html'));
  await page2.waitForSelector('#err', { state: 'visible' });
  assert.match(await page2.textContent('#err'), /데이터를 불러오지 못했습니다: 권한 오류/);
  console.log('OK 오류 상태 표시');

  assert.deepStrictEqual(errors, [], '브라우저 오류: ' + errors.join(' / '));
  console.log('OK 브라우저 콘솔 오류 없음');
  await browser.close();
  console.log('\nALL PASSED  (스크린샷: ' + shots + ')');
})().catch((e) => { console.error(e); process.exit(1); });
