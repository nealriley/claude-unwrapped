export const cell = 52
export const gutter = 4
const directions = [[1,0],[0,1],[-1,0],[0,-1]]

export function createSpiral() {
  const cursor = {x:0,y:0,direction:0,leg:1,remaining:1}
  const occupied = new Map()
  const rows = new Map()
  let minX = 0, maxX = 1, minY = 0, maxY = 1

  function nextCell(position) {
    const point = {x:position.x,y:position.y,direction:position.direction}
    const [dx,dy] = directions[point.direction]
    position.x += dx
    position.y += dy
    if (--position.remaining === 0) {
      position.direction = (point.direction + 1) % 4
      if (position.direction % 2 === 0) position.leg++
      position.remaining = position.leg
    }
    return point
  }

  function findSpace(position,span,reserved) {
    for (;;) {
      const point = nextCell(position)
      // Align westbound blocks to their right edge so long words follow the turn.
      const west = point.direction === 2 || (point.direction === 3 && point.x < 0)
      const col = point.x - (west ? span - 1 : 0)
      const line = occupied.get(point.y)
      let free = true
      for (let i = 0; i < span; i++) {
        if (line?.has(col+i) || reserved?.get(point.y)?.has(col+i)) {
          free = false
          break
        }
      }
      if (free) return {col,row:point.y}
    }
  }

  function rectAt(col,row,span) {
    return {x:col*cell,y:row*cell,width:span*cell-gutter,height:cell-gutter}
  }

  function place(tile,span) {
    const {col,row} = findSpace(cursor,span)
    const line = occupied.get(row) || new Map()
    Object.assign(tile,rectAt(col,row,span))
    for (let i=0;i<span;i++) line.set(col+i,tile)
    occupied.set(row,line)
    if (!rows.has(row)) rows.set(row,[])
    rows.get(row).push(tile)
    minX = Math.min(minX,col)
    maxX = Math.max(maxX,col+span)
    minY = Math.min(minY,row)
    maxY = Math.max(maxY,row+1)
  }

  return {
    place,
    preview(spans) {
      const position = {...cursor}
      const reserved = new Map()
      return spans.map(span=>{
        const {col,row} = findSpace(position,span,reserved)
        const line = reserved.get(row) || new Set()
        for (let i=0;i<span;i++) line.add(col+i)
        reserved.set(row,line)
        return rectAt(col,row,span)
      })
    },
    pick(point) {
      const tile = occupied.get(Math.floor(point.y/cell))?.get(Math.floor(point.x/cell))
      return tile && point.x < tile.x+tile.width && point.y < tile.y+tile.height ? tile : null
    },
    *visible(camera, width, height) {
      const right = camera.x+width/camera.zoom
      const bottom = camera.y+height/camera.zoom
      const start = Math.max(minY,Math.floor(camera.y/cell))
      const end = Math.min(maxY,Math.ceil(bottom/cell))
      for (let row = start; row < end; row++) {
        for (const tile of rows.get(row) || []) {
          if (tile.x < right && tile.x+tile.width > camera.x) yield tile
        }
      }
    },
    bounds(minimum = 8) {
      const side = Math.max(maxX-minX,maxY-minY,minimum)*cell
      return {x:(minX+maxX)*cell/2-side/2,y:(minY+maxY)*cell/2-side/2,width:side,height:side}
    },
  }
}
