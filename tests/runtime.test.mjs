import assert from 'node:assert/strict'
import {test} from 'node:test'
import {mkdtemp,readFile,mkdir,rm,stat} from 'node:fs/promises'
import {join} from 'node:path'
import {tmpdir} from 'node:os'
import {spawnSync} from 'node:child_process'
import {root,runner,fixture,run} from './helpers.mjs'
const python = process.env.PYTHON_BIN || 'python3'

async function temporary(t) {
  const path = await mkdtemp(join(tmpdir(),'unwrapped test '))
  t.after(async()=>{
    run(python,['-c','from pathlib import Path; import sys; [(p.chmod(0o755) if p.is_dir() else p.chmod(0o644)) for p in Path(sys.argv[1]).rglob("*")]',path])
    await rm(path,{recursive:true,force:true})
  })
  return path
}
function prepare(args,options={}) {
  return JSON.parse(run(process.execPath,[runner,...args],options))
}

test('artifact mode handles a missing export without starting a local viewer',async t=>{
  const cwd = await temporary(t)
  const empty = join(cwd,'empty')
  await mkdir(empty)
  const output = prepare(['--mode=artifact','--export='+empty],{cwd})
  assert.equal(output.status,'missing')
  assert.equal((await stat(output.exports)).isDirectory(),true)
  assert.match(output.settings_url,/claude.ai\/settings\/privacy/)
  await assert.rejects(stat(join(cwd,'claude-context-art/.server.json')),{code:'ENOENT'})
})

test('clean upload package imports multipart exports from a read-only installed skill',async t=>{
  const cwd = await temporary(t)
  const archive = join(cwd,'skill.zip')
  run(python,[join(root,'scripts/package.py'),'--output',archive])
  const installed = join(cwd,'installed')
  run(python,['-c',`
from zipfile import ZipFile
from pathlib import Path
import sys
with ZipFile(sys.argv[1]) as z:
 names=z.namelist()
 assert all(n.startswith('context-gallery/') for n in names)
 assert not any(n.endswith(('.zip','.mp4','.webm','.jpg')) or '/node_modules/' in n for n in names)
 assert not any('/README.md' in n for n in names)
 z.extractall(sys.argv[2])
for p in sorted(Path(sys.argv[2]).rglob('*'),reverse=True): p.chmod(0o555 if p.is_dir() else 0o444)
`,archive,installed])
  const exports = join(cwd,'exports')
  await mkdir(exports)
  fixture(exports,0)
  fixture(exports,1)
  const result = JSON.parse(run(process.execPath,[join(installed,'context-gallery/scripts/prepare.mjs'),'--mode=artifact','--export='+exports,'--workspace='+join(cwd,'output')],{cwd}))
  assert.equal(result.status,'ready')
  assert.equal(result.sessions,2)
  assert.equal(result.tokens,10)
  const vocabulary = JSON.parse(await readFile(join(result.data,'vocabulary.json'),'utf8'))
  assert.deepEqual(vocabulary.vocabulary,['hello','world','sky'])
  assert.equal(vocabulary.sessions[0].title,'Fixture $& </script>')
  const html = await readFile(join(cwd,'output/gallery/word-pulse.html'),'utf8')
  assert.ok(!html.includes('/*DATA*/'))
  assert.ok(html.includes('Fixture $& \\u003c/script>'))
  assert.ok(!html.includes('fetch("../data'))
  run(python,['-c',`
from zipfile import ZipFile
import sys
with ZipFile(sys.argv[1]) as z:
 names=set(z.namelist())
 assert 'claude-unwrapped/index.html' in names
 assert 'claude-unwrapped/data/sessions.json' in names
 assert not any(n.endswith('.zip') or '/exports/' in n for n in names)
`,result.artifact])
  await assert.rejects(stat(join(cwd,'escape.txt')),{code:'ENOENT'})
  await assert.rejects(stat(join(installed,'context-gallery/node_modules')),{code:'ENOENT'})
  await assert.rejects(stat(join(cwd,'output/.server.json')),{code:'ENOENT'})
})

test('a malformed import preserves the previous data and gallery archive',async t=>{
  const cwd = await temporary(t)
  const good = fixture(cwd)
  const workspace = join(cwd,'output')
  const result = prepare(['--mode=artifact','--export='+good,'--workspace='+workspace])
  const data = await readFile(join(result.data,'sessions.json'))
  const gallery = await readFile(result.artifact)
  const bad = join(cwd,'bad.zip')
  run(python,['-c','from zipfile import ZipFile; import sys; z=ZipFile(sys.argv[1],"w"); z.writestr("conversations.json","{invalid"); z.close()',bad])
  const failure = spawnSync(process.execPath,[runner,'--mode=artifact','--export='+bad,'--workspace='+workspace],{encoding:'utf8'})
  assert.equal(failure.status,1)
  assert.deepEqual(await readFile(join(result.data,'sessions.json')),data)
  assert.deepEqual(await readFile(result.artifact),gallery)
})

test('local mode loads external data and reuses its loopback viewer',async t=>{
  const cwd = await temporary(t)
  const source = fixture(cwd)
  const args = ['--export='+source,'--workspace='+join(cwd,'output')]
  const first = prepare(args)
  const state = JSON.parse(await readFile(join(first.workspace,'.server.json'),'utf8'))
  t.after(()=>{try {process.kill(state.pid)} catch {}})
  const next = prepare(args)
  assert.equal(first.gallery,next.gallery)
  const html = await (await fetch(first.gallery.replace('index.html','word-pulse.html'))).text()
  assert.ok(html.includes('fetch("../data/vocabulary.json")'))
  assert.equal((await fetch(new URL('/exports/file.zip',first.gallery))).status,404)
  const response = await fetch(new URL('/data/vocabulary.json',first.gallery))
  assert.equal((await response.json()).tokens,5)
})

test('capture setup failure is reported while vocabulary remains available',async t=>{
  const cwd = await temporary(t)
  const source = fixture(cwd)
  const output = prepare(['--mode=artifact','--export='+source,'--workspace='+join(cwd,'output'),'--capture'],{env:{...process.env,CHROME_BIN:join(cwd,'missing-chrome')}})
  assert.equal(output.status,'ready')
  assert.equal(output.tokens,5)
  assert.equal(output.eligible_search_results,1)
  assert.equal(output.screenshots,0)
  assert.match(output.capture_status,/failed/i)
})
