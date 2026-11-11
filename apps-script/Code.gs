/**
 * 야자 관리실 – 운영팀 서버 (Google Apps Script)
 *
 * 하는 일
 *  1) 베타 테스트 기록 받기: 앱에서 보낸 점검·할 일 기록을 이 구글 시트에 쌓습니다.
 *  2) AI 멘토 중계: 앱의 질문을 AI(Claude API)에 전달하고 답을 돌려줍니다.
 *     AI 키는 이 스크립트의 '스크립트 속성'에만 저장되고, 앱이나 GitHub에는 들어가지 않습니다.
 *
 * 설치 순서는 README.md의 '운영팀 서버 만들기'를 보세요.
 *
 * 스크립트 속성 (프로젝트 설정 → 스크립트 속성)
 *  - ANTHROPIC_API_KEY   (AI 멘토를 쓰려면 필수) Claude API 키
 *  - ANTHROPIC_WORKSPACE_ID (키를 만들 때 워크스페이스를 고르지 않았을 때만) wrkspc_로 시작하는 값
 *  - MENTOR_MODEL        (선택) 기본값 claude-haiku-5-5
 *  - MENTOR_CODE         (선택) 정하면, 앱 설정에 같은 '멘토 이용 코드'를 넣은 사람만 멘토를 쓸 수 있음
 *  - MENTOR_DAILY_LIMIT  (선택) 기기 하나가 하루에 보낼 수 있는 질문 수, 기본 30
 *  - MENTOR_GLOBAL_LIMIT (선택) 전체 하루 질문 수, 기본 400
 */

const SESSION_SHEET = '점검기록';
const TASK_SHEET = '할일';
const SESSION_HEADERS = ['기록ID', '참여코드', '실험단계', '날짜', '요일', '시작', '종료', '과목', '예상(분)', '순공(분)', '휴식(분)',
  '앱 이탈(분)', '이탈 횟수', '이탈 시간 순공에서 뺌', '결과', '집중도(1-5)', '방해요인', '받은 시각',
  '카메라 사용', '카메라 자리비움(분)', '졸음 감지 횟수', '카메라 자리비움 순공에서 뺌'];
const TASK_HEADERS = ['할일ID', '참여코드', '실험단계', '날짜', '요일', '과목', '예상(분)', '실제 순공(분)', '상태', '점검 횟수', '마지막 갱신'];

const MENTOR_RULES = [
  '너는 고등학생의 야간자율학습을 돕는 "야자 관리실 AI 학습 멘토"다.',
  '',
  '[역할]',
  '- 공부 방법, 과목별 시간 배분, 계획 세우기, 성적 변화 해석, 공부 습관 관리를 돕는 학습 코치다.',
  '- 학생을 평가하거나 혼내지 않고, 스스로 생각해서 다음 행동을 정하도록 돕는다.',
  '',
  '[데이터 사용]',
  '- 아래 [학생 기록]에 있는 숫자만 쓰고, 없는 수치를 지어내지 않는다. 이미 계산된 값은 그대로 인용한다.',
  '- 기록이 부족하면 부족하다고 말하고, 필요한 정보를 질문한다.',
  '- 학생의 말과 기록이 다르면 부드럽게 짚는다. (예: "열심히 했다고 했는데, 기록상 이번 주 순공은 지난주보다 줄었어요.")',
  '- 성적은 시험 수가 적으므로 변화의 원인을 단정하지 않는다("~때문일 수 있어요"). 다른 학생과 비교하지 않는다.',
  '- 카메라 판정(졸음·자리 비움)은 추정값이라 틀릴 수 있다는 점을 염두에 둔다.',
  '',
  '[공부 방법 조언의 근거]',
  '- 스스로 떠올리기(연습 시험, 백지 복습)와 간격을 두고 복습하기는 효과가 높다고 평가된 방법이다.',
  '- 단순히 다시 읽기, 밑줄 긋기, 요약하기는 효과가 낮다고 평가된 방법이다. (Dunlosky 외, 2013)',
  '- 일반론이 아니라 학생의 기록(과목, 계획 정확도, 시간대별 집중도, 방해 요인)에 맞춰 구체적으로 제안한다.',
  '',
  '[상담 방식]',
  '- 진단 질문 → 기록과 대조 → 근거 있는 전략 제안 → 다음 야자에서 할 구체적 행동 1~2개 정하기 순서로 진행한다.',
  '- 지난 약속이 있으면 실천했는지 먼저 확인하고, 실천했으면 칭찬하고 효과를 묻는다.',
  '- 문제의 정답이나 풀이 전체를 대신 써 주지 않는다. 어디서 막혔는지 물어보고 힌트와 개념 방향만 준다.',
  '- 친근한 해요체로, 한 번에 5문장 안팎으로 짧게 답한다. 목록은 꼭 필요할 때만 짧게 쓴다.',
  '',
  '[안전]',
  '- 공부와 관계없는 심각한 고민(우울, 가정 문제, 괴롭힘 등)이 나오면 공감하되 직접 상담하지 말고 담임 선생님, Wee클래스, 청소년상담 1388과 이야기해 보도록 안내한다.',
  '- 자해나 자살 생각을 내비치면 걱정을 분명히 표현하고, 지금 바로 자살예방 상담전화 109나 청소년상담 1388, 가까운 어른에게 연락하도록 안내한다.',
  '- 이름, 연락처, 학교 같은 개인정보를 묻지 않는다.',
  '- 숙제 대필, 공부와 무관한 요청은 짧게 거절하고 학습 이야기로 돌린다.',
].join('\n');

