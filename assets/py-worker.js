/* Runs Python (Pyodide) in a Web Worker so the page stays responsive.
   input() works by blocking this worker on a SharedArrayBuffer until the
   page sends back what the user typed. */
"use strict";

const PYODIDE_VERSION = "0.26.4";
const PYODIDE_URL = `https://cdn.jsdelivr.net/pyodide/v${PYODIDE_VERSION}/full/`;

let pyodide = null;
let stdinCtrl = null;   // Int32Array [flag, byteLength]
let stdinData = null;   // Uint8Array holding the typed text
let interruptBuf = null;
let canInput = false;
const decoder = new TextDecoder();
const decOut = new TextDecoder();
const decErr = new TextDecoder();

const RUNNER = `
import sys, traceback, builtins, linecache

def _run_program(code, filename):
    try:
        sys.stdout.reconfigure(line_buffering=True)
        sys.stderr.reconfigure(line_buffering=True)
    except Exception:
        pass
    # let tracebacks show the lines of the user's code
    linecache.cache[filename] = (len(code), None, code.splitlines(True), filename)
    ns = {"__name__": "__main__", "__file__": filename, "__builtins__": builtins}
    try:
        compiled = compile(code, filename, "exec")
    except SyntaxError as e:
        sys.stderr.write("".join(traceback.format_exception_only(type(e), e)))
        return 1
    status = 0
    try:
        exec(compiled, ns)
    except SystemExit as e:
        if e.code not in (None, 0):
            status = e.code if isinstance(e.code, int) else 1
            if not isinstance(e.code, int):
                print(e.code, file=sys.stderr)
    except KeyboardInterrupt:
        print("\\n[Program stopped]", file=sys.stderr)
        status = 130
    except BaseException as e:
        # hide the runner's own frame so the traceback starts at the user's code
        traceback.print_exception(type(e), e, e.__traceback__.tb_next)
        status = 1
    finally:
        sys.stdout.flush()
        sys.stderr.flush()
    return status
`;

function readStdin() {
  if (!canInput) {
    self.postMessage({ type: "stderr", text: "\n[input() isn't available: reload the page once so it can turn it on]\n" });
    return null; // EOF -> EOFError
  }
  Atomics.store(stdinCtrl, 0, 0);
  self.postMessage({ type: "input-request" });
  Atomics.wait(stdinCtrl, 0, 0); // sleep until the page writes the answer
  const len = Atomics.load(stdinCtrl, 1);
  const flag = Atomics.load(stdinCtrl, 0);
  Atomics.store(stdinCtrl, 0, 0);
  if (flag === 2) return null; // EOF (Ctrl+D)
  return decoder.decode(stdinData.slice(0, len)) + "\n";
}

async function init(msg) {
  if (msg.stdinCtrl) {
    stdinCtrl = new Int32Array(msg.stdinCtrl);
    stdinData = new Uint8Array(msg.stdinData);
    interruptBuf = new Uint8Array(msg.interrupt);
    canInput = true;
  }
  try {
    importScripts(PYODIDE_URL + "pyodide.js");
    pyodide = await loadPyodide({ indexURL: PYODIDE_URL });
    pyodide.setStdout({
      isatty: true,
      write: (buf) => { self.postMessage({ type: "stdout", text: decOut.decode(buf, { stream: true }) }); return buf.length; },
    });
    pyodide.setStderr({
      isatty: true,
      write: (buf) => { self.postMessage({ type: "stderr", text: decErr.decode(buf, { stream: true }) }); return buf.length; },
    });
    // isatty must stay false so input() writes its prompt to stdout (not stderr)
    pyodide.setStdin({ stdin: readStdin, autoEOF: false, isatty: false });
    if (interruptBuf) pyodide.setInterruptBuffer(interruptBuf);
    pyodide.runPython(RUNNER);
    self.postMessage({ type: "ready", version: pyodide.version, canInput });
  } catch (err) {
    self.postMessage({ type: "load-error", text: String(err && err.message || err) });
  }
}

async function run(msg) {
  if (interruptBuf) interruptBuf[0] = 0;
  const started = performance.now();
  let status = 0;
  try {
    // auto-install packages such as numpy if the program imports them
    await pyodide.loadPackagesFromImports(msg.code, {
      messageCallback: (m) => self.postMessage({ type: "info", text: m }),
      errorCallback: (m) => self.postMessage({ type: "info", text: m }),
    });
  } catch (e) { /* unknown imports are reported by Python itself */ }
  try {
    const runner = pyodide.globals.get("_run_program");
    status = runner(msg.code, msg.filename || "program.py");
    runner.destroy();
  } catch (err) {
    self.postMessage({ type: "stderr", text: String(err && err.message || err) + "\n" });
    status = 1;
  }
  self.postMessage({ type: "done", status, ms: Math.round(performance.now() - started) });
}

self.onmessage = (ev) => {
  const msg = ev.data;
  if (msg.type === "init") init(msg);
  else if (msg.type === "run") run(msg);
};
