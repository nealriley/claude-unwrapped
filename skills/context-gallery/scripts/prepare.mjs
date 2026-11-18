#!/usr/bin/env node
import {spawn,spawnSync} from 'node:child_process'
import {mkdir,open,readFile,realpath,rm} from 'node:fs/promises'
import {closeSync,openSync} from 'node:fs'
import {homedir} from 'node:os'
import {basename,join,resolve} from 'node:path'
import {fileURLToPath} from 'node:url'
import {renderGallery} from './render.mjs'
import {downloadExport,findManifest,readManifest} from './export-manifest.mjs'

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

const settingsUrl = 'https://claude.ai/settings/privacy'
const helpUrl = 'https://support.claude.com/en/articles/9450526-export-your-claude-data'

function verifyZip(path) {
  const result = spawnSync(python,['-c','from zipfile import ZipFile; import sys; sys.exit(ZipFile(sys.argv[1]).testzip() is not None)',path],{stdio:'ignore'})
  if (result.error) throw result.error
  return result.status===0
}

async function existingData() {
  const data = join(workspace,'data')
  try {
    const read = async name=>JSON.parse(await readFile(join(data,name),'utf8'))
    const [manifest,sessions,search] = await Promise.all(['manifest.json','sessions.json','search-results.json'].map(read))
    if (manifest?.version===1 && Array.isArray(sessions) && sessions.length && Array.isArray(search)) {
      return {status:'reused',workspace,data,exports:join(workspace,'exports')}
    }
  } catch (error) {
    if (!(error instanceof SyntaxError) && error.code!=='ENOENT') throw error
  }
  return null
}

async function importData() {
  const importer = [join(skill,'scripts/import-export.py'),'--workspace',workspace]
  const source = option('--export')
  const manifestPath = option('--manifest')
  if (manifestPath && (source || mode!=='local')) throw new Error('Use --manifest in local mode without --export.')
  if (source) return JSON.parse(run(python,[...importer,'--export',resolve(source)]))

  const locations = [...new Set([join(workspace,'exports'),workspace,join(cwd,'exports'),cwd])]
  const search = folders=>JSON.parse(run(python,[...importer,...folders.flatMap(folder=>['--search',folder])]))
  if (mode!=='local') return search(locations)
  if (!manifestPath && !args.includes('--refresh')) {
    const cached = await existingData()
    if (cached) return cached
  }
  const downloads = join(homedir(),'Downloads')
  let manifest = manifestPath ? await readManifest(resolve(manifestPath)) : await findManifest(locations)
  if (!manifest) {
    const imported = search(locations)
    if (imported.status!=='missing') return imported
    manifest = await findManifest([downloads])
    if (!manifest) return search([downloads])
  }

  const batch = await downloadExport(manifest,join(workspace,'exports'),verifyZip)
  if (batch.pending_files.length) {
    return {
      status:'download_pending',workspace,exports:batch.folder,manifest:batch.manifest,pending_files:batch.pending_files,
      settings_url:settingsUrl,help_url:helpUrl,opened:shouldOpen?{folder:openTarget(batch.folder)}:undefined,
      message:'Use the original manifest to download the listed files in signed-in Chrome and save them in this folder. Request a new export if the links have expired.',
    }
  }
  for (const archive of batch.archives) importer.push('--archive',archive)
  return JSON.parse(run(python,importer))
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
  const result = await importData()
  if (result.status==='missing') {
    if (shouldOpen) result.opened = {folder:openTarget(result.exports),settings:openTarget(result.settings_url,true)}
    console.log(JSON.stringify(result,null,2))
  } else if (result.status==='download_pending') {
    console.log(JSON.stringify(result,null,2))
  } else {
    const reused = result.status==='reused'
    let captureStatus = 'Existing local captures reused'
    if (args.includes('--capture') || args.includes('--capture-on-import') && !reused) {
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
    Object.assign(result,counts,{status:'ready',mode,reused,capture_status:captureStatus})
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