const MODE_RULES = {
  chat: '',
  summary: '\n\n[지금 할 일]\n지금까지의 상담을 정리한다. 반드시 JSON 한 개만 출력한다. 형식: {"summary":"상담 요약 2~3문장","promises":["다음 야자에서 할 구체적 행동", "..."]}. promises는 학생과 합의한 행동만 1~3개, 각 40자 이내로 쓴다. 합의한 행동이 없으면 빈 배열로 둔다.',
  report: '\n\n[지금 할 일]\n[코멘트할 주]의 기록을 보고 4~6문장으로 코멘트한다. 잘한 점 1개, 개선할 점 1~2개(근거 숫자 포함), 다음 주에 시도할 행동 1개를 담는다. 원인을 단정하지 않는다.',
};
const MAX_TOKENS = { chat: 700, summary: 400, report: 600 };

function doPost(e) {
  let body = {};
  try { body = JSON.parse((e && e.postData && e.postData.contents) || '{}'); } catch (err) { return json_({ ok: false, error: 'bad_request' }); }
  if (body.action === 'mentor') return json_(mentor_(body));
  return json_(saveRecords_(body));
}

// 브라우저로 웹 앱 주소를 열었을 때 연결 확인용
function doGet() {
  const hasKey = !!PropertiesService.getScriptProperties().getProperty('ANTHROPIC_API_KEY');
  return json_({ ok: true, app: 'yaja-room', mentor: hasKey ? 'ready' : 'no_key', message: '수집 주소가 정상적으로 동작하고 있어요.' });
}

// ---------- 1) 베타 테스트 기록 ----------
function saveRecords_(body) {
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
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
        if (findRow_(sessions, it.id)) return; // 이미 받은 기록
        sessions.appendRow([
          text_(it.id), text_(it.code), text_(it.phase), text_(it.date), text_(it.weekday), text_(it.start), text_(it.end), text_(it.subject),
          num_(it.plannedMin), num_(it.studyMin), num_(it.breakMin), num_(it.awayMin), num_(it.awayCount), it.awayExcluded ? '예' : '아니오',
          text_(it.outcome), num_(it.focus), text_(it.distractors), now,
          it.camUsed ? '예' : '아니오', num_(it.camAwayMin), num_(it.drowsyCount), it.camAwayExcluded ? '예' : '아니오',
        ]);
        added++;
      } else if (it.kind === 'task') {
        const row = [text_(it.id), text_(it.code), text_(it.phase), text_(it.date), text_(it.weekday), text_(it.subject),
          num_(it.plannedMin), num_(it.actualMin), text_(it.status), num_(it.sessions), now];
        const r = findRow_(tasks, it.id);
        if (r) { tasks.getRange(r, 1, 1, row.length).setValues([row]); updated++; } else { tasks.appendRow(row); added++; }
      }
    });
    return { ok: true, added: added, updated: updated };
  } catch (err) {
    return { ok: false, error: String(err) };
  } finally {
    lock.releaseLock();
  }
}

