# Claude Context visualization workshop

[Design decisions and code examples](design-guide.md) · [Experience backlog](experiences.md)

The gallery opens My AI Vocabulary and Search Filmstrip. The skill generates both experiences from a supplied Claude export. Desktop and Cowork deliver a downloadable gallery. Direct local execution serves data through a loopback viewer.

## Run locally

Use Node.js 20+, Python 3, and Chrome. Invoke the installed skill's runner from the folder where your data should live.

```sh
node /absolute/path/to/context-gallery/scripts/prepare.mjs --open --capture
```

It discovers a compatible export, or creates and opens an exports folder along with Claude's export settings. Once an export is present, data, captures, and experiences are generated under the local claude-context-art workspace. The runner returns a browser URL. Omit --capture to reuse saved screenshots.

The generated experiences fetch their JSON from the adjacent data folder. The local viewer keeps these paths available. Use --mode=artifact with an explicit --export and --workspace to generate the downloadable gallery. npm run build compiles reusable templates into the skill package.

## Source guide

| File | Responsibility |
| --- | --- |
| src/gallery.html | Gallery cards, hash navigation, and one mounted experience |
| src/word-pulse.js | Word mosaic, camera controls, opening tiles, and video recording |
| src/search-filmstrip.js | Screenshot playback and chronological navigation |
| skills/context-gallery/scripts/claude_export.py | Single-file and category-part Claude export reader |
| scripts/prepare.mjs | Discovery, import, build, local viewer, and opening Chrome |
| build.mjs | Gallery and experience HTML generation |
| capture-search.mjs | Public-page screenshots in independent Chrome contexts |

Capture needs network access. Playback uses stored data and screenshots. The manifest records successful and skipped captures. Filmstrip dates refer to when a URL first appeared in the export, and capture metadata also records when the screenshot was taken.

## GPUCanvas exhibits

[GPUCanvas](https://github.com/berkantay/gpucanvas) powers navigation in My AI Vocabulary and renders the scrollable screenshot frames. My AI Vocabulary draws the visible tiles in a Canvas 2D layer synchronized with GPUCanvas’s camera. Both exhibits report whether GPUCanvas is using the WebGPU or DOM renderer.
