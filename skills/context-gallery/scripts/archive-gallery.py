#!/usr/bin/env python3
"""Bundle a prepared gallery and its data without including the original export."""
from pathlib import Path
import sys
from zipfile import ZipFile, ZIP_DEFLATED

workspace = Path(sys.argv[1]).resolve()
artifact = workspace / 'claude-unwrapped-gallery.zip'
output = workspace / 'gallery'
staging = workspace / 'claude-unwrapped-gallery.zip.part'
staging.touch(mode=0o600, exist_ok=True)
with ZipFile(staging, 'w', ZIP_DEFLATED) as archive:
    for name in ['index.html', 'word-pulse.html', 'search-filmstrip.html']:
        archive.write(output / name, 'claude-unwrapped/' + name)
    for name in ['manifest.json', 'sessions.json', 'vocabulary.json', 'search-results.json', 'filmstrip.json']:
        archive.write(workspace / 'data' / name, 'claude-unwrapped/data/' + name)
    manifest = workspace / 'captures/manifest.json'
    if manifest.exists():
        import json
        metadata = json.loads(manifest.read_text())
        eligible = {item['id'] for item in json.loads((workspace / 'data/search-results.json').read_text())}
        selected = [item for item in metadata['images'] if item['id'] in eligible and (workspace / 'captures' / item['file']).is_file()]
        for image in selected:
            name = image['file']
            if Path(name).name != name or not name.endswith('.jpg'):
                raise ValueError('Invalid capture filename')
            archive.write(workspace / 'captures' / name, 'claude-unwrapped/captures/' + name)
        archive.writestr('claude-unwrapped/captures/manifest.json', json.dumps({
            'images': selected, 'skipped': [item for item in metadata['skipped'] if item['id'] in eligible], 'eligible': len(eligible),
        }))
staging.chmod(0o600)
staging.replace(artifact)
print(artifact)
