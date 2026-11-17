import {board,el,motion,number,report} from './gpu-board.js'
import {cell,createSpiral} from './tile-spiral.js'
import {createStream} from './vocabulary-stream.js'
import {createFollowCamera} from './vocabulary-follow.js'

const {vocabulary,sessions,tokens} = JSON.parse(el('dataset').textContent)
const dictionary = new Map(vocabulary.map((word,id)=>[word,id]))
const field = el('field')
const raster = el('tiles')
const ctx = raster.getContext('2d')
const record = el('record')
const recordStatus = el('record-status')
const download = el('download')
const recordingFormat = typeof MediaRecorder==='function' && typeof raster.captureStream==='function'
  ? ['video/mp4;codecs=avc1.420028','video/mp4;codecs=avc1','video/webm;codecs=vp8'].find(type=>MediaRecorder.isTypeSupported(type))
  : undefined
const cameraButtons = [...document.querySelectorAll('[data-mode]')]
const wordRates = [1,3,5,8,13,21,34]
const cameraRates = [.25,.5,.75,1,1.5,2,3]
const baseCameraRate = .5
const openingWords = ['your','agent','vocabulary']
const openingBeat = 320
const openingTotal = openingBeat*(openingWords.length-1)+2000
const palette = {
  you:{fill:'#315f4b',edge:'#83b992',ink:'#ecffec'},
  claude:{fill:'#774443',edge:'#c8877c',ink:'#ffefe9'},
  both:{fill:'#4e5c84',edge:'#8f9cc5',ink:'#eef1ff'},
}
const flash = {
  you:{
    new:{fill:'#b4e7a2',edge:'#e1ffc9',ink:'#193421'},
    repeat:{fill:'#78dfb9',edge:'#bbffe5',ink:'#10392b'},
  },
  claude:{
    new:{fill:'#ffae9e',edge:'#ffdfd4',ink:'#421d1d'},
    repeat:{fill:'#f482ae',edge:'#ffd2e7',ink:'#451c35'},
  },
  both:{new:{fill:'#d4dcfa',edge:'#eef1ff',ink:'#212b48'}},
}
const backgrounds = {both:'#172930',you:'#192c29',claude:'#30252b'}
const flashDuration = 410
const followWidth = 16*cell
const labelSize = 15
const readableZoom = 11/labelSize
const follower = createFollowCamera()
let spiral = createSpiral()
let stream = createStream(sessions)
const tiles = new Map()
const placed = []
let canvas
let stageWidth = 0
let stageHeight = 0
let phase = 'ready'
let playing = false
let openingTime = 0
let openingCount = 0
let scanned = 0
let latestTile
let speaker = 'both'
let selected
let activeUntil = 0
let frame = 0
let lastFrame = 0
let lastDraw = 0
let credit = 0
let mode = 'follow'
let cameraSpeed
let wordSpeed = 3
let followRequested = false
let following = false
let followMoving = false
let goal
let zoomFactor = 1
let wanderTime = 0
let wanderTile
let pointer
let recording
let downloadUrl

function tileShape(word) {
  const letters = Array.from(word)
  const label = letters.length<=56 ? word : letters.slice(0,55).join('')+'…'
  return {label,span:Math.ceil((label.length*8.8+23)/cell)}
}

function placeTile(id,word) {
  const {label,span} = tileShape(word)
  const tile = {id,label,you:0,claude:0,kind:'new',pulseAt:-Infinity}
  spiral.place(tile,span)
  placed.push(tile)
  return tile
}

function pulse(tile,time,kind,actor) {
  tile.pulseAt = time
  tile.kind = kind
  tile.actor = actor
  activeUntil = time+flashDuration
}

function setSpeaker(actor) {
  if (actor===speaker) return
  speaker = actor
  document.documentElement.dataset.speaker = actor
}

function scan(limit,time) {
  let processed = 0
  while (processed<limit) {
    const event = stream.next(el('shuffle').checked)
    if (!event) {
      phase = 'complete'
      playing = false
      break
    }
    let tile = tiles.get(event.id)
    const kind = tile ? 'repeat' : 'new'
    if (!tile) {
      tile = placeTile(event.id,vocabulary[event.id])
      tiles.set(event.id,tile)
    }
    const actor = event.assistant ? 'claude' : 'you'
    if (event.assistant) tile.claude++
    else tile.you++
    if (actor!==tile.actor || kind!==tile.kind || time-tile.pulseAt>=280) pulse(tile,time,kind,actor)
    latestTile = tile
    setSpeaker(actor)
    scanned++
    processed++
  }
  if (scanned===tokens) {
    phase = 'complete'
    playing = false
  }
  if (mode==='follow') aimFollow()
}

