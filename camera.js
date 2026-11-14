// Steps 2 and 3: camera rep counter, with hands-free sets, voice counting, a depth bar and a position check.
// Uses Google's MediaPipe pose model, which runs on the phone itself. The video is never recorded or uploaded.
// Uses globals from index.html: S, PLAN, dk, save, render, sync, setsOf, ac, tone, beep, tick, mmss.
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
var PARTS = ["shoulders", "elbows", "hands", "hips", "knees", "feet"];
function seen(L, i) { return L[i] && (L[i].visibility == null || L[i].visibility > 0.5); }
function needs(m) { return m.plank ? [0, 3, 5] : m.j === "knee" ? [3, 4, 5] : [0, 1, 2]; }

// The angle to watch in one camera frame, or null if the body is not clearly in view.
function measure(m, L, ar) {
  var out = SIDES.map(function (s) {
    var p = needs(m).map(function (t) { return s[t]; });
    if (!p.every(function (i) { return seen(L, i); })) return null;
    var v = p.reduce(function (t, i) { return t + (L[i].visibility == null ? 1 : L[i].visibility); }, 0);
    return { a: ang(L[p[0]], L[p[1]], L[p[2]], ar), v: v, p: p };
  }).filter(function (x) { return x && x.a != null; });
  if (!out.length) return null;
  if (m.side === "avg") return out.length === 2 ? { a: (out[0].a + out[1].a) / 2, p: out[0].p } : null;
  if (m.side === "min") return out.reduce(function (x, y) { return y.a < x.a ? y : x; });
  return out.reduce(function (x, y) { return y.v > x.v ? y : x; });
}

// What the camera cannot see, in plain words, for the position check
function whereMsg(m, L) {
  if (!L) return "Can't see you. Step back so your whole body is in view.";
  var miss = needs(m).filter(function (t) {
    return m.side === "avg" ? !SIDES.every(function (s) { return seen(L, s[t]); }) : !SIDES.some(function (s) { return seen(L, s[t]); });
  }).map(function (t) { return PARTS[t]; });
  if (miss.length) return "Can't see your " + miss.join(" and ") + ". Step back or tilt the phone.";
  return m.side === "avg" ? "Face the phone so both arms are in view." : "Turn side-on to the phone.";
}

// Rep counter: wait (until seen in start position) -> rest -> move -> back to rest = one rep, if the goal was reached.
function Counter(m) { this.m = m; this.n = 0; this.st = "wait"; this.best = null; this.buf = []; this.v = null; }
Counter.prototype.feed = function (a) {
  var m = this.m, b = this.buf;
  b.push(a); if (b.length > 5) b.shift();
  a = this.v = b.slice().sort(function (x, y) { return x - y; })[b.length >> 1]; // median of last 5 frames, removes jitter
  var past = function (x, t) { return m.down ? x <= t : x >= t; };
  var atRest = m.down ? a >= m.rest : a <= m.rest;
  if (this.st === "wait") { if (atRest) this.st = "rest"; return null; }
  if (this.st === "rest") { if (past(a, m.go)) { this.st = "move"; this.best = a; } return null; }
  if (m.down ? a < this.best : a > this.best) this.best = a;
  if (atRest) { this.st = "rest"; if (past(this.best, m.goal)) { this.n++; return "rep"; } return "shallow"; }
  return null;
};
// How far into the rep you are: 0 = start position, 1 = deep enough to count
function depth(m, v) {
  if (v == null) return 0;
  var p = m.down ? (m.rest - v) / (m.rest - m.goal) : (v - m.rest) / (m.goal - m.rest);
  return Math.max(0, Math.min(1, p));
}

