#!/usr/bin/env python3
"""compile_manuscript.py — compile chapter files into one clean manuscript.

Natural-sorts chapter files, strips state noise (HTML comments, %% lines,
[ledger:...] lines), normalizes scene breaks to a single centered `#`,
concatenates with chapter headings, and reports word counts.

Usage:
    python3 compile_manuscript.py chapters/ --title "TITLE" --author "Name"
    python3 compile_manuscript.py --selftest

Stdlib only.
"""

import argparse
import re
import sys
import tempfile
from pathlib import Path

# --- configuration -----------------------------------------------------------

CHAPTER_EXTENSIONS = {".md", ".markdown", ".txt"}

# Lines starting with any of these prefixes are state noise — dropped.
STRIP_PREFIXES = ("%%",)

# Lines matching any of these regexes are state noise — dropped.
STRIP_PATTERNS = (
    r"^\[ledger:",
    r"^\[scene-plan\b",
    r"^\[scene:",
    r"^\[note:",
    r"^\[todo\b",
)

# Scene-break variants normalized to a single centered `#`:
#   ***  * * *  ~~~  ~ ~ ~  #  # # #  (3 or more of * or ~, spaced or not)
SCENE_BREAK_RE = re.compile(r"^\s*(?:(?:\*\s*){3,}|(?:~\s*){3,}|#(?:\s*#){0,4})\s*$")

HTML_COMMENT_RE = re.compile(r"<!--.*?-->", re.DOTALL)
HEADING_RE = re.compile(r"^#{1,2}\s+(.+?)\s*$")

SCENE_BREAK = "#"

# --- core --------------------------------------------------------------------


def natural_key(name):
    """Sort key so ch1, ch2, ch10 order numerically, not lexically."""
    return [int(tok) if tok.isdigit() else tok.lower()
            for tok in re.split(r"(\d+)", name)]


def find_chapter_files(input_dir):
    p = Path(input_dir)
    if not p.is_dir():
        sys.exit(f"error: not a directory: {input_dir}")
    files = [f for f in p.iterdir()
             if f.is_file() and f.suffix.lower() in CHAPTER_EXTENSIONS]
    if not files:
        sys.exit(f"error: no chapter files ({'/'.join(sorted(CHAPTER_EXTENSIONS))}) in {input_dir}")
    return sorted(files, key=lambda f: natural_key(f.name))


def clean_chapter(text):
    """Strip state noise and normalize scene breaks. Returns (title_or_None, body)."""
    text = HTML_COMMENT_RE.sub("", text)

    strip_res = [re.compile(pat) for pat in STRIP_PATTERNS]
    title = None
    out = []
    for line in text.splitlines():
        stripped = line.strip()
        if any(stripped.startswith(pfx) for pfx in STRIP_PREFIXES):
            continue
        if any(rx.match(stripped) for rx in strip_res):
            continue
        # First heading in the file becomes the chapter title (not body text).
        if title is None and not out and (m := HEADING_RE.match(stripped)):
            title = m.group(1)
            continue
        if stripped and SCENE_BREAK_RE.match(stripped):
            out.append(SCENE_BREAK)
            continue
        out.append(line.rstrip())

    # Collapse runs of blank lines / duplicate scene breaks left by stripping.
    collapsed = []
    for line in out:
        if line == "" and (not collapsed or collapsed[-1] == ""):
            continue
        if line == SCENE_BREAK and collapsed and collapsed[-1] == SCENE_BREAK:
            continue
        collapsed.append(line)
    while collapsed and collapsed[-1] in ("", SCENE_BREAK):
        collapsed.pop()
    while collapsed and collapsed[0] in ("", SCENE_BREAK):
        collapsed.pop(0)

    # Scene breaks get breathing room: blank line either side.
    spaced = []
    for line in collapsed:
        if line == "" and spaced and spaced[-1] == "":
            continue
        if line == SCENE_BREAK:
            if spaced and spaced[-1] != "":
                spaced.append("")
            spaced.append(SCENE_BREAK)
            spaced.append("")
        else:
            spaced.append(line)
    return title, "\n".join(spaced)


def count_words(body):
    words = 0
    for line in body.splitlines():
        if line.strip() == SCENE_BREAK:
            continue
        words += len(re.findall(r"\S+", line))
    return words


