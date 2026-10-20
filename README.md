# Python Programs

A website for keeping my university Python programs. Every program can be opened,
edited and **run in the browser** — including programs that use `input()`.
Python runs on the visitor's own computer using [Pyodide](https://pyodide.org)
(Python compiled to WebAssembly), so there's no server to pay for and it works on
GitHub Pages.

## Putting it on GitHub Pages

1. Create a new repository on GitHub (e.g. `python-programs`) and upload everything
   in this folder, including the hidden `.github` folder.
2. In the repository go to **Settings → Pages** and set **Source** to **GitHub Actions**.
3. Push to `main` (or open the **Actions** tab and run *Deploy site to GitHub Pages*).
   After a minute the site is live at `https://<your-username>.github.io/python-programs/`.

The first time you open the site it reloads itself once — that's normal (see
*How input() works* below).

## Adding a program

1. Save your `.py` file inside `programs/`, in a folder for the topic or week,
   e.g. `programs/05-files/word_count.py`.
   Folders become headings in the sidebar; a number at the start
   (`05-`) only controls the order and isn't shown.
2. Put a docstring at the very top. The first line is the title, the rest is the
   description:

   ```python
   """Word count

   Reads some text and counts how often each word appears.
   """
   ```
3. Commit and push. The workflow rebuilds `programs/index.json` and redeploys.

## Previewing on your own computer

```bash
python tools/build_index.py      # refresh the program list
python -m http.server 8000       # then open http://localhost:8000
```

Use `localhost` rather than opening `index.html` directly, otherwise the programs
can't be loaded.

## Features

- Program list grouped by folder, with search
- Code editor with Python highlighting, auto-indent, Tab/Shift+Tab, Ctrl/⌘+/ to comment
- **Run** (or Ctrl/⌘+Enter) and **Stop**
- Terminal-style output: `input()` waits for you to type and press Enter (Ctrl+D sends end-of-file)
- Tracebacks for errors, just like running Python normally
- Edits are kept in your browser; **Reset** goes back to the file on GitHub
- Copy and Download buttons, a Scratchpad for trying things, links to each program (`#04-security/caesar_cipher.py`)
- Packages Pyodide includes (e.g. `numpy`) load automatically when a program imports them
- Works on phones, and in light and dark mode

## How input() works

The Python runs in a background Web Worker. When your program calls `input()`,
the worker pauses using a `SharedArrayBuffer` until you type an answer. Browsers
only allow that on "cross-origin isolated" pages, which needs special HTTP
headers that GitHub Pages can't send — so `coi-serviceworker.js` installs a
small service worker that adds them, then reloads the page once.

## Limitations

- Programs that open windows (`turtle`, `tkinter`) won't work in the browser.
- Reading/writing files works, but only in a temporary in-browser file system.
- `time.sleep()` works, but output is shown as it's printed, so long sleeps just pause.

## Files

```
index.html               the page
assets/app.js            program list, terminal, run/stop
assets/editor.js         the code editor
assets/py-worker.js      runs Python (Pyodide) in a Web Worker
assets/style.css         styles
coi-serviceworker.js     enables input() on GitHub Pages
programs/                your .py files (+ generated index.json)
tools/build_index.py     builds programs/index.json
.github/workflows/       auto-deploys to GitHub Pages
```
