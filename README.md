# Claude Context Gallery

A local skill and two GPUCanvas experiences for an Anthropic Claude export.

- **My AI Vocabulary** replays complete sessions as a portrait word mosaic and records the live canvas to video.
- **Search Filmstrip** replays screenshots captured from eligible public search results.

## Run

Install Node.js 20+, Python 3, and Chrome. From the directory where your export and generated data should live, run the skill's runner using its absolute path.

```sh
node /absolute/path/to/context-gallery/scripts/prepare.mjs --open --capture
```

Dependencies install on first use. If the export is missing, the runner creates an exports folder and opens it along with Claude's export settings. Request the export in Settings → Privacy, then place the downloaded ZIP in the folder and rerun the command. The runner also checks the current directory and Downloads.

You can specify the export and output folder.

```sh
node /absolute/path/to/context-gallery/scripts/prepare.mjs \
  --export=/absolute/path/to/export.zip \
  --workspace=/absolute/path/to/claude-context-art \
  --open --capture --limit=32
```

Single ZIP exports and conversations-*.zip category parts are supported. Include design_chats-*.zip alongside conversation parts to import Claude Design dialogue. Other export objects are inventoried in the manifest. The importer reads archive entries directly.

The generated workspace contains exports, data, captures, experiences, and docs. The gallery loads local JSON through a loopback-only viewer. Rerunning reimports the data, rebuilds the experiences, and reuses the viewer. Omit --capture to use existing screenshots. Capture visits eligible public pages and requires a network connection. Playback works offline while the local viewer runs. PYTHON_BIN and CHROME_BIN select alternate executables.

The runner prints JSON with the gallery URL, data path, and capture status. Its viewer process information is saved in .server.json inside the generated workspace. Stop that process with its recorded PID when finished. Rerunning the skill restarts a stopped viewer.

## Record

Open My AI Vocabulary and click Record. Pause & download finishes the take. The tested Chrome path produces silent H.264 MP4 at 1080 × 1350, with the controls outside the portrait canvas. Browsers without MP4 recording support can save WebM.

## Use as a skill

Place the context-gallery folder in your agent's skills directory and invoke $context-gallery. SKILL.md contains the setup and missing-export workflow. Source and assets are resolved relative to the installed skill. User data is generated under the invocation's working directory.

## Package

```sh
python3 scripts/package.py
```

This creates dist/context-gallery.zip using an explicit source manifest. The archive is the GitHub-ready payload. Local exports, generated HTML, data, screenshots, dependencies, and recordings are excluded. To work on the bundled app source, run npm ci in the skill folder.
