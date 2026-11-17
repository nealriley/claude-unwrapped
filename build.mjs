import {execFileSync} from 'node:child_process'
import {fileURLToPath} from 'node:url'
import {dirname,resolve} from 'node:path'
import './scripts/build-assets.mjs'
import {renderGallery} from './skills/context-gallery/scripts/render.mjs'

const args = process.argv.slice(2)
const option = name=>args.find(arg=>arg.startsWith(name+'='))?.slice(name.length+1)
const dataDir = option('--data-dir')
const outDir = option('--out-dir')
if (dataDir) {
  console.log(await renderGallery(dirname(resolve(dataDir)),resolve(outDir || '.'),args.includes('--standalone')))
} else if (args.includes('--standalone')) {
  const root = fileURLToPath(new URL('./',import.meta.url))
  execFileSync(process.execPath,[fileURLToPath(new URL('./scripts/prepare.mjs',import.meta.url)),'--mode=artifact','--export='+resolve(root,'..'),'--workspace='+resolve(outDir || root,'claude-context-art')],{stdio:'inherit'})
}
