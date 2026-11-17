import { execFileSync } from 'node:child_process'
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { build } from 'esbuild'
import { wordData } from './src/word-data.mjs'

const here = new URL('./', import.meta.url)
const args = process.argv.slice(2)
const option = name => args.find(arg => arg.startsWith(name+'='))?.slice(name.length+1)
const dataDir = option('--data-dir')
const outputDir = option('--out-dir')
const output = outputDir ? pathToFileURL(outputDir.replace(/\/$/,'')+'/') : here
await mkdir(output,{recursive:true,mode:0o700})
const local = path => fileURLToPath(new URL(path, here))
const text = path => readFile(local(path), 'utf8')
const fonts = [
  ['geist', 'Geist', 400],
  ['geist', 'Geist', 600],
  ['ibm-plex-mono', 'IBM Plex Mono', 400],
]
const fontRules = await Promise.all(fonts.map(async ([packageName, family, weight]) => {
  const path = 'node_modules/@fontsource/' + packageName + '/files/' + packageName + '-latin-' + weight + '-normal.woff2'
  const font = (await readFile(local(path))).toString('base64')
  return '@font-face{font-family:"' + family + '";font-weight:' + weight + ';src:url(data:font/woff2;base64,' + font + ') format("woff2");font-display:swap}'
}))
const fontLicenses = await Promise.all(['geist', 'ibm-plex-mono'].map(name => text('node_modules/@fontsource/' + name + '/LICENSE')))
async function bundle(script) {
  const result = await build({
    entryPoints: [local(script)], bundle: true, format: 'iife', minify: true,
    write: false, legalComments: 'inline',
  })
  return result.outputFiles[0].text.replaceAll(/<\/script/gi, '<\\/script')
}

function extract(script) {
  return execFileSync('python3', [local(script), local('../')], {
    encoding: 'utf8', maxBuffer: 80 * 1024 * 1024,
  }).trim()
}

const transcriptData = dataDir ? await readFile(dataDir+'/sessions.json','utf8') : extract('src/extract-transcripts.py')
const sessions = JSON.parse(transcriptData)
const words = wordData(sessions)
let captures
try {
  captures = JSON.parse(await readFile(dataDir ? dataDir+'/../captures/manifest.json' : local('captures/manifest.json'),'utf8'))
} catch (error) {
  if (error.code !== 'ENOENT') throw error
  captures = {images:[],skipped:[]}
}
if (dataDir) {
  const results = JSON.parse(await readFile(dataDir+'/search-results.json','utf8'))
  const ids = new Set(results.map(item=>item.id))
  captures.images = captures.images.filter(item=>ids.has(item.id))
  captures.skipped = captures.skipped.filter(item=>ids.has(item.id))
  captures.eligible = results.length
}
const screenshots = await Promise.all(captures.images.map(async image => {
  if (!/^[a-f0-9]{16}\.jpg$/.test(image.file)) throw new Error('Invalid capture filename')
  if (dataDir) return {...image,src:'../captures/'+image.file}
  const jpeg = await readFile(local('captures/' + image.file))
  return {...image,src:'data:image/jpeg;base64,'+jpeg.toString('base64')}
}))
const filmstrip = {
  images:screenshots,
  eligible:captures.eligible || 0,
  attempted:captures.images.length+captures.skipped.length,
}
const inlineJson = value => JSON.stringify(value).replaceAll('<','\\u003c')
const substitutions = {
  '/*FONTS*/': fontRules.join('\n'),
  '/*AVATARS*/': await text('src/avatars.css'),
  '/*GPU-STYLES*/': await text('src/gpu-exhibits.css'),
  '<!--FONTS-LICENSE-->': '<!-- Embedded font licenses\n' + fontLicenses.join('\n') + '\n-->',
}
const exhibits = [
  ['src/gallery.html', 'index.html'],
  ['src/word-pulse.html', 'word-pulse.html', 'src/word-pulse.js', inlineJson(words)],
  ['src/search-filmstrip.html', 'search-filmstrip.html', 'src/search-filmstrip.js', inlineJson(filmstrip)],
]
for (const [source, target, script, data] of exhibits) {
  const template = await text(source)
  const values = {...substitutions}
  if (script) {
    const bundled = await bundle(script)
    if (dataDir) {
      const name = target==='word-pulse.html'?'vocabulary.json':'filmstrip.json'
      await writeFile(dataDir+'/'+name,target==='word-pulse.html'?inlineJson(words):inlineJson(filmstrip),{mode:0o600})
      values['/*DATA*/'] = '{}'
      values['/*BUNDLE*/'] = 'fetch("../data/'+name+'").then(response=>{if(!response.ok)throw new Error("Could not load local data");return response.json()}).then(data=>{document.getElementById("dataset").textContent=JSON.stringify(data);'+bundled+'}).catch(()=>{const error=document.getElementById("surface-error");error.textContent="Could not load local data. Run the skill again to start the local viewer.";error.hidden=false})'
    } else {
      values['/*BUNDLE*/'] = bundled
      values['/*DATA*/'] = data
    }
  }
  let html = template.replace(/\/\*(?:FONTS|AVATARS|GPU-STYLES|BUNDLE|DATA)\*\/|<!--FONTS-LICENSE-->/g, key => values[key])
  if (dataDir) {
    html = html.replace("default-src 'none';","default-src 'none'; connect-src 'self';").replace('img-src data: blob:','img-src \'self\' data: blob:')
    if (target==='index.html') html = html.replaceAll('href="docs/','href="../docs/')
    if (target==='search-filmstrip.html') html = html.replace('The JPEGs show the pages at capture time and are embedded for offline playback.','The JPEGs show the pages at capture time and are stored in your local captures folder.')
  }
  const destination = new URL(target,output)
  const temporary = new URL(target+'.part',output)
  await writeFile(temporary, html, {mode: 0o600})
  await rename(temporary,destination)
}
const turns = sessions.reduce((n, session) => n + session.turns.length, 0)
console.log('Built gallery and two experiences from '+turns+' dialogue turns.')
console.log('My AI Vocabulary · ' + words.sessions.length + ' sessions, ' + words.tokens + ' words and ' + words.vocabulary.length + ' unique words. Search Filmstrip · ' + screenshots.length + ' screenshots.')
