"""Read Claude's single-file and category-part exports without extracting ZIP paths."""
import json
from pathlib import Path
from zipfile import BadZipFile, ZipFile


def export_files(source):
    source = Path(source).expanduser().resolve()
    if source.is_file():
        return [source]
    return sorted(source.glob('*.zip'))


def compatible(path):
    try:
        with ZipFile(path) as archive:
            return any(Path(name).name == 'conversations.json' for name in archive.namelist())
    except (BadZipFile, OSError):
        return False


def discover(locations):
    for location in locations:
        folder = Path(location).expanduser().resolve()
        candidates = sorted(folder.glob('*.zip'), key=lambda path: path.stat().st_mtime, reverse=True)
        for path in candidates:
            if compatible(path):
                if path.name.startswith('conversations-'):
                    return sorted(folder.glob('conversations-*.zip')) + sorted(folder.glob('design_chats-*.zip'))
                return [path]
    return []


def load_export(files):
    conversations, designs = {}, {}
    inventory = []
    for path in files:
        with ZipFile(path) as archive:
            for info in archive.infolist():
                name = Path(info.filename)
                if info.is_dir():
                    continue
                inventory.append({'archive': Path(path).name, 'path': info.filename, 'bytes': info.file_size})
                if name.suffix != '.json':
                    continue
                if name.name == 'conversations.json':
                    raw = json.loads(archive.read(info))
                    if not isinstance(raw, list):
                        raise ValueError('conversations.json must contain a list of conversations')
                    for item in raw:
                        conversations[item['uuid']] = item
                elif Path(path).name.startswith('design_chats-') or 'design_chats' in name.parts:
                    raw = json.loads(archive.read(info))
                    if isinstance(raw, dict) and 'messages' in raw and 'uuid' in raw:
                        designs[raw['uuid']] = raw
    return list(conversations.values()), list(designs.values()), inventory


def message_text(message):
    if isinstance(message.get('text'), str):
        return message['text']
    content = message.get('content')
    if isinstance(content, str):
        return content
    if isinstance(content, dict):
        return content.get('content', '')
    if isinstance(content, list):
        return '\n'.join(block.get('text', '') for block in content if isinstance(block, dict) and block.get('type') == 'text')
    return ''


def sessions_from(conversations, designs):
    sessions = []
    for kind, items, key in [('Claude', conversations, 'chat_messages'), ('Claude Design', designs, 'messages')]:
        for item in items:
            turns = []
            for message in item.get(key, []):
                role = message.get('sender') or message.get('role')
                text = message_text(message)
                date = message.get('created_at') or item.get('created_at')
                if role in ('assistant', 'human', 'user') and isinstance(text, str) and text.strip() and date:
                    turns.append([role == 'assistant', date, text])
            if turns:
                turns.sort(key=lambda turn: turn[1])
                sessions.append({
                    'id': item['uuid'], 'title': (item.get('name') or item.get('title') or '').strip() or 'Untitled session',
                    'kind': kind, 'date': (item.get('created_at') or turns[0][1])[:10], 'turns': turns,
                })
    return sorted(sessions, key=lambda session: session['turns'][-1][1], reverse=True)