// ---------- 2) AI 멘토 ----------
function mentor_(body) {
  const props = PropertiesService.getScriptProperties();
  const key = props.getProperty('ANTHROPIC_API_KEY');
  if (!key) return { ok: false, error: 'no_key' };
  const code = props.getProperty('MENTOR_CODE');
  if (code && String(body.accessCode || '') !== code) return { ok: false, error: 'bad_code' };

  const limitErr = countUse_(props, String(body.device || 'unknown').slice(0, 40));
  if (limitErr) return { ok: false, error: limitErr };

  const mode = MODE_RULES.hasOwnProperty(body.mode) ? body.mode : 'chat';
  const messages = cleanMessages_(body.messages);
  if (!messages.length) return { ok: false, error: 'empty' };
  if (mode === 'summary') messages.push({ role: 'user', content: '상담을 마무리할게요. 요약과 약속을 JSON으로 정리해 주세요.' });
  const merged = mergeTurns_(messages);
  const system = MENTOR_RULES + '\n\n[학생 기록]\n' + String(body.context || '(기록 없음)').slice(0, 9000) + MODE_RULES[mode];

  const headers = { Authorization: 'Bearer ' + key, 'anthropic-version': '2026-10-21' };
  const workspace = props.getProperty('ANTHROPIC_WORKSPACE_ID'); // 워크스페이스를 고르지 않고 만든 키일 때만 필요
  if (workspace) headers['anthropic-workspace-id'] = workspace;
  const res = UrlFetchApp.fetch('https://api.anthropic.com/v1/messages', {
    method: 'post',
    contentType: 'application/json',
    headers: headers,
    payload: JSON.stringify({ model: props.getProperty('MENTOR_MODEL') || 'claude-haiku-5-5', max_tokens: MAX_TOKENS[mode], system: system, messages: merged }),
    muteHttpExceptions: true,
  });
  const status = res.getResponseCode();
  if (status === 401 || status === 403) return { ok: false, error: 'bad_key' };
  if (status === 429 || status === 529 || status >= 500) return { ok: false, error: 'busy' };
  if (status !== 200) return { ok: false, error: 'api_error' };
  const data = JSON.parse(res.getContentText());
  const text = (data.content || []).filter(function (c) { return c.type === 'text'; }).map(function (c) { return c.text; }).join('\n').trim();

  if (mode === 'summary') {
    const parsed = parseJson_(text);
    return { ok: true, summary: parsed && parsed.summary ? String(parsed.summary) : text.slice(0, 300), promises: parsed && Array.isArray(parsed.promises) ? parsed.promises.slice(0, 3) : [] };
  }
  return { ok: true, text: text };
}

// 하루 사용량 제한 (기기별, 전체)
function countUse_(props, device) {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const day = Utilities.formatDate(new Date(), 'Asia/Seoul', 'yyyyMMdd');
    const perDevice = Number(props.getProperty('MENTOR_DAILY_LIMIT') || 30);
    const perAll = Number(props.getProperty('MENTOR_GLOBAL_LIMIT') || 400);
    const kAll = 'use_' + day + '_all';
    const kDev = 'use_' + day + '_' + device;
    if (!props.getProperty(kAll)) { // 날짜가 바뀌면 지난 카운터 정리
      Object.keys(props.getProperties()).forEach(function (k) { if (k.indexOf('use_') === 0 && k.indexOf('use_' + day) !== 0) props.deleteProperty(k); });
    }
    const nAll = Number(props.getProperty(kAll) || 0);
    const nDev = Number(props.getProperty(kDev) || 0);
    if (nAll >= perAll) return 'limit_all';
    if (nDev >= perDevice) return 'limit_device';
    props.setProperty(kAll, String(nAll + 1));
    props.setProperty(kDev, String(nDev + 1));
    return '';
  } finally {
    lock.releaseLock();
  }
}

function cleanMessages_(list) {
  const out = (Array.isArray(list) ? list : []).slice(-16)
    .filter(function (m) { return m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string' && m.content.trim(); })
    .map(function (m) { return { role: m.role, content: m.content.slice(0, 2000) }; });
  while (out.length && out[0].role !== 'user') out.shift(); // 첫 메시지는 학생이어야 함
  return out;
}

// 같은 사람이 연달아 보낸 메시지는 하나로 합칩니다
function mergeTurns_(list) {
  const out = [];
  list.forEach(function (m) {
    if (out.length && out[out.length - 1].role === m.role) out[out.length - 1].content += '\n\n' + m.content;
    else out.push({ role: m.role, content: m.content });
  });
  if (out.length && out[out.length - 1].role !== 'user') out.push({ role: 'user', content: '계속 이야기해 주세요.' });
  return out;
}

function parseJson_(text) {
  const a = text.indexOf('{');
  const b = text.lastIndexOf('}');
  if (a < 0 || b <= a) return null;
  try { return JSON.parse(text.slice(a, b + 1)); } catch (err) { return null; }
}

// ---------- 공통 ----------
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
