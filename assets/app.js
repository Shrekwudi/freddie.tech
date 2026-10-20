(function () {
  "use strict";

  const $ = (id) => document.getElementById(id);
  const els = {
    list: $("programList"), search: $("search"), scratch: $("scratchBtn"),
    crumb: $("crumb"), title: $("progTitle"), desc: $("progDesc"),
    run: $("runBtn"), stop: $("stopBtn"), reset: $("resetBtn"), copy: $("copyBtn"),
    download: $("downloadBtn"), edited: $("editedBadge"), clear: $("clearBtn"),
    term: $("terminal"), status: $("pyStatus"), menu: $("menuBtn"), sidebar: $("sidebar"),
  };

  const SCRATCH = { path: "scratch", title: "Scratchpad", description: "A blank program to try things out. Your code is kept in this browser.", group: "", original: '# Write any Python here and press Run\nname = input("What is your name? ")\nprint(f"Hello, {name}!")\n' };

  let programs = [];
  let current = null;
  let worker = null;
  let ready = false;
  let running = false;
  let waitingInput = false;
  let stopTimer = null;

  // ---------- shared memory for input() and Stop ----------
  const isolated = !!self.crossOriginIsolated && typeof SharedArrayBuffer !== "undefined";
  const shared = isolated ? {
    stdinCtrl: new SharedArrayBuffer(8),
    stdinData: new SharedArrayBuffer(64 * 1024),
    interrupt: new SharedArrayBuffer(1),
  } : null;
  const ctrl = shared && new Int32Array(shared.stdinCtrl);
  const data = shared && new Uint8Array(shared.stdinData);
  const interrupt = shared && new Uint8Array(shared.interrupt);

  // ---------- storage helpers (never let storage break the page) ----------
  const store = {
    get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch (e) {} },
    del(k) { try { localStorage.removeItem(k); } catch (e) {} },
  };
  const editKey = (p) => "pyprog-edit:" + p;

  // ---------- editor ----------
  const editor = CodeEditor.create({
    textarea: $("code"), pre: $("highlight"), gutter: $("gutter"),
    onRun: () => runProgram(),
    onChange: (v) => {
      if (!current) return;
      if (v === current.original) store.del(editKey(current.path));
      else store.set(editKey(current.path), v);
      updateEdited();
    },
  });

  function updateEdited() {
    const edited = !!current && current.path !== "scratch" && editor.getValue() !== current.original;
    els.edited.hidden = !edited;
    els.reset.hidden = !edited;
    const link = els.list.querySelector(`[data-path="${CSS.escape(current ? current.path : "")}"] .dot-edited`);
    if (link) link.hidden = !edited;
  }

  // ---------- status pill ----------
  function setStatus(state, label) {
    els.status.dataset.state = state;
    els.status.querySelector(".label").textContent = label;
    els.status.title = label;
  }
  function updateButtons() {
    els.run.disabled = !ready || running || !current;
    els.stop.disabled = !running;
  }

  // ---------- terminal ----------
  let lastSpan = null;
  function write(text, cls) {
    if (!text) return;
    const c = cls || "out";
    if (lastSpan && lastSpan.dataset.cls === c && lastSpan.parentNode === els.term) {
      lastSpan.textContent += text;
    } else {
      lastSpan = document.createElement("span");
      lastSpan.dataset.cls = c;
      if (c !== "out") lastSpan.className = c;
      lastSpan.textContent = text;
      els.term.appendChild(lastSpan);
    }
    els.term.scrollTop = els.term.scrollHeight;
  }
  function info(text) {
    const needsNl = els.term.textContent && !els.term.textContent.endsWith("\n");
    write((needsNl ? "\n" : "") + text + "\n", "info");
  }
  function clearTerminal() { els.term.textContent = ""; lastSpan = null; }

  function askForInput() {
    waitingInput = true;
    setStatus("input", "Waiting for input");
    const field = document.createElement("input");
    field.className = "term-input";
    field.setAttribute("aria-label", "Program input");
    field.autocomplete = "off";
    field.spellcheck = false;
    els.term.appendChild(field);
    lastSpan = null;
    els.term.scrollTop = els.term.scrollHeight;
    field.focus({ preventScroll: true });
    field.addEventListener("keydown", (ev) => {
      if (ev.key === "Enter") {
        ev.preventDefault();
        sendInput(field.value, false);
        field.remove();
        write(field.value + "\n", "echo");
      } else if ((ev.ctrlKey || ev.metaKey) && ev.key.toLowerCase() === "d") {
        ev.preventDefault();
        sendInput("", true);
        field.remove();
        write("^D\n", "info");
      }
    });
  }
  function sendInput(text, eof) {
    waitingInput = false;
    setStatus("running", "Running");
    const bytes = new TextEncoder().encode(text).slice(0, data.length);
    data.set(bytes);
    Atomics.store(ctrl, 1, bytes.length);
    Atomics.store(ctrl, 0, eof ? 2 : 1);
    Atomics.notify(ctrl, 0);
  }
  els.term.addEventListener("click", () => {
    const f = els.term.querySelector(".term-input");
    if (f && !window.getSelection().toString()) f.focus();
  });

  // ---------- Python worker ----------
  function startWorker() {
    ready = false;
    updateButtons();
    setStatus("loading", "Loading Python…");
    worker = new Worker("assets/py-worker.js");
    worker.onmessage = onWorkerMessage;
    worker.onerror = (e) => { setStatus("error", "Python failed to start"); info("Python failed to start: " + (e.message || "unknown error")); };
    worker.postMessage(Object.assign({ type: "init" }, shared || {}));
  }

  function onWorkerMessage(ev) {
    const m = ev.data;
    switch (m.type) {
      case "ready":
        ready = true;
        setStatus("ready", "Python " + m.version + " ready");
        updateButtons();
        break;
      case "load-error":
        setStatus("error", "Couldn't load Python");
        info("Couldn't load Python (" + m.text + "). Check your internet connection and refresh the page.");
        break;
      case "stdout": write(m.text); break;
      case "stderr": write(m.text, "err"); break;
      case "info": info(m.text); break;
      case "input-request": askForInput(); break;
      case "done":
        clearTimeout(stopTimer);
        running = false;
        waitingInput = false;
        info(m.status === 0 ? `Finished in ${fmtMs(m.ms)}.` : m.status === 130 ? "Stopped." : `Exited with status ${m.status}.`);
        setStatus("ready", "Python ready");
        updateButtons();
        break;
    }
  }
  const fmtMs = (ms) => (ms < 1000 ? ms + " ms" : (ms / 1000).toFixed(2) + " s");

  function runProgram() {
    if (!ready || running || !current) return;
    clearTerminal();
    running = true;
    updateButtons();
    setStatus("running", "Running");
    info("▶ Running " + (current.path === "scratch" ? "scratchpad" : current.path.split("/").pop()));
    worker.postMessage({ type: "run", code: editor.getValue(), filename: current.path === "scratch" ? "scratchpad.py" : current.path.split("/").pop() });
  }

  function hardRestart() {
    worker.terminate();
    running = false;
    waitingInput = false;
    els.term.querySelectorAll(".term-input").forEach((f) => f.remove());
    info("[Program stopped — restarting Python]");
    startWorker();
  }

  function stopProgram() {
    if (!running) return;
    if (waitingInput || !interrupt) { hardRestart(); return; }
    interrupt[0] = 2; // raises KeyboardInterrupt inside Python
    clearTimeout(stopTimer);
    stopTimer = setTimeout(() => { if (running) hardRestart(); }, 1500);
  }

  // ---------- program list ----------
  function prettyGroup(g) {
    if (!g) return "Other";
    return g.replace(/^\d+[-_ ]*/, "").replace(/[-_]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()) || g;
  }

  function renderList() {
    const q = els.search.value.trim().toLowerCase();
    const shown = programs.filter((p) => !q || (p.title + " " + p.description + " " + p.path).toLowerCase().includes(q));
    els.list.textContent = "";
    if (!shown.length) {
      const p = document.createElement("p");
      p.className = "muted pad";
      p.textContent = programs.length ? "No programs match your search." : "No programs yet. Add .py files to the programs folder.";
      els.list.appendChild(p);
      return;
    }
    let lastGroup = null;
    for (const p of shown) {
      if (p.group !== lastGroup) {
        lastGroup = p.group;
        const h = document.createElement("h3");
        h.className = "group-title";
        h.textContent = prettyGroup(p.group);
        els.list.appendChild(h);
      }
      const a = document.createElement("a");
      a.className = "prog-link" + (current && current.path === p.path ? " active" : "");
      a.href = "#" + encodeURI(p.path);
      a.dataset.path = p.path;
      const t = document.createElement("span");
      t.textContent = p.title;
      const dot = document.createElement("span");
      dot.className = "dot-edited";
      dot.textContent = "●";
      dot.title = "You've edited this program";
      dot.hidden = store.get(editKey(p.path)) === null;
      const s = document.createElement("small");
      s.textContent = p.description ? p.description.split("\n")[0] : p.path;
      a.append(t, dot, s);
      els.list.appendChild(a);
    }
  }

  async function loadIndex() {
    try {
      const res = await fetch("programs/index.json", { cache: "no-cache" });
      if (!res.ok) throw new Error(res.status + " " + res.statusText);
      const json = await res.json();
      programs = (json.programs || json).slice();
    } catch (e) {
      programs = [];
      info("Couldn't load programs/index.json (" + e.message + "). Run tools/build_index.py to create it.");
    }
    renderList();
  }

  async function openProgram(path) {
    let prog;
    if (path === "scratch") {
      prog = Object.assign({}, SCRATCH);
    } else {
      const meta = programs.find((p) => p.path === path);
      if (!meta) return false;
      prog = Object.assign({}, meta);
      try {
        const res = await fetch("programs/" + encodeURI(path), { cache: "no-cache" });
        if (!res.ok) throw new Error(res.status + " " + res.statusText);
        prog.original = await res.text();
      } catch (e) {
        prog.original = "# Couldn't load " + path + " (" + e.message + ")\n";
      }
    }
    if (!running && (!current || current.path !== prog.path)) clearTerminal();
    current = prog;
    const saved = store.get(editKey(prog.path));
    editor.setValue(saved !== null ? saved : prog.original);
    els.crumb.textContent = prog.path === "scratch" ? "" : "programs/" + prog.path;
    els.title.textContent = prog.title;
    els.desc.textContent = prog.description || "";
    document.title = prog.title + " · " + $("siteTitle").textContent;
    updateEdited();
    updateButtons();
    for (const a of els.list.querySelectorAll(".prog-link")) a.classList.toggle("active", a.dataset.path === prog.path);
    document.body.classList.remove("nav-open");
    els.menu.setAttribute("aria-expanded", "false");
    return true;
  }

  async function route() {
    const path = decodeURI(location.hash.replace(/^#\/?/, ""));
    if (path && (await openProgram(path))) return;
    if (!current && programs.length) openProgram(programs[0].path);
    else if (!current) openProgram("scratch");
  }

  // ---------- toolbar ----------
  els.run.addEventListener("click", runProgram);
  els.stop.addEventListener("click", stopProgram);
  els.clear.addEventListener("click", () => { if (!waitingInput) clearTerminal(); });
  els.reset.addEventListener("click", () => {
    if (!current || !confirmReset()) return;
    store.del(editKey(current.path));
    editor.setValue(current.original);
    updateEdited();
  });
  function confirmReset() { return window.confirm("Throw away your edits to this program?"); }
  els.copy.addEventListener("click", async () => {
    try { await navigator.clipboard.writeText(editor.getValue()); flash(els.copy, "Copied!"); }
    catch (e) { flash(els.copy, "Copy failed"); }
  });
  els.download.addEventListener("click", () => {
    if (!current) return;
    const name = current.path === "scratch" ? "scratchpad.py" : current.path.split("/").pop();
    const url = URL.createObjectURL(new Blob([editor.getValue()], { type: "text/x-python" }));
    const a = Object.assign(document.createElement("a"), { href: url, download: name });
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  });
  function flash(btn, text) {
    const old = btn.textContent;
    btn.textContent = text;
    setTimeout(() => (btn.textContent = old), 1200);
  }
  els.scratch.addEventListener("click", () => { location.hash = "scratch"; });
  els.search.addEventListener("input", renderList);
  els.menu.addEventListener("click", () => {
    const open = document.body.classList.toggle("nav-open");
    els.menu.setAttribute("aria-expanded", String(open));
  });
  document.addEventListener("click", (ev) => {
    if (document.body.classList.contains("nav-open") && !els.sidebar.contains(ev.target) && !els.menu.contains(ev.target)) {
      document.body.classList.remove("nav-open");
    }
  });
  window.addEventListener("hashchange", route);

  // ---------- go ----------
  startWorker();
  if (!isolated) {
    info("Note: input() is switched off because this page isn't cross-origin isolated yet. " +
         "Refreshing the page usually fixes this (it needs coi-serviceworker.js and an https:// address).");
  }
  loadIndex().then(route);
})();
