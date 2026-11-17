import { execFileSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { join, resolve } from 'node:path'
import { access, mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { fileURLToPath, pathToFileURL } from 'node:url'

const args = process.argv.slice(2)
const option = name => args.find(arg => arg.startsWith(name+'='))?.slice(name.length+1)
const dataDir = option('--data-dir')
const captureDir = option('--captures-dir')
if (!dataDir || !captureDir) throw new Error('Use --data-dir and --captures-dir')
const folder = pathToFileURL(resolve(captureDir)+'/')
const path = name => new URL(name, folder)
const requested = Number(args.find(arg => arg.startsWith('--limit='))?.split('=')[1] ?? 32)
if (!Number.isInteger(requested) || requested < 1) throw new Error('Use --limit with a positive integer')
const candidates = JSON.parse(await readFile(join(dataDir,'search-results.json'),'utf8'))
await mkdir(folder,{recursive:true,mode:0o700})

let previous
try {
  previous = JSON.parse(await readFile(path('manifest.json'),'utf8'))
} catch (error) {
  if (error.code !== 'ENOENT') throw error
  previous = {images:[], skipped:[]}
}
previous.eligible = candidates.length
const eligibleIds = new Set(candidates.map(item=>item.id))
previous.images = previous.images.filter(item=>eligibleIds.has(item.id))
previous.skipped = previous.skipped.filter(item=>eligibleIds.has(item.id))
const seen = new Set([...previous.images,...previous.skipped].map(item => item.id))
const start = candidates.filter(item => !seen.has(item.id))
function sample(items, limit) {
  if (items.length <= limit) return items
  const buckets = Array.from({length:limit},(_,i)=> items.slice(Math.floor(i*items.length/limit),Math.floor((i+1)*items.length/limit)))
  const hosts = new Map()
  return buckets.map(bucket => {
    const pick = bucket.reduce((best,item)=>(hosts.get(item.host)||0)<(hosts.get(best.host)||0) ? item : best,bucket[0])
    hosts.set(pick.host,(hosts.get(pick.host)||0)+1)
    return pick
  })
}
const queue = sample(start, requested)
if (!queue.length) {
  await writeFile(path('manifest.json'),JSON.stringify(previous,null,2)+'\n',{mode:0o600})
  console.log('All eligible pages have been attempted.')
  process.exit(0)
}
console.log('Attempting',queue.length,'of',start.length,'remaining eligible search results.')
// Keep optional browser dependencies and downloads in the writable workspace.
if (process.env.CHROME_BIN) await access(process.env.CHROME_BIN)
const cache = resolve(option('--cache-dir') || join(dataDir,'../.cache'))
const browserCache = join(cache,'browsers')
process.env.PLAYWRIGHT_BROWSERS_PATH = browserCache
await mkdir(cache,{recursive:true,mode:0o700})
const require = createRequire(join(cache,'package.json'))
let playwright
try {
  playwright = require('playwright-core')
} catch(error) {
  if (error.code!=='MODULE_NOT_FOUND') throw error
  const runtime = JSON.parse(await readFile(new URL('../assets/runtime.json',import.meta.url),'utf8'))
  execFileSync(process.platform==='win32'?'npm.cmd':'npm',[
    'install','--prefix',cache,'--no-audit','--no-fund','--ignore-scripts','playwright-core@'+runtime.playwright,
  ],{stdio:'inherit',timeout:120_000})
  playwright = require('playwright-core')
}
let executablePath = process.env.CHROME_BIN
if (!executablePath && process.platform==='darwin') {
  const chrome = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
  try {await access(chrome);executablePath=chrome} catch {}
}
if (!executablePath) {
  try {
    await access(playwright.chromium.executablePath())
  } catch {
    execFileSync(process.execPath,[require.resolve('playwright-core/cli'),'install','chromium'],{stdio:'inherit',timeout:180_000})
  }
}
const browser = await playwright.chromium.launch({executablePath})
const challenge = /^.{0,250}\b(?:just a moment|verify (?:that )?you are human|access denied|checking your browser|enable javascript and cookies)\b/is

function isPublicURL(raw) {
  const url = new URL(raw)
  return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password &&
    /\.[a-z][a-z0-9-]+$/i.test(url.hostname) && !/\.(?:local|localhost|internal|lan|test|home|invalid|onion)$/i.test(url.hostname)
}
async function capture(row) {
  const context = await browser.newContext({viewport:{width:1240,height:760},deviceScaleFactor:1,acceptDownloads:false,serviceWorkers:'block'})
  try {
    await context.route('**/*', route => {
      const request = route.request()
      if (!['GET','HEAD'].includes(request.method()) || !isPublicURL(request.url())) return route.abort()
      return route.continue()
    })
    const page = await context.newPage()
    const response = await page.goto(row.url,{waitUntil:'domcontentloaded',timeout:11_500})
    if (!response?.ok()) throw new Error('HTTP ' + (response?.status() || 'unavailable'))
    if (!response.headers()['content-type']?.includes('text/html')) throw new Error('Non-HTML response')
    const target = new URL(page.url())
    if (/\/(?:login|signin|sign-in|security-check|challenge)(?:\/|$)/i.test(target.pathname)) throw new Error('Sign-in or challenge page')
    await page.waitForLoadState('load',{timeout:1600}).catch(()=>{})
    const body = (await page.locator('body').innerText({timeout:1800})).trim()
    const title = await page.title()
    if (body.length < 40 || challenge.test(title) || challenge.test(body)) throw new Error('Blank page or browser challenge')
    const file = row.id + '.jpg'
    const image = await page.screenshot({type:'jpeg',quality:70,timeout:8500,animations:'disabled',caret:'hide'})
    await writeFile(path(file + '.part'),image,{mode:0o600})
    await rename(path(file + '.part'),path(file))
    return {image:{...row,title:row.title || title, file, captured:new Date().toISOString()}}
  } catch(error) {
    return {failure:{id:row.id,host:row.host,reason:String(error.message).split('\n')[0]
      .replace(/https?:\/\/[^\s]+/g,'[URL]').slice(0,130)}}
  } finally {
    await context.close()
  }
}

try {
  for (let i=0;i<queue.length;i+=5) {
    const outcomes = await Promise.all(queue.slice(i,i+5).map(capture))
    for (const {image,failure} of outcomes) {
      if (image) previous.images.push(image)
      else previous.skipped.push(failure)
      console.log(image ? 'Saved ' + image.host : 'Skipped ' + failure.host + ' · ' + failure.reason)
    }
    previous.images.sort((a,b)=>Date.parse(a.observed)-Date.parse(b.observed))
    await writeFile(path('manifest.json.part'),JSON.stringify(previous,null,2)+'\n',{mode:0o600})
    await rename(path('manifest.json.part'),path('manifest.json'))
  }
}finally{
  await browser.close()
}
console.log(previous.images.length,'stored screenshots;',previous.skipped.length,'skipped.')
