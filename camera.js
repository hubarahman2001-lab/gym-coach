// Steps 2 and 3: camera rep counter.
// Uses Google's MediaPipe pose model, which runs on the phone itself. The video is never recorded or uploaded.
// Uses globals from index.html: S, PLAN, dk, save, render, sync, gs, setsOf, rest, ac, tone, beep, tick, mmss.
var MP_URL = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.2.0";
var MP_MODEL = "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task";

// Each move watches one joint angle (degrees, 180 = straight).
// rest: where a rep starts and ends. goal: how far a rep must go to count. go: past this you are clearly doing a rep.
var MOVES = {
  squat:  { n: "Squats", j: "knee", rest: 160, goal: 100, go: 140, down: true, side: "best",
            how: "Prop the phone at hip height. Stand side-on, about 2 m away, so your whole body is in view.", start: "Stand tall to start" },
  lunge:  { n: "Lunges", j: "knee", rest: 160, goal: 105, go: 140, down: true, side: "min",
            how: "Stand side-on, about 2 m away, whole body in view. Each step down and back up is one rep.", start: "Stand tall to start" },
  pushup: { n: "Push-ups", j: "elbow", rest: 155, goal: 95, go: 130, down: true, side: "best",
            how: "Phone on the floor, side-on, about 1.5 m away, whole body in view.", start: "Arms straight to start" },
  press:  { n: "Shoulder press", j: "elbow", rest: 105, goal: 155, go: 130, down: false, side: "avg",
            how: "Face the phone with your upper body and both arms in view.", start: "Hands at shoulder height to start" },
  plank:  { n: "Plank", plank: true,
            how: "Phone on the floor, side-on, about 1.5 m away, whole body in view." }
};
// Plan exercises that get a "Count with camera" button
var CAM_FOR = { "Plank": "plank", "Shoulder press machine": "press" };

// ---------- counting logic (no camera needed, easy to test) ----------
function ang(a, b, c, ar) {
  var x1 = (a.x - b.x) * ar, y1 = a.y - b.y, x2 = (c.x - b.x) * ar, y2 = c.y - b.y;
  var d = Math.sqrt(x1 * x1 + y1 * y1) * Math.sqrt(x2 * x2 + y2 * y2);
  if (!d) return null;
  return Math.acos(Math.max(-1, Math.min(1, (x1 * x2 + y1 * y2) / d))) * 180 / Math.PI;
}
// Landmark numbers: left side then right side: shoulder, elbow, wrist, hip, knee, ankle
var SIDES = [[11, 13, 15, 23, 25, 27], [12, 14, 16, 24, 26, 28]];
function seen(L, i) { return L[i] && (L[i].visibility == null || L[i].visibility > 0.5); }

// The angle to watch in one camera frame, or null if the body is not clearly in view.
function measure(m, L, ar) {
  var out = SIDES.map(function (s) {
    var p = m.plank ? [s[0], s[3], s[5]] : m.j === "knee" ? [s[3], s[4], s[5]] : [s[0], s[1], s[2]];
    if (!p.every(function (i) { return seen(L, i); })) return null;
    var v = p.reduce(function (t, i) { return t + (L[i].visibility == null ? 1 : L[i].visibility); }, 0);
    return { a: ang(L[p[0]], L[p[1]], L[p[2]], ar), v: v, p: p };
  }).filter(function (x) { return x && x.a != null; });
  if (!out.length) return null;
  if (m.side === "avg" && out.length === 2) return { a: (out[0].a + out[1].a) / 2, p: out[0].p };
  if (m.side === "min") return out.reduce(function (x, y) { return y.a < x.a ? y : x; });
  return out.reduce(function (x, y) { return y.v > x.v ? y : x; });
}