def compile_manuscript(input_dir, title, author, out_path):
    files = find_chapter_files(input_dir)
    parts = [f"---\ntitle: {title}\nauthor: {author}\n---\n"]
    report = []
    total = 0
    for i, f in enumerate(files, 1):
        chap_title, body = clean_chapter(f.read_text(encoding="utf-8"))
        heading = chap_title if chap_title else f"Chapter {i}"
        words = count_words(body)
        total += words
        report.append((f.name, heading, words))
        parts.append(f"# {heading}\n\n{body}\n")
    Path(out_path).write_text("\n".join(parts), encoding="utf-8")
    return report, total


def print_report(report, total, out_path):
    name_w = max(len(r[0]) for r in report)
    head_w = max(len(r[1]) for r in report)
    for name, heading, words in report:
        print(f"  {name:<{name_w}}  {heading:<{head_w}}  {words:>7,} words")
    print(f"  {'-' * (name_w + head_w + 17)}")
    print(f"  TOTAL {total:>{name_w + head_w + 5},} words -> {out_path}")


# --- self-test ----------------------------------------------------------------


def selftest():
    with tempfile.TemporaryDirectory() as tmp:
        d = Path(tmp) / "chapters"
        d.mkdir()
        # ch1: heading, HTML comment (multi-line), %% noise, ledger line, *** break
        (d / "ch1.md").write_text(
            "# The Landing\n\n"
            "<!-- planning: cut\nthis whole aside -->\n"
            "%% state: promise P3 due\n"
            "[ledger: relationship Mara->Finn +1]\n"
            "One two three four five.\n\n"
            "***\n\n"
            "Six seven eight.\n",
            encoding="utf-8")
        # ch2: no heading, ~~~ break and # # # break
        (d / "ch2.md").write_text(
            "Alpha beta gamma.\n\n~ ~ ~\n\nDelta epsilon.\n\n# # #\n\nZeta.\n",
            encoding="utf-8")
        # ch10: proves natural sort (would sort before ch2 lexically)
        (d / "ch10.md").write_text("# Endgame\n\nFinal words here now.\n",
                                   encoding="utf-8")
        out = Path(tmp) / "manuscript.md"
        report, total = compile_manuscript(d, "Test Book", "A. Writer", out)

        names = [r[0] for r in report]
        assert names == ["ch1.md", "ch2.md", "ch10.md"], f"natural sort failed: {names}"

        text = out.read_text(encoding="utf-8")
        assert "<!--" not in text and "planning" not in text, "HTML comment not stripped"
        assert "%%" not in text, "%% line not stripped"
        assert "[ledger:" not in text, "[ledger: line not stripped"
        assert "***" not in text and "~ ~ ~" not in text and "# # #" not in text, \
            "scene breaks not normalized"
        assert text.count("\n#\n") == 3, \
            f"expected 3 normalized scene breaks, got {text.count(chr(10) + '#' + chr(10))}"
        assert "# The Landing" in text and "# Chapter 2" in text and "# Endgame" in text, \
            "chapter headings wrong"
        assert text.index("Alpha beta") < text.index("Final words"), "ch2 must precede ch10"
        assert "title: Test Book" in text and "author: A. Writer" in text, "metadata missing"

        by_name = {r[0]: r[2] for r in report}
        assert by_name["ch1.md"] == 8, f"ch1 word count: {by_name['ch1.md']}"
        assert by_name["ch2.md"] == 6, f"ch2 word count: {by_name['ch2.md']}"
        assert by_name["ch10.md"] == 4, f"ch10 word count: {by_name['ch10.md']}"
        assert total == 18, f"total word count: {total}"

        print_report(report, total, out)
        print("SELFTEST PASS: ordering, stripping, scene breaks, headings, counts")


# --- cli ----------------------------------------------------------------------


def main():
    ap = argparse.ArgumentParser(description="Compile chapter files into one clean manuscript markdown file.")
    ap.add_argument("input_dir", nargs="?", help="directory containing chapter files")
    ap.add_argument("--title", default="Untitled", help="manuscript title")
    ap.add_argument("--author", default="Unknown", help="author name")
    ap.add_argument("--out", default="manuscript.md", help="output file (default: manuscript.md)")
    ap.add_argument("--selftest", action="store_true", help="run built-in fixture test and exit")
    args = ap.parse_args()

    if args.selftest:
        selftest()
        return
    if not args.input_dir:
        ap.error("input_dir is required (or use --selftest)")

    report, total = compile_manuscript(args.input_dir, args.title, args.author, args.out)
    print_report(report, total, args.out)


if __name__ == "__main__":
    main()
