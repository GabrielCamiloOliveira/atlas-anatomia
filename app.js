/* Atlas de estudo — lógica */
(() => {
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const byId = Object.fromEntries(STRUCTS.map(s => [s.id, s]));
  const figById = Object.fromEntries(FIGS.map(f => [f.id, f]));

  // ---------- persistência ----------
  const LS = {
    get(k, d) { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } },
    set(k, v) { localStorage.setItem(k, JSON.stringify(v)); },
  };
  let overrides = LS.get("anat.pins", {});   // {figId: {structId: [x,y] | null}}
  let known = LS.get("anat.known", {});      // {id: "sei" | "rev"}
  let stats = LS.get("anat.stats", {});      // {id: {ok, bad}}

  function pinsOf(fig) {
    const out = { ...fig.pins };
    const ov = overrides[fig.id] || {};
    for (const [k, v] of Object.entries(ov)) { if (v === null) delete out[k]; else out[k] = v; }
    return out;
  }
  function figsWith(id) { return FIGS.filter(f => pinsOf(f)[id]); }
  function addStat(id, ok) {
    const s = stats[id] || { ok: 0, bad: 0 };
    ok ? s.ok++ : s.bad++; stats[id] = s; LS.set("anat.stats", stats);
  }

  // ---------- estado ----------
  const st = { view: "explorar", sys: "all", sel: null, fig: FIGS[0].id, labelMode: "sel", zoom: 1, edit: false, q: "" };

  const inSys = s => st.sys === "all" || s.sys === st.sys || s.sys === "FM";
  const figInSys = f => st.sys === "all" || f.sys === st.sys;

  // ---------- navegação ----------
  $$(".tabs button").forEach(b => b.onclick = () => setView(b.dataset.view));
  function setView(v) {
    st.view = v;
    $$(".tabs button").forEach(b => b.classList.toggle("active", b.dataset.view === v));
    $$(".view").forEach(el => el.classList.toggle("active", el.id === "view-" + v));
    if (v === "aponte" && !qa.cur) qaNew();
    if (v === "nomeie" && !qn.cur) qnNew();
    if (v === "lista") renderChecklist();
    if (v === "explorar") renderAll();
  }
  $$("#sysFilter button").forEach(b => b.onclick = () => {
    st.sys = b.dataset.sys;
    $$("#sysFilter button").forEach(x => x.classList.toggle("active", x === b));
    if (!figInSys(figById[st.fig])) st.fig = FIGS.find(figInSys).id;
    qa.cur = null; qn.cur = null;
    setView(st.view);
    renderAll();
  });

  // ---------- árvore ----------
  $("#search").oninput = e => { st.q = e.target.value.trim().toLowerCase(); renderTree(); };
  const norm = t => t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

  function renderTree() {
    const tree = $("#tree"); tree.innerHTML = "";
    const groups = new Map();
    for (const s of STRUCTS) {
      if (!inSys(s)) continue;
      if (st.q && !norm(s.n).includes(norm(st.q))) continue;
      if (!groups.has(s.g)) groups.set(s.g, []);
      groups.get(s.g).push(s);
    }
    for (const [g, items] of groups) {
      const d = document.createElement("details"); d.className = "grp";
      d.open = !!st.q || items.some(i => i.id === st.sel) || groups.size <= 3;
      d.innerHTML = `<summary>${g}<span class="cnt">${items.length}</span></summary>`;
      for (const s of items) {
        const nf = figsWith(s.id).length;
        const it = document.createElement("div");
        it.className = "item" + (s.id === st.sel ? " sel" : "");
        it.innerHTML = `<span class="dot ${s.sys}"></span><span>${s.n}</span>` +
          (known[s.id] === "sei" ? `<span class="known">✓</span>` : nf ? "" : `<span class="nofig">sem pino</span>`);
        it.onclick = () => select(s.id);
        d.appendChild(it);
      }
      tree.appendChild(d);
    }
    if (!groups.size) tree.innerHTML = `<p style="padding:10px;color:#999">Nada encontrado.</p>`;
  }

  function select(id, keepFig) {
    st.sel = id;
    if (!keepFig && id) {
      const here = pinsOf(figById[st.fig])[id];
      if (!here) {
        const cands = figsWith(id).filter(figInSys);
        const pick = cands.find(f => f.tipo === "esquema") || cands[0] || figsWith(id)[0];
        if (pick) st.fig = pick.id;
      }
    }
    renderAll();
    const p = $(".pin.sel"); if (p) p.scrollIntoView({ block: "center", inline: "center", behavior: "smooth" });
  }

  // ---------- figura ----------
  function renderFigbar() {
    const bar = $("#figbar"); bar.innerHTML = "";
    let lastSys = null;
    for (const f of FIGS.filter(figInSys)) {
      if (lastSys && lastSys !== f.sys) { const sp = document.createElement("span"); sp.className = "sep"; bar.appendChild(sp); }
      lastSys = f.sys;
      const c = document.createElement("button");
      const has = st.sel && pinsOf(f)[st.sel];
      c.className = "chip" + (f.id === st.fig ? " active" : "") + (has ? " has" : "");
      c.innerHTML = `<span class="k">${f.tipo === "foto" ? "📷" : "✏️"}</span>${f.t.replace("Foto · ", "")}`;
      c.title = has ? "Esta figura mostra a estrutura selecionada" : "";
      c.onclick = () => { st.fig = f.id; renderAll(); };
      bar.appendChild(c);
    }
  }

  function placePins(container, fig, opts) {
    container.innerHTML = "";
    const pins = pinsOf(fig);
    for (const [id, [x, y]] of Object.entries(pins)) {
      const s = byId[id]; if (!s) continue;
      if (opts.only && !opts.only.includes(id)) continue;
      const p = document.createElement("div");
      p.className = "pin" + (s.ref ? " ref" : "");
      p.style.left = (x / fig.w * 100) + "%"; p.style.top = (y / fig.h * 100) + "%";
      p.dataset.id = id;
      if (opts.decorate) opts.decorate(p, id, s, x, y);
      container.appendChild(p);
    }
  }
  function addTag(container, fig, x, y, text, cls = "") {
    const t = document.createElement("div");
    t.className = "tag " + cls + (x / fig.w > 0.62 ? " left" : "");
    t.style.left = (x / fig.w * 100) + "%"; t.style.top = (y / fig.h * 100) + "%";
    t.textContent = text; container.appendChild(t);
  }

  // encaixa a imagem inteira na área visível (largura e altura); zoom multiplica
  function fitStage(stage, wrap, fig, zoom = 1) {
    const cs = getComputedStyle(wrap);
    const W = wrap.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
    const H = wrap.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom);
    const ratio = fig.w === 100 ? (naturalRatio[fig.id] || 0.75) : fig.w / fig.h;
    const base = H > 80 ? Math.min(W, H * ratio) : W;
    stage.style.width = Math.max(200, base * zoom) + "px";
  }
  const naturalRatio = {};
  function learnRatio(img, figId, cb) {
    const set = () => { if (img.naturalWidth) { naturalRatio[figId] = img.naturalWidth / img.naturalHeight; cb && cb(); } };
    if (img.complete) set(); else img.onload = set;
  }
  window.addEventListener("resize", () => {
    if (st.view === "explorar") renderStage();
    if (st.view === "aponte" && qa.cur) fitStage($("#qaStage"), $("#qaStage").parentElement, figById[qa.cur.fig]);
    if (st.view === "nomeie" && qn.cur) fitStage($("#qnStage"), $("#qnStage").parentElement, figById[qn.cur.fig]);
  });

  function renderStage() {
    const fig = figById[st.fig];
    const img = $("#figimg");
    if (img.getAttribute("src") !== fig.src) img.src = fig.src;
    fitStage($("#stage"), $("#stagewrap"), fig, st.zoom);
    learnRatio(img, fig.id, () => fitStage($("#stage"), $("#stagewrap"), fig, st.zoom));
    const selChip = $("#figbar .chip.active"); if (selChip) selChip.scrollIntoView({ block: "nearest", inline: "nearest" });
    $("#fignote").innerHTML = `<b>${fig.t}</b> — ${fig.nota}`;
    const pinsEl = $("#pins");
    placePins(pinsEl, fig, {
      decorate(p, id, s, x, y) {
        if (id === st.sel) p.classList.add("sel");
        else if (st.sel) p.classList.add("dim");
        p.title = s.n;
        p.onclick = e => { e.stopPropagation(); if (!st.edit) select(id, true); else { st.sel = id; renderAll(); } };
        if (st.edit) enableDrag(p, fig, id);
      }
    });
    const pins = pinsOf(fig);
    if (st.labelMode === "all") {
      for (const [id, [x, y]] of Object.entries(pins)) if (id !== st.sel && byId[id]) addTag(pinsEl, fig, x, y, byId[id].n, "small");
    }
    if (st.sel && pins[st.sel] && st.labelMode !== "none") addTag(pinsEl, fig, ...pins[st.sel], byId[st.sel].n);
  }

  // clique na imagem no modo edição: posiciona pino
  $("#stage").addEventListener("click", e => {
    if (!st.edit || !st.sel || e.target.classList.contains("pin")) return;
    const fig = figById[st.fig];
    const r = $("#figimg").getBoundingClientRect();
    const x = round((e.clientX - r.left) / r.width * fig.w, fig), y = round((e.clientY - r.top) / r.height * fig.h, fig);
    setOverride(fig.id, st.sel, [x, y]);
  });
  const round = (v, fig) => fig.w === 100 ? Math.round(v * 10) / 10 : Math.round(v);
  function setOverride(figId, id, val) {
    overrides[figId] = overrides[figId] || {};
    overrides[figId][id] = val;
    LS.set("anat.pins", overrides);
    renderAll();
  }
  function enableDrag(p, fig, id) {
    p.classList.add("drag");
    p.onpointerdown = e => {
      e.preventDefault(); e.stopPropagation();
      st.sel = id;
      const r = $("#figimg").getBoundingClientRect();
      p.setPointerCapture(e.pointerId);
      const move = ev => {
        p.style.left = Math.min(100, Math.max(0, (ev.clientX - r.left) / r.width * 100)) + "%";
        p.style.top = Math.min(100, Math.max(0, (ev.clientY - r.top) / r.height * 100)) + "%";
      };
      const up = ev => {
        p.removeEventListener("pointermove", move); p.removeEventListener("pointerup", up);
        const x = round(Math.min(1, Math.max(0, (ev.clientX - r.left) / r.width)) * fig.w, fig);
        const y = round(Math.min(1, Math.max(0, (ev.clientY - r.top) / r.height)) * fig.h, fig);
        setOverride(fig.id, id, [x, y]);
      };
      p.addEventListener("pointermove", move); p.addEventListener("pointerup", up);
    };
  }

  $("#labelMode").onchange = e => { st.labelMode = e.target.value; renderStage(); };
  $("#zoom").oninput = e => { st.zoom = +e.target.value; renderStage(); };
  $("#editMode").onchange = e => { st.edit = e.target.checked; $("#editbar").classList.toggle("hidden", !st.edit); renderAll(); };
  $("#btnRemovePin").onclick = () => { if (st.sel) setOverride(st.fig, st.sel, null); };
  $("#btnExport").onclick = () => {
    const blob = new Blob([JSON.stringify(overrides, null, 1)], { type: "application/json" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = "ajustes-pinos.json"; a.click();
  };
  $("#fileImport").onchange = async e => {
    const f = e.target.files[0]; if (!f) return;
    try { overrides = JSON.parse(await f.text()); LS.set("anat.pins", overrides); renderAll(); alert("Ajustes importados."); }
    catch { alert("Arquivo inválido."); }
  };
  $("#btnReset").onclick = () => {
    if (confirm("Apagar todos os seus ajustes de pinos e voltar ao padrão?")) { overrides = {}; LS.set("anat.pins", overrides); renderAll(); }
  };

  // ---------- painel info ----------
  function renderInfo() {
    const el = $("#info");
    const s = byId[st.sel];
    if (!s) { el.innerHTML = `<div class="empty">Escolha uma estrutura na lista ou clique num pino.<br><br><b>Dica de estudo:</b> use “Rótulos: nenhum” e tente dizer o nome de cada pino antes de clicar. Depois vá para o <b>Quiz: aponte</b>.</div>`; return; }
    const figs = figsWith(s.id);
    const sysTxt = { F: "Feminino", M: "Masculino", FM: "Fem. e masc." }[s.sys];
    const stt = stats[s.id];
    el.innerHTML = `
      <h2>${s.n}</h2>
      <div class="grpname"><span class="badge ${s.ref ? "ref" : s.sys}">${s.ref ? "referência" : sysTxt}</span>${s.g}</div>
      <h3>Onde fica</h3><p>${s.onde}</p>
      <h3>Como achar no modelo</h3><p class="tip">${s.dica}</p>
      <h3>Aparece em</h3>
      <div class="figlist">${figs.length ? figs.map(f => `<button class="chip ${f.id === st.fig ? "active" : ""}" data-f="${f.id}">${f.tipo === "foto" ? "📷" : "✏️"} ${f.t.replace("Foto · ", "")}</button>`).join("") : `<span style="color:#999;font-size:13px">Nenhuma figura ainda — use “Editar pinos” para marcar.</span>`}</div>
      ${s.ref ? "" : `<div class="knowbtns"><button data-k="sei" class="${known[s.id] === "sei" ? "on" : ""}">✓ Já sei apontar</button><button data-k="rev" class="${known[s.id] === "rev" ? "on rev" : ""}">↻ Revisar</button></div>`}
      ${stt ? `<div class="stat">Quiz: ${stt.ok} acerto(s), ${stt.bad} erro(s)</div>` : ""}`;
    $$(".figlist .chip", el).forEach(b => b.onclick = () => { st.fig = b.dataset.f; renderAll(); });
    $$(".knowbtns button", el).forEach(b => b.onclick = () => {
      known[s.id] = known[s.id] === b.dataset.k ? undefined : b.dataset.k;
      LS.set("anat.known", known); renderInfo(); renderTree();
    });
  }

  function renderAll() { renderTree(); renderFigbar(); renderStage(); renderInfo(); }

  // ---------- QUIZ: APONTE ----------
  const qa = { cur: null, ok: 0, n: 0, done: false };
  const quizPool = () => STRUCTS.filter(s => !s.ref && inSys(s));
  function weightOf(id) {
    if (!$("#qaWeak").checked) return 1;
    const s = stats[id] || { ok: 0, bad: 0 };
    return 1 + s.bad * 2 - Math.min(s.ok, 3) * 0.25 + (known[id] === "rev" ? 2 : 0) - (known[id] === "sei" ? 0.5 : 0);
  }
  function wpick(arr, w) {
    const ws = arr.map(w).map(v => Math.max(0.2, v)); let r = Math.random() * ws.reduce((a, b) => a + b, 0);
    for (let i = 0; i < arr.length; i++) { r -= ws[i]; if (r <= 0) return arr[i]; } return arr[arr.length - 1];
  }
  function qaFigFilter(f) {
    if (!figInSys(f)) return false;
    if ($("#qaOnlyFotos").checked && f.tipo !== "foto") return false;
    if ($("#qaOnlySchemes").checked && f.tipo !== "esquema") return false;
    return true;
  }
  function qaNew() {
    const pool = quizPool().filter(s => FIGS.some(f => qaFigFilter(f) && pinsOf(f)[s.id]));
    if (!pool.length) { $("#qaTarget").textContent = "Nenhuma estrutura com esse filtro"; return; }
    let s = wpick(pool, x => weightOf(x.id));
    if (qa.cur && pool.length > 1 && s.id === qa.cur.id) s = wpick(pool, x => weightOf(x.id));
    const figs = FIGS.filter(f => qaFigFilter(f) && pinsOf(f)[s.id]);
    const fig = figs[Math.floor(Math.random() * figs.length)];
    qa.cur = { id: s.id, fig: fig.id }; qa.done = false;
    $("#qaTarget").textContent = s.n;
    $("#qaFig").textContent = `${fig.t} · ${s.g}`;
    $("#qaImg").src = fig.src;
    const fitQa = () => fitStage($("#qaStage"), $("#qaStage").parentElement, fig);
    fitQa(); learnRatio($("#qaImg"), fig.id, fitQa);
    $("#qaPins").innerHTML = "";
    const fb = $("#qaFeedback"); fb.className = "feedback"; fb.textContent = "Clique na imagem onde você acha que está a estrutura.";
  }
  function qaReveal(clickXY) {
    const fig = figById[qa.cur.fig], s = byId[qa.cur.id];
    const [x, y] = pinsOf(fig)[s.id];
    const pinsEl = $("#qaPins"); pinsEl.innerHTML = "";
    const r = $("#qaImg").getBoundingClientRect();
    const thr = Math.max(24, r.width * 0.05);
    const ring = document.createElement("div"); ring.className = "ring";
    ring.style.width = ring.style.height = (thr * 2) + "px";
    ring.style.left = `calc(${x / fig.w * 100}% - ${thr}px)`; ring.style.top = `calc(${y / fig.h * 100}% - ${thr}px)`;
    pinsEl.appendChild(ring);
    const p = document.createElement("div"); p.className = "pin ok";
    p.style.left = (x / fig.w * 100) + "%"; p.style.top = (y / fig.h * 100) + "%"; pinsEl.appendChild(p);
    addTag(pinsEl, fig, x, y, s.n);
    let hit = null;
    if (clickXY) {
      const dx = (clickXY[0] - x) / fig.w * r.width, dy = (clickXY[1] - y) / fig.h * r.height;
      hit = Math.hypot(dx, dy) <= thr;
      const c = document.createElement("div"); c.className = "pin click" + (hit ? " good" : "");
      c.style.left = (clickXY[0] / fig.w * 100) + "%"; c.style.top = (clickXY[1] / fig.h * 100) + "%"; pinsEl.appendChild(c);
      if (!hit) {
        // qual estrutura a pessoa apontou?
        let best = null, bd = Infinity;
        for (const [id, [px, py]] of Object.entries(pinsOf(fig))) {
          const d = Math.hypot((clickXY[0] - px) / fig.w * r.width, (clickXY[1] - py) / fig.h * r.height);
          if (d < bd && id !== s.id) { bd = d; best = id; }
        }
        if (best && bd <= thr) addTag(pinsEl, fig, ...pinsOf(fig)[best], "você marcou: " + byId[best].n, "small");
      }
      qa.n++; if (hit) qa.ok++;
      addStat(s.id, hit);
    } else { qa.n++; addStat(s.id, false); }
    $("#qaScore").textContent = `${qa.ok} / ${qa.n}`;
    const fb = $("#qaFeedback");
    fb.className = "feedback " + (hit ? "ok" : "bad");
    fb.innerHTML = `<b>${hit ? "✓ Acertou!" : clickXY ? "✗ Não foi dessa vez." : "Resposta:"}</b>${s.onde}<br><i>Dica:</i> ${s.dica}`;
    qa.done = true;
  }
  $("#qaStage").addEventListener("click", e => {
    if (!qa.cur || qa.done) return;
    const fig = figById[qa.cur.fig], r = $("#qaImg").getBoundingClientRect();
    qaReveal([(e.clientX - r.left) / r.width * fig.w, (e.clientY - r.top) / r.height * fig.h]);
  });
  $("#qaSkip").onclick = () => { if (qa.cur && !qa.done) qaReveal(null); };
  $("#qaNext").onclick = qaNew;
  ["#qaOnlyFotos", "#qaOnlySchemes"].forEach(sel => $(sel).onchange = e => {
    if (e.target.checked) $(sel === "#qaOnlyFotos" ? "#qaOnlySchemes" : "#qaOnlyFotos").checked = false;
    qaNew();
  });

  // ---------- QUIZ: NOMEIE ----------
  const qn = { cur: null, ok: 0, n: 0, done: false };
  function qnNew() {
    const figs = FIGS.filter(figInSys);
    const pairs = [];
    for (const f of figs) for (const id of Object.keys(pinsOf(f))) { const s = byId[id]; if (s && !s.ref && inSys(s)) pairs.push([f, s]); }
    if (!pairs.length) return;
    const [fig, s] = wpick(pairs, ([, x]) => weightOf(x.id));
    // distratores: preferir pinos da mesma figura e mesmo grupo
    const sameFig = Object.keys(pinsOf(fig)).map(i => byId[i]).filter(x => x && !x.ref && x.id !== s.id);
    const sameGrp = STRUCTS.filter(x => !x.ref && x.g === s.g && x.id !== s.id);
    const pool = [...new Set([...shuffle(sameFig), ...shuffle(sameGrp), ...shuffle(quizPool())])].filter(x => x.id !== s.id);
    const opts = shuffle([s, ...pool.slice(0, 3)]);
    qn.cur = { id: s.id, fig: fig.id }; qn.done = false;
    $("#qnFig").textContent = fig.t;
    $("#qnImg").src = fig.src;
    const fitQn = () => fitStage($("#qnStage"), $("#qnStage").parentElement, fig);
    fitQn(); learnRatio($("#qnImg"), fig.id, fitQn);
    const pinsEl = $("#qnPins");
    placePins(pinsEl, fig, { only: [s.id], decorate: p => p.classList.add("ask") });
    const ch = $("#qnChoices"); ch.innerHTML = "";
    for (const o of opts) {
      const b = document.createElement("button"); b.textContent = o.n;
      b.onclick = () => {
        if (qn.done) return; qn.done = true; qn.n++;
        const ok = o.id === s.id; if (ok) qn.ok++;
        addStat(s.id, ok);
        $$("button", ch).forEach(bb => { if (bb.textContent === s.n) bb.classList.add("right"); });
        if (!ok) b.classList.add("wrong");
        $("#qnScore").textContent = `${qn.ok} / ${qn.n}`;
        const fb = $("#qnFeedback"); fb.className = "feedback " + (ok ? "ok" : "bad");
        fb.innerHTML = `<b>${ok ? "✓ Isso!" : "✗ Era: " + s.n}</b>${s.onde}`;
        const [x, y] = pinsOf(fig)[s.id]; addTag(pinsEl, fig, x, y, s.n);
      };
      ch.appendChild(b);
    }
    const fb = $("#qnFeedback"); fb.className = "feedback"; fb.textContent = "Escolha o nome do pino laranja.";
  }
  $("#qnNext").onclick = qnNew;
  function shuffle(a) { a = [...a]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }

  // ---------- CHECKLIST ----------
  function renderChecklist() {
    const list = quizPool();
    const box = $("#checklist"); box.innerHTML = "";
    const groups = new Map();
    for (const s of list) { if (!groups.has(s.g)) groups.set(s.g, []); groups.get(s.g).push(s); }
    for (const [g, items] of groups) {
      const d = document.createElement("div"); d.className = "cl-grp";
      d.innerHTML = `<h4>${g}</h4>`;
      for (const s of items) {
        const r = document.createElement("div"); r.className = "cl-row";
        const t = stats[s.id];
        r.innerHTML = `<span class="nm">${s.n}</span><span class="st">${t ? `✓${t.ok} ✗${t.bad}` : ""}</span>
          <button data-k="sei" class="${known[s.id] === "sei" ? "on" : ""}">✓ sei</button>
          <button data-k="rev" class="${known[s.id] === "rev" ? "on rev" : ""}">↻ revisar</button>`;
        $(".nm", r).onclick = () => { setView("explorar"); select(s.id); };
        $$("button", r).forEach(b => b.onclick = () => {
          known[s.id] = known[s.id] === b.dataset.k ? undefined : b.dataset.k;
          LS.set("anat.known", known); renderChecklist();
        });
        d.appendChild(r);
      }
      box.appendChild(d);
    }
    const k = list.filter(s => known[s.id] === "sei").length;
    $("#progBar").style.width = (list.length ? k / list.length * 100 : 0) + "%";
    $("#progTxt").textContent = `${k} de ${list.length} marcadas como “sei”`;
  }

  // ---------- teclado ----------
  document.addEventListener("keydown", e => {
    if (e.target.tagName === "INPUT" || e.target.tagName === "SELECT") return;
    if (st.view === "aponte" && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); qa.done ? qaNew() : qaReveal(null); }
    if (st.view === "nomeie") {
      if (e.key === "Enter" && qn.done) qnNew();
      if (/^[1-4]$/.test(e.key)) $$("#qnChoices button")[+e.key - 1]?.click();
    }
  });

  renderAll();
})();
