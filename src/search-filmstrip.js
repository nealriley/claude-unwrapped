import {fitCamera} from 'gpucanvas'
import {board,el,immersiveControls,motion,node,number,report} from './gpu-board.js'

const {images,attempted,eligible} = JSON.parse(el('dataset').textContent)
const date = new Intl.DateTimeFormat('en-GB',{dateStyle:'medium',timeStyle:'short',timeZone:'UTC'})
const field=el('field')
const list=el('frames')
const cover=el('film-cover')
const reel=new Map()
const width=1010
const height=660
let canvas
let selected=0
let playing=false
let timer
let cameraFrame=0
let paintFrame=0
let request=0
let requested=0
let loading=false
let shown=false
let outgoing

function bounds(index) {return {x:index*(width+46),y:0,width,height}}

function positionCover(camera) {
  for (const view of cover.children) {
    const x=(bounds(Number(view.dataset.frame)).x-camera.x)*camera.zoom
    view.style.transform='matrix('+camera.zoom+',0,0,'+camera.zoom+','+x+','+(-camera.y*camera.zoom)+')'
  }
}

function holdCover(indexes) {
  cancelAnimationFrame(paintFrame)
  if (canvas.mode!=='gpu') return
  // Keep decoded frames visible while GPUCanvas repaints after a camera move or resize.
  cover.replaceChildren(...[...indexes].map(index=>reel.get(index).preview))
  positionCover(canvas.getCamera())
  cover.hidden=false
}

function releaseAfterPaint() {
  if (cover.hidden) return
  const previousFrame=canvas.getStats().frames
  const deadline=performance.now()+1600
  function check(now) {
    const stats=canvas.getStats()
    const missing=stats.needs?.[0] || 0 // GPUCanvas lists missing snapshots first.
    if (stats.frames>previousFrame && stats.visible && stats.pending===0 &&
        (missing===0 || stats.rasterizedLastFrame>=missing)) {
      cover.hidden=true
      cover.replaceChildren()
    } else if (now<deadline) {
      paintFrame=requestAnimationFrame(check)
    }
  }
  paintFrame=requestAnimationFrame(check)
}

function moveCamera(animate=false) {
  cancelAnimationFrame(cameraFrame)
  cameraFrame=0
  if (!shown || !field.clientWidth || !field.clientHeight) return
  holdCover(visibleIndexes())
  const padding = field.clientWidth<550?11:24
  const target=fitCamera(bounds(selected),field.clientWidth,field.clientHeight,padding)
  if (!animate||motion.matches) {
    canvas.setCamera(target)
    releaseAfterPaint()
    return
  }
  const from=canvas.getCamera()
  const started=performance.now()
  function move(at) {
    const linear=Math.max(0,Math.min(1,(at-started)/430))
    const t=1-Math.pow(1-linear,3)
    canvas.setCamera({
      x:from.x+(target.x-from.x)*t,
      y:from.y+(target.y-from.y)*t,
      zoom:from.zoom+(target.zoom-from.zoom)*t,
    })
    if (linear<1) cameraFrame=requestAnimationFrame(move)
    else {
      cameraFrame=0
      releaseAfterPaint()
    }
  }
  cameraFrame=requestAnimationFrame(move)
}

function makeFrame(index) {
  const image=images[index]
  const view=node('div','frame-visual')
  const header=node('div','frame-bar')
  header.append(node('span','',image.host),node('span','',date.format(Date.parse(image.observed))+' UTC'))
  const img=node('img','')
  img.alt=image.title||image.host
  img.draggable=false
  img.src=image.src
  view.append(header,img)
  if (canvas.mode!=='gpu') return {view,ready:img.decode()}
  const preview=view.cloneNode(true)
  preview.dataset.frame=index
  preview.style.width=width+'px'
  preview.style.height=height+'px'
  return {view,preview,ready:Promise.all([img.decode(),preview.querySelector('img').decode()])}
}

function frameAt(index) {
  if (!reel.has(index)) reel.set(index,makeFrame(index))
  return reel.get(index)
}

function visibleIndexes() {
  return new Set([selected-1,selected,outgoing].filter(index=>index>=0 && reel.get(index)?.added))
}

