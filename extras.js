// Muscle balance (Week tab) and monthly recap card (Week tab).
// Reads the calendar log (S.cal). Uses globals from index.html and coach.js: S, dk, esc, entrySets, bestBefore, beats.

// ---------- Muscle balance ----------
// Which muscle groups each exercise works. Matched on the exercise name, so hand-typed Log entries count too.
var MG = ["Legs", "Glutes", "Back", "Chest", "Shoulders", "Arms", "Core"];
var MG_RULES = [
  [/leg press|squat|lunge/i, ["Legs", "Glutes"]],
  [/leg extension|leg curl/i, ["Legs"]],
  [/abduction|glute|hip thrust/i, ["Glutes"]],
  [/pulldown|pull-up|pull up|row/i, ["Back", "Arms"]],
  [/chest press|push-up|push up|bench/i, ["Chest", "Arms"]],
  [/shoulder press|lateral raise/i, ["Shoulders", "Arms"]],
  [/triceps|biceps|curl/i, ["Arms"]],
  [/plank|crunch|leg raise|\babs?\b/i, ["Core"]]
];
function musclesOf(nm) {
  for (var i = 0; i < MG_RULES.length; i++) if (MG_RULES[i][0].test(nm)) return MG_RULES[i][1];
  return [];
}
function nSets(e) { return (e.ls && e.ls.length) || e.s || 0; }

// Sets per muscle group for the 7 days starting Monday of this week
function weekMuscles() {
  var n = new Date(), dw = (n.getDay() + 6) % 7, out = {}, i;
  MG.forEach(function (g) { out[g] = 0; });
  for (i = 0; i < 7; i++) {
    var k = dk(new Date(n.getFullYear(), n.getMonth(), n.getDate() - dw + i));
    (S.cal[k] || []).forEach(function (e) {
      var c = nSets(e); if (!c) return;
      musclesOf(e.n).forEach(function (g) { out[g] += c; });
    });
  }
  return out;
}

function muscleBox() {
  var m = weekMuscles(), mx = Math.max.apply(0, MG.map(function (g) { return m[g]; })), total = MG.reduce(function (a, g) { return a + m[g]; }, 0);
  var h = '<section class="ex"><h3>Muscle balance this week</h3>';
  if (!total) return h + '<p class="meta">Tick some sets and this shows how many sets each muscle group got this week.</p></section>';
  var low = MG.filter(function (g) { return m[g] === Math.min.apply(0, MG.map(function (x) { return m[x]; })); });
  h += '<p class="meta">Sets per muscle group since Monday. Least trained: <b style="color:var(--warn)">' + low.join(", ") + '</b></p>';
  MG.forEach(function (g) {
    var w = mx ? Math.round(m[g] / mx * 100) : 0;
    h += '<div class="mb"><span>' + g + '</span><div class="mbt"><i style="width:' + w + '%' + (m[g] ? '' : ';background:transparent') + '"></i></div><b' + (m[g] ? '' : ' class="z"') + '>' + m[g] + '</b></div>';
  });
  return h + '</section>';
}

// ---------- Monthly recap ----------
var RY = new Date().getFullYear(), RM = new Date().getMonth();
function recapMove(d) { RM += d; if (RM < 0) { RM = 11; RY--; } if (RM > 11) { RM = 0; RY++; } render(); }

function recapData(y, mo) {
  var nd = new Date(y, mo + 1, 0).getDate(), i, r = { days: 0, sets: 0, kg: 0, prs: 0, streak: 0, top: null, min: 0 }, run = 0;
  var lifts = {};
  for (i = 1; i <= nd; i++) {
    var k = dk(new Date(y, mo, i)), L = S.cal[k] || [];
    if (L.length) { run++; if (run > r.streak) r.streak = run; } else run = 0;
    if (L.some(function (e) { return !/stretch$/i.test(e.n); })) r.days++;
    L.forEach(function (e) {
      r.sets += nSets(e); r.min += e.m || 0;
      var ss = entrySets(e), b = null, isPr = false;
      ss.forEach(function (x) {
        r.kg += (x.r || 0) * (x.k || 0);
        if (x.k > 0) {
          if (b === null) b = bestBefore(e.n, k) || false;
          if (b && beats(x, b)) isPr = true;
          if (!lifts[e.n] || x.k > lifts[e.n]) lifts[e.n] = x.k;
        }
      });
      if (isPr) r.prs++;
    });
  }
  // Heaviest lift of the month
  Object.keys(lifts).forEach(function (n) { if (!r.top || lifts[n] > r.top.k) r.top = { n: n, k: lifts[n] }; });
  r.kg = Math.round(r.kg);
  return r;
}
function monthName(y, mo) { return new Date(y, mo, 1).toLocaleDateString("en-GB", { month: "long", year: "numeric" }); }
function fmtKg(n) { return n >= 10000 ? (Math.round(n / 100) / 10) + "k" : String(n); }

