#!/usr/bin/env python3
"""Create a source-only skill archive using an explicit list of distributable files."""
import argparse
from pathlib import Path
from zipfile import ZIP_DEFLATED, ZipFile

root = Path(__file__).resolve().parents[1]
parser = argparse.ArgumentParser()
parser.add_argument('--output', type=Path, default=root / 'dist' / 'context-gallery.zip')
args = parser.parse_args()
files = [
    'SKILL.md', 'README.md', '.gitignore', 'package.json', 'package-lock.json', 'build.mjs', 'capture-search.mjs',
    'agents/openai.yaml', 'scripts/prepare.mjs', 'scripts/serve.mjs', 'scripts/import-export.py', 'scripts/package.py',
    'src/claude_export.py', 'src/extract-transcripts.py', 'src/search-sources.py', 'src/word-data.mjs',
    'src/gallery.html', 'src/word-pulse.html', 'src/word-pulse.js', 'src/search-filmstrip.html', 'src/search-filmstrip.js',
    'src/gpu-board.js', 'src/gpu-exhibits.css', 'src/avatars.css', 'src/tile-spiral.js', 'src/vocabulary-follow.js', 'src/vocabulary-stream.js',
    'docs/README.md', 'docs/design-guide.md', 'docs/experiences.md',
]
args.output.parent.mkdir(parents=True, exist_ok=True)
with ZipFile(args.output, 'w', ZIP_DEFLATED) as archive:
    for name in files:
        archive.write(root / name, 'context-gallery/' + name)
print(args.output.resolve())