// Plank check: body in a straight line (shoulder-hip-ankle) and lying roughly flat.
function plankState(L, ar) {
  var r = measure(MOVES.plank, L, ar); if (!r) return null;
  var s = L[r.p[0]], h = L[r.p[1]], k = L[r.p[2]];
  var flat = Math.abs(s.y - k.y) < Math.abs(s.x - k.x) * ar * 0.6;
  if (!flat) return { ok: false, why: "Get into your plank", say: "Get into your plank" };
  if (r.a >= 160) return { ok: true };
  var lineY = s.y + (k.y - s.y) * ((h.x - s.x) / ((k.x - s.x) || 1e-6));
  return h.y < lineY ? { ok: false, why: "Hips too high, lower them a little", say: "Hips down" }
                     : { ok: false, why: "Hips sagging, lift them a little", say: "Hips up" };
}

// ---------- voice ----------
function say(t) {
  var c = CAMS; if (!c || !c.voice || !window.speechSynthesis) return false;
  try { speechSynthesis.cancel(); var u = new SpeechSynthesisUtterance(t); u.rate = 1.1; speechSynthesis.speak(u); } catch (e) { return false; }
  return true;
}

// ---------- camera screen ----------
var CAMS = null, PL = null;
function exOf2(k) { return PLAN[k.charAt(0)].ex[parseInt(k.slice(1), 10)]; }

function camOpen(type, k) {
  ac();
  var m = MOVES[type], cfg = (S.camCfg && S.camCfg[type]) || { goal: m.plank ? 30 : 10, sets: 3, rest: 60 };
  cfg = { goal: cfg.goal, sets: cfg.sets, rest: cfg.rest };
  if (k) { // from a plan card: use the plan's target and the sets still to do
    var e = exOf2(k), n = setsOf(e[1]), left = n - (S.done[k] || []).filter(Boolean).length;
    cfg.goal = parseInt((e[1].split("×")[1] || ""), 10) || cfg.goal;
    cfg.sets = Math.max(1, left);
  }
  CAMS = { type: type, m: m, k: k || null, phase: "intro", cfg: cfg, voice: S.camVoice !== 0, set: 1, results: [], saved: [], hint: "", hintT: 0 };
  drawCam();
}

function opts(list, v, unit) { return list.map(function (x) { return '<option value="' + x + '"' + (x == v ? " selected" : "") + '>' + x + unit + '</option>'; }).join(""); }

function drawCam() {
  var el = document.getElementById("cam"), c = CAMS;
  if (!c) { el.style.display = "none"; el.innerHTML = ""; return; }
  el.style.display = "flex";
  if (c.phase === "intro" || c.phase === "error" || c.phase === "loading") {
    var note = S.camNote ? "" : '<p class="cnote"><b>Please note:</b> the camera counts reps and keeps you going. It does not judge whether your form is safe.</p>';
    var unit = c.m.plank ? "seconds" : "reps";
    el.innerHTML = '<div class="cbox"><h2>' + c.m.n + '</h2><p>' + c.m.how + '</p>' + note +
      '<div class="cset"><label>Goal (' + unit + ')<input id="cgoal" type="number" inputmode="numeric" min="1" value="' + c.cfg.goal + '"></label>' +
      '<label>Sets<select id="csets">' + opts([1, 2, 3, 4, 5, 6], c.cfg.sets, "") + '</select></label>' +
      '<label>Rest<select id="crest">' + opts([30, 45, 60, 90, 120], c.cfg.rest, " sec") + '</select></label></div>' +
      '<label class="cvo"><input type="checkbox" id="cvoice"' + (c.voice ? " checked" : "") + '> Say the count out loud</label>' +
      '<p class="cpriv">Runs on this phone. Nothing is recorded or uploaded. Each set finishes and saves by itself when you reach the goal.</p>' +
      (c.phase === "error" ? '<p class="cerr">' + c.err + '</p>' : '') +
      (c.phase === "loading" ? '<p class="cload">Starting camera… the first time takes a few seconds.</p>' :
        '<button class="big" onclick="camStart()">Start camera</button>') +
      '<button class="ghost" style="width:100%;margin-top:10px" onclick="camClose()">Cancel</button></div>';
    return;
  }
  if (c.phase === "summary") {
    var lines = c.results.map(function (v, i) { return '<li>Set ' + (i + 1) + ': <b>' + (c.m.plank ? v + " sec" : v + " reps") + '</b></li>'; }).join("");
    el.innerHTML = '<div class="cbox"><h2>' + (c.results.length ? "Nice work" : "Stopped") + '</h2>' +
      (lines ? '<ul class="csum">' + lines + '</ul><p>' + c.saved.join(" ") + ' You can still edit it.</p>' : '<p>Nothing was counted, so nothing was saved.</p>') +
      '<button class="big" onclick="camClose()">Close</button></div>';
    return;
  }
}