function recapBox() {
  var r = recapData(RY, RM), now = new Date(), isNow = RY === now.getFullYear() && RM === now.getMonth();
  var h = '<section class="ex"><h3>Monthly recap</h3><div class="rcn"><button class="ghost" aria-label="Previous month" onclick="recapMove(-1)">‹</button><b>' + monthName(RY, RM) + '</b><button class="ghost" aria-label="Next month" onclick="recapMove(1)"' + (isNow ? ' disabled' : '') + '>›</button></div>';
  h += '<div class="rcg"><div><b>' + r.days + '</b><span>gym days</span></div><div><b>' + r.sets + '</b><span>sets</span></div><div><b>' + fmtKg(r.kg) + '</b><span>kg lifted</span></div>' +
    '<div><b>' + r.prs + '</b><span>PRs</span></div><div><b>' + r.streak + '</b><span>best streak</span></div><div><b>' + Math.round(r.min) + '</b><span>minutes</span></div></div>';
  if (r.top) h += '<p class="meta" style="margin-top:10px">Heaviest lift: <b>' + esc(r.top.n) + ' · ' + r.top.k + ' kg</b></p>';
  h += '<button class="big" style="margin:10px 0 0" onclick="recapImg()">Save as image</button><p class="st" id="rcm"></p></section>';
  return h;
}

// Draw the recap on a canvas and save or share it as a picture
function recapImg() {
  var r = recapData(RY, RM), W = 1080, H = 1350, c = document.createElement("canvas"), x = c.getContext("2d");
  c.width = W; c.height = H;
  var g = x.createLinearGradient(0, 0, 0, H); g.addColorStop(0, "#0f172a"); g.addColorStop(1, "#020617");
  x.fillStyle = g; x.fillRect(0, 0, W, H);
  x.fillStyle = "#22c55e"; x.fillRect(80, 110, 120, 12);
  var F = "Inter, system-ui, -apple-system, sans-serif";
  x.fillStyle = "#94a3b8"; x.font = "600 44px " + F; x.fillText("MY GYM RECAP", 80, 200);
  x.fillStyle = "#f1f5f9"; x.font = "800 86px " + F; x.fillText(monthName(RY, RM), 80, 300);
  var cells = [[r.days, "gym days"], [r.sets, "sets"], [fmtKg(r.kg), "kg lifted"], [r.prs, "PRs"], [r.streak, "best streak"], [Math.round(r.min), "minutes"]];
  cells.forEach(function (q, i) {
    var cx = 80 + (i % 2) * 470, cy = 380 + Math.floor(i / 2) * 250;
    x.fillStyle = "#0f172a"; rr(x, cx, cy, 440, 220, 36); x.fill();
    x.strokeStyle = "#1e293b"; x.lineWidth = 3; x.stroke();
    x.fillStyle = "#22c55e"; x.font = "800 110px " + F; x.fillText(String(q[0]), cx + 40, cy + 130);
    x.fillStyle = "#94a3b8"; x.font = "600 40px " + F; x.fillText(q[1], cx + 40, cy + 185);
  });
  if (r.top) {
    x.fillStyle = "#94a3b8"; x.font = "600 40px " + F; x.fillText("Heaviest lift", 80, 1180);
    x.fillStyle = "#f1f5f9"; x.font = "700 52px " + F; x.fillText(fit(x, r.top.n + " · " + r.top.k + " kg", W - 160), 80, 1245);
  }
  var nm = "gym-recap-" + RY + "-" + ("0" + (RM + 1)).slice(-2) + ".png", m = document.getElementById("rcm");
  c.toBlob(function (b) {
    if (!b) { m.textContent = "Could not make the image."; return; }
    var f = null; try { f = new File([b], nm, { type: "image/png" }); } catch (e) {}
    if (f && navigator.canShare && navigator.canShare({ files: [f] })) {
      navigator.share({ files: [f], title: "My gym recap" }).catch(function () {});
      m.textContent = "Pick Save Image to keep it in Photos.";
    } else {
      var a = document.createElement("a"); a.href = URL.createObjectURL(b); a.download = nm; document.body.appendChild(a); a.click(); a.remove();
      m.textContent = "Image saved to your downloads.";
    }
  }, "image/png");
}
function rr(x, a, b, w, h, r) { x.beginPath(); x.moveTo(a + r, b); x.arcTo(a + w, b, a + w, b + h, r); x.arcTo(a + w, b + h, a, b + h, r); x.arcTo(a, b + h, a, b, r); x.arcTo(a, b, a + w, b, r); x.closePath(); }
function fit(x, t, w) { while (t.length > 4 && x.measureText(t).width > w) t = t.slice(0, -2); return t; }

// ---------- Offline: register the service worker so the app works with no signal ----------
if ("serviceWorker" in navigator && location.protocol !== "file:") {
  window.addEventListener("load", function () { navigator.serviceWorker.register("sw.js").catch(function () {}); });
}