// Rep counter: wait (until seen in start position) -> rest -> move -> back to rest = one rep, if the goal was reached.
function Counter(m) { this.m = m; this.n = 0; this.st = "wait"; this.best = null; this.buf = []; }
Counter.prototype.feed = function (a) {
  var m = this.m, b = this.buf;
  b.push(a); if (b.length > 5) b.shift();
  a = b.slice().sort(function (x, y) { return x - y; })[b.length >> 1]; // median of last 5 frames, removes jitter
  var past = function (x, t) { return m.down ? x <= t : x >= t; };
  var atRest = m.down ? a >= m.rest : a <= m.rest;
  if (this.st === "wait") { if (atRest) this.st = "rest"; return null; }
  if (this.st === "rest") { if (past(a, m.go)) { this.st = "move"; this.best = a; } return null; }
  if (m.down ? a < this.best : a > this.best) this.best = a;
  if (atRest) { this.st = "rest"; if (past(this.best, m.goal)) { this.n++; return "rep"; } return "shallow"; }
  return null;
};

// Plank check: body in a straight line (shoulder-hip-ankle) and lying roughly flat.
function plankState(L, ar) {
  var r = measure(MOVES.plank, L, ar); if (!r) return null;
  var s = L[r.p[0]], h = L[r.p[1]], k = L[r.p[2]];
  var flat = Math.abs(s.y - k.y) < Math.abs(s.x - k.x) * ar * 0.6;
  if (!flat) return { ok: false, why: "Get into your plank" };
  if (r.a >= 160) return { ok: true };
  var lineY = s.y + (k.y - s.y) * ((h.x - s.x) / ((k.x - s.x) || 1e-6));
  return { ok: false, why: h.y < lineY ? "Hips too high, lower them a little" : "Hips sagging, lift them a little" };
}

// ---------- camera screen ----------
var CAMS = null, PL = null;

function camOpen(type, k) {
  ac();
  var m = MOVES[type], e = k ? PLAN[k.charAt(0)].ex[parseInt(k.slice(1), 10)] : null;
  CAMS = { type: type, m: m, k: k || null, phase: "intro", n: 0, secs: 0,
           goal: e && m.plank ? (parseInt((e[1].split("×")[1] || ""), 10) || 0) : 0, hint: "", hintT: 0 };
  drawCam();
}

function drawCam() {
  var el = document.getElementById("cam"), c = CAMS;
  if (!c) { el.style.display = "none"; el.innerHTML = ""; return; }
  el.style.display = "flex";
  if (c.phase === "intro" || c.phase === "error" || c.phase === "loading") {
    var note = S.camNote ? "" : '<p class="cnote"><b>Please note:</b> the camera counts reps and keeps you going. It does not judge whether your form is safe.</p>';
    el.innerHTML = '<div class="cbox"><h2>' + c.m.n + '</h2><p>' + c.m.how + '</p>' + note +
      '<p class="cpriv">Runs on this phone. Nothing is recorded or uploaded.</p>' +
      (c.phase === "error" ? '<p class="cerr">' + c.err + '</p>' : '') +
      (c.phase === "loading" ? '<p class="cload">Starting camera… the first time takes a few seconds.</p>' :
        '<button class="big" onclick="camStart()">Start camera</button>') +
      '<button class="ghost" style="width:100%;margin-top:10px" onclick="camClose()">Cancel</button></div>';
    return;
  }
  if (c.phase === "done") {
    el.innerHTML = '<div class="cbox"><h2>' + (c.m.plank ? mmss(Math.floor(c.secs)) : c.n + " reps") + '</h2><p>' + c.msg + '</p>' +
      '<button class="big" onclick="camClose()">Close</button></div>';
    return;
  }
  el.innerHTML = '<video id="cv" playsinline muted autoplay></video><canvas id="cc"></canvas>' +
    '<div class="ctop"><span>' + c.m.n + '</span><b id="cn">' + (c.m.plank ? "0:00" : "0") + '</b><p id="ch"></p></div>' +
    '<div class="cbot"><button class="ghost" onclick="camClose()">Cancel</button><button class="big" onclick="camDone()">Done</button></div>';
}

