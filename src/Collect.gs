/**
 * 2단계: 네이버 광고 소재 목록 + 지난주 성과를 수집해 '네이버_원본' 탭에 기록한다.
 * 모두 조회(GET)만 사용한다. 필드명·엔드포인트는 0단계 조사 결과(docs/STAGE0_FINDINGS.md) 기준.
 */

// ---------- 진입점 ----------

/** 월 09:00 트리거용. 지난주 수집 + 2주 전 재수집. 실패하면 오류 메일 + 알림_로그 기록. */
function collectWeekly() {
  var started = Date.now();
  try {
    var creatives = fetchCreativeList_(started);
    [0, COLLECT.RECOLLECT_WEEKS_AGO].forEach(function (weeksAgo) {
      var range = getWeekRange_(new Date(), weeksAgo + 1); // 1 = 지난주
      collectRange_(creatives, range, started);
    });
  } catch (e) {
    notifyError_('수집 실패', e);
    throw e; // 트리거 실행 기록에도 실패로 남김
  }
}

/** 수동 테스트용: 지난주만 수집 */
function collectLastWeekOnly() {
  var started = Date.now();
  var creatives = fetchCreativeList_(started);
  collectRange_(creatives, getWeekRange_(new Date(), 1), started);
}

// ---------- 기간 계산 ----------

/**
 * 한국시간(KST) 기준 월~일 주간 범위.
 * @param {Date} now
 * @param {number} weeksAgo 1 = 지난주, 2 = 2주 전
 * @return {{since: string, until: string}} 'yyyy-MM-dd'
 */
function getWeekRange_(now, weeksAgo) {
  var KST = 9 * 3600 * 1000, DAY = 24 * 3600 * 1000;
  var kst = new Date(now.getTime() + KST);
  var dow = kst.getUTCDay();                 // 0=일
  var sinceThisWeek = (dow + 6) % 7;          // 이번 주 월요일까지 거꾸로 일수
  var thisMonday = Date.UTC(kst.getUTCFullYear(), kst.getUTCMonth(), kst.getUTCDate()) - sinceThisWeek * DAY;
  var monday = thisMonday - weeksAgo * 7 * DAY;
  return { since: fmtUtcDate_(monday), until: fmtUtcDate_(monday + 6 * DAY) };
}

function fmtUtcDate_(ms) {
  var d = new Date(ms);
  var m = d.getUTCMonth() + 1, day = d.getUTCDate();
  return d.getUTCFullYear() + '-' + (m < 10 ? '0' : '') + m + '-' + (day < 10 ? '0' : '') + day;
}

// ---------- 소재 목록 (캠페인 → 광고그룹 → 소재) ----------

/**
 * @return {Array<{id:string, product:string, campaign:string, adgroup:string}>}
 */
function fetchCreativeList_(started) {
  var list = [];
  var campaigns = naverGet_(ENDPOINTS.CAMPAIGNS);

  campaigns.forEach(function (camp) {
    var isShopping = camp.campaignTp === CAMPAIGN_TYPE.SHOPPING;
    var isPowerlink = camp.campaignTp === CAMPAIGN_TYPE.POWERLINK;
    if (!isShopping && !isPowerlink) return; // Phase 1 범위 밖 (브랜드검색, 플레이스 등)

    var adgroups = naverGet_(ENDPOINTS.ADGROUPS, { nccCampaignId: camp.nccCampaignId });
    adgroups.forEach(function (grp) {
      assertTimeLeft_(started);

      // 쇼핑검색은 광고 목록의 SHOPPING_PRODUCT_AD 등으로 조회되는 구조로 보인다 (실제 계정에서 확인 필요)
      naverGet_(ENDPOINTS.ADS, { nccAdgroupId: grp.nccAdgroupId }).forEach(function (ad) {
        list.push({
          id: ad.nccAdId,
          product: isShopping ? PRODUCT.SHOPPING : PRODUCT.POWERLINK_TEXT, // 파워링크 텍스트: 수집만, 판정 제외
          campaign: camp.name, adgroup: grp.name
        });
      });

      if (isPowerlink) {
        naverGet_(ENDPOINTS.AD_EXTENSIONS, { ownerId: grp.nccAdgroupId }).forEach(function (ext) {
          if (IMAGE_EXTENSION_TYPES.indexOf(ext.type) === -1) return;
          list.push({ id: ext.nccAdExtensionId, product: PRODUCT.POWERLINK_IMAGE, campaign: camp.name, adgroup: grp.name });
        });
      }
    });
  });

  Logger.log('소재 ' + list.length + '개 조회');
  return list;
}

// ---------- 성과 조회 ----------

/**
 * 광고 상품별로 묶어(캠페인 유형이 섞이면 400) 소재 ID 묶음으로 stats 조회.
 * 응답에 없는 소재는 호출하는 쪽에서 0으로 채운다.
 * @return {Object<string, Object>} id → 지표
 */