function centerOf(camera) {
  return {x:camera.x+stageWidth/(2*camera.zoom),y:camera.y+stageHeight/(2*camera.zoom)}
}

function boardCenter() {
  const bounds = spiral.bounds()
  return {x:bounds.x+bounds.width/2,y:bounds.y+bounds.height/2}
}

function at(point,zoom) {
  return {x:point.x-stageWidth/(2*zoom),y:point.y-stageHeight/(2*zoom),zoom}
}

function frameForBoard() {
  const extent = spiral.bounds(1)
  const view = Math.max(4*cell,extent.width+2*cell)
  return {extent,view}
}

function followLimits() {
  const rest = Math.max(readableZoom*1.3,stageWidth/(11*cell))*zoomFactor
  return {rest,floor:Math.min(readableZoom,rest)}
}

function forecast() {
  const upcoming = stream.peek(4)
  const newWords = [...new Set(upcoming.filter(id=>!tiles.has(id)))]
  const locations = spiral.preview(newWords.map(id=>tileShape(vocabulary[id]).span))
  const future = new Map(newWords.map((id,i)=>[id,locations[i]]))
  return upcoming.map(id=>tiles.get(id)||future.get(id))
}

function aimFollow() {
  if (!stageWidth || !stageHeight) return
  const {extent,view} = frameForBoard()
  const limits = followLimits()
  const growthLimit = Math.min(followWidth,stageWidth*zoomFactor/limits.floor)
  if (latestTile && (following || followRequested || view>=growthLimit)) {
    following = true
    followMoving = true
    goal = undefined
    follower.observe(canvas.getCamera(),{width:stageWidth,height:stageHeight},latestTile,forecast(),limits)
  } else {
    const point = {x:extent.x+extent.width/2,y:extent.y+extent.height/2}
    goal = at(point,Math.max(limits.floor,stageWidth/view*zoomFactor))
  }
}

function chooseWander() {
  if (!placed.length || !stageWidth) return
  wanderTime = 2850
  let index = Math.floor(Math.random()*placed.length)
  if (placed.length>1 && placed[index]===wanderTile) index = (index+1)%placed.length
  wanderTile = placed[index]
  const point = {x:wanderTile.x+wanderTile.width/2,y:wanderTile.y+wanderTile.height/2}
  goal = at(point,Math.max(readableZoom,stageWidth/12/cell)*zoomFactor)
}

function setMode(next,recenter=true) {
  if (mode!==next) {
    follower.reset()
    following = followMoving = false
    goal = undefined
  }
  mode = next
  for (const button of cameraButtons) button.setAttribute('aria-pressed', String(button.dataset.mode===mode))
  if (mode==='center') {
    goal = undefined
    const {view} = frameForBoard()
    if (recenter && stageWidth) canvas.setCamera(at(boardCenter(),stageWidth/view*zoomFactor))
  } else if (mode==='follow') aimFollow()
  else chooseWander()
  nextPaint()
}

function changeZoom(factor) {
  const current = canvas.getCamera()
  const next = Math.min(4,Math.max(.25,zoomFactor*factor))
  const zoom = current.zoom*next/zoomFactor
  zoomFactor = next
  goal = undefined
  follower.reset()
  followMoving = false
  canvas.setCamera(at(centerOf(current),zoom))
}

function trackCamera(delta) {
  if (mode==='follow' && following) {
    const next = follower.advance(canvas.getCamera(),delta,{width:stageWidth,height:stageHeight},followLimits(),motion.matches,cameraSpeed)
    followMoving = Boolean(next)
    if (next) canvas.setCamera(next)
    return
  }
  if (mode==='wander' && (wanderTime-=delta*cameraSpeed)<=0) chooseWander()
  if (!goal) return
  const current = canvas.getCamera()
  const point = centerOf(current)
  const target = centerOf(goal)
  const distance = Math.hypot(point.x-target.x,point.y-target.y)*current.zoom
  const zoomChange = Math.abs(1-current.zoom/goal.zoom)
  if (motion.matches || distance<.65 && zoomChange<.001) {
    canvas.setCamera(goal)
    goal = undefined
    return
  }
  const rate = 1-Math.exp(-Math.max(delta,8)*cameraSpeed/(mode==='wander'?570:175))
  const softened = {x:point.x+(target.x-point.x)*rate,y:point.y+(target.y-point.y)*rate}
  const zoom = current.zoom*Math.pow(goal.zoom/current.zoom,rate)
  canvas.setCamera(at(softened,zoom))
}

