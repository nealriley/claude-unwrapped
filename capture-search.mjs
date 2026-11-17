import {execFileSync} from 'node:child_process'
import {mkdtemp,writeFile} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {fileURLToPath} from 'node:url'

if (!process.argv.some(arg=>arg.startsWith('--data-dir='))) {
  const data = await mkdtemp(join(tmpdir(),'claude-search-'))
  const results = execFileSync(process.env.PYTHON_BIN || 'python3',[
    fileURLToPath(new URL('./src/search-sources.py',import.meta.url)),
    fileURLToPath(new URL('../',import.meta.url)),
  ],{encoding:'utf8'})
  await writeFile(join(data,'search-results.json'),results,{mode:0o600})
  process.argv.push('--data-dir='+data,'--captures-dir='+fileURLToPath(new URL('./captures/',import.meta.url)))
}
await import('./skills/context-gallery/scripts/capture-search.mjs')
