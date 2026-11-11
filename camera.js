// 야자 관리실 카메라 관리
// - 카메라 영상은 이 기기 안에서만 분석하고, 저장하거나 어디로도 보내지 않아요.
// - 남기는 것은 "자리 비움 n분, 졸음 감지 n회" 같은 숫자뿐이에요.
// - 얼굴 인식에는 Google MediaPipe의 Face Landmarker(이미 학습된 딥러닝 모델)를 씁니다.
(function () {
  'use strict';

  const MP_VERSION = '0.10.14';
  const CDN = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${MP_VERSION}`;
  const MODEL_REMOTE = 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task';
  const MODEL_LOCAL = 'models/face_landmarker.task'; // 운영팀이 저장소에 올려 두면 이 파일을 먼저 씁니다
  const FRAME_MS = 200; // 1초에 5번만 분석해서 배터리를 아낍니다

  // 민감도: 눈 감김 점수(0~1) 기준과, 눈을 감고 있어야 하는 시간
  const SENS = {
    relaxed: { closed: 0.6, drowsyMs: 4000 },
    normal: { closed: 0.5, drowsyMs: 3000 },
    sensitive: { closed: 0.4, drowsyMs: 2000 },
  };
  const AWAY_GRACE_MS = 5000;      // 얼굴이 5초 넘게 안 보이면 자리 비움
  const TILT_DEG = 25;             // 고개를 25도 넘게 숙이면 필기 중일 수 있음
  const TILT_FACTOR = 3;           // 그때는 눈 감김을 3배 더 오래 지켜본 뒤 판정
  const HEADDOWN_MS = 15000;       // 고개를 숙이거나 눈이 감기다가 얼굴이 사라져 15초가 지나면 엎드림으로 추정
  const HEADDOWN_BLINK = 0.35;
  const ALARM_COOLDOWN_MS = 60000; // 알람은 1분에 한 번까지

  // ---------- 판정 로직 (카메라 없이도 시험할 수 있는 순수 함수) ----------
  // frame: { face: boolean, blink: 0~1 | null, pitchDeg: number | null }, t: ms
  function createMonitor(sensitivity) {
    const cfg = SENS[sensitivity] || SENS.normal;
    let lastT = null; let lastFaceT = null; let lastFace = null;
    let away = false; let awayStartT = null; let headDown = false;
    let closedMs = 0; let lastAlarmT = -Infinity;
    let acc = { awayMs: 0, drowsyCount: 0 };

    function alarm(t, reason, events) {
      if (t - lastAlarmT < ALARM_COOLDOWN_MS) return;
      lastAlarmT = t; acc.drowsyCount += 1; events.push({ type: 'drowsy', reason });
    }
    function update(f, t) {
      const events = [];
      const dt = lastT == null ? 0 : Math.min(2000, Math.max(0, t - lastT));
      lastT = t;
      if (f.face) {
        if (away) { acc.awayMs += t - awayStartT; events.push({ type: 'back', awayMs: t - awayStartT }); }
        away = false; headDown = false; lastFaceT = t; lastFace = f;
        const closed = f.blink != null && f.blink >= cfg.closed;
        closedMs = closed ? closedMs + dt : 0;
        const tilted = f.pitchDeg != null && Math.abs(f.pitchDeg) >= TILT_DEG;
        if (closed && closedMs >= cfg.drowsyMs * (tilted ? TILT_FACTOR : 1)) { alarm(t, 'eyes', events); closedMs = 0; }
      } else {
        closedMs = 0;
        if (lastFaceT == null) lastFaceT = t;
        const gone = t - lastFaceT;
        if (!away && gone >= AWAY_GRACE_MS) {
          away = true; awayStartT = lastFaceT;
          const sleepy = lastFace && ((lastFace.pitchDeg != null && Math.abs(lastFace.pitchDeg) >= TILT_DEG) || (lastFace.blink != null && lastFace.blink >= HEADDOWN_BLINK));
          headDown = !!sleepy;
          events.push({ type: 'away', headDown });
        }
        if (away && headDown && gone >= HEADDOWN_MS) { alarm(t, 'headdown', events); headDown = false; }
      }
      return events;
    }
    // 지금까지 쌓인 값을 돌려주고 0부터 다시 셉니다 (자리 비움 중이면 그 시점까지 계산)
    function flush(t) {
      const out = { awayMs: acc.awayMs + (away && t != null ? t - awayStartT : 0), drowsyCount: acc.drowsyCount };
      acc = { awayMs: 0, drowsyCount: 0 };
      if (away && t != null) awayStartT = t;
      return out;
    }
    function peek(t) { return { awayMs: acc.awayMs + (away && t != null ? t - awayStartT : 0), drowsyCount: acc.drowsyCount, away, headDown, closedMs, faceSeenMsAgo: lastFaceT == null || t == null ? null : t - lastFaceT }; }
    function reset() { lastT = null; closedMs = 0; if (!away) lastFaceT = null; }
    return { update, flush, peek, reset };
  }

  // MediaPipe 결과 한 장을 판정용 숫자로 바꿉니다
  function frameFromResult(res) {
    const face = !!(res && res.faceLandmarks && res.faceLandmarks.length);
    let blink = null; let pitchDeg = null;
    const cats = res && res.faceBlendshapes && res.faceBlendshapes[0] && res.faceBlendshapes[0].categories;
    if (face && cats) {
      const l = cats.find((c) => c.categoryName === 'eyeBlinkLeft');
      const r = cats.find((c) => c.categoryName === 'eyeBlinkRight');
      if (l && r) blink = (l.score + r.score) / 2;
    }
    const m = res && res.facialTransformationMatrixes && res.facialTransformationMatrixes[0] && res.facialTransformationMatrixes[0].data;
    if (face && m && m.length >= 11) pitchDeg = (Math.atan2(m[6], m[10]) * 180) / Math.PI;
    return { face, blink, pitchDeg };
  }

  // ---------- 모델 불러오기 ----------
  async function loadVisionModule() {
    if (window.YAJA_TEST_VISION) return window.YAJA_TEST_VISION; // 자동 테스트용
    const urls = [`${CDN}/vision_bundle.mjs`, `${CDN}/+esm`];
    let lastErr = null;
    for (const u of urls) {
      try {
        const mod = await import(u);
        const v = mod && mod.FaceLandmarker ? mod : mod && mod.default;
        if (v && v.FaceLandmarker && v.FilesetResolver) return v;
      } catch (e) { lastErr = e; }
    }
    throw lastErr || new Error('vision module not found');
  }
  async function pickModel() {
    if (window.YAJA_TEST_VISION) return 'test';
    try { const r = await fetch(MODEL_LOCAL, { method: 'HEAD', cache: 'no-store' }); if (r.ok) return MODEL_LOCAL; } catch (e) { /* use remote */ }
    return MODEL_REMOTE;
  }
  let landmarkerPromise = null;
  function getLandmarker() {
    if (!landmarkerPromise) {
      landmarkerPromise = (async () => {
        const vision = await loadVisionModule();
        const fileset = await vision.FilesetResolver.forVisionTasks(`${CDN}/wasm`);
        const modelAssetPath = await pickModel();
        const opts = (delegate) => ({ baseOptions: { modelAssetPath, delegate }, runningMode: 'VIDEO', numFaces: 1, outputFaceBlendshapes: true, outputFacialTransformationMatrixes: true });
        try { return await vision.FaceLandmarker.createFromOptions(fileset, opts('GPU')); }
        catch (e) { return vision.FaceLandmarker.createFromOptions(fileset, opts('CPU')); }
      })();
      landmarkerPromise.catch(() => { landmarkerPromise = null; });
    }
    return landmarkerPromise;
  }

  // ---------- 카메라 실행 ----------
  const Cam = {
    state: 'off', // off | loading | on | error
    error: '',
    supported() { return !!(window.isSecureContext && navigator.mediaDevices && navigator.mediaDevices.getUserMedia); },
    createMonitor, frameFromResult,
  };
  let stream = null; let timer = null; let monitor = null; let video = null; let paused = false; let handlers = null; let lastStatus = null;

  Cam.start = async function (opts) {
    if (Cam.state === 'on' || Cam.state === 'loading') return true;
    handlers = opts; video = opts.video; paused = false;
    Cam.state = 'loading'; Cam.error = ''; opts.onState && opts.onState();
    try {
      stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } }, audio: false });
      video.srcObject = stream; video.muted = true; video.setAttribute('playsinline', '');
      await video.play().catch(() => {});
      const lm = await getLandmarker();
      monitor = createMonitor(opts.sensitivity);
      Cam.state = 'on'; opts.onState && opts.onState();
      timer = setInterval(() => {
        if (paused || !monitor || video.readyState < 2) return;
        let res = null;
        try { res = lm.detectForVideo(video, performance.now()); } catch (e) { return; }
        const t = performance.now();
        const events = monitor.update(frameFromResult(res), t);
        events.forEach((ev) => handlers.onEvent && handlers.onEvent(ev));
        const p = monitor.peek(t);
        const status = p.away ? (p.headDown ? 'headdown' : 'away') : p.faceSeenMsAgo != null && p.faceSeenMsAgo > 1000 ? 'noface' : p.closedMs > 800 ? 'closed' : 'face';
        if (status !== lastStatus) { lastStatus = status; handlers.onStatus && handlers.onStatus(status, p); }
      }, FRAME_MS);
      return true;
    } catch (e) {
      Cam.stop();
      Cam.state = 'error';
      const n = e && e.name;
      Cam.error = n === 'NotAllowedError' || n === 'SecurityError' ? '카메라 권한이 거부됐어요. 브라우저 설정에서 이 사이트의 카메라를 허용해 주세요.'
        : n === 'NotFoundError' || n === 'OverconstrainedError' ? '카메라를 찾을 수 없어요.'
        : n === 'NotReadableError' ? '다른 앱이 카메라를 쓰고 있어요. 그 앱을 닫고 다시 시도해 주세요.'
        : '얼굴 인식 모델을 불러오지 못했어요. 인터넷 연결을 확인해 주세요.';
      opts.onState && opts.onState();
      return false;
    }
  };
  // 쌓인 값을 돌려받으며 멈춥니다
  Cam.stop = function () {
    const out = monitor ? monitor.flush(performance.now()) : { awayMs: 0, drowsyCount: 0 };
    if (timer) clearInterval(timer); timer = null;
    if (stream) stream.getTracks().forEach((tr) => tr.stop()); stream = null;
    if (video) { try { video.srcObject = null; } catch (e) { /* ignore */ } }
    monitor = null; paused = false; lastStatus = null;
    if (Cam.state !== 'error') Cam.state = 'off';
    handlers && handlers.onState && handlers.onState();
    return out;
  };
  Cam.flush = function () { return monitor ? monitor.flush(performance.now()) : { awayMs: 0, drowsyCount: 0 }; };
  Cam.peek = function () { return monitor ? monitor.peek(performance.now()) : null; };
  Cam.pause = function () { if (!monitor) return { awayMs: 0, drowsyCount: 0 }; paused = true; const out = monitor.flush(performance.now()); monitor = createMonitor(handlers && handlers.sensitivity); lastStatus = null; return out; };
  Cam.resume = function () { if (monitor) { monitor.reset(); paused = false; } };
  Cam.isPaused = function () { return paused; };

  // ---------- 아두이노 연결 (PC의 Chrome·Edge, Web Serial) ----------
  const Arduino = { port: null, writer: null };
  Arduino.supported = () => 'serial' in navigator && window.isSecureContext;
  Arduino.connected = () => !!Arduino.writer;
  Arduino.connect = async function () {
    if (!Arduino.supported()) return false;
    try {
      Arduino.port = await navigator.serial.requestPort();
      await Arduino.port.open({ baudRate: 9600 });
      Arduino.writer = Arduino.port.writable.getWriter();
      return true;
    } catch (e) { Arduino.port = null; Arduino.writer = null; return false; }
  };
  Arduino.disconnect = async function () {
    try { if (Arduino.writer) { Arduino.writer.releaseLock(); } if (Arduino.port) await Arduino.port.close(); } catch (e) { /* ignore */ }
    Arduino.port = null; Arduino.writer = null;
  };
  // W: 깨우기 시작, O: 깨우기 끝, S: 공부 시작, B: 휴식, E: 공부 끝
  Arduino.send = async function (ch) {
    if (!Arduino.writer) return;
    try { await Arduino.writer.write(new TextEncoder().encode(ch)); } catch (e) { Arduino.writer = null; Arduino.port = null; }
  };

  window.YajaCam = Cam;
  window.YajaArduino = Arduino;
  if (typeof module !== 'undefined' && module.exports) module.exports = { createMonitor, frameFromResult };
})();