function resize() {
  const oldWidth = stageWidth
  const point = oldWidth ? centerOf(canvas.getCamera()) : boardCenter()
  const zoom = canvas.getCamera().zoom
  stageWidth = field.clientWidth
  stageHeight = field.clientHeight
  if (!stageWidth || !stageHeight) return
  ctx.setTransform(raster.width/stageWidth,0,0,raster.height/stageHeight,0,0)
  if (mode==='follow') {
    if (following && oldWidth) {
      follower.reset()
      canvas.setCamera(at(point,Math.max(followLimits().floor,zoom*stageWidth/oldWidth)))
    }
    aimFollow()
    if (goal) {
      canvas.setCamera(goal)
      goal = undefined
    } else if (followMoving) nextPaint()
  } else {
    goal = undefined
    canvas.setCamera(at(point,oldWidth?zoom*stageWidth/oldWidth:stageWidth/(4*cell)))
  }
  draw(performance.now())
}
function draw(time) {
  if (!canvas || !stageWidth || !stageHeight) return
  const camera = canvas.getCamera()
  const {x,y,zoom} = camera
  ctx.fillStyle = backgrounds[speaker]
  ctx.fillRect(0,0,stageWidth,stageHeight)
  ctx.textBaseline = 'middle'
  ctx.textAlign = 'center'
  const fontSize = labelSize*zoom
  ctx.font = '600 '+fontSize+'px "IBM Plex Mono", monospace'
  for (const tile of spiral.visible(camera,stageWidth,stageHeight)) {
    const left = (tile.x-x)*zoom
    const top = (tile.y-y)*zoom
    const width = Math.max(1,tile.width*zoom)
    const height = Math.max(1,tile.height*zoom)
    const base = palette[tile.claude && !tile.you ? 'claude' : tile.you && !tile.claude ? 'you' : 'both']
    const age = time-tile.pulseAt
    const glow = motion.matches ? 0 : Math.max(0,1-Math.max(0,age)/flashDuration)
    const active = flash[tile.actor][tile.kind]
    ctx.fillStyle = base.fill
    ctx.fillRect(left,top,width,height)
    if (glow) {
      ctx.fillStyle = active.fill
      ctx.globalAlpha = glow
      ctx.fillRect(left,top,width,height)
      ctx.globalAlpha = 1
    }
    if (zoom >= .32 || tile.id === selected || glow > .25) {
      ctx.strokeStyle = tile.id === selected ? '#fff8da' : glow > .25 ? active.edge : base.edge
      ctx.lineWidth = tile.id === selected ? 2 : 1
      ctx.strokeRect(left+.5,top+.5,Math.max(0,width-1),Math.max(0,height-1))
    }
    if (fontSize >= 4.5 && width>8) {
      ctx.fillStyle = glow > .68 ? active.ink : base.ink
      ctx.fillText(tile.label,left+width/2,top+height/2,Math.max(1,width-9*zoom))
    }
  }
}

function refresh(time) {
  const opening = el('play')
  opening.hidden = phase!=='ready' && phase!=='complete'
  opening.setAttribute('aria-label',phase==='complete'?'Replay My AI Vocabulary':'Play My AI Vocabulary')
  const transport = el('transport')
  transport.hidden = phase==='ready' || phase==='complete'
  transport.textContent = playing ? (recording?.media.state==='recording' ? 'Pause & download' : 'Pause') : 'Resume'
  el('step').disabled = phase!=='session' || playing
  el('progress').textContent = number.format(scanned)+' / '+number.format(tokens)+' words · '+number.format(tiles.size)+' tiles'
  const tile = tiles.get(selected)
  el('word-name').textContent = tile ? vocabulary[tile.id] : 'Select a tile'
  el('word-detail').textContent = tile ? 'You · '+number.format(tile.you)+'  |  Claude · '+number.format(tile.claude) : ''
  draw(time)
}

function revealOpening(time) {
  const count = Math.min(openingWords.length,1+Math.floor(openingTime/openingBeat))
  if (count===openingCount) return false
  while (openingCount<count) {
    const tile = placeTile('opening-'+openingCount,openingWords[openingCount])
    pulse(tile,time,'new','both')
    openingCount++
  }
  if (mode==='follow') aimFollow()
  return true
}

function nextPaint() {
  if (!frame) frame = requestAnimationFrame(animate)
}

