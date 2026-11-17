import {readFile,writeFile,mkdir} from 'node:fs/promises'
import {fileURLToPath} from 'node:url'
import {build} from 'esbuild'

const root = new URL('../',import.meta.url)
const read = path=>readFile(new URL(path,root),'utf8')
const folder = new URL('skills/context-gallery/assets/app/',root)
await mkdir(folder,{recursive:true})
const fonts = await Promise.all([
  ['geist','Geist',400],['geist','Geist',600],['ibm-plex-mono','IBM Plex Mono',400],
].map(async([name,family,weight])=>{
  const bytes = await readFile(new URL('node_modules/@fontsource/'+name+'/files/'+name+'-latin-'+weight+'-normal.woff2',root))
  return '@font-face{font-family:"'+family+'";font-weight:'+weight+';src:url(data:font/woff2;base64,'+bytes.toString('base64')+') format("woff2");font-display:swap}'
}))
const licenses = await Promise.all(['geist','ibm-plex-mono'].map(name=>read('node_modules/@fontsource/'+name+'/LICENSE')))
const shared = {
  '/*FONTS*/':fonts.join('\n'),
  '/*GPU-STYLES*/':await read('src/gpu-exhibits.css'),
  '<!--FONTS-LICENSE-->':'<!-- Embedded font licenses\n'+licenses.join('\n')+'\n-->',
}
for (const [name,script] of [['gallery.html'],['word-pulse.html','word-pulse.js'],['search-filmstrip.html','search-filmstrip.js']]) {
  const values = {...shared}
  if (script) {
    const result = await build({entryPoints:[fileURLToPath(new URL('src/'+script,root))],bundle:true,format:'iife',minify:true,write:false,legalComments:'inline'})
    values['/*BUNDLE*/'] = result.outputFiles[0].text.replaceAll(/<\/script/gi,'<\\/script')
  }
  const template = (await read('src/'+name)).replace(/\/\*(?:FONTS|GPU-STYLES|BUNDLE)\*\/|<!--FONTS-LICENSE-->/g,key=>values[key])
  await writeFile(new URL(name==='gallery.html'?'index.html':name,folder),template)
}
const packageInfo = JSON.parse(await read('package.json'))
await writeFile(new URL('../runtime.json',folder),JSON.stringify({version:packageInfo.version,playwright:packageInfo.devDependencies['playwright-core']},null,2)+'\n')
console.log('Built reusable gallery templates without export data.')
