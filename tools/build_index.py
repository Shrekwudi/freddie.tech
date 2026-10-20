"""Build programs/index.json from the .py files in the programs folder.

Each program's title and description come from the docstring at the top of
the file: the first line is the title, the rest is the description. Files
without a docstring use their file name as the title.

The GitHub Actions workflow runs this automatically every time you push, so
you only need to run it yourself to preview the site on your own computer:

    python tools/build_index.py
"""

import ast
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
PROGRAMS = ROOT / "programs"


def describe(path):
    text = path.read_text(encoding="utf-8", errors="replace")
    doc = None
    try:
        doc = ast.get_docstring(ast.parse(text))
    except SyntaxError:
        pass  # still list programs that don't parse yet

    if doc:
        lines = doc.strip().splitlines()
        title = lines[0].strip()
        description = "\n".join(lines[1:]).strip()
    else:
        title = path.stem.replace("_", " ").replace("-", " ").capitalize()
        description = ""
    return title, description


def main():
    programs = []
    for path in sorted(PROGRAMS.rglob("*.py")):
        rel = path.relative_to(PROGRAMS)
        if any(part.startswith((".", "_")) for part in rel.parts):
            continue  # skip hidden files and things like __init__.py
        title, description = describe(path)
        programs.append({
            "path": rel.as_posix(),
            "title": title,
            "description": description,
            "group": rel.parts[0] if len(rel.parts) > 1 else "",
        })

    out = PROGRAMS / "index.json"
    out.write_text(json.dumps({"programs": programs}, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"Wrote {out.relative_to(ROOT)} with {len(programs)} programs")


if __name__ == "__main__":
    main()
