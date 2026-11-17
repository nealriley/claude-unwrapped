import assert from 'node:assert/strict'
import {mkdtemp,mkdir,writeFile,readFile,rm} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {pathToFileURL} from 'node:url'
import {chromium} from 'playwright-core'
import {runner,fixture,run} from './helpers.mjs'

const temp = await mkdtemp(join(tmpdir(),'unwrapped-browser-'))
const source = fixture(temp)
const workspace = join(temp,'output')
const args = ['--mode=artifact','--export='+source,'--workspace='+workspace]
let browser
try {
  let result = JSON.parse(run(process.execPath,[runner,...args]))
  const executablePath = process.env.CHROME_BIN || (process.platform==='darwin'?'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome':undefined)
  browser = await chromium.launch({executablePath})
  const context = await browser.newContext({acceptDownloads:true,viewport:{width:1440,height:900}})
  const page = await context.newPage()
  await page.setContent('<body style="background:#254b51;color:white;font:30px sans-serif">Saved public result</body>')
  const captures = join(workspace,'captures')
  await mkdir(captures)
  const [row] = JSON.parse(await readFile(join(result.data,'search-results.json'),'utf8'))
  const image = {...row,file:row.id+'.jpg',captured:new Date().toISOString()}
  await page.screenshot({path:join(captures,image.file),type:'jpeg'})
  await writeFile(join(captures,'manifest.json'),JSON.stringify({images:[image],skipped:[],eligible:1}))
  result = JSON.parse(run(process.execPath,[runner,...args]))
  const extracted = join(temp,'extracted')
  run(process.env.PYTHON_BIN || 'python3',['-c','from zipfile import ZipFile; import sys; ZipFile(sys.argv[1]).extractall(sys.argv[2])',result.artifact,extracted])
  const gallery = pathToFileURL(join(extracted,'claude-unwrapped/index.html')).href
  const errors=[]
  page.on('pageerror',error=>errors.push(error.message))
  await context.setOffline(true)
  await page.goto(gallery)
  await page.getByRole('link',{name:/My AI Vocabulary/}).click()
  const frame = page.frameLocator('iframe')
  assert.equal(await frame.getByRole('slider',{name:'Camera speed'}).getAttribute('aria-valuetext'),'0.75×')
  const downloadEvent = page.waitForEvent('download')
  await frame.getByRole('button',{name:'Record',exact:true}).click()
  const video = await downloadEvent
  assert.match(video.suggestedFilename(),/\.(mp4|webm)$/)
  const saved = join(temp,video.suggestedFilename())
  await video.saveAs(saved)
  await writeFile(join(temp,'video-check.html'),'<video controls src="'+video.suggestedFilename()+'"></video>')
  const check = await context.newPage()
  await check.goto(pathToFileURL(join(temp,'video-check.html')).href)
  await check.waitForFunction(()=>document.querySelector('video').readyState>=1)
  const metadata = await check.locator('video').evaluate(video=>({width:video.videoWidth,height:video.videoHeight,duration:video.duration}))
  assert.equal(metadata.width,1080)
  assert.equal(metadata.height,1350)
  assert.ok(metadata.duration>=3)
  await check.close()
  await page.getByRole('link',{name:'← Gallery',exact:true}).click()
  await page.getByRole('link',{name:/Search Filmstrip/}).click()
  await page.frameLocator('iframe').getByRole('button',{name:'Play',exact:true}).waitFor({state:'visible'})
  const child = page.frames()[1]
  await child.waitForFunction(()=>!document.querySelector('#play').disabled)
  assert.equal(await child.locator('#surface-error').isHidden(),true)
  assert.ok((await child.locator('#capture-count').textContent()).startsWith('1 stored screenshot'))
  assert.deepEqual(errors,[])
  console.log('Verified offline file gallery, navigation, screenshot decoding, and playable '+metadata.width+' × '+metadata.height+' portrait video ('+metadata.duration.toFixed(2)+'s).')
} finally {
  if (browser) await browser.close()
  await rm(temp,{recursive:true,force:true})
}
