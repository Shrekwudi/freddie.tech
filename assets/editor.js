/* A small, dependency-free Python code editor:
   a transparent <textarea> sitting on top of a syntax-highlighted <pre>. */
(function () {
  "use strict";

  const KEYWORDS = new Set((
    "False None True and as assert async await break class continue def del elif else except " +
    "finally for from global if import in is lambda nonlocal not or pass raise return try while with yield match case"
  ).split(" "));
  const BUILTINS = new Set((
    "print input len range int float str bool list dict set tuple abs min max sum round sorted " +
    "reversed enumerate zip map filter open type isinstance issubclass any all chr ord hex bin oct " +
    "format repr id iter next super object property staticmethod classmethod hasattr getattr setattr " +
    "divmod pow hash callable vars dir help exit quit self Exception ValueError TypeError KeyError " +
    "IndexError ZeroDivisionError NameError RuntimeError StopIteration FileNotFoundError AttributeError"
  ).split(" "));

  const TOKEN = new RegExp([
    "(#[^\\n]*)",                                                              // 1 comment
    "([rRbBuUfF]{0,2}(?:'''[\\s\\S]*?(?:'''|$)|\"\"\"[\\s\\S]*?(?:\"\"\"|$)))", // 2 triple string
    "([rRbBuUfF]{0,2}(?:'(?:\\\\.|[^'\\\\\\n])*'?|\"(?:\\\\.|[^\"\\\\\\n])*\"?))", // 3 string
    "(@[A-Za-z_][\\w.]*)",                                                     // 4 decorator
    "(\\b0[xXoObB][\\da-fA-F_]+\\b|\\b\\d[\\d_]*(?:\\.\\d*)?(?:[eE][+-]?\\d+)?j?\\b|\\.\\d+\\b)", // 5 number
    "([A-Za-z_]\\w*)",                                                         // 6 identifier
  ].join("|"), "g");

  function esc(s) {
    return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }

  function highlight(src) {
    let out = "";
    let last = 0;
    let prevWord = "";
    TOKEN.lastIndex = 0;
    let m;
    while ((m = TOKEN.exec(src))) {
      if (m[0] === "") { TOKEN.lastIndex++; continue; }
      out += esc(src.slice(last, m.index));
      const t = m[0];
      let cls = null;
      if (m[1]) cls = "com";
      else if (m[2] || m[3]) {
        // a bare identifier like "f" or "rb" followed by nothing is caught here too; check it is really a string
        cls = /['"]/.test(t) ? "str" : null;
      }
      else if (m[4]) cls = "dec";
      else if (m[5]) cls = "num";
      else if (m[6]) {
        if (KEYWORDS.has(t)) cls = "kw";
        else if (prevWord === "def" || prevWord === "class") cls = "fn";
        else if (BUILTINS.has(t)) cls = "bi";
        else if (/^\s*\(/.test(src.slice(TOKEN.lastIndex, TOKEN.lastIndex + 40))) cls = "fn";
        prevWord = t;
      }
      if (!m[6]) prevWord = "";
      out += cls ? `<span class="t-${cls}">${esc(t)}</span>` : esc(t);
      last = TOKEN.lastIndex;
    }
    out += esc(src.slice(last));
    return out + "\n ";
  }

  function create({ textarea, pre, gutter, onRun, onChange }) {
    const code = pre.querySelector("code");
    let escaped = false; // after Esc, Tab moves focus instead of indenting

    function render() {
      const v = textarea.value;
      code.innerHTML = highlight(v);
      const lines = v.split("\n").length;
      if (gutter._lines !== lines) {
        gutter._lines = lines;
        let g = "";
        for (let i = 1; i <= lines; i++) g += i + "\n";
        gutter.textContent = g + " ";
      }
      syncScroll();
    }
    function syncScroll() {
      pre.scrollTop = textarea.scrollTop;
      pre.scrollLeft = textarea.scrollLeft;
      gutter.scrollTop = textarea.scrollTop;
    }

    // Insert text keeping the browser's undo history where possible
    function insert(text, selStart, selEnd) {
      if (selStart !== undefined) textarea.setSelectionRange(selStart, selEnd);
      textarea.focus();
      let ok = false;
      try { ok = document.execCommand("insertText", false, text); } catch (e) { ok = false; }
      if (!ok) {
        textarea.setRangeText(text, textarea.selectionStart, textarea.selectionEnd, "end");
        textarea.dispatchEvent(new Event("input"));
      }
    }

    function lineBounds(v, start, end) {
      const ls = v.lastIndexOf("\n", start - 1) + 1;
      let le = v.indexOf("\n", end > start && v[end - 1] === "\n" ? end - 1 : end);
      if (le === -1) le = v.length;
      return [ls, le];
    }

    function transformLines(fn) {
      const v = textarea.value;
      const s = textarea.selectionStart, e = textarea.selectionEnd;
      const [ls, le] = lineBounds(v, s, e);
      const block = v.slice(ls, le);
      const lines = block.split("\n");
      const next = fn(lines);
      const joined = next.join("\n");
      insert(joined, ls, le);
      const firstDelta = next[0].length - lines[0].length;
      textarea.setSelectionRange(Math.max(ls, s + firstDelta), ls + joined.length);
    }

    textarea.addEventListener("keydown", (ev) => {
      const v = textarea.value;
      const s = textarea.selectionStart, e = textarea.selectionEnd;
      const mod = ev.ctrlKey || ev.metaKey;

      if (ev.key === "Escape") { escaped = true; return; }
      if (mod && ev.key === "Enter") { ev.preventDefault(); onRun && onRun(); return; }

      if (ev.key === "Tab" && !escaped) {
        ev.preventDefault();
        if (ev.shiftKey) {
          transformLines((lines) => lines.map((l) => l.replace(/^( {1,4}|\t)/, "")));
        } else if (s !== e && v.slice(s, e).includes("\n")) {
          transformLines((lines) => lines.map((l) => "    " + l));
        } else {
          const col = s - (v.lastIndexOf("\n", s - 1) + 1);
          insert(" ".repeat(4 - (col % 4)));
        }
        return;
      }
      escaped = false;

      if (mod && ev.key === "/") {
        ev.preventDefault();
        transformLines((lines) => {
          const allCommented = lines.filter((l) => l.trim()).every((l) => /^\s*#/.test(l));
          return lines.map((l) => {
            if (!l.trim()) return l;
            return allCommented ? l.replace(/^(\s*)# ?/, "$1") : l.replace(/^(\s*)/, "$1# ");
          });
        });
        return;
      }

      if (ev.key === "Enter" && !ev.shiftKey && !mod && !ev.altKey) {
        ev.preventDefault();
        const ls = v.lastIndexOf("\n", s - 1) + 1;
        const before = v.slice(ls, s);
        let indent = before.match(/^[ \t]*/)[0];
        const stripped = before.replace(/#.*$/, "").trimEnd();
        if (stripped.endsWith(":")) indent += "    ";
        else if (/^\s*(return|pass|break|continue|raise)\b/.test(before)) indent = indent.slice(0, Math.max(0, indent.length - 4));
        insert("\n" + indent);
        return;
      }

      if (ev.key === "Backspace" && s === e && s > 0) {
        const ls = v.lastIndexOf("\n", s - 1) + 1;
        const before = v.slice(ls, s);
        if (before.length > 0 && /^ +$/.test(before)) {
          ev.preventDefault();
          const remove = before.length % 4 || 4;
          insert("", s - remove, s);
        }
      }
    });

    textarea.addEventListener("input", () => { render(); onChange && onChange(textarea.value); });
    textarea.addEventListener("scroll", syncScroll);

    return {
      getValue: () => textarea.value,
      setValue(v) {
        textarea.value = v;
        textarea.scrollTop = 0; textarea.scrollLeft = 0;
        render();
      },
      focus: () => textarea.focus(),
    };
  }

  window.CodeEditor = { create, highlight };
})();
