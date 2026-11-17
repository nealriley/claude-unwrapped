const safe = .14
const leadInset = .25
const centerOf = (rect) => ({x:rect.x+rect.width/2,y:rect.y+rect.height/2})
const viewport = (camera,size) => ({x:camera.x,y:camera.y,width:size.width/camera.zoom,height:size.height/camera.zoom})
const clamp = (value,min,max) => Math.max(min,Math.min(value,max))

function frame(center,zoom,size) {
  return {x:center.x-size.width/(2*zoom),y:center.y-size.height/(2*zoom),zoom}
}

function combine(a,b) {
  const x = Math.min(a.x,b.x)
  const y = Math.min(a.y,b.y)
  return {x,y,width:Math.max(a.x+a.width,b.x+b.width)-x,height:Math.max(a.y+a.height,b.y+b.height)-y}
}

function inside(rect,view,inset) {
  return rect.x>=view.x+view.width*inset && rect.x+rect.width<=view.x+view.width*(1-inset) &&
    rect.y>=view.y+view.height*inset && rect.y+rect.height<=view.y+view.height*(1-inset)
}

function centerToFit(rect,center,view,inset) {
  return {
    x:fitAxis(rect.x,rect.width,center.x,view.width,inset),
    y:fitAxis(rect.y,rect.height,center.y,view.height,inset),
  }
}

function fitAxis(start,length,center,span,inset) {
  const half = span*(.5-inset)
  return length>2*half ? start+length/2 : clamp(center,start+length-half,start+half)
}

function boundedTile(tile,size,zoom) {
  const center = centerOf(tile)
  const width = Math.min(tile.width,size.width*.60/zoom)
  const height = Math.min(tile.height,size.height*.60/zoom)
  return {x:center.x-width/2,y:center.y-height/2,width,height}
}

function close(a,b,size,zoom) {
  const p = centerOf(a)
  const q = centerOf(b)
  return Math.hypot((p.x-q.x)*zoom/size.width,(p.y-q.y)*zoom/size.height)<=.28
}

function easeCamera(current,target,delta,size,reduced,speed) {
  if (reduced) return target
  const from = centerOf(viewport(current,size))
  const to = centerOf(viewport(target,size))
  const rate = 1-Math.exp(-Math.max(delta,8)*speed/125)
  const center = {x:from.x+(to.x-from.x)*rate,y:from.y+(to.y-from.y)*rate}
  const zoom = current.zoom*Math.pow(target.zoom/current.zoom,rate)
  return frame(center,zoom,size)
}

export function createFollowCamera() {
  let currentTile
  let recent = []
  let pursuit
  let lead
  let envelope

  function reset() {
    currentTile = pursuit = lead = envelope = undefined
    recent = []
  }

  function observe(camera,size,tile,upcoming,limits) {
    if (!currentTile || !close(currentTile,tile,size,limits.rest)) recent = []
    currentTile = tile
    recent.push(tile)
    if (recent.length>4) recent.shift()

    const view = viewport(camera,size)
    const center = centerOf(view)
    const important = boundedTile(tile,size,camera.zoom)
    if (!inside(important,view,safe)) {
      // Correct part of the distance with zoom and the rest with translation.
      const focus = centerOf(important)
      const fitHere = Math.min(
        size.width*(.5-safe)/(Math.abs(center.x-focus.x)+important.width/2),
        size.height*(.5-safe)/(Math.abs(center.y-focus.y)+important.height/2),
      )
      const zoom = Math.max(Math.min(limits.floor,camera.zoom),Math.min(camera.zoom,Math.sqrt(camera.zoom*fitHere)))
      const destination = centerToFit(important,center,view,.27)
      pursuit = frame(destination,zoom,size)
      lead = undefined
      envelope = important
      return
    }

    pursuit = undefined
    envelope = important
    let previous = tile
    for (const next of upcoming) {
      if (!close(previous,next,size,limits.rest)) break
      const expanded = combine(envelope,boundedTile(next,size,camera.zoom))
      if (expanded.width>view.width*.63 || expanded.height>view.height*.63) break
      envelope = expanded
      previous = next
    }
    lead = undefined
    if (previous!==tile && !inside(envelope,view,leadInset)) {
      const preferred = centerToFit(envelope,center,view,leadInset)
      const target = centerToFit(important,preferred,view,safe+.025)
      const distance = Math.hypot(target.x-center.x,target.y-center.y)*camera.zoom
      if (distance>6) lead = frame(target,camera.zoom,size)
    }
  }

  function advance(camera,delta,size,limits,reduced,speed=1) {
    if (!currentTile) return null
    const view = viewport(camera,size)
    const important = boundedTile(currentTile,size,camera.zoom)
    if (pursuit) {
      if (inside(important,view,safe)) pursuit = undefined
      else return easeCamera(camera,pursuit,delta,size,reduced,speed)
    }
    if (lead) {
      const distance = Math.hypot(lead.x-camera.x,lead.y-camera.y)*camera.zoom
      if (distance>.8) return easeCamera(camera,lead,delta,size,reduced,speed)
      const target = lead
      lead = undefined
      return target
    }
    if (recent.length<3 || camera.zoom>=limits.rest-.003) return null

    let local = envelope || important
    for (const tile of recent) {
      const expanded = combine(local,boundedTile(tile,size,camera.zoom))
      if (expanded.width<=view.width*.67 && expanded.height<=view.height*.67) local = expanded
    }
    const target = Math.min(limits.rest,size.width*.63/local.width,size.height*.63/local.height)
    if (target-camera.zoom<.003) return null
    const rate = reduced ? 1 : 1-Math.exp(-Math.max(delta,8)*speed/1250)
    const zoom = camera.zoom+(target-camera.zoom)*rate
    const center = centerToFit(local,centerOf(view),{width:size.width/zoom,height:size.height/zoom},safe)
    return frame(center,zoom,size)
  }

  return {reset,observe,advance}
}