function animate(time) {
  frame = 0
  if (phase==='complete') stopRecording()
  const delta = lastFrame ? Math.min(time-lastFrame,120) : 0
  lastFrame = time
  let changed = false
  if (playing && phase==='opening') {
    openingTime+=delta
    changed = revealOpening(time)
    if (openingTime>=openingTotal) {
      phase = 'session'
      scan(1,time)
      changed = true
    }
  } else if (playing && phase==='session') {
    credit+=delta*wordSpeed/1000
    const batch = Math.floor(credit)
    if (batch) {
      credit-=batch
      scan(batch,time)
      changed = true
    }
  }

  trackCamera(delta)
  if (changed) {
    refresh(time)
    lastDraw = time
  } else if (recording?.media.state==='recording' || lastDraw<activeUntil && (time-lastDraw>32 || time>=activeUntil)) {
    draw(time)
    lastDraw = time
  }
  if (playing || recording?.media.state==='recording' || goal || followMoving || mode==='wander' && placed.length || time<activeUntil && !motion.matches) nextPaint()
  else lastFrame = 0
}

function clearPlayback() {
  stopRecording()
  playing = false
  phase = 'ready'
  stream = createStream(sessions)
  spiral = createSpiral()
  tiles.clear()
  placed.length = 0
  latestTile = selected = wanderTile = undefined
  openingCount = openingTime = credit = scanned = activeUntil = 0
  setSpeaker('both')
  zoomFactor = 1
  followRequested = false
  following = followMoving = false
  follower.reset()
  el('find-status').textContent = ''
  setMode('follow')
  if (goal) {
    canvas.setCamera(goal)
    goal = undefined
  }
  refresh(performance.now())
}

function begin() {
  if (phase==='complete') clearPlayback()
  phase = 'opening'
  playing = true
  lastFrame = 0
  const time = performance.now()
  revealOpening(time)
  refresh(time)
  el('transport').focus({preventScroll:true})
  nextPaint()
}

function togglePlayback() {
  if (phase==='ready' || phase==='complete') {
    begin()
    return
  }
  playing = !playing
  if (!playing) stopRecording()
  lastFrame = 0
  refresh(performance.now())
  if (playing) nextPaint()
}

function showRecordingStatus(message,active=false) {
  el('recording-note').hidden = false
  recordStatus.textContent = message
  recordStatus.dataset.recording = String(active)
}

function startRecording() {
  if (!recordingFormat || recording) return
  if (phase==='complete') clearPlayback()
  let capture
  try {
    capture = raster.captureStream(30)
    const media = new MediaRecorder(capture,{mimeType:recordingFormat,videoBitsPerSecond:6_000_000})
    const session = {media,autoDownload:true,failed:false}
    const chunks = []
    media.addEventListener('dataavailable',event=>{
      if (event.data.size) chunks.push(event.data)
    })
    media.addEventListener('error',()=>{
      session.failed = true
    })
    media.addEventListener('stop',()=>{
      capture.getTracks().forEach(track=>track.stop())
      recording = undefined
      record.disabled = false
      if (session.failed || !chunks.length) {
        showRecordingStatus(session.failed ? 'Recording failed. Try again.' : 'No video was captured. Record for a moment and try again.')
      } else {
        const mimeType = chunks[0].type || recordingFormat
        const extension = mimeType.startsWith('video/mp4') ? 'mp4' : 'webm'
        if (downloadUrl) URL.revokeObjectURL(downloadUrl)
        downloadUrl = URL.createObjectURL(new Blob(chunks,{type:mimeType}))
        download.href = downloadUrl
        download.download = 'my-ai-vocabulary-'+new Date().toISOString().replaceAll(':','-').slice(0,19)+'.'+extension
        download.textContent = 'Download '+extension.toUpperCase()
        download.hidden = false
        showRecordingStatus(extension==='mp4' ? 'Recording ready' : 'WebM ready · use Chrome for MP4')
        if (session.autoDownload) download.click()
      }
      record.textContent = 'Record'
      refresh(performance.now())
    },{once:true})
    media.start(1000)
    recording = session
  } catch {
    capture?.getTracks().forEach(track=>track.stop())
    showRecordingStatus('Could not start recording. Try again.')
    return
  }
  download.hidden = true
  record.disabled = true
  record.textContent = 'Recording'
  showRecordingStatus('● Recording '+(recordingFormat.startsWith('video/mp4')?'MP4':'WebM'),true)
  if (playing) refresh(performance.now())
  else togglePlayback()
}

function stopRecording(autoDownload=true) {
  if (!recording) return
  recording.autoDownload &&= autoDownload
  if (recording.media.state==='inactive') return
  recording.media.stop()
  showRecordingStatus('Saving video…')
}