async function camStart() {
  var c = CAMS; ac(); S.camNote = 1; save();
  c.phase = "loading"; drawCam();
  try {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) throw { cam: 1 };
    var stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user", width: { ideal: 640 }, height: { ideal: 480 } }, audio: false });
    if (CAMS !== c) { stream.getTracks().forEach(function (t) { t.stop(); }); return; }
    c.stream = stream;
    if (!PL) PL = await loadPose();
    if (CAMS !== c) return camStop(c);
  } catch (err) {
    camStop(c);
    c.phase = "error";
    var nm = err && err.name;
    c.err = (err && err.cam) || nm === "NotFoundError" || nm === "OverconstrainedError" ? "No camera found on this device." :
      nm === "NotAllowedError" || nm === "SecurityError" ? "The camera is blocked. On iPhone: Settings › Safari › Camera › Allow, then try again." :
      nm === "NotReadableError" ? "The camera is busy in another app. Close it and try again." :
      "Could not start the counter. Check your internet connection (it is needed the first time) and try again.";
    drawCam(); return;
  }
  c.phase = "ready"; drawCam();
  var v = document.getElementById("cv"); v.srcObject = c.stream;
  try { await v.play(); } catch (e) {}
  try { c.wake = await navigator.wakeLock.request("screen"); } catch (e) {}
  c.cd = 5; c.cdT = performance.now(); c.last = -1; c.t = performance.now();
  c.raf = requestAnimationFrame(camLoop);
}

async function loadPose() {
  var mp = await import(MP_URL + "/vision_bundle.mjs");
  var files = await mp.FilesetResolver.forVisionTasks(MP_URL + "/wasm");
  var opt = function (d) { return { baseOptions: { modelAssetPath: MP_MODEL, delegate: d }, runningMode: "VIDEO", numPoses: 1 }; };
  try { return await mp.PoseLandmarker.createFromOptions(files, opt("GPU")); }
  catch (e) { return await mp.PoseLandmarker.createFromOptions(files, opt("CPU")); }
}

function camLoop() {
  var c = CAMS; if (!c || (c.phase !== "ready" && c.phase !== "count")) return;
  var v = document.getElementById("cv");
  if (v && v.readyState >= 2 && v.currentTime !== c.last) {
    c.last = v.currentTime;
    var res = null;
    try { res = PL.detectForVideo(v, performance.now()); } catch (e) {}
    var L = res && res.landmarks && res.landmarks[0];
    drawPose(v, L);
    onPose(L || null, v.videoWidth / (v.videoHeight || 1));
  } else onPose(undefined);
  c.raf = requestAnimationFrame(camLoop);
}

// Handles one camera frame. L = landmarks, null = nobody seen, undefined = no new frame yet.
function onPose(L, ar) {
  var c = CAMS, now = performance.now(), dt = Math.min(0.5, (now - c.t) / 1000); c.t = now;
  if (c.phase === "ready") {
    var left = Math.ceil(5 - (now - c.cdT) / 1000);
    if (left !== c.cd) { c.cd = left; if (left > 0) tick(); }
    if (left <= 0) { c.phase = "count"; c.ctr = new Counter(c.m); tone(880, .3); }
    else { setHint("Get in position… " + left); return; }
  }
  if (L === undefined) return;
  if (!L) { if (!c.m.plank) c.ctr.buf = []; setHint("Can't see you. Move so your whole body is in view."); return; }
  if (c.m.plank) {
    var p = plankState(L, ar);
    if (p && p.ok) {
      var was = c.secs; c.secs += dt;
      if (c.goal && was < c.goal && c.secs >= c.goal) beep();
      setHint("Good, hold it straight");
    } else setHint(p ? p.why : "Can't see you. Move so your whole body is in view.");
    setCount(mmss(Math.floor(c.secs)));
    return;
  }
  var r = measure(c.m, L, ar);
  if (!r) { setHint("Can't see you. Move so your whole body is in view."); return; }
  var ev = c.ctr.feed(r.a);
  if (ev === "rep") { c.n = c.ctr.n; setCount(c.n); tone(880, .15); setHint("", 1); }
  else if (ev === "shallow") { tone(300, .3); setHint("Too shallow, not counted", 1, 1800); }
  else if (c.ctr.st === "wait") setHint(c.m.start);
  else setHint("");
}

function setHint(t, force, hold) {
  var c = CAMS, now = performance.now();
  if (!force && now < c.hintT) return;
  c.hintT = hold ? now + hold : 0;
  if (c.hint === t) return; c.hint = t;
  var h = document.getElementById("ch"); if (h) { h.textContent = t; h.className = /shallow|sagging|high|see/i.test(t) ? "warn" : ""; }
}
function setCount(t) { var b = document.getElementById("cn"); if (b) b.textContent = t; }

