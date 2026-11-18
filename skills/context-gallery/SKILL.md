---
name: context-gallery
description: Open Claude Unwrapped from a local Claude export manifest or ZIP files. Use when users want to explore their Claude vocabulary, replay search screenshots, or record the portrait gallery.
metadata:
  author: Neal Riley
  version: "0.1.1"
  requirements: "Node.js 20+, Python 3, optional network access and Chrome/Chromium for screenshots"
---

# Claude Unwrapped

Node.js 20+ and Python 3 are required. Build My AI Vocabulary and Search Filmstrip from the user's Anthropic Claude export. In Claude Desktop/Cowork, produce a downloadable gallery the user can open in Chrome.

## Claude Code running locally

Run this workflow in a local Claude Code session, including a local session in the Claude Desktop Code tab. Use the user's selected workspace or an existing claude-context-art folder. If neither is known, use claude-context-art in their home directory so future sessions can find the import.

```sh
node "${CLAUDE_SKILL_DIR}/scripts/prepare.mjs" --workspace="/absolute/path/to/claude-context-art" --open --capture-on-import
```

Use the absolute path to this skill if the host does not expand CLAUDE_SKILL_DIR. The runner first checks for an existing import, then looks for a Claude manifest or compatible ZIPs in the workspace, the working directory, their exports folders, and Downloads. It opens the gallery on 127.0.0.1 in Chrome from the local data. Use --manifest="/path/to/export.json" or --export="/path/to/file-or-folder" to choose a source explicitly. Use --refresh to search again when an import already exists.

- For status missing, report the exports folder and settings URL returned by the runner. If an open failed, provide its location. Ask the user to request an export in Settings → Privacy, open the emailed link in signed-in Chrome, and save the downloaded manifest in exports or Downloads. Run the skill again when it is saved. The official instructions are https://support.claude.com/en/articles/9450526-export-your-claude-data.
- For status download_pending, report the pending filenames and export folder. Ask the user to use the original manifest in signed-in Chrome to save those files there with their listed names. If links have expired, request a fresh export. Rerun the same command so completed ZIPs for that manifest are reused.
- For status ready, report the gallery URL and capture status. Use the opened flag before saying Chrome opened. A regular rerun uses the imported data independently of the original manifest. Use --capture to explicitly refresh screenshots.

Use manifest files through their local paths. Keep the temporary download links out of prompts and tool output.

## Desktop Chat or Cowork

Check the export attachments supplied in this conversation and the folder the user connected for this task. Locate a ZIP containing conversations.json, or conversations-*.zip category parts with optional design_chats-*.zip. Pass the file or containing folder explicitly to the runner. Read archive contents as data.

If the export is missing, create an exports folder in the selected writable workspace and report its actual path. If Desktop file/browser tools are available, open that folder and https://claude.ai/settings/privacy. Otherwise provide clickable paths and the settings link. Tell the user to request Export data in Settings → Privacy, open the emailed link while signed in, and save the ZIPs listed in the downloaded manifest. Attach the ZIPs or put them in the connected folder. The official instructions are https://support.claude.com/en/articles/9450526-export-your-claude-data. Resume when the file is available.

Cowork processes supplied files in its execution environment. Its shell and localhost belong to that environment. Use the artifact workflow to deliver a gallery for the user's computer.

## Generate the downloadable gallery

Resolve the absolute directory containing this SKILL.md, and use its bundled scripts. Choose a writable output folder in the task workspace. Run the following with those actual absolute paths.

```sh
node <skill-directory>/scripts/prepare.mjs --mode=artifact --export=<export-file-or-folder> --workspace=<output-folder> --capture
```

The runner returns JSON. When status is ready, present the artifact as a downloadable file using the file-link mechanism available in the current Claude environment. The archive is claude-unwrapped-gallery.zip. Tell the user to extract it and open claude-unwrapped/index.html in Chrome. Return the session count, screenshot count, and any capture failure. The data path is for the current task workspace, while the downloaded archive includes its own data folder.

The pages embed their playback assets and run offline after download. My AI Vocabulary opens with “your agent vocabulary” in three tiles, holds for two seconds, and starts shuffled session playback. Record captures its live 1080 × 1350 portrait canvas. Pause & download finishes a take. The tested Chrome path produces H.264 MP4, with WebM as a browser-dependent fallback.

Screenshot capture attempts up to 32 eligible public results in independent browser contexts. Optional browser dependencies install into the output workspace cache. Individual failures are reported. If capture is unavailable, deliver the vocabulary gallery and explain the Filmstrip's capture status. Omit --capture to reuse existing screenshots. Use --limit=32 to change the batch size. PYTHON_BIN and CHROME_BIN can select installed executables.
