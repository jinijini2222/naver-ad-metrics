/**
 * 7-2. 디자인 우선순위: 소재를 새로 만들거나 교체할 후보 캠페인을 찾는다. 전환은 '총 전환수' 기준.
 *   A. 비용은 큰데 전환율이 낮은 캠페인: 광고비 비중 ≥ 기준 AND 클릭 ≥ 최소 클릭 AND 전환율 ≤ 기준
 *   B. 노출이 전주 대비 크게 줄어든 캠페인: 전주 노출 ≥ 최소 노출 AND 이번 주 노출 ≤ 전주 × (1 - 감소 기준)
 * 전환율 낮음·노출 감소는 디자인만의 원인이 아니므로 결과에 확인 문구를 붙인다.
 */

/** 캠페인 → 주 → 합산 */
function aggregateCampaignWeeks_(raw) {
  var camps = {};
  raw.forEach(function (r) {
    if (!r.campaign) return;
    var c = camps[r.campaign] = camps[r.campaign] || {};
    var w = c[r.since] = c[r.since] || { imp: 0, clk: 0, cost: 0, conv: 0, products: {} };
    w.imp += r.imp; w.clk += r.clk; w.cost += r.cost; w.conv += r.conv;
    if (r.product) w.products[r.product] = true;
  });
  return camps;
}

/** 한 주의 A·B 후보 (지속 표시·드릴다운 전) */
function evalPriorityCore_(camps, week, s) {
  var prevWeek = addDays_(week, -7), names = Object.keys(camps), total = 0, present = false, prevPresent = false;
  names.forEach(function (n) {
    if (camps[n][week]) { present = true; total += camps[n][week].cost; }
    if (camps[n][prevWeek]) prevPresent = true;
  });
  var A = [], B = [];
  if (!present) return { A: A, B: B };
  names.forEach(function (n) {
    var w = camps[n][week], p = camps[n][prevWeek];
    if (w) {
      var share = total > 0 ? w.cost / total : 0;
      var cvr = w.clk > 0 ? w.conv / w.clk : null;
      if (share >= s.prioShare - EPS && w.clk >= s.prioMinClicks && cvr !== null && cvr <= s.prioCvr + EPS) {
        A.push({ kind: 'A', campaign: n, products: Object.keys(w.products), cost: w.cost, share: share, clk: w.clk, conv: w.conv, cvr: cvr });
      }
    }
    if (prevPresent) {   // 전주 데이터가 없으면 비교하지 않는다
      var prevImp = p ? p.imp : 0, imp = w ? w.imp : 0;
      if (prevImp >= s.minImpressions && imp <= prevImp * (1 - s.dropRate) + EPS) {
        B.push({ kind: 'B', campaign: n, products: Object.keys((w || p).products), prevImp: prevImp, imp: imp, drop: 1 - imp / prevImp });
      }
    }
  });
  A.sort(function (x, y) { return y.cost - x.cost; });
  B.sort(function (x, y) { return y.drop - x.drop || y.prevImp - x.prevImp; });
  return { A: A, B: B };
}

/** 캠페인 안에서 광고비가 큰 소재(작업물 ID, 없으면 소재 ID) 상위 n개 */
function topWorksOf_(raw, mapping, campaign, week, n) {
  var idx = indexMapping_(mapping), sums = {};
  raw.forEach(function (r) {
    if (r.campaign !== campaign || r.since !== week) return;
    var res = resolveWork_(idx, r.creativeId, r.since);
    var label = res.hit ? res.hit.workId : r.creativeId;
    sums[label] = (sums[label] || 0) + r.cost;
  });
  return Object.keys(sums).map(function (k) { return { label: k, cost: sums[k] }; })
    .sort(function (a, b) { return b.cost - a.cost || (a.label < b.label ? -1 : 1); }).slice(0, n);
}

/**
 * 한 주의 디자인 우선순위. 같은 대상이 전주에도 걸렸으면 persist(지속)로 표시한다.
 * @return {{week:string, A:Array, B:Array}}
 */
function evaluatePriority_(raw, mapping, week, s) {
  var camps = aggregateCampaignWeeks_(raw);
  var cur = evalPriorityCore_(camps, week, s), prev = evalPriorityCore_(camps, addDays_(week, -7), s);
  function names(list) { var o = {}; list.forEach(function (i) { o[i.campaign] = true; }); return o; }
  var prevA = names(prev.A), prevB = names(prev.B);
  cur.A.forEach(function (i) { i.persist = !!prevA[i.campaign]; i.topWorks = topWorksOf_(raw, mapping, i.campaign, week, 3); i.text = PRIORITY_TEXT.A; });
  cur.B.forEach(function (i) { i.persist = !!prevB[i.campaign]; i.topWorks = topWorksOf_(raw, mapping, i.campaign, addDays_(week, -7), 3); i.text = PRIORITY_TEXT.B; });
  return { week: week, A: cur.A, B: cur.B };
}

function comma_(n) { return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ','); }

/** 메일용 블록: [{title, items:[{head, lines:[...]}]}] — 텍스트와 HTML이 같은 내용을 쓴다. */
function priorityBlocks_(p) {
  var blocks = [];
  if (p.A.length) {
    blocks.push({ title: '디자인 우선순위 · 비용은 큰데 전환율이 낮은 캠페인 (' + p.A.length + '건)', items: p.A.map(function (i) {
      var lines = [];
      if (i.topWorks && i.topWorks.length) lines.push('광고비 상위 소재: ' + i.topWorks.map(function (w) { return w.label; }).join(', '));
      lines.push('→ ' + i.text);
      return { head: i.campaign + ' | 광고비 ' + comma_(i.cost) + '원 (' + (i.share * 100).toFixed(0) + '%) | 클릭 ' + comma_(i.clk) +
        ' | 전환 ' + comma_(i.conv) + ' | 전환율 ' + (i.cvr * 100).toFixed(2) + '%' + (i.persist ? ' | 지속' : ''), lines: lines };
    }) });
  }
  if (p.B.length) {
    blocks.push({ title: '디자인 우선순위 · 노출이 전주 대비 크게 줄어든 캠페인 (' + p.B.length + '건)', items: p.B.map(function (i) {
      var lines = [];
      if (i.topWorks && i.topWorks.length) lines.push('전주 광고비 상위 소재는 같은 캠페인의 ' + i.topWorks.map(function (w) { return w.label; }).join(', ') + ' 입니다.');
      lines.push('→ ' + i.text);
      return { head: i.campaign + ' | 노출 ' + comma_(i.prevImp) + ' → ' + comma_(i.imp) + ' (-' + (i.drop * 100).toFixed(0) + '%)' + (i.persist ? ' | 지속' : ''), lines: lines };
    }) });
  }
  return blocks;
}
