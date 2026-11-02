/** 시트 열 때 메뉴 추가 */
function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('네이버 광고')
    .addItem('1. 시트 초기화', 'setupSheets')
    .addItem('2. API 키 입력', 'setCredentials')
    .addItem('3. 연결 테스트 (캠페인 목록)', 'testListCampaigns')
    .addItem('4. 지난주 수집 (수동)', 'collectLastWeekOnly')
    .addToUi();
}

/**
 * 5개 탭을 만들고 헤더·설정 기본값을 채운다. 여러 번 실행해도 기존 데이터는 지우지 않는다.
 */
function setupSheets() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();

  Object.keys(HEADERS).forEach(function (name) {
    var sheet = getOrCreateSheet_(ss, name);
    writeHeaderIfEmpty_(sheet, HEADERS[name]);
  });

  var settings = getOrCreateSheet_(ss, SHEETS.SETTINGS);
  if (settings.getLastRow() === 0) {
    settings.getRange(1, 1, 1, 3).setValues([['항목', '값', '설명']]).setFontWeight('bold');
    settings.getRange(2, 1, SETTINGS_DEFAULTS.length, 3).setValues(SETTINGS_DEFAULTS);
    settings.setFrozenRows(1);
    settings.autoResizeColumns(1, 3);
  }

  // 스크립트만 쓰는 탭은 직접 편집 시 경고 (매핑·설정은 사람이 편집)
  [SHEETS.RAW, SHEETS.VERDICT, SHEETS.ALERT_LOG].forEach(function (name) {
    protectWithWarning_(ss.getSheetByName(name));
  });

  // 기본 'Sheet1'이 비어 있으면 제거
  var def = ss.getSheetByName('Sheet1') || ss.getSheetByName('시트1');
  if (def && def.getLastRow() === 0 && ss.getSheets().length > 1) ss.deleteSheet(def);

  SpreadsheetApp.getActive().toast('시트 초기화 완료', '네이버 광고', 5);
}

function getOrCreateSheet_(ss, name) {
  return ss.getSheetByName(name) || ss.insertSheet(name);
}

function writeHeaderIfEmpty_(sheet, headers) {
  if (sheet.getLastRow() > 0) return;
  sheet.getRange(1, 1, 1, headers.length).setValues([headers]).setFontWeight('bold');
  sheet.setFrozenRows(1);
}

function protectWithWarning_(sheet) {
  if (!sheet) return;
  var exists = sheet.getProtections(SpreadsheetApp.ProtectionType.SHEET).length > 0;
  if (exists) return;
  sheet.protect().setDescription('스크립트 전용 탭').setWarningOnly(true);
}

/**
 * API 키를 입력창으로 받아 스크립트 속성에만 저장한다.
 * 값은 코드·시트·로그에 남지 않는다.
 */
function setCredentials() {
  var ui = SpreadsheetApp.getUi();
  var props = PropertiesService.getScriptProperties();
  var items = [
    [PROP.NAVER_API_KEY, '네이버 검색광고 API 키 (액세스라이선스)'],
    [PROP.NAVER_SECRET_KEY, '네이버 검색광고 비밀키'],
    [PROP.NAVER_CUSTOMER_ID, '네이버 고객 ID']
  ];
  for (var i = 0; i < items.length; i++) {
    var res = ui.prompt(items[i][1], '비워 두면 기존 값을 유지합니다.', ui.ButtonSet.OK_CANCEL);
    if (res.getSelectedButton() !== ui.Button.OK) return;
    var v = res.getResponseText().trim();
    if (v) props.setProperty(items[i][0], v);
  }
  ui.alert('저장 완료. 값은 스크립트 속성에만 보관됩니다.');
}

/** Claude API 키는 5단계에서 필요할 때 입력 */
function setClaudeApiKey() {
  var ui = SpreadsheetApp.getUi();
  var res = ui.prompt('Claude API 키', '', ui.ButtonSet.OK_CANCEL);
  if (res.getSelectedButton() !== ui.Button.OK) return;
  var v = res.getResponseText().trim();
  if (v) PropertiesService.getScriptProperties().setProperty(PROP.CLAUDE_API_KEY, v);
}