// The live camera view is built once; ui() only changes the parts on top of it.
function buildLive() {
  var c = CAMS, el = document.getElementById("cam");
  el.innerHTML = '<video id="cv" playsinline muted autoplay></video><canvas id="cc"></canvas><div id="cfr" class="cframe"></div>' +
    '<div class="ctop"><span id="cnm"></span><div><b id="cn"></b><small id="cg"></small></div><p id="ch"></p></div>' +
    '<div class="cbar" id="cbar"><i id="cbf"></i><em>' + (c.m.plank ? "goal" : "deep enough") + '</em></div>' +
    '<div class="cmid" id="cmid"></div><div class="cbot" id="cbot"></div>';
  if (c.stream) document.getElementById("cv").srcObject = c.stream;
}

function ui() {
  var c = CAMS; if (!c || !document.getElementById("cbot")) return;
  var $ = function (i) { return document.getElementById(i); };
  $("cnm").textContent = c.m.n + " · set " + c.set + " of " + c.cfg.sets;
  var counting = c.phase === "count";
  $("cn").textContent = c.m.plank ? mmss(Math.floor(c.secs || 0)) : (counting ? c.n : 0);
  $("cg").textContent = c.m.plank ? " / " + mmss(c.cfg.goal) : " / " + c.cfg.goal;
  $("cbar").style.display = counting ? "" : "none";
  var mid = "";
  if (c.phase === "setup") mid = '<span class="cmsg">Get in position</span>';
  if (c.phase === "ready") mid = '<span class="cbig">' + c.cd + '</span>';
  if (c.phase === "rest") mid = '<span class="cmsg">Rest</span><span class="cbig">' + mmss(Math.max(0, c.restLeft)) + '</span><span class="cmsg">Next: set ' + (c.set + 1) + ' of ' + c.cfg.sets + '</span>';
  $("cmid").innerHTML = mid;
  $("cbot").innerHTML = '<button class="ghost" onclick="camFinish()">Stop</button>' +
    (counting ? '<button class="big" onclick="setDone()">Set done</button>' : c.phase === "rest" ? '<button class="big" onclick="CAMS.restEnd=0">Skip rest</button>' : '');
}

