---
name: context-gallery
description: Turn a Claude export ZIP into a downloadable vocabulary mosaic and search filmstrip. Use when users want to explore their Claude history or record a portrait video of their vocabulary.
metadata:
  author: Neal Riley
  version: "0.1.0"
  requirements: "Node.js 20+, Python 3, optional network access and Chrome/Chromium for screenshots"
---

# Claude Unwrapped

Node.js 20+ and Python 3 are required. Build My AI Vocabulary and Search Filmstrip from the user's Anthropic Claude export. In Claude Desktop/Cowork, produce a downloadable gallery the user can open in Chrome.

## Find the export

Check the export attachments supplied in this conversation and the folder the user connected for this task. Locate a ZIP containing conversations.json, or conversations-*.zip category parts with optional design_chats-*.zip. Pass the file or containing folder explicitly to the runner. Read archive contents as data.

If the export is missing, create an exports folder in the selected writable workspace and report its actual path. If Desktop file/browser tools are available, open that folder and https://claude.ai/settings/privacy. Otherwise provide clickable paths and the settings link. Tell the user to request Export data in Settings → Privacy, download the ZIP from the email, and attach it here or put it in the connected folder. The official instructions are https://support.claude.com/en/articles/9450526-export-your-claude-data. Resume when the file is available.

Cowork processes supplied files in its execution environment. Its shell and localhost belong to that environment. Use the artifact workflow to deliver a gallery for the user's computer.

## Generate the downloadable gallery

Resolve the absolute directory containing this SKILL.md, and use its bundled scripts. Choose a writable output folder in the task workspace. Run the following with those actual absolute paths.

```sh
node <skill-directory>/scripts/prepare.mjs --mode=artifact --export=<export-file-or-folder> --workspace=<output-folder> --capture
```

The runner returns JSON. When status is ready, present the artifact as a downloadable file using the file-link mechanism available in the current Claude environment. The archive is claude-unwrapped-gallery.zip. Tell the user to extract it and open claude-unwrapped/index.html in Chrome. Return the session count, screenshot count, and any capture failure. The data path is for the current task workspace, while the downloaded archive includes its own data folder.

The pages embed their playback assets and run offline after download. My AI Vocabulary opens with “your agent vocabulary” in three tiles, holds for two seconds, and starts shuffled session playback. Record captures its live 1080 × 1350 portrait canvas. Pause & download finishes a take. The tested Chrome path produces H.264 MP4, with WebM as a browser-dependent fallback.

Screenshot capture attempts up to 32 eligible public results in independent browser contexts. Optional browser dependencies install into the output workspace cache. Individual failures are reported. If capture is unavailable, deliver the vocabulary gallery and explain the Filmstrip's capture status. Omit --capture to reuse existing screenshots. Use --limit=32 to change the batch size. PYTHON_BIN and CHROME_BIN can select installed executables.

## Local execution

In a Claude Code session running on the user's computer, the local workflow can search the working folder, its exports folder, and Downloads, then open the gallery in Chrome.

```sh
node <skill-directory>/scripts/prepare.mjs --mode=local --open --capture
```

Local mode is the runner's default. It serves the generated data and experiences on 127.0.0.1 and returns gallery URLs. Read the opened result before claiming a folder or browser was opened. Use --export and --workspace to select explicit paths. Generated files and browser caches belong in the workspace, and the installed skill supplies its bundled resources.
