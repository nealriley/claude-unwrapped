from pathlib import Path
import runpy

globals().update(runpy.run_path(str(Path(__file__).resolve().parents[1] / 'skills/context-gallery/scripts/claude_export.py')))