function syncReel(from) {
  outgoing=from
  const range=new Set([selected-1,selected,from].filter(index=>index>=0 && reel.has(index)))
  for (const index of range) {
    const entry=reel.get(index)
    if (!entry.added && entry.decoded) {
      canvas.addNode(entry.view,bounds(index))
      entry.added=true
    }
  }
  for (const [i,entry] of reel) {
    if (!range.has(i) && i!==selected+1) {
      if (entry.added) canvas.removeNode(entry.view)
      reel.delete(i)
    }
  }
  for (const index of [selected-1,selected+1]) {
    if (index>=0 && index<images.length) {
      const neighbor=frameAt(index)
      neighbor.ready.then(()=>{neighbor.decoded=true},()=>{})
    }
  }
}

function updateControls() {
  el('play').textContent=playing?'Pause':'Play'
  el('previous').disabled=requested===0
  el('next').disabled=requested>=images.length-1
}

function render() {
  const image=images[selected]
  updateControls()
  el('seek').value=selected
  el('count').textContent=number.format(selected+1)+' / '+number.format(images.length)
  el('date').textContent=date.format(Date.parse(image.observed))+' UTC'
  el('current').textContent=image.title||image.host
  el('meta').textContent=image.host+' · Captured '+image.captured.slice(0,10)
  el('external').hidden=false
  el('external').href=image.url
  const previous=list.querySelector('[aria-current="true"]')
  previous?.removeAttribute('aria-current')
  const row=list.children[selected]
  row.setAttribute('aria-current','true')
  const listBox=list.getBoundingClientRect(), rowBox=row.getBoundingClientRect()
  if (rowBox.top<listBox.top || rowBox.bottom>listBox.bottom) list.scrollTop+=rowBox.top-listBox.top
}

function schedule() {
  clearTimeout(timer)
  if (!playing || loading || document.hidden) return
  timer=setTimeout(()=>{
    if (selected<images.length-1) go(selected+1)
    else {
      playing=false
      updateControls()
    }
  },Number(el('pace').value))
}

async function go(index) {
  if (index<0||index>=images.length) return
  const version=++request
  requested=index
  loading=true
  clearTimeout(timer)
  const entry=frameAt(index)
  try {
    await entry.ready
  } catch {
    if (version!==request) return
    loading=false
    requested=selected
    playing=false
    updateControls()
    el('surface-error').textContent='This saved screenshot could not be decoded.'
    el('surface-error').hidden=false
    return
  }
  if (version!==request) return
  entry.decoded=true
  const animate=shown && !cameraFrame && Math.abs(index-selected)===1
  const from=shown?selected:undefined
  selected=index
  shown=true
  loading=false
  el('surface-error').hidden=true
  syncReel(from)
  moveCamera(animate)
  render()
  schedule()
}

async function start() {
  el('capture-count').textContent=number.format(images.length)+' stored screenshots from '+number.format(attempted)+' attempts · '+number.format(eligible)+' eligible public search results'
  if (!images.length) {
    el('empty').hidden=false
    el('renderer').textContent='No local captures'
    el('seek').disabled=true
    return
  }
  canvas=await board(el('gpu'),{
    background:'#1c171e',atlasSize:3072,atlasLayers:3,pageSize:1024,
    onCameraChange:camera=>{if (!cover.hidden) positionCover(camera)},
  })
  for (const [index,image] of images.entries()) {
    const button=node('button','item')
    button.type='button'
    button.append(node('span','',image.title||image.host),node('small','',image.observed.slice(0,10)+' · '+image.host))
    button.addEventListener('click',()=>{playing=false;go(index)})
    list.append(button)
  }
  await go(0)
  for (const id of ['play','fit']) el(id).disabled=false
  el('seek').max=images.length-1
  el('play').addEventListener('click',()=>{
    playing=!playing
    if (playing&&selected===images.length-1&&images.length>1) go(0)
    else {updateControls();schedule()}
  })
  el('previous').addEventListener('click',()=>go(requested-1))
  el('next').addEventListener('click',()=>go(requested+1))
  el('fit').addEventListener('click',()=>moveCamera())
  el('seek').addEventListener('input',event=>go(Number(event.target.value)))
  el('pace').addEventListener('change',schedule)
  document.addEventListener('visibilitychange',schedule)
  const observer=new ResizeObserver(()=>moveCamera())
  observer.observe(field)
  addEventListener('pagehide',event=>{
    clearTimeout(timer)
    cancelAnimationFrame(cameraFrame)
    cancelAnimationFrame(paintFrame)
    cameraFrame=0
    if (!event.persisted) {
      request++
      observer.disconnect()
    }
  })
  addEventListener('pageshow',event=>{
    if (event.persisted) moveCamera()
    schedule()
  })
}
immersiveControls()
start().catch(report)