function bindRate(id,output,rates,format,apply) {
  const input = el(id)
  function update() {
    const rate = rates[input.valueAsNumber]
    const label = format(rate)
    el(output).value = label
    input.setAttribute('aria-valuetext',label)
    apply(rate)
  }
  input.addEventListener('input',update)
  update()
}

function focusTile(tile) {
  selected = tile.id
  refresh(performance.now())
}

async function start() {
  if (!ctx) throw new Error('Canvas 2D is unavailable')
  canvas = await board(el('gpu'),{background:'#172930',atlasSize:512,atlasLayers:2,onCameraChange:()=>draw(performance.now())})
  const observer = new ResizeObserver(resize)
  observer.observe(field)
  addEventListener('pagehide',event=>{
    cancelAnimationFrame(frame)
    frame = 0
    playing = false
    lastFrame = 0
    stopRecording(false)
    if (!event.persisted) observer.disconnect()
  })
  addEventListener('pageshow',event=>{
    if (!event.persisted) return
    resize()
    refresh(performance.now())
    nextPaint()
  })
  document.fonts.ready.then(()=>draw(performance.now()))
  for (const id of ['play','reset','zoom-out','zoom-in']) el(id).disabled = false
  for (const button of cameraButtons) {
    button.disabled = false
    button.addEventListener('click',()=>{
      if (button.dataset.mode==='follow') followRequested = true
      setMode(button.dataset.mode)
    })
  }
  bindRate('speed','word-rate',wordRates,rate=>rate+(rate===1?' word/s':' words/s'),rate=>{wordSpeed = rate})
  bindRate('camera-speed','camera-rate',cameraRates,rate=>rate+'×',rate=>{cameraSpeed = baseCameraRate*rate})
  record.disabled = !recordingFormat
  if (!recordingFormat) showRecordingStatus('Video recording is unavailable in this browser.')
  record.addEventListener('click',startRecording)
  el('play').addEventListener('click',begin)
  el('transport').addEventListener('click',togglePlayback)
  el('reset').addEventListener('click',clearPlayback)
  el('step').addEventListener('click',()=>{
    if (phase!=='session' || playing) return
    scan(1,performance.now())
    refresh(performance.now())
    nextPaint()
  })
  el('zoom-out').addEventListener('click',()=>changeZoom(1/1.3))
  el('zoom-in').addEventListener('click',()=>changeZoom(1.3))
  const fullscreen = el('fullscreen')
  fullscreen.hidden = !document.fullscreenEnabled
  fullscreen.addEventListener('click',()=>{
    const action = document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen()
    action.catch(()=>{fullscreen.title='Full screen is unavailable in this browser'})
  })
  document.addEventListener('fullscreenchange',()=>{
    fullscreen.textContent = document.fullscreenElement?'Exit full screen':'Full screen'
  })
  el('find-form').addEventListener('submit',event=>{
    event.preventDefault()
    const term = el('find').value.trim().normalize('NFKC').toLowerCase().replaceAll('’',"'")
    const id = dictionary.get(term)
    const tile = tiles.get(id)
    el('find-status').textContent = tile || !term ? '' : id==null ? 'No exact match in the export.' : 'This word hasn’t appeared in the replay yet.'
    if (!tile) return
    lockCamera()
    const zoom = Math.max(stageWidth/(12*cell),canvas.getCamera().zoom)
    canvas.setCamera(at({x:tile.x+tile.width/2,y:tile.y+tile.height/2},zoom))
    focusTile(tile)
  })
  function lockCamera() {
    if (mode!=='center') setMode('center',false)
  }
  field.addEventListener('pointerdown',event=>{pointer={x:event.clientX,y:event.clientY}})
  field.addEventListener('pointermove',event=>{
    if (event.buttons && pointer && Math.hypot(event.clientX-pointer.x,event.clientY-pointer.y)>7) lockCamera()
  })
  field.addEventListener('wheel',lockCamera,{passive:true})
  field.addEventListener('click',event=>{
    if (!pointer || Math.hypot(event.clientX-pointer.x,event.clientY-pointer.y)>7) return
    const rect = field.getBoundingClientRect()
    const tile = spiral.pick(canvas.screenToWorld({x:event.clientX-rect.left,y:event.clientY-rect.top}))
    if (tile && tiles.has(tile.id)) focusTile(tile)
  })
  document.addEventListener('keydown',event=>{
    if (event.code==='Space' && !event.target.closest('input,button,select,a,summary')) {
      event.preventDefault()
      togglePlayback()
    }
  })
  document.addEventListener('visibilitychange',()=>{
    if (document.hidden && playing) togglePlayback()
  })
  resize()
  refresh(performance.now())
}
start().catch(report)
