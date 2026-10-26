/* Dice Roller — every result comes from crypto.getRandomValues with rejection sampling (no modulo bias). */
(function () {
  "use strict";
  var $ = S3.$, $$ = S3.$$;
  var LIM = { dice: 100, sides: 1000, terms: 20, constant: 100000 };

  // ---------- fair random ----------
  function uniformFrom(n, next) { var lim = Math.floor(0x100000000 / n) * n, x; do x = next(); while (x >= lim); return x % n; }
  function cryptoU32() { var b = new Uint32Array(1); crypto.getRandomValues(b); return b[0]; }
  function randInt(n) { return uniformFrom(n, cryptoU32); } // 0..n-1, n <= 2^32

  // ---------- notation ----------
  function parse(src) {
    var s = String(src || "").toLowerCase()
      .replace(/\s*drop\s*lowest/g, "dl").replace(/\s*drop\s*highest/g, "dh").replace(/\s*keep\s*highest/g, "kh").replace(/\s*keep\s*lowest/g, "kl")
      .replace(/\s*([+-])\s*/g, "$1").trim();
    if (!s) return { error: "Type some dice notation, e.g. 2d6+3" };
    if (/\s/.test(s)) return { error: "Join terms with + or −, e.g. 2d6+3" };
    var re = /^([+-]?)(?:(\d*)d(\d+|%)(?:(dl|dh|kh|kl|k)(\d*))?|(\d+))/, terms = [], m, first = true;
    while (s.length) {
      m = re.exec(s);
      if (!m || (!first && !m[1])) return { error: "Can't read “" + s.slice(0, 12) + "”. Try 2d6+3 or 4d6dl1." };
      first = false; s = s.slice(m[0].length);
      var sign = m[1] === "-" ? -1 : 1;
      if (m[6] !== undefined) {
        var c = +m[6]; if (c > LIM.constant) return { error: "Numbers up to " + LIM.constant + " only." };
        terms.push({ sign: sign, constant: c });
      } else {
        var n = m[2] === "" ? 1 : +m[2], sides = m[3] === "%" ? 100 : +m[3], op = m[4] === "k" ? "kh" : m[4], k = m[5] === "" || m[5] === undefined ? 1 : +m[5];
        if (n < 1 || n > LIM.dice) return { error: "Use 1 to " + LIM.dice + " dice per term." };
        if (sides < 2 || sides > LIM.sides) return { error: "Dice need 2 to " + LIM.sides + " sides." };
        if (op && (op[0] === "d" ? k >= n : k > n || k < 1)) return { error: op[0] === "d" ? "You can't drop " + k + " of " + n + " dice." : "You can't keep " + k + " of " + n + " dice." };
        terms.push({ sign: sign, n: n, sides: sides, op: op || null, k: op ? k : 0 });
      }
      if (terms.length > LIM.terms) return { error: "Up to " + LIM.terms + " terms." };
    }
    return { terms: terms };
  }
  function label(t) { return t.constant !== undefined ? String(t.constant) : (t.n === 1 ? "" : t.n) + "d" + t.sides + (t.op ? t.op + t.k : ""); }
  function canon(p) { return p.terms.map(function (t, i) { return (t.sign < 0 ? "-" : i ? "+" : "") + label(t); }).join(""); }
  // rng(sides) -> 0..sides-1
  function roll(p, rng) {
    var total = 0, parts = p.terms.map(function (t) {
      if (t.constant !== undefined) { total += t.sign * t.constant; return { t: t, sub: t.constant }; }
      var rolls = [];
      for (var i = 0; i < t.n; i++) rolls.push({ v: rng(t.sides) + 1, kept: true });
      if (t.op) {
        var order = rolls.map(function (r, i) { return i; }).sort(function (a, b) { return rolls[a].v - rolls[b].v || a - b; });
        var drop = t.op === "dl" ? order.slice(0, t.k) : t.op === "dh" ? order.slice(order.length - t.k) : t.op === "kh" ? order.slice(0, order.length - t.k) : order.slice(t.k);
        drop.forEach(function (i) { rolls[i].kept = false; });
      }
      var sub = rolls.reduce(function (a, r) { return a + (r.kept ? r.v : 0); }, 0);
      total += t.sign * sub;
      return { t: t, rolls: rolls, sub: sub };
    });
    return { total: total, parts: parts };
  }
  function describe(r) {
    return r.parts.map(function (p, i) {
      var s = (p.t.sign < 0 ? "− " : i ? "+ " : "");
      if (!p.rolls) return s + p.sub;
      return s + label(p.t) + " [" + p.rolls.map(function (x) { return x.kept ? x.v : "~" + x.v + "~"; }).join(", ") + "]";
    }).join(" ") + " = " + r.total;
  }

  // ---------- dice UI ----------
  var history = S3.store("dice.history") || [];
  function showError(msg) { $("#dice").innerHTML = ""; var t = $("#total"); t.textContent = msg; t.className = "total err"; $("#breakdown").textContent = ""; }
  function doRoll(expr) {
    var p = parse(expr);
    if (p.error) { showError(p.error); return null; }
    var r = roll(p, randInt), box = $("#dice"), shown = 0;
    box.innerHTML = "";
    r.parts.forEach(function (part) {
      if (!part.rolls) return;
      part.rolls.forEach(function (x) {
        if (shown++ >= 120) return;
        var cls = "die rolling" + (x.kept ? "" : " drop") + (part.t.sides > 2 && x.v === part.t.sides ? " max" : x.v === 1 ? " min" : "");
        var d = S3.h("div", { "class": cls, title: "d" + part.t.sides + (x.kept ? "" : " (dropped)") }, [String(x.v), S3.h("small", { text: "d" + part.t.sides })]);
        d.style.animationDelay = Math.min(shown * 35, 400) + "ms";
        box.appendChild(d);
      });
    });
    var t = $("#total"); t.className = "total"; t.textContent = r.total;
    $("#breakdown").textContent = describe(r).replace(/~(\d+)~/g, "($1 dropped)");
    history.unshift({ e: canon(p), d: describe(r).replace(/~(\d+)~/g, "($1)"), total: r.total, t: Date.now() });
    history = history.slice(0, 100); S3.store("dice.history", history); renderHist();
    S3.store("dice.expr", expr); S3.done();
    return r;
  }
  function renderHist() {
    var ol = $("#hist"); ol.innerHTML = "";
    history.slice(0, 40).forEach(function (h) { ol.appendChild(S3.h("li", null, [S3.h("b", { text: String(h.total) }), S3.h("code", { text: h.d })])); });
    $("#noHist").hidden = history.length > 0;
  }
  $("#diceForm").addEventListener("submit", function (e) { e.preventDefault(); doRoll($("#expr").value); });
  $$("#quick button").forEach(function (b) {
    b.addEventListener("click", function () { var e = $("#count").value + "d" + b.dataset.s; $("#expr").value = e; doRoll(e); });
  });
  $$("#presets button").forEach(function (b) { b.addEventListener("click", function () { $("#expr").value = b.dataset.e; doRoll(b.dataset.e); }); });
  $("#copyHist").addEventListener("click", function () { if (history.length) S3.copy(history.map(function (h) { return h.d; }).join("\n")); else S3.toast("No rolls yet", "error"); });
  $("#clearHist").addEventListener("click", function () { history = []; S3.store("dice.history", history); renderHist(); });

  // ---------- coin ----------
  var coin = Object.assign({ h: 0, t: 0, streak: 0, side: null, best: 0, bestSide: null, seq: [] }, S3.store("dice.coin") || {}), coinRot = 0, flipping = false;
  function coinStep(st, heads) {
    var s = heads ? "h" : "t";
    st[s]++; st.streak = st.side === s ? st.streak + 1 : 1; st.side = s;
    if (st.streak > st.best) { st.best = st.streak; st.bestSide = s; }
    st.seq = [s].concat(st.seq).slice(0, 24);
    return st;
  }
  function renderCoin() {
    var n = coin.h + coin.t, pct = function (x) { return n ? Math.round(x / n * 100) + "%" : "—"; };
    function stat(l, v) { return '<div class="stat"><b>' + S3.esc(v) + "</b><span>" + S3.esc(l) + "</span></div>"; }
    $("#coinStats").innerHTML = stat("heads · " + pct(coin.h), coin.h) + stat("tails · " + pct(coin.t), coin.t) +
      stat("current streak", coin.streak ? coin.streak + "× " + (coin.side === "h" ? "heads" : "tails") : "—") +
      stat("longest streak", coin.best ? coin.best + "× " + (coin.bestSide === "h" ? "heads" : "tails") : "—");
    var seq = $("#coinSeq"); seq.innerHTML = "";
    coin.seq.forEach(function (s) { seq.appendChild(S3.h("span", { "class": s, text: s.toUpperCase() })); });
  }
  function flip() {
    if (flipping) return;
    var heads = randInt(2) === 0, target = heads ? 0 : 180;
    coinRot = coinRot + 1800 + ((target - (coinRot % 360)) + 360) % 360;
    flipping = true; $("#coinRes").textContent = "…";
    $("#coin").style.transform = "rotateY(" + coinRot + "deg)";
    setTimeout(function () {
      flipping = false; coinStep(coin, heads); S3.store("dice.coin", coin);
      $("#coinRes").textContent = heads ? "Heads" : "Tails"; renderCoin(); S3.done();
    }, window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 900);
  }
  $("#coin").addEventListener("click", flip);
  $("#flip").addEventListener("click", flip);
  $("#coinReset").addEventListener("click", function () { coin = { h: 0, t: 0, streak: 0, side: null, best: 0, bestSide: null, seq: [] }; S3.store("dice.coin", coin); renderCoin(); $("#coinRes").textContent = "Tap the coin"; });

  // ---------- random numbers ----------
  // Distinct sample of k values from 0..n-1: partial Fisher-Yates for small ranges, rejection with a Set otherwise.
  function sampleUnique(n, k, rng) {
    if (n <= 200000) {
      var a = []; for (var i = 0; i < n; i++) a.push(i);
      for (var j = 0; j < k; j++) { var r = j + rng(n - j), t = a[j]; a[j] = a[r]; a[r] = t; }
      return a.slice(0, k);
    }
    var seen = new Set(), out = [];
    while (out.length < k) { var v = rng(n); if (!seen.has(v)) { seen.add(v); out.push(v); } }
    return out;
  }
  function genNumbers(min, max, k, unique, rng) {
    if (!Number.isInteger(min) || !Number.isInteger(max)) return { error: "Min and max must be whole numbers." };
    if (Math.abs(min) > 1e9 || Math.abs(max) > 1e9) return { error: "Keep min and max between −1,000,000,000 and 1,000,000,000." };
    if (min > max) { var s = min; min = max; max = s; }
    var n = max - min + 1;
    if (!Number.isInteger(k) || k < 1 || k > 10000) return { error: "How many: 1 to 10,000." };
    if (unique && k > n) return { error: "Only " + n + " different numbers exist between " + min + " and " + max + "." };
    var vals = unique ? sampleUnique(n, k, rng) : Array.from({ length: k }, function () { return rng(n); });
    return { nums: vals.map(function (v) { return v + min; }) };
  }
  var lastNums = [];
  $("#gen").addEventListener("click", function () {
    var r = genNumbers(Number($("#min").value), Number($("#max").value), Number($("#howMany").value), $("#unique").checked, randInt);
    if (r.error) { $("#nums").textContent = r.error; S3.toast(r.error, "error"); lastNums = []; return; }
    lastNums = $("#sortNums").checked ? r.nums.slice().sort(function (a, b) { return a - b; }) : r.nums;
    $("#nums").textContent = lastNums.join(", ");
    S3.store("dice.nums", { min: $("#min").value, max: $("#max").value, k: $("#howMany").value, u: $("#unique").checked, s: $("#sortNums").checked });
    S3.done();
  });
  $("#copyNums").addEventListener("click", function () { if (lastNums.length) S3.copy(lastNums.join(", ")); else S3.toast("Generate some numbers first", "error"); });
  var ns = S3.store("dice.nums");
  if (ns) { $("#min").value = ns.min; $("#max").value = ns.max; $("#howMany").value = ns.k; $("#unique").checked = !!ns.u; $("#sortNums").checked = !!ns.s; }

  if (typeof S3.store("dice.expr") === "string") $("#expr").value = S3.store("dice.expr").slice(0, 120);
  renderHist(); renderCoin();

  window.S3_DEMO = function () {
    $("#expr").value = "4d6 drop lowest+2";
    doRoll("4d6 drop lowest+2");
    $$(".die").forEach(function (d) { d.classList.remove("rolling"); });
    ["2d20kh1", "d20+5", "3d8"].forEach(function (e) { var p = parse(e), r = roll(p, randInt); history.splice(1, 0, { e: e, d: describe(r).replace(/~(\d+)~/g, "($1)"), total: r.total, t: Date.now() }); });
    renderHist();
    coin = { h: 7, t: 5, streak: 3, side: "h", best: 4, bestSide: "t", seq: ["h", "h", "h", "t", "h", "t", "t", "t", "t", "h", "h", "t"] }; renderCoin(); $("#coinRes").textContent = "Heads";
    $("#min").value = 1; $("#max").value = 49; $("#howMany").value = 6; $("#unique").checked = true; $("#sortNums").checked = true; $("#gen").click();
  };

  window.S3_SELFTEST = function () {
    function seq(vals) { return function (sides) { return vals.shift() - 1; }; }
    var p1 = parse("4d6 drop lowest"), r1 = roll(p1, seq([3, 1, 4, 6]));
    var a = r1.total === 13 && r1.parts[0].rolls[1].kept === false && canon(p1) === "4d6dl1";
    var r2 = roll(parse("2d20kh1"), seq([5, 17])), r3 = roll(parse("2d20kl1"), seq([5, 17])), r4 = roll(parse("2d6+3"), seq([2, 5]));
    var b = r2.total === 17 && r3.total === 5 && r4.total === 10;
    var r5 = roll(parse("d20 - 1d4 - 2"), seq([12, 3])), c = r5.total === 7 && parse("d%").terms[0].sides === 100 && parse("D20").terms[0].n === 1;
    var r6 = roll(parse("5d10dh2"), seq([9, 2, 10, 4, 4])), d = r6.total === 10;
    var e = ["", "2d", "0d6", "101d6", "4d6dl4", "2d1", "abc", "2d6+", "2d6 3", "1d1001"].every(function (s) { return !!parse(s).error; });
    var calls = 0, src = [0xFFFFFFFF, 7], f = uniformFrom(6, function () { calls++; return src.shift(); }) === 1 && calls === 2;
    var cnt = [0, 0, 0, 0, 0, 0], g = true;
    for (var i = 0; i < 6000; i++) cnt[randInt(6)]++;
    cnt.forEach(function (x) { if (x < 860 || x > 1140) g = false; });
    var u = genNumbers(1, 10, 10, true, randInt).nums.slice().sort(function (x, y) { return x - y; }).join() === "1,2,3,4,5,6,7,8,9,10";
    var big = genNumbers(1, 1e9, 50, true, randInt).nums, h = new Set(big).size === 50 && big.every(function (x) { return x >= 1 && x <= 1e9; });
    var err = !!genNumbers(1, 5, 6, true, randInt).error && genNumbers(5, 1, 3, false, randInt).nums.every(function (x) { return x >= 1 && x <= 5; });
    var st = coinStep(coinStep(coinStep({ h: 0, t: 0, streak: 0, side: null, best: 0, seq: [] }, true), true), false);
    var cs = st.h === 2 && st.t === 1 && st.streak === 1 && st.best === 2 && st.bestSide === "h";
    return a && b && c && d && e && f && g && u && h && err && cs;
  };
})();
