/**
 * 네이버 검색광고 API 클라이언트 (조회 전용).
 * 서명: Base64( HMAC-SHA256( secret, timestamp + "." + METHOD + "." + path ) )
 * path에는 쿼리스트링을 포함하지 않는다.
 */

function getCredentials_() {
  var p = PropertiesService.getScriptProperties();
  var c = {
    apiKey: p.getProperty(PROP.NAVER_API_KEY),
    secretKey: p.getProperty(PROP.NAVER_SECRET_KEY),
    customerId: p.getProperty(PROP.NAVER_CUSTOMER_ID)
  };
  if (!c.apiKey || !c.secretKey || !c.customerId) {
    throw new Error('네이버 API 키가 설정되지 않았습니다. 메뉴 [네이버 광고 > API 키 입력]을 실행하세요.');
  }
  return c;
}

function naverSignature_(timestamp, method, path, secretKey) {
  var message = timestamp + '.' + method + '.' + path;
  var bytes = Utilities.computeHmacSha256Signature(message, secretKey);
  return Utilities.base64Encode(bytes);
}

/**
 * GET 요청. 429·5xx는 최대 NAVER_API.MAX_RETRY회 재시도한다.
 * @param {string} path 예: '/ncc/campaigns'
 * @param {Object=} query 쿼리 파라미터
 * @return {*} 파싱된 JSON
 */
function naverGet_(path, query) {
  var creds = getCredentials_();
  var url = NAVER_API.BASE_URL + path + buildQuery_(query);

  for (var attempt = 0; attempt <= NAVER_API.MAX_RETRY; attempt++) {
    var timestamp = String(new Date().getTime());
    var res = UrlFetchApp.fetch(url, {
      method: 'get',
      muteHttpExceptions: true,
      headers: {
        'X-Timestamp': timestamp,
        'X-API-KEY': creds.apiKey,
        'X-Customer': creds.customerId,
        'X-Signature': naverSignature_(timestamp, 'GET', path, creds.secretKey)
      }
    });
    var code = res.getResponseCode();

    if (code >= 200 && code < 300) {
      Utilities.sleep(NAVER_API.REQUEST_GAP_MS);
      return JSON.parse(res.getContentText());
    }
    var retryable = code === 429 || code >= 500;
    if (!retryable || attempt === NAVER_API.MAX_RETRY) {
      throw new Error('네이버 API 오류 ' + code + ' ' + path + ' : ' + res.getContentText().slice(0, 300));
    }
    Utilities.sleep(NAVER_API.RETRY_WAIT_MS * Math.pow(2, attempt));
  }
}

function buildQuery_(query) {
  if (!query) return '';
  var parts = Object.keys(query).map(function (k) {
    return encodeURIComponent(k) + '=' + encodeURIComponent(query[k]);
  });
  return parts.length ? '?' + parts.join('&') : '';
}
