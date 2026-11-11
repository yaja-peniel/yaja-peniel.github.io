/**
 * 야자 관리실 – 베타 테스트 기록 수집용 Google Apps Script
 *
 * 쓰는 법 (자세한 순서는 README.md):
 * 1. 구글 시트를 새로 만들고 [확장 프로그램] → [Apps Script]를 엽니다.
 * 2. 기본 코드를 모두 지우고 이 파일 내용을 붙여 넣고 저장합니다.
 * 3. [배포] → [새 배포] → 유형 '웹 앱', 실행: '나', 액세스: '모든 사용자' → [배포].
 * 4. 나오는 웹 앱 URL(…/exec)을 앱의 config.js에 붙여 넣습니다.
 *
 * 시트 두 개가 자동으로 생깁니다.
 *  - 점검기록: 타이머로 공부하고 점검을 저장할 때마다 한 줄 (같은 기록은 한 번만 들어감)
 *  - 할일:     계획한 할 일마다 한 줄 (상태가 바뀌면 그 줄이 갱신됨)
 * 이름, 닉네임, 할 일 제목, 메모는 앱에서 보내지 않습니다.
 */

const SESSION_SHEET = '점검기록';
const TASK_SHEET = '할일';
const SESSION_HEADERS = ['기록ID', '참여코드', '실험단계', '날짜', '요일', '시작', '종료', '과목', '예상(분)', '순공(분)', '휴식(분)',
  '앱 이탈(분)', '이탈 횟수', '이탈 시간 순공에서 뺌', '결과', '집중도(1-5)', '방해요인', '받은 시각'];
const TASK_HEADERS = ['할일ID', '참여코드', '실험단계', '날짜', '요일', '과목', '예상(분)', '실제 순공(분)', '상태', '점검 횟수', '마지막 갱신'];

function doPost(e) {
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const body = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    const items = Array.isArray(body.items) ? body.items.slice(0, 500) : [];
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sessions = sheet_(ss, SESSION_SHEET, SESSION_HEADERS);
    const tasks = sheet_(ss, TASK_SHEET, TASK_HEADERS);
    const now = new Date();
    let added = 0;
    let updated = 0;

    items.forEach(function (it) {
      if (!it || !it.id) return;
      if (it.kind === 'session') {
        if (findRow_(sessions, it.id)) return; // already received
        sessions.appendRow([
          text_(it.id), text_(it.code), text_(it.phase), text_(it.date), text_(it.weekday), text_(it.start), text_(it.end), text_(it.subject),
          num_(it.plannedMin), num_(it.studyMin), num_(it.breakMin), num_(it.awayMin), num_(it.awayCount), it.awayExcluded ? '예' : '아니오',
          text_(it.outcome), num_(it.focus), text_(it.distractors), now,
        ]);
        added++;
      } else if (it.kind === 'task') {
        const row = [text_(it.id), text_(it.code), text_(it.phase), text_(it.date), text_(it.weekday), text_(it.subject),
          num_(it.plannedMin), num_(it.actualMin), text_(it.status), num_(it.sessions), now];
        const r = findRow_(tasks, it.id);
        if (r) { tasks.getRange(r, 1, 1, row.length).setValues([row]); updated++; }
        else { tasks.appendRow(row); added++; }
      }
    });
    return json_({ ok: true, added: added, updated: updated });
  } catch (err) {
    return json_({ ok: false, error: String(err) });
  } finally {
    lock.releaseLock();
  }
}

// 브라우저로 웹 앱 주소를 열었을 때 연결이 됐는지 확인하는 용도
function doGet() {
  return json_({ ok: true, app: 'yaja-room', message: '수집 주소가 정상적으로 동작하고 있어요.' });
}

function sheet_(ss, name, headers) {
  let sh = ss.getSheetByName(name);
  if (!sh) sh = ss.insertSheet(name);
  if (sh.getLastRow() === 0) {
    sh.appendRow(headers);
    sh.setFrozenRows(1);
  }
  return sh;
}

function findRow_(sh, id) {
  if (sh.getLastRow() < 2) return 0;
  const hit = sh.getRange(2, 1, sh.getLastRow() - 1, 1).createTextFinder(String(id)).matchEntireCell(true).findNext();
  return hit ? hit.getRow() : 0;
}

// 시트에서 수식으로 실행되지 않도록 =, +, -, @ 로 시작하는 글자 앞에 ' 를 붙이고 길이를 제한합니다.
function text_(v) {
  let s = v == null ? '' : String(v).slice(0, 80);
  if (/^[=+\-@]/.test(s)) s = "'" + s;
  return s;
}

function num_(v) {
  const n = Number(v);
  return isFinite(n) ? n : '';
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