function fetchStats_(creatives, range, started) {
  var fields = [STAT_FIELDS.IMPRESSIONS, STAT_FIELDS.CLICKS, STAT_FIELDS.COST,
    STAT_FIELDS.CONVERSIONS, STAT_FIELDS.CONV_AMOUNT, STAT_FIELDS.AVG_RANK];
  var byProduct = {};
  creatives.forEach(function (c) { (byProduct[c.product] = byProduct[c.product] || []).push(c.id); });

  var result = {};
  Object.keys(byProduct).forEach(function (product) {
    var ids = byProduct[product];
    for (var i = 0; i < ids.length; i += COLLECT.STATS_BATCH_SIZE) {
      assertTimeLeft_(started);
      var batch = ids.slice(i, i + COLLECT.STATS_BATCH_SIZE);
      var res;
      try {
        res = naverGet_(ENDPOINTS.STATS, {
          ids: batch.join(','),
          fields: JSON.stringify(fields),
          timeRange: JSON.stringify({ since: range.since, until: range.until }),
          timeIncrement: 'allDays' // ids 조회는 allDays만 허용
        });
      } catch (e) {
        if (product === PRODUCT.POWERLINK_IMAGE) {
          throw new Error(e.message + ' | 확장소재 ID를 /stats로 조회할 수 있다는 근거가 문서에 없습니다. ' +
            'STAT-REPORT ADEXTENSION 보고서 방식이 필요할 수 있습니다 (docs/STAGE0_FINDINGS.md).');
        }
        throw e;
      }
      extractStatRows_(res).forEach(function (row) { result[row.id] = row; });
    }
  });
  return result;
}

/** 응답이 { data: [...] } 이든, 한 번 감싸진 { xxxStatResponse: { data: [...] } } 이든 행 배열을 꺼낸다. */
function extractStatRows_(res) {
  if (Array.isArray(res)) return res;
  if (res && Array.isArray(res.data)) return res.data;
  var rows = [];
  if (res && typeof res === 'object') {
    Object.keys(res).forEach(function (k) {
      var v = res[k];
      if (v && typeof v === 'object' && !Array.isArray(v) && Array.isArray(v.data)) rows = rows.concat(v.data);
    });
  }
  return rows;
}

function num_(v) { return typeof v === 'number' && isFinite(v) ? v : Number(v) || 0; }

/** 목록과 성과를 소재 ID로 조인해 원본 행 배열을 만든다. */
function buildRawRows_(creatives, stats, range, collectedAt) {
  return creatives.map(function (c) {
    var s = stats[c.id] || {};
    return [
      collectedAt, range.since, range.until, c.product, c.campaign, c.adgroup, c.id,
      num_(s[STAT_FIELDS.IMPRESSIONS]), num_(s[STAT_FIELDS.CLICKS]), num_(s[STAT_FIELDS.COST]),
      num_(s[STAT_FIELDS.CONVERSIONS]), num_(s[STAT_FIELDS.CONV_AMOUNT]), num_(s[STAT_FIELDS.AVG_RANK])
    ];
  });
}

function collectRange_(creatives, range, started) {
  if (!creatives.length) {
    Logger.log('수집할 소재가 없습니다.');
    return;
  }
  var stats = fetchStats_(creatives, range, started);
  var collectedAt = Utilities.formatDate(new Date(), 'Asia/Seoul', 'yyyy-MM-dd HH:mm');
  var rows = buildRawRows_(creatives, stats, range, collectedAt);
  var r = upsertRawRows_(rows);
  Logger.log(range.since + '~' + range.until + ' : 추가 ' + r.added + '행, 덮어쓰기 ' + r.updated + '행');
}

// ---------- 시트 기록 (중복 시 덮어쓰기) ----------

var RAW_COL = { COLLECTED: 0, SINCE: 1, UNTIL: 2, CREATIVE_ID: 6 };

function dateStr_(v) {
  if (v instanceof Date) return Utilities.formatDate(v, 'Asia/Seoul', 'yyyy-MM-dd');
  return String(v);
}

function rawKey_(since, creativeId) { return since + '|' + creativeId; }

/**
 * 같은 기간시작 + 소재 ID 행은 덮어쓰고, 없으면 추가한다.
 * @return {{added:number, updated:number}}
 */
function upsertRawRows_(rows) {
  var sheet = SpreadsheetApp.getActive().getSheetByName(SHEETS.RAW);
  if (!sheet) throw new Error("'" + SHEETS.RAW + "' 탭이 없습니다. 먼저 시트 초기화를 실행하세요.");
  var width = HEADERS[SHEETS.RAW].length;

  // 날짜가 자동 변환되지 않도록 날짜 컬럼을 텍스트 서식으로 고정
  sheet.getRange(2, RAW_COL.SINCE + 1, Math.max(sheet.getMaxRows() - 1, 1), 2).setNumberFormat('@');

  var existing = {};
  var lastRow = sheet.getLastRow();
  if (lastRow > 1) {
    sheet.getRange(2, 1, lastRow - 1, width).getValues().forEach(function (r, idx) {
      existing[rawKey_(dateStr_(r[RAW_COL.SINCE]), String(r[RAW_COL.CREATIVE_ID]))] = idx + 2;
    });
  }

  var toAppend = [], updated = 0;
  rows.forEach(function (row) {
    var key = rawKey_(row[RAW_COL.SINCE], String(row[RAW_COL.CREATIVE_ID]));
    if (existing[key]) {
      sheet.getRange(existing[key], 1, 1, width).setValues([row]);
      updated++;
    } else {
      toAppend.push(row);
    }
  });

  if (toAppend.length) {
    var start = sheet.getLastRow() + 1;
    sheet.getRange(start, RAW_COL.SINCE + 1, toAppend.length, 2).setNumberFormat('@');
    sheet.getRange(start, 1, toAppend.length, width).setValues(toAppend);
  }
  return { added: toAppend.length, updated: updated };
}

// ---------- 보조 ----------

function assertTimeLeft_(started) {
  if (Date.now() - started > COLLECT.MAX_RUN_MS) {
    throw new Error('실행 시간 한도에 근접해 수집을 중단했습니다. 소재 수가 많으면 트리거를 분리하세요.');
  }
}
