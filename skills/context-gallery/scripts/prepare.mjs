#!/usr/bin/env node
import {spawn,spawnSync} from 'node:child_process'
import {mkdir,open,readFile,realpath,rm} from 'node:fs/promises'
import {closeSync,openSync} from 'node:fs'
import {homedir} from 'node:os'
import {basename,join,resolve} from 'node:path'
import {fileURLToPath} from 'node:url'
import {renderGallery} from './render.mjs'

const skill = fileURLToPath(new URL('../',import.meta.url))
const args = process.argv.slice(2)
const option = name=>args.find(arg=>arg.startsWith(name+'='))?.slice(name.length+1)
const cwd = process.cwd()
let workspace = resolve(option('--workspace') || (basename(cwd)==='claude-context-art'?cwd:join(cwd,'claude-context-art')))
const mode = option('--mode') || 'local'
if (!['local','artifact'].includes(mode)) throw new Error('Use --mode=local or --mode=artifact')
const shouldOpen = mode==='local' && args.includes('--open')
const python = process.env.PYTHON_BIN || 'python3'

function run(command,argv,options={}) {
  const result = spawnSync(command,argv,{cwd:skill,encoding:'utf8',maxBuffer:80*1024*1024,env:{...process.env,PYTHONDONTWRITEBYTECODE:'1'},...options})
  if (result.error) throw result.error
  if (result.status!==0) throw new Error(result.stderr || result.stdout || command+' failed')
  return result.stdout
}

function openTarget(target,chrome=false) {
  let command,argv
  if (process.platform==='darwin') {
    command = 'open'
    argv = chrome?['-a','Google Chrome',target]:[target]
  } else if (process.platform==='win32') {
    command = 'explorer.exe'
    argv = [target]
  } else {
    command = 'xdg-open'
    argv = [target]
  }
  const result = spawnSync(command,argv,{stdio:'ignore'})
  return result.status===0 && !result.error
}

async function viewer() {
  const statePath = join(workspace,'.server.json')
  try {
    const state = JSON.parse(await readFile(statePath,'utf8'))
    const url = new URL(state.url)
    if (url.hostname!=='127.0.0.1' || url.protocol!=='http:') throw new Error('Invalid server address')
    const response = await fetch(url.origin+'/__context_gallery_status',{signal:AbortSignal.timeout(700)})
    if ((await response.json()).root===workspace) return state.url
  } catch {
    // A closed viewer is restarted on a fresh loopback port.
  }
  await rm(statePath,{force:true})
  const log = openSync(join(workspace,'.server.log'),'a',0o600)
  const child = spawn(process.execPath,[join(skill,'scripts/serve.mjs'),workspace],{detached:true,stdio:['ignore',log,log]})
  closeSync(log)
  child.unref()
  for (let attempt=0;attempt<40;attempt++) {
    await new Promise(done=>setTimeout(done,100))
    try {
      const state = JSON.parse(await readFile(statePath,'utf8'))
      return state.url
    } catch {}
  }
  throw new Error('The local viewer could not start. See '+join(workspace,'.server.log'))
}

await mkdir(workspace,{recursive:true,mode:0o700})
workspace = await realpath(workspace)
const lockPath = join(workspace,'.prepare.lock')
let lock
try {
  try {
    lock = await open(lockPath,'wx',0o600)
    await lock.writeFile(String(process.pid))
  } catch (error) {
    if (error.code!=='EEXIST') throw error
    const pid = Number(await readFile(lockPath,'utf8'))
    try {process.kill(pid,0)} catch (check) {
      if (check.code!=='ESRCH') throw check
      await rm(lockPath)
      lock = await open(lockPath,'wx',0o600)
      await lock.writeFile(String(process.pid))
    }
    if (!lock) throw new Error('Another import is running in '+workspace)
  }
  const importer = [join(skill,'scripts/import-export.py'),'--workspace',workspace]
  const source = option('--export')
  if (source) importer.push('--export',resolve(source))
  else {
    for (const location of (mode==='artifact'?[join(cwd,'exports'),cwd]:[join(cwd,'exports'),cwd,join(homedir(),'Downloads')])) importer.push('--search',location)
  }
  const result = JSON.parse(run(python,importer))
  if (result.status==='missing') {
    if (shouldOpen) result.opened = {folder:openTarget(result.exports),settings:openTarget(result.settings_url,true)}
    console.log(JSON.stringify(result,null,2))
  } else {
    let captureStatus = 'Existing local captures reused'
    if (args.includes('--capture')) {
      try {
        process.stderr.write(run(process.execPath,[join(skill,'scripts/capture-search.mjs'),'--data-dir='+result.data,'--captures-dir='+join(workspace,'captures'),'--limit='+(option('--limit') || '32'),'--cache-dir='+join(workspace,'.cache')]))
        captureStatus = 'Capture pass completed'
      } catch (error) {
        captureStatus = 'Capture pass failed. '+error.message.split('\n')[0]
        process.stderr.write(captureStatus+'\n')
      }
    }
    const outputDir = join(workspace,mode==='artifact'?'gallery':'experiences')
    const counts = await renderGallery(workspace,outputDir,mode==='artifact')
    Object.assign(result,counts,{status:'ready',mode,capture_status:captureStatus})
    if (mode==='artifact') {
      result.artifact = run(python,[join(skill,'scripts/archive-gallery.py'),workspace]).trim()
      result.entrypoint = 'claude-unwrapped/index.html'
      result.gallery = join(outputDir,'index.html')
    } else {
      const url = await viewer()
      result.gallery = url+'/experiences/index.html'
      result.vocabulary = result.gallery+'#my-ai-vocabulary'
      result.filmstrip = result.gallery+'#search-filmstrip'
      if (shouldOpen) result.opened = openTarget(result.gallery,true)
    }
    console.log(JSON.stringify(result,null,2))
  }
} catch (error) {
  console.error(error.message)
  process.exitCode = 1
} finally {
  if (lock) {
    await lock.close()
    await rm(lockPath,{force:true})
  }
}