function drawPose(v, L) {
  var cv = document.getElementById("cc"); if (!cv) return;
  if (cv.width !== v.videoWidth) { cv.width = v.videoWidth; cv.height = v.videoHeight; }
  var g = cv.getContext("2d"); g.clearRect(0, 0, cv.width, cv.height); if (!L) return;
  var W = cv.width, H = cv.height, lines = [[11, 12], [11, 13], [13, 15], [12, 14], [14, 16], [11, 23], [12, 24], [23, 24], [23, 25], [25, 27], [24, 26], [26, 28]];
  g.lineWidth = 4; g.strokeStyle = "rgba(34,197,94,.9)"; g.fillStyle = "#38bdf8";
  lines.forEach(function (q) { var a = L[q[0]], b = L[q[1]]; if (seen(L, q[0]) && seen(L, q[1])) { g.beginPath(); g.moveTo(a.x * W, a.y * H); g.lineTo(b.x * W, b.y * H); g.stroke(); } });
  [11, 12, 13, 14, 15, 16, 23, 24, 25, 26, 27, 28].forEach(function (i) { if (seen(L, i)) { g.beginPath(); g.arc(L[i].x * W, L[i].y * H, 6, 0, 7); g.fill(); } });
}

function camStop(c) {
  c = c || CAMS; if (!c) return;
  if (c.raf) cancelAnimationFrame(c.raf);
  if (c.stream) c.stream.getTracks().forEach(function (t) { t.stop(); });
  if (c.wake) { try { c.wake.release(); } catch (e) {} }
  c.stream = null; c.wake = null;
}
function camClose() { camStop(); CAMS = null; drawCam(); render(); }

// Set finished: put the result into the normal log.
function camDone() {
  var c = CAMS; camStop(c);
  var val = c.m.plank ? Math.round(c.secs) : c.n;
  if (!val) { c.phase = "done"; c.msg = "Nothing counted, so nothing was saved."; drawCam(); return; }
  var r = c.m.plank ? val + " sec" : String(val);
  if (c.k) {
    var k = c.k, e = PLAN[k.charAt(0)].ex[parseInt(k.slice(1), 10)], n = setsOf(e[1]), d = S.done[k] || [], j = 0;
    while (j < n && d[j]) j++;
    if (j < n) {
      S.sets = S.sets || {}; var a = S.sets[k] = S.sets[k] || []; a[j] = a[j] || {}; a[j].r = r;
      d[j] = true; S.done[k] = d; sync(k);
      c.msg = "Saved to " + e[0] + ", set " + (j + 1) + ". You can still edit it.";
      c.phase = "done"; drawCam(); rest(60); return;
    }
  }
  var td = dk(new Date()), L = S.cal[td] = S.cal[td] || [], name = c.k ? PLAN[c.k.charAt(0)].ex[parseInt(c.k.slice(1), 10)][0] : c.m.n, ent = null, i;
  for (i = 0; i < L.length; i++) if (L[i].cam && L[i].n === name) ent = L[i];
  if (!ent) { ent = { n: name, cam: 1, s: 0, ls: [] }; L.push(ent); }
  ent.ls.push({ r: r, k: null }); ent.s = ent.ls.length; save();
  c.msg = "Saved to today's log as " + name + ", set " + ent.s + ".";
  c.phase = "done"; drawCam(); rest(60);
}

// Button on a plan card
function camBtn(e, k) {
  var t = CAM_FOR[e[0]]; if (!t) return "";
  return '<button class="ghost cambtn" onclick="camOpen(\'' + t + '\',\'' + k + '\')">📷 Count with camera</button>';
}

// Camera tab
function camv(v) {
  var h = '<p class="focus">Prop your phone up and it counts for you. A beep means a rep counted. Each set saves to today’s log.</p>';
  for (var t in MOVES) {
    var m = MOVES[t];
    h += '<section class="ex"><h3>' + m.n + '</h3><p class="meta">' + m.how + '</p><button class="big" onclick="camOpen(\'' + t + '\')">📷 Count ' + m.n.toLowerCase() + '</button></section>';
  }
  v.innerHTML = h + '<p class="tip">The camera counts reps and keeps you going. It does not judge whether your form is safe. Nothing is recorded or uploaded.</p>';
}
