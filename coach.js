// Step 1: next-weight suggestions and personal records.
// Reads past workouts from the calendar log (S.cal). Uses globals from index.html: S, PLAN, dk, save, render, sync, gs.
var DEF_STEP = 2.5;

// "3 × 12" -> {sets:3, reps:12}. Timed moves ("3 × 30 sec", "30 min") get no suggestion.
function target(e) {
  var p = e[1].split("×");
  if (p.length < 2 || /sec|min/i.test(e[1])) return null;
  return { sets: parseInt(p[0], 10), reps: parseInt(p[1], 10) };
}

function stepOf(nm) { var s = S.step && S.step[nm]; return s > 0 ? s : DEF_STEP; }
function setStep(k, v) {
  var nm = exOf(k)[0]; v = parseFloat(v); S.step = S.step || {};
  if (v > 0) S.step[nm] = v; else delete S.step[nm];
  save(); render();
}
function exOf(k) { return PLAN[k.charAt(0)].ex[parseInt(k.slice(1), 10)]; }
function kgs(x) { return String(+(+x).toFixed(2)); }

// All sets of one calendar entry as [{r, k}] with numbers (r = 0 means reps not written down).
function entrySets(e) {
  if (e.ls && e.ls.length) return e.ls.map(function (x) { return { r: parseInt(x.r, 10) || 0, k: parseFloat(x.k) || 0 }; });
  var out = [], n = e.s || 1, i;
  if (!e.k) return out;
  for (i = 0; i < n; i++) out.push({ r: parseInt(e.r, 10) || 0, k: parseFloat(e.k) || 0 });
  return out;
}

// Past sessions of an exercise before a date, oldest first: [{d, sets}]. Only sessions with a weight count.
function sessions(nm, before) {
  var out = [];
  Object.keys(S.cal || {}).sort().forEach(function (d) {
    if (d >= before) return;
    var sets = [];
    S.cal[d].forEach(function (e) { if (e.n === nm) sets = sets.concat(entrySets(e)); });
    sets = sets.filter(function (x) { return x.k > 0; });
    if (sets.length) out.push({ d: d, sets: sets });
  });
  return out;
}
function topK(sets) { return Math.max.apply(0, sets.map(function (x) { return x.k; })); }

// true = all reps hit, false = missed, null = reps not written down
function hitAll(sess, t) {
  if (sess.sets.some(function (x) { return !x.r; })) return null;
  return sess.sets.length >= t.sets && sess.sets.every(function (x) { return x.r >= t.reps; });
}

// The suggestion for the next session: {kg, why} or {none: text}
function suggest(e) {
  var t = target(e); if (!t) return null;
  var ss = sessions(e[0], dk(new Date()));
  if (!ss.length) return { none: "Log this lift once with a weight to get a suggestion." };
  var last = ss[ss.length - 1], W = topK(last.sets), st = stepOf(e[0]), h = hitAll(last, t);
  if (h === null) return { kg: W, why: "same weight, reps were not logged last time" };
  if (h) return { kg: +(W + st).toFixed(2), why: "up " + kgs(st) + " kg, all reps hit last time" };
  var miss = 0, i;
  for (i = ss.length - 1; i >= 0; i--) { if (hitAll(ss[i], t) === false && topK(ss[i].sets) === W) miss++; else break; }
  if (miss >= 3) {
    var nk = Math.round(W * 0.9 * 2) / 2; if (nk >= W) nk = W - 0.5;
    if (nk > 0) return { kg: nk, why: "down about 10%, missed reps 3 sessions in a row" };
  }
  return { kg: W, why: "same weight, missed reps last time" + (miss === 2 ? " (2 in a row)" : "") };
}

function sugBox(e, k) {
  var s = suggest(e); if (!s) return "";
  var h = '<div class="sug">';
  if (s.none) h += '<div class="sgt"><small>' + s.none + '</small></div>';
  else h += '<div class="sgt"><b>Try ' + kgs(s.kg) + ' kg</b><small>' + s.why + '</small></div><button class="ghost" onclick="useW(\'' + k + '\',' + s.kg + ')">Use</button>';
  return h + '<label class="stp">Step<input type="number" inputmode="decimal" step="0.5" min="0" value="' + kgs(stepOf(e[0])) + '" aria-label="Weight step for ' + e[0] + '" onchange="setStep(\'' + k + '\',this.value)">kg</label></div>';
}

// Fill the suggested weight into the sets not ticked yet. The owner can still change any box.
function useW(k, w) {
  var e = exOf(k), n = setsOf(e[1]), d = S.done[k] || [], j;
  S.sets = S.sets || {}; var a = S.sets[k] = S.sets[k] || [];
  for (j = 0; j < n; j++) { if (d[j]) continue; a[j] = a[j] || {}; a[j].k = String(w); }
  S.w[k] = String(w); sync(k); render();
}

// Best set from days before a date: {k, r} (heaviest weight, then most reps at that weight)
function bestBefore(nm, before) {
  var b = null;
  sessions(nm, before).forEach(function (s) { s.sets.forEach(function (x) { if (beats(x, b)) b = x; }); });
  return b;
}
function beats(x, b) { return x.k > 0 && (!b || x.k > b.k || (x.k === b.k && x.r > b.r)); }

// Which ticked set today (index) is a new record, or -1
function prIdx(k, e) {
  var d = S.done[k] || [], b = bestBefore(e[0], dk(new Date())), top = -1, tb = null, j;
  if (!b) return -1;
  for (j = 0; j < d.length; j++) {
    if (!d[j]) continue;
    var q = gs(k, j, e), x = { r: parseInt(q.r, 10) || 0, k: parseFloat(q.k) || 0 };
    if (beats(x, tb)) { tb = x; top = j; }
  }
  return tb && beats(tb, b) ? top : -1;
}

// PR tag for a Log entry on a given day
function prTag(e, day) {
  var b = bestBefore(e.n, day); if (!b) return "";
  return entrySets(e).some(function (x) { return beats(x, b); }) ? ' <span class="prt">PR</span>' : "";
}
