// Math12 Learning Hub - Google Apps Script sync adapter
// Deploy as Web app: Execute as Me, access level appropriate for your source sheet.
// The frontend calls: <WEB_APP_URL>?sheetUrl=<GOOGLE_SHEET_URL>

function doGet(e) {
  try {
    var sheetUrl = String((e && e.parameter && e.parameter.sheetUrl) || '');
    var spreadsheetId = extractSpreadsheetId(sheetUrl);
    if (!spreadsheetId) throw new Error('Google Sheet URL không hợp lệ.');

    var ss = SpreadsheetApp.openById(spreadsheetId);
    var sheet = ss.getSheets()[0];
    var lastRow = sheet.getLastRow();
    if (!lastRow) throw new Error('Sheet không có dữ liệu.');

    var range = sheet.getRange(1, 1, lastRow, Math.min(6, sheet.getMaxColumns()));
    var values = range.getDisplayValues();
    var rich = range.getRichTextValues();
    var rawCourse = buildRawCourse(values, rich);

    return json({
      ok: true,
      spreadsheetId: spreadsheetId,
      sheetName: sheet.getName(),
      syncedAt: new Date().toISOString(),
      rawCourse: rawCourse
    });
  } catch (err) {
    return json({ ok: false, error: String(err && err.message || err) });
  }
}

function buildRawCourse(values, rich) {
  var out = [];
  var hasChapter = false;
  var hasGroup = false;

  for (var r = 0; r < values.length; r++) {
    var title = clean(values[r][0]);
    if (!title) continue;

    var links = [];
    for (var c = 2; c <= 5; c++) {
      var url = getCellUrl(rich[r] && rich[r][c]);
      if (url) links.push({ col: c, label: clean(values[r][c]), url: url });
    }

    if (/^ch(?:ư|u)ơng\s*\d+/i.test(title)) {
      out.push('C|' + safe(title));
      hasChapter = true;
      hasGroup = false;
      continue;
    }

    if (!hasChapter) {
      out.push('C|Khóa học');
      hasChapter = true;
    }

    if (!links.length && isGroupTitle(title)) {
      out.push('B|' + safe(title));
      hasGroup = true;
      continue;
    }

    if (!links.length) continue;
    if (!hasGroup) {
      out.push('B|Bài học');
      hasGroup = true;
    }

    var tokens = ['L', safe(title)];
    links.forEach(function(item) {
      var key = classifyResource(item.col, item.label, item.url);
      tokens.push(key + '=' + item.url);
    });
    out.push(tokens.join('|'));
  }

  return out.join('\n');
}

function classifyResource(col, label, url) {
  var normalized = String(label || '').toLowerCase();
  var youtube = /(?:youtube\.com|youtu\.be)/i.test(url);
  if (/đáp\s*án|dap\s*an/i.test(normalized)) return 'A';
  if (/chữa|chua/i.test(normalized) && youtube) return 'S';
  if (youtube) return col === 5 ? 'S' : 'V';
  if (col === 4) return 'H';
  return 'D';
}

function isGroupTitle(title) {
  return /^(b[aà]i|bai)\s*\d+/i.test(title) ||
    /^ôn\s*tập/i.test(title) ||
    /^on\s*tap/i.test(title) ||
    /^tham\s*khảo/i.test(title);
}

function getCellUrl(richTextValue) {
  if (!richTextValue) return '';
  var direct = richTextValue.getLinkUrl();
  if (direct) return direct;
  var runs = richTextValue.getRuns();
  for (var i = 0; i < runs.length; i++) {
    var url = runs[i].getLinkUrl();
    if (url) return url;
  }
  return '';
}

function extractSpreadsheetId(url) {
  var match = String(url || '').match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  return match ? match[1] : (/^[a-zA-Z0-9-_]{20,}$/.test(url) ? url : '');
}

function clean(value) {
  return String(value == null ? '' : value).trim();
}

function safe(value) {
  return clean(value).replace(/\r?\n/g, ' ').replace(/\|/g, '／');
}

function json(payload) {
  return ContentService
    .createTextOutput(JSON.stringify(payload))
    .setMimeType(ContentService.MimeType.JSON);
}
