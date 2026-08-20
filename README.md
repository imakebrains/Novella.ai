# Novella

A writing app for novelists that keeps your book on your own disk, as plain
Markdown files, in a folder you choose. No account. No subscription. No
per-word charge. It works with the internet unplugged.

It is also the worldbuilding tool, the task list, the sprint timer and the
word-count tracker — the four other apps most writers keep open — in the same
window as the manuscript.

**[Download for Windows or macOS](https://github.com/imakebrains/Novella.ai/releases/latest)**
· [Try it in a browser](https://imakebrains.github.io/Novella.ai/)
· [Roadmap](ROADMAP.md) · [Contributing](CONTRIBUTING.md)

---

## What makes it different

**Your book is a folder, not a database row.** Every chapter, character and
note is a `.md` file with a small YAML header. Open the folder in Obsidian,
edit it in Notepad, put it in Dropbox, grep it, diff it in git. Novella is a
way of working with those files, not a place they are trapped.

**No account, ever.** There is no sign-up screen, no email confirmation, no
password, no Google or Apple sign-in, no cloud sync, no telemetry. Nothing
about your writing leaves the machine unless you connect an AI service and
press a button.

**The AI is optional, and local first.** Install [Ollama](https://ollama.com)
and a model runs on your own computer: free, offline, unlimited, and nobody
else's business. If you would rather use Claude or ChatGPT, you paste your own
API key and pay your own provider directly — Novella takes no cut and adds no
markup, because there is no Novella server in the path.

**You can leave.** Export the whole manuscript to Word, EPUB, Markdown, print
PDF, or a zip of everything, in one dialog. The files were always yours; the
export is a convenience, not an escape hatch.

**One install.** The Windows installer fetches WebView2 itself if the machine
lacks it. Nothing else to download to start writing.

---

## Installing

### The desktop app

1. Go to [Releases](https://github.com/imakebrains/Novella.ai/releases/latest)
   and download the file for your system:
   - **Windows** — `Novella_x.y.z_x64-setup.exe` (or the `.msi` if your
     workplace prefers it)
   - **macOS** — `Novella_x.y.z_universal.dmg` (Intel and Apple Silicon in one)
2. Run it, then pick a folder for your first project. That folder is your book.

**These builds are not code-signed yet**, so your operating system will warn
you about them. That warning means "nobody paid for a certificate", not
"this file is dangerous" — but you should only ever click through it for
software you actually meant to download.

- **Windows / SmartScreen:** a blue box says *"Windows protected your PC"*.
  Click **More info**, then **Run anyway**.
- **macOS / Gatekeeper:** it may say the app *"is damaged and can't be
  opened"*. That is Gatekeeper's wording for unsigned, not a corrupt
  download. **Right-click** (or Control-click) the app in Applications,
  choose **Open**, then **Open** again in the dialog. You only do this once.

Novella checks the Releases page for updates and offers them in-app; it never
installs one without asking.

### In a browser, without installing

[imakebrains.github.io/Novella.ai](https://imakebrains.github.io/Novella.ai/)
runs the same app in a browser tab. Worth knowing before you rely on it:
projects live in that browser's own storage rather than in real files on your
disk, so clearing site data deletes them, and the file-export path is how you
get your work out. Good for a look around; the desktop app is the real thing.

---

## What is in it

**Writing.** A distraction-light editor (CodeMirror 6) with Markdown,
`[[wiki-link]]` autocomplete over titles *and* aliases, a formatting bar
where every button is its own undo, and paste that keeps its shape — HTML
from Google Docs or Word arrives as clean Markdown instead of a wall of
`<span>`s. Focus mode. Autosave with a status line that tells you the truth
about whether your words are on disk yet.

**Your world.** The Codex holds characters, locations and lore as typed
entries. Backlinks are automatic and include references buried in frontmatter,
so a scene whose `pov:` is a character shows up on that character's page.
There is a relationship web, a dangling-link list that catches names you have
used but never written up, and one-click creation of the entries you are
missing.

**Structure.** The Board shows the manuscript four ways — corkboard cards you
drag, a grid, a spreadsheet-style table, and the relationship web — with cover
art if you want it. Chapter order is a number in the frontmatter, never the
filename, so reordering can never break a link.

**Reading your own draft.** A local prose report (nothing is uploaded):
readability, sentence rhythm, sticky sentences, repeated words, echoes,
adverbs, passive voice, dialogue ratio. It can mark problems inline in the
manuscript with an explanation on hover. A continuity panel checks the draft
against the codex.

**Getting a book in and out.** Import a `.docx`, `.md` or `.txt` manuscript:
Novella guesses the chapter breaks, shows you its guess to correct before
anything is written, and then reads the cast list straight out of the prose so
you do not retype it. Export to Word (standard manuscript format), EPUB,
Markdown, print PDF, or a full zip backup.

**The rest of the desk.** Tasks with subtasks, a calendar you can plan in
(custom labels, and subscribing to an `.ics` feed), a sprint timer and alarm,
word-count goals and session history, per-project music, version history for
every note, and a trash with 7- or 30-day retention so a mis-click is
survivable.

**Making it yours.** Light and dark are both first-class, plus custom themes,
saved accent colours, five bundled backdrops or your own image, and a motion
setting for people who want the animation or would rather not have it. The
tool panels can be reordered, stacked, hidden, or side-docked into columns.

---

## The AI, stated plainly

Novella writes perfectly well with no AI connected at all — the editor, codex,
board, prose analysis, tasks and export need nothing.

When you do want it, **Settings → Connections**:

- **Local models (Ollama)** — free, offline, no account and no key. If Ollama
  is not installed, Settings → Local AI walks through it, states the download
  size before fetching anything, and never downloads on its own.
- **Claude (Anthropic)** or **ChatGPT and anything OpenAI-compatible**
  (OpenRouter, Groq, DeepSeek, LM Studio, …) — you paste an **API key** you
  create on that provider's own site. There is no "sign in with Google" here
  and there never will be: what these services hand out is a key, and drawing
  an OAuth button over that would be a lie about where your text goes. Keys
  are held in the OS keychain, not in a file Novella writes.

You can connect several and say which one does which job — drafting, ideas,
research, critique, quick fixes. If the one you picked cannot answer, the next
one does, and the app tells you in a sentence that it happened. A silent
substitution mid-chapter is exactly the thing a writer should never have to
wonder about.

Prompts and writing styles are ordinary notes in your vault with
`type: prompt`. You can read them, edit them, and take them with you.

---

## Building from source

You need **Node 20+**, and for the desktop app **Rust** plus your platform's
C toolchain (MSVC Build Tools on Windows, Xcode command line tools on macOS,
`webkit2gtk` and friends on Linux). See
[Tauri's prerequisites](https://tauri.app/start/prerequisites/).

```bash
git clone https://github.com/imakebrains/Novella.ai.git
cd Novella.ai
npm install

npm run dev          # browser build at http://localhost:5173
npm run tauri dev    # the real desktop app
npm run tauri build  # installers, into src-tauri/target/release/bundle/
```

The dev server uses `strictPort`, deliberately: Vite's habit of sliding to
5174 when 5173 is taken makes every "open the app" instruction quietly wrong
and hides a stale server still running. If it refuses to start, something is
already on that port.

Before pushing anything, run the gate:

```bash
npm run verify   # typecheck + the full test suite + a production build
```

[CONTRIBUTING.md](CONTRIBUTING.md) covers the rest — the house rules, the
comment convention, and why the commit log reads the way it does.

---

## Privacy and security

The short version: your writing stays in the folder you chose. There is no
telemetry and no analytics, and your manuscript is sent nowhere unless you
connect an AI service and press a button — in which case it goes to that
provider and nowhere else, because there is no Novella server in between.

Two network calls happen without you asking, and both are worth naming: an
unauthenticated read of GitHub's public API to see whether a newer release
exists, and — only if you turn it on — fetching a calendar feed you
subscribed to. Neither sends anything about your book.

The desktop build ships with **no** filesystem permission at all. Picking a
vault widens its access to that one directory for that session, so a folder
you never opened is unreadable to it, even to a compromised webview.

[SECURITY.md](SECURITY.md) has the full audit, the network calls that do
exist and what triggers each one, and how to report a vulnerability.

## Contributing

Pull requests are welcome. [CONTRIBUTING.md](CONTRIBUTING.md) first — the
quality gate is one command and CI runs it on every PR.

## License

[Apache-2.0](LICENSE) — free to use, modify, fork, build plugins for, and
sell. The name and logo are not covered by it; see [NOTICE](NOTICE).