async function camStart() {
  var c = CAMS; ac(); S.camNote = 1;
  var g = parseInt(document.getElementById("cgoal").value, 10);
  c.cfg = { goal: g > 0 ? Math.min(g, 600) : c.cfg.goal, sets: parseInt(document.getElementById("csets").value, 10), rest: parseInt(document.getElementById("crest").value, 10) };
  c.voice = document.getElementById("cvoice").checked; S.camVoice = c.voice ? 1 : 0;
  if (!c.k) { S.camCfg = S.camCfg || {}; S.camCfg[c.type] = c.cfg; }
  save();
  say("Get in position"); // iPhone only allows speech that starts from a tap, so the first words go here
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
  buildLive(); toSetup();
  var v = document.getElementById("cv");
  try { await v.play(); } catch (e) {}
  try { c.wake = await navigator.wakeLock.request("screen"); } catch (e) {}
  c.last = -1; c.t = performance.now();
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
  var c = CAMS; if (!c || !c.stream) return;
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

function toSetup() { var c = CAMS; c.phase = "setup"; c.okT = 0; setHint("", 1); ui(); }

// Handles one camera frame. L = landmarks, null = nobody seen, undefined = no new frame yet.
function onPose(L, ar) {
  var c = CAMS; if (!c) return;
  var now = performance.now(), dt = Math.min(0.5, (now - c.t) / 1000); c.t = now;
  if (L !== undefined) { c.L = L; c.r = L ? measure(c.m, L, ar) : null; frame(!!c.r); }
  var fresh = L !== undefined;

  if (c.phase === "setup") { // position check: whole body needed for 1 second before the countdown
    if (!fresh) return;
    if (c.r) { c.okT += dt; setHint("✓ Good, hold still"); if (c.okT >= 1) startCountdown(now); }
    else { c.okT = 0; setHint(whereMsg(c.m, L)); sayEvery(whereMsg(c.m, L).split(".")[0], 6000); }
    return;
  }
  if (c.phase === "ready") {
    if (fresh) { c.lost = c.r ? 0 : (c.lost || 0) + dt; if (c.lost > 1) { say("Lost you"); return toSetup(); } }
    var left = Math.ceil((c.cdEnd - now) / 1000);
    if (left !== c.cd) {
      c.cd = left;
      if (left > 0) { if (!say(String(left))) tick(); ui(); }
      else { c.phase = "count"; c.ctr = new Counter(c.m); c.n = 0; c.secs = 0; c.spoke = 0; if (!say("Go")) tone(880, .3); ui(); }
    }
    return;
  }
  if (c.phase === "rest") {
    var rl = Math.ceil((c.restEnd - now) / 1000);
    if (rl !== c.restLeft) {
      c.restLeft = rl; ui();
      if (rl === 10) say("10 seconds");
      if (rl <= 3 && rl > 0 && !c.voice) tick();
      if (rl <= 0) { c.set++; say("Next set. Get in position"); if (!c.voice) beep(); toSetup(); }
    }
    return;
  }
  if (c.phase !== "count" || !fresh) return;

  if (!c.r) { if (!c.m.plank) c.ctr.buf = []; setHint(whereMsg(c.m, L)); return; }
  if (c.m.plank) {
    var p = plankState(L, ar);
    if (p && p.ok) {
      c.secs += dt; setHint("Good, hold it straight");
      var tens = Math.floor(c.secs / 10) * 10;
      if (tens > c.spoke && c.secs < c.cfg.goal) { c.spoke = tens; say(String(tens)); }
    } else if (p) { setHint(p.why); sayEvery(p.say, 4000); }
    setCount(mmss(Math.floor(c.secs)));
    setBar(c.secs / c.cfg.goal);
    if (c.secs >= c.cfg.goal) setDone(true);
    return;
  }
  var ev = c.ctr.feed(c.r.a);
  setBar(depth(c.m, c.ctr.v));
  if (ev === "rep") {
    c.n = c.ctr.n; setCount(c.n); setHint("", 1);
    if (c.n >= c.cfg.goal) return setDone(true);
    if (!say(String(c.n))) tone(880, .15);
  } else if (ev === "shallow") { if (!say("Too shallow")) tone(300, .3); setHint("Too shallow, not counted", 1, 1800); }
  else if (c.ctr.st === "wait") setHint(c.m.start);
  else setHint("");
}

function startCountdown(now) {
  var c = CAMS; c.phase = "ready"; c.lost = 0; c.cd = null;
  c.cdEnd = now + (c.set === 1 ? 5 : 3) * 1000;
  say("Ready"); setHint("", 1);
}

// Finish the current set (auto = goal reached). Saves it, then rest or the end.
function setDone(auto) {
  var c = CAMS; if (!c || c.phase !== "count") return;
  var val = c.m.plank ? Math.round(c.secs) : c.n;
  if (!val) { setHint("Nothing counted yet", 1, 2000); return; }
  saveSet(val);
  if (c.set >= c.cfg.sets) { say((c.m.plank ? "Time. " : val + ". ") + "All sets done. Nice work"); if (!c.voice) beep(); return camFinish(true); }
  c.phase = "rest"; c.restEnd = performance.now() + c.cfg.rest * 1000; c.restLeft = null;
  say((c.m.plank ? "Time. " : val + ". ") + "Set done. Rest " + c.cfg.rest + " seconds"); if (!c.voice) beep();
  setHint("", 1); frame(null); ui();
}

// Stop button, or all sets finished: save a set in progress and show the summary.
function camFinish(already) {
  var c = CAMS; if (!c) return;
  if (!already && c.phase === "count") { var v = c.m.plank ? Math.round(c.secs) : c.n; if (v) saveSet(v); }
  camStop(c);
  if (!c.results.length && c.phase !== "count" && c.phase !== "rest") return camClose();
  c.phase = "summary"; drawCam();
}

// Put one finished set into the normal log.
function saveSet(val) {
  var c = CAMS, r = c.m.plank ? val + " sec" : String(val);
  c.results.push(val);
  if (c.k) {
    var k = c.k, e = exOf2(k), n = setsOf(e[1]), d = S.done[k] || [], j = 0;
    while (j < n && d[j]) j++;
    if (j < n) {
      S.sets = S.sets || {}; var a = S.sets[k] = S.sets[k] || []; a[j] = a[j] || {}; a[j].r = r;
      d[j] = true; S.done[k] = d; sync(k);
      c.saved = ["Saved to " + e[0] + " on your workout."];
      return;
    }
  }
  var td = dk(new Date()), L = S.cal[td] = S.cal[td] || [], name = c.k ? exOf2(c.k)[0] : c.m.n, ent = null, i;
  for (i = 0; i < L.length; i++) if (L[i].cam && L[i].n === name) ent = L[i];
  if (!ent) { ent = { n: name, cam: 1, s: 0, ls: [] }; L.push(ent); }
  ent.ls.push({ r: r, k: null }); ent.s = ent.ls.length; save();
  if (c.saved.indexOf("Saved to today's log.") < 0) c.saved.push("Saved to today's log.");
}

function sayEvery(t, gap) { var c = CAMS, now = performance.now(); if (c.sayT != null && now - c.sayT < gap) return; c.sayT = now; say(t); }
function setHint(t, force, hold) {
  var c = CAMS, now = performance.now();
  if (!force && now < c.hintT) return;
  c.hintT = hold ? now + hold : 0;
  if (c.hint === t) return; c.hint = t;
  var h = document.getElementById("ch"); if (h) { h.textContent = t; h.className = /shallow|sagging|high|see|Turn|Face|Nothing/i.test(t) ? "warn" : ""; }
}
function setCount(t) { var b = document.getElementById("cn"); if (b) b.textContent = t; }
function setBar(p) {
  var f = document.getElementById("cbf"); if (!f) return;
  p = Math.max(0, Math.min(1, p)); f.style.height = Math.round(p * 100) + "%"; f.className = p >= 1 ? "ok" : "";
}
// Green frame = you are in view, red = not, none = resting
function frame(ok) {
  var f = document.getElementById("cfr"), c = CAMS; if (!f || c.phase === "rest") { if (f) f.className = "cframe"; return; }
  f.className = "cframe " + (ok ? "ok" : "bad");
}

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
  c.stream = null; c.wake = null; c.raf = null;
}
function camClose() { camStop(); try { window.speechSynthesis && speechSynthesis.cancel(); } catch (e) {} CAMS = null; drawCam(); render(); }

// Button on a plan card
function camBtn(e, k) {
  var t = CAM_FOR[e[0]]; if (!t) return "";
  return '<button class="ghost cambtn" onclick="camOpen(\'' + t + '\',\'' + k + '\')">📷 Count with camera</button>';
}

// Camera tab
function camv(v) {
  var h = '<p class="focus">Prop your phone up and it counts for you, out loud. Set a goal and it runs your sets and rest by itself, so you never have to walk back to the phone.</p>';
  for (var t in MOVES) {
    var m = MOVES[t];
    h += '<section class="ex"><h3>' + m.n + '</h3><p class="meta">' + m.how + '</p><button class="big" onclick="camOpen(\'' + t + '\')">📷 Count ' + m.n.toLowerCase() + '</button></section>';
  }
  v.innerHTML = h + '<p class="tip">The camera counts reps and keeps you going. It does not judge whether your form is safe. Nothing is recorded or uploaded.</p>';
}
