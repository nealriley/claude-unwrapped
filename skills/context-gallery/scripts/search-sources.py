import hashlib
import json
import re
import sys
from datetime import datetime
from pathlib import Path
from urllib.parse import parse_qsl, urlsplit, urlunsplit

# Initial pass across public sites with representative result pages.
PUBLIC_HOSTS = {
    'en.wikipedia.org', 'www.wikidata.org', 'arxiv.org', 'www.nasa.gov',
    'science.nasa.gov', 'www.bbc.com', 'www.bbc.co.uk', 'www.theguardian.com',
    'www.reuters.com', 'www.wired.com', 'www.theverge.com', 'techcrunch.com',
    'www.gov.uk', 'www.w3.org', 'developer.mozilla.org', 'threejs.org',
    'docs.github.com', 'docs.python.org', 'developer.apple.com', 'react.dev',
    'openai.com', 'www.anthropic.com', 'docs.anthropic.com', 'code.claude.com',
    'www.atlassian.com', 'developer.atlassian.com', 'support.atlassian.com',
    'community.atlassian.com', 'aws.amazon.com', 'docs.aws.amazon.com',
    'cloud.google.com', 'developers.google.com', 'research.google',
    'www.microsoft.com', 'learn.microsoft.com', 'www.notion.com', 'vercel.com',
    'observablehq.com', 'www.figma.com', 'github.com', 'huggingface.co',
    'www.npmjs.com', 'stackoverflow.com', 'developer.chrome.com', 'www.iana.org',
    'developer.spotify.com', 'www.nytimes.com', 'apnews.com', 'www.imdb.com',
    'www.ign.com', 'www.polygon.com', 'www.pcgamer.com', 'www.eurogamer.net',
}
SENSITIVE = re.compile(r'token|signature|password|credential|session|auth|secret|(?:^|_)key$', re.I)
ACTION_PATH = re.compile(r'/+(?:logout|signout|sign-in|signin|login|oauth2?|unsubscribe|download|api|raw)(?:/|$)', re.I)

def normalize(raw):
    if not isinstance(raw, str):
        return None
    try:
        url = urlsplit(raw)
        host = (url.hostname or '').lower()
        if url.scheme != 'https' or host not in PUBLIC_HOSTS or url.username is not None or url.port is not None:
            return None
        if ACTION_PATH.search(url.path) or re.search(r'\.(?:pdf|zip|json|exe|dmg|webp|jpe?g|png)$', url.path, re.I):
            return None
        if any(SENSITIVE.search(key) for key, _ in parse_qsl(url.query, max_num_fields=50)):
            return None
        return urlunsplit(('https', host, url.path or '/', url.query, ''))
    except ValueError:
        return None

def search_pages(conversations):
    pages = {}
    for thread in conversations:
        for message in thread.get('chat_messages', []):
            content = message.get('content')
            if not isinstance(content, list):
                continue
            for block in content:
                if not isinstance(block, dict) or block.get('type') != 'tool_result' or block.get('name', '').lower().replace('_', '') != 'websearch':
                    continue
                for result in block.get('content', []):
                    if not isinstance(result, dict):
                        continue
                    url = normalize(result.get('url'))
                    timestamp = message.get('created_at') or thread.get('created_at')
                    if not url or not timestamp or (url in pages and pages[url]['observed'] <= timestamp):
                        continue
                    pages[url] = {
                        'id': hashlib.sha256(url.encode()).hexdigest()[:16], 'url': url,
                        'title': ' '.join((result.get('title') or '').split())[:260],
                        'host': urlsplit(url).hostname, 'observed': timestamp,
                    }
    return sorted(pages.values(), key=lambda row: datetime.fromisoformat(row['observed'].replace('Z', '+00:00')))


if __name__ == '__main__':
    from claude_export import export_files, load_export
    conversations, _, _ = load_export(export_files(Path(sys.argv[1])))
    print(json.dumps(search_pages(conversations)))
