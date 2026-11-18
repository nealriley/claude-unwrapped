import assert from 'node:assert/strict'
import {test} from 'node:test'
import {mkdtemp,readFile,mkdir,rm,stat,readdir,writeFile,copyFile} from 'node:fs/promises'
import {join} from 'node:path'
import {pathToFileURL} from 'node:url'
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

test('local manifest import resumes verified downloads, then reuses the data without the source files',async t=>{
  const cwd = await temporary(t)
  const fixtures = join(cwd,'fixtures')
  const workspace = join(cwd,'claude-context-art')
  const exports = join(workspace,'exports')
  await mkdir(fixtures)
  await mkdir(exports,{recursive:true})
  const archives = [0,1,2].map(index=>fixture(fixtures,index))
  const filenames = archives.map((_,index)=>'conversations-00'+index+'.zip')
  const urls = filenames.map((_,index)=>'https://claude.ai/export/test-batch/download/fixture-token-'+index)
  const manifest = join(exports,'export.json')
  await writeFile(manifest,JSON.stringify({total_files:3,data_files:filenames.map((filename,i)=>({
    filename,export_url:i===0?'[Export file]('+urls[i]+')':urls[i],
  }))}))
  const mock = join(cwd,'mock-fetch.mjs')
  const requests = join(cwd,'requests')
  await writeFile(mock,`
    import {appendFile,readFile} from 'node:fs/promises'
    const fetchNetwork = globalThis.fetch
    globalThis.fetch = async (target,options)=>{
      const url = new URL(target)
      if (url.hostname==='127.0.0.1') return fetchNetwork(target,options)
      const index = ${JSON.stringify(urls)}.indexOf(url.href)
      if (index<0 || options.redirect!=='manual') throw new Error('Unexpected request')
      await appendFile(${JSON.stringify(requests)},String(index))
      if (index===1) return new Response('Sign in',{status:403})
      const bytes = await readFile(${JSON.stringify(archives)}[index])
      return new Response(index===2 && !process.env.TEST_CONTINUE ? bytes.subarray(0,10) : bytes)
    }
  `)
  const args = ['--import',pathToFileURL(mock).href,runner,'--workspace='+workspace]
  const pending = JSON.parse(run(process.execPath,args,{cwd}))
  assert.equal(pending.status,'download_pending')
  assert.deepEqual(pending.pending_files,filenames.slice(1))
  assert.deepEqual(await readdir(pending.exports),[filenames[0]])
  assert.equal((await stat(join(pending.exports,filenames[0]))).mode & 0o777,0o600)
  await assert.rejects(stat(join(workspace,'data/sessions.json')),{code:'ENOENT'})
  await copyFile(archives[1],join(pending.exports,filenames[1]))

  const retry = run(process.execPath,[...args,'--manifest='+manifest],{cwd,env:{...process.env,TEST_CONTINUE:'1'}})
  assert.ok(!retry.includes('fixture-token'))
  const ready = JSON.parse(retry)
  const state = JSON.parse(await readFile(join(ready.workspace,'.server.json'),'utf8'))
  t.after(()=>{try {process.kill(state.pid)} catch {}})
  assert.equal(ready.status,'ready')
  assert.equal(ready.sessions,3)
  assert.equal(ready.tokens,15)
  assert.deepEqual((await readFile(requests,'utf8')).split('').sort(),['0','1','2','2'])
  assert.ok(!(await readFile(join(ready.data,'manifest.json'),'utf8')).includes('fixture-token'))

  await rm(exports,{recursive:true})
  const cached = JSON.parse(run(process.execPath,args,{cwd}))
  assert.equal(cached.reused,true)
  assert.equal(cached.gallery,ready.gallery)
  assert.equal((await (await fetch(new URL('/data/vocabulary.json',cached.gallery))).json()).tokens,15)
})

test('an explicit manifest rejects unexpected hosts and unsafe filenames',async t=>{
  const cwd = await temporary(t)
  const path = join(cwd,'manifest.json')
  for (const [filename,export_url,expected] of [
    ['conversations-000.zip','https://example.com/export/test-batch/download/token',/Claude export page/],
    ['../conversations-000.zip','https://claude.ai/export/test-batch/download/token',/invalid filename/],
  ]) {
    await writeFile(path,JSON.stringify({total_files:1,data_files:[{filename,export_url}]}))
    const result = spawnSync(process.execPath,[runner,'--manifest='+path],{cwd,encoding:'utf8'})
    assert.equal(result.status,1)
    assert.match(result.stderr,expected)
  }
})
