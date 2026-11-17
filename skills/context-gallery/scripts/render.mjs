import {mkdir,readFile,rename,writeFile} from 'node:fs/promises'
import {join} from 'node:path'
import {wordData} from './word-data.mjs'

const assets = new URL('../assets/app/',import.meta.url)
const inlineJson = value=>JSON.stringify(value).replaceAll('<','\\u003c')

export async function renderGallery(workspace,outDir,standalone) {
  const dataDir = join(workspace,'data')
  const sessions = JSON.parse(await readFile(join(dataDir,'sessions.json'),'utf8'))
  const words = wordData(sessions)
  const results = JSON.parse(await readFile(join(dataDir,'search-results.json'),'utf8'))
  const ids = new Set(results.map(item=>item.id))
  let captures
  try {
    captures = JSON.parse(await readFile(join(workspace,'captures/manifest.json'),'utf8'))
  } catch(error) {
    if (error.code!=='ENOENT') throw error
    captures = {images:[],skipped:[]}
  }
  const images = []
  const skipped = captures.skipped.filter(item=>ids.has(item.id))
  for (const image of captures.images.filter(item=>ids.has(item.id))) {
    if (!/^[a-f0-9]{16}\.jpg$/.test(image.file)) throw new Error('Invalid capture filename')
    try {
      const bytes = await readFile(join(workspace,'captures',image.file))
      images.push({...image,src:standalone?'data:image/jpeg;base64,'+bytes.toString('base64'):'../captures/'+image.file})
    } catch(error) {
      if (error.code!=='ENOENT') throw error
      skipped.push({id:image.id,host:image.host,reason:'Stored screenshot is missing'})
    }
  }
  const filmstrip = {images,eligible:results.length,attempted:images.length+skipped.length}
  await mkdir(outDir,{recursive:true,mode:0o700})
  for (const [name,value] of [['vocabulary.json',words],['filmstrip.json',filmstrip]]) {
    const temporary = join(dataDir,name+'.part')
    await writeFile(temporary,inlineJson(value),{mode:0o600})
    await rename(temporary,join(dataDir,name))
  }
  for (const [name,dataset] of [['index.html'],['word-pulse.html','vocabulary.json'],['search-filmstrip.html','filmstrip.json']]) {
    let html = await readFile(new URL(name,assets),'utf8')
    if (dataset) {
      if (standalone) {
        html = html.replace('/*DATA*/',()=>inlineJson(dataset==='vocabulary.json'?words:filmstrip))
      } else {
        html = html.replace('/*DATA*/','{}')
        // Delay the compiled application until its local JSON is available.
        html = html.replace('<script>','<script>fetch("../data/'+dataset+'").then(response=>{if(!response.ok)throw new Error("Could not load local data");return response.json()}).then(data=>{document.getElementById("dataset").textContent=JSON.stringify(data);')
        html = html.replace('</script>\n<!-- Embedded font licenses','}).catch(()=>{const message=document.getElementById("surface-error");message.textContent="Could not load local data. Run the skill again to restart the viewer.";message.hidden=false})</script>\n<!-- Embedded font licenses')
        html = html.replace("default-src 'none';","default-src 'none'; connect-src 'self';").replace('img-src data: blob:',"img-src 'self' data: blob:")
        if (name==='search-filmstrip.html') html = html.replace('are embedded for offline playback','are stored in your local captures folder')
      }
    }
    const temporary = join(outDir,name+'.part')
    await writeFile(temporary,html,{mode:0o600})
    await rename(temporary,join(outDir,name))
  }
  return {sessions:words.sessions.length,tokens:words.tokens,screenshots:images.length,eligible_search_results:results.length,skipped_captures:skipped.length}
}
