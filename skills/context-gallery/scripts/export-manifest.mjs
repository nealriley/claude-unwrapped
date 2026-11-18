import {createHash} from 'node:crypto'
import {createWriteStream} from 'node:fs'
import {mkdir,readFile,readdir,rename,rm,stat} from 'node:fs/promises'
import {basename,join} from 'node:path'
import {Readable} from 'node:stream'
import {pipeline} from 'node:stream/promises'

const maxManifestSize = 1024*1024
const downloadPath = /^\/export\/([a-zA-Z0-9-]+)\/download\/[a-zA-Z0-9_-]+$/

function parseManifest(raw) {
  const manifest = JSON.parse(raw.replace(/^\uFEFF/,''))
  if (!Array.isArray(manifest?.data_files)) return null
  const files = manifest.data_files.map(entry=>{
    const {filename,export_url:link} = entry ?? {}
    if (typeof filename!=='string' || !/^[a-zA-Z0-9][a-zA-Z0-9_-]*\.zip$/.test(filename) || typeof link!=='string') {
      throw new Error('The Claude export manifest contains an invalid filename or download link.')
    }
    let url
    try {
      url = new URL(link.trim().match(/^\[[^\]]*\]\((https:\/\/[^\s)]+)\)$/)?.[1] ?? link.trim())
    } catch {
      throw new Error('The Claude export manifest contains an invalid download link.')
    }
    const match = url.pathname.match(downloadPath)
    if (url.origin!=='https://claude.ai' || url.username || url.password || !match) {
      throw new Error('Expected download links from the Claude export page.')
    }
    return {filename,url,batch:match[1]}
  })
  if (!files.length || files.length!==manifest.total_files || new Set(files.map(file=>file.filename)).size!==files.length ||
      new Set(files.map(file=>file.batch)).size!==1) {
    throw new Error('The Claude export manifest has an incomplete or inconsistent file list.')
  }
  return files
}

export async function readManifest(path) {
  const details = await stat(path)
  if (!details.isFile() || details.size>maxManifestSize) throw new Error('Expected a Claude export manifest JSON file.')
  const files = parseManifest(await readFile(path,'utf8'))
  if (!files) throw new Error('The JSON file does not contain a Claude export manifest.')
  return {path,files}
}

export async function findManifest(locations) {
  for (const location of new Set(locations)) {
    let entries
    try {
      entries = await readdir(location,{withFileTypes:true})
    } catch (error) {
      if (['ENOENT','ENOTDIR','EACCES','EPERM'].includes(error.code)) continue
      throw error
    }
    const candidates = await Promise.all(entries.filter(entry=>entry.isFile() && /\.json$/i.test(entry.name)).map(async entry=>{
      const path = join(location,entry.name)
      try {
        return {path,mtime:(await stat(path)).mtimeMs}
      } catch {
        return null
      }
    }))
    for (const {path} of candidates.filter(Boolean).sort((a,b)=>b.mtime-a.mtime)) {
      try {
        return await readManifest(path)
      } catch {
        // Other JSON files can share the user's Downloads folder.
      }
    }
  }
  return null
}

async function downloadPart(file,folder,verifyZip) {
  const target = join(folder,file.filename)
  if (verifyZip(target)) return true
  const temporary = target+'.part'
  const signal = AbortSignal.timeout(10*60_000)
  const response = await fetch(file.url,{signal,redirect:'manual'})
  if (response.status!==200 || !response.body) {
    await response.body?.cancel()
    return false
  }
  await rm(temporary,{force:true})
  try {
    await pipeline(Readable.fromWeb(response.body),createWriteStream(temporary,{flags:'wx',mode:0o600}),{signal})
    if (!verifyZip(temporary)) return false
    await rename(temporary,target)
    return true
  } finally {
    await rm(temporary,{force:true})
  }
}

export async function downloadExport(manifest,exports,verifyZip) {
  const {path,files} = manifest
  const id = createHash('sha256').update(files[0].batch).digest('hex').slice(0,16)
  const folder = join(exports,'import-'+id)
  await mkdir(folder,{recursive:true,mode:0o700})
  const pending = []
  for (let index=0;index<files.length;index+=3) {
    const batch = files.slice(index,index+3)
    const outcomes = await Promise.allSettled(batch.map(file=>downloadPart(file,folder,verifyZip)))
    outcomes.forEach((outcome,i)=>{
      if (outcome.status!=='fulfilled' || !outcome.value) pending.push(batch[i].filename)
    })
  }
  return {
    folder,
    archives:files.map(file=>join(folder,file.filename)),
    pending_files:pending,
    manifest:basename(path),
  }
}
