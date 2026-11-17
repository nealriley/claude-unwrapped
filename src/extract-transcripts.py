from pathlib import Path
import json
import sys
from claude_export import export_files, load_export, sessions_from

conversations, designs, _ = load_export(export_files(Path(sys.argv[1])))
sessions = sessions_from(conversations, designs)
print(json.dumps(sessions, ensure_ascii=True, separators=(',', ':')).replace('<', '\\u003c'))
