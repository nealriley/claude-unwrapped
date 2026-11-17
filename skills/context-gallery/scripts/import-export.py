#!/usr/bin/env python3
"""Discover export ZIPs and write the gallery's local data in one committed directory."""
import argparse
from datetime import datetime, timezone
import importlib.util
import json
from pathlib import Path
import shutil
import sys
import tempfile
from zipfile import BadZipFile

source_root = Path(__file__).resolve().parent
sys.path.insert(0, str(source_root))
from claude_export import compatible, discover, export_files, load_export, sessions_from
spec = importlib.util.spec_from_file_location('search_sources', source_root / 'search-sources.py')
search_sources = importlib.util.module_from_spec(spec)
spec.loader.exec_module(search_sources)


def run():
    parser = argparse.ArgumentParser()
    parser.add_argument('--workspace', type=Path, required=True)
    parser.add_argument('--search', action='append', default=[])
    parser.add_argument('--export', dest='source', type=Path)
    args = parser.parse_args()
    workspace = args.workspace.expanduser().resolve()
    exports = workspace / 'exports'
    exports.mkdir(parents=True, exist_ok=True, mode=0o700)
    files = export_files(args.source) if args.source else discover([exports, *args.search])
    if not any(compatible(path) for path in files):
        print(json.dumps({'status': 'missing', 'exports': str(exports), 'settings_url': 'https://claude.ai/settings/privacy',
                          'help_url': 'https://support.claude.com/en/articles/9450526-export-your-claude-data'}))
        return
    conversations, designs, inventory = load_export(files)
    sessions = sessions_from(conversations, designs)
    if not sessions:
        raise ValueError('The export contains no playable conversation text')
    workspace.mkdir(parents=True, exist_ok=True, mode=0o700)
    staging = Path(tempfile.mkdtemp(prefix='.import-', dir=workspace))
    data = workspace / 'data'
    try:
        values = {
            'sessions.json': sessions,
            'search-results.json': search_sources.search_pages(conversations),
            'manifest.json': {
                'version': 1, 'imported_at': datetime.now(timezone.utc).isoformat(),
                'archives': [str(path) for path in files], 'objects': inventory,
                'sessions': len(sessions), 'messages': sum(len(session['turns']) for session in sessions),
            },
        }
        for name, value in values.items():
            target = staging / name
            target.write_text(json.dumps(value, ensure_ascii=True, separators=(',', ':')))
            target.chmod(0o600)
        # A rejected export leaves the previous data intact.
        data.mkdir(exist_ok=True, mode=0o700)
        for path in staging.iterdir():
            path.replace(data / path.name)
    finally:
        shutil.rmtree(staging)
    print(json.dumps({'status': 'imported', 'workspace': str(workspace), 'data': str(data),
                      'exports': str(exports), 'archives': [str(path) for path in files], 'sessions': len(sessions)}))


if __name__ == '__main__':
    try:
        run()
    except (ValueError, OSError, KeyError, BadZipFile) as error:
        print(str(error), file=sys.stderr)
        sys.exit(1)
