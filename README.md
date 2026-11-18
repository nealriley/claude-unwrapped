# Claude Unwrapped

Turn your Claude export into two experiences you can open in Chrome.

- **My AI Vocabulary** replays sessions as a portrait word mosaic and records the live canvas to video.
- **Search Filmstrip** replays screenshots of eligible public search results in chronological order.

## Install in Claude Desktop

Enable code execution in Claude, then choose either installation route.

### Install from this GitHub repository

1. Open **Customize → Plugins → Add → Add marketplace**.
2. Choose **Add from a repository** and enter `nealriley/claude-unwrapped`.
3. Install **Claude Unwrapped** and enable it.
4. In a local Code session, ask Claude to open your Claude Unwrapped gallery. In Chat or Cowork, ask for a downloadable gallery.

The plugin's skill is available as `/agent-unwrapped:context-gallery` where Claude supports namespaced commands. Marketplace installations can use **Check for updates** and **Sync automatically** where available.

### Upload the skill ZIP

1. Download [context-gallery.zip](https://github.com/nealriley/claude-unwrapped/releases/latest/download/context-gallery.zip) from the latest GitHub release.
2. Open **Customize → Skills → + → Create skill → Upload a skill**.
3. Upload the ZIP and enable **context-gallery**.
4. Ask Claude, “Use context-gallery to explore my Claude export.”

For manual installations, upload the newer release ZIP when you want to update. Organization policy and Claude's rolling UI updates may affect the exact labels and available installation options.

## Use in Desktop or Cowork

Attach your downloaded Claude export ZIPs, or connect the folder holding them. If you need an export, the skill points you to **Settings → Privacy → Export data** and helps you locate a folder for the download.

Claude processes the supplied export in its execution environment and produces **claude-unwrapped-gallery.zip**. Download and extract it, then open **claude-unwrapped/index.html** in Chrome. Both experience pages embed their playback data and assets. The archive also contains normalized JSON and any successful screenshot captures.

Screenshot capture visits eligible public pages and needs network access. It attempts 32 pages by default and reports failures. Vocabulary playback is available even when screenshots could not be captured. Once generated, the gallery works offline on your computer.

In My AI Vocabulary, click **Record**, then **Pause & download** to finish the take. Chrome produces silent H.264 MP4 at **1080 × 1350**. Browsers without MP4 recording support can save WebM.

## Claude Code and local use

Install from the same repository in Claude Code.

```text
/plugin marketplace add nealriley/claude-unwrapped
/plugin install agent-unwrapped@claude-unwrapped
/agent-unwrapped:context-gallery
```

Choose a local session in the Claude Desktop Code tab or run Claude Code on your computer. The skill checks the chosen claude-context-art workspace for an existing import and opens it in Chrome. Repeat invocations use the same workspace.

On a first run, put the JSON manifest from Claude's emailed export link in the workspace's exports folder or in Downloads. The runner downloads the ZIPs listed in the manifest into a separate folder for that export and imports them when all are verified. If Chrome sign-in is needed, use the original manifest to save the remaining parts into the folder named by the runner, then repeat the command. Keep the filenames listed in the manifest.

You can run the same workflow directly with Node.js 20+ and Python 3.

```sh
node /absolute/path/to/claude-unwrapped/scripts/prepare.mjs \
  --workspace="/absolute/path/to/claude-context-art" --open --capture-on-import
```

Use `--manifest=/absolute/path/to/export.json` for a particular manifest, `--export=/absolute/path` for existing ZIPs, or `--refresh` to search again. The viewer serves the gallery on 127.0.0.1. PYTHON_BIN and CHROME_BIN select alternate executables. Viewer process details are in the workspace's .server.json file.

Generate a downloadable gallery directly with the artifact mode.

```sh
node /absolute/path/to/claude-unwrapped/scripts/prepare.mjs \
  --mode=artifact --export=/absolute/path/to/export.zip \
  --workspace=/absolute/path/to/output --capture
```

## Develop and package

```sh
npm ci
npm run build
npm test
npm run test:browser
npm run package:skill
```

The build compiles the application into reusable templates inside the canonical skill. Commit updated templates whenever application source changes. Runtime generation uses the shipped templates. Optional screenshot packages and browser downloads install into the writable workspace cache.

The uploadable package is **dist/context-gallery.zip**, with one **context-gallery/** root containing SKILL.md and all required scripts and assets. Development documentation stays in the repository. Version tags trigger package validation and create a draft GitHub release for Desktop acceptance before publication.

The first release is **0.1.0**. Its release notes distinguish automated browser/package checks from installation and execution verified in a live Claude Desktop account.

[Skill source](skills/context-gallery/SKILL.md) · [Distribution research and verification](docs/claude-distribution.md) · [Design context](docs/README.md)
