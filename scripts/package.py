#!/usr/bin/env python3
"""Package only the complete, independently usable skill directory."""
import argparse
from pathlib import Path
import re
from zipfile import ZIP_DEFLATED, ZipFile

root = Path(__file__).resolve().parents[1]
skill = root / 'skills/context-gallery'
parser = argparse.ArgumentParser()
parser.add_argument('--output', type=Path, default=root / 'dist/context-gallery.zip')
args = parser.parse_args()
metadata = (skill / 'SKILL.md').read_text()
assert re.search(r'^name: context-gallery$', metadata, re.M)
description = re.search(r'^description: (.+)$', metadata, re.M).group(1)
assert len(description) <= 200
assert all((skill / 'assets/app' / name).exists() for name in ['index.html', 'word-pulse.html', 'search-filmstrip.html'])
files = [skill / 'SKILL.md', skill / 'agents/openai.yaml', skill / 'assets/runtime.json']
files += sorted((skill / 'scripts').glob('*.mjs'))
files += sorted((skill / 'scripts').glob('*.py'))
files += sorted((skill / 'assets/app').glob('*.html'))
args.output.parent.mkdir(parents=True, exist_ok=True)
with ZipFile(args.output, 'w', ZIP_DEFLATED) as archive:
    for path in files:
        archive.write(path, 'context-gallery/' + path.relative_to(skill).as_posix())
print(args.output.resolve())
