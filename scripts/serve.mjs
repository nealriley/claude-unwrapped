import {createServer} from 'node:http'
import {createReadStream} from 'node:fs'
import {realpath,stat,writeFile} from 'node:fs/promises'
import {extname,resolve,sep} from 'node:path'

const root = await realpath(process.argv[2])
const types = {'.html':'text/html; charset=utf-8','.json':'application/json','.jpg':'image/jpeg','.md':'text/plain; charset=utf-8'}
const server = createServer(async (request,response)=>{
  try {
    const url = new URL(request.url,'http://127.0.0.1')
    if (url.pathname==='/__context_gallery_status') {
      response.writeHead(200,{'Content-Type':'application/json','Cache-Control':'no-store'})
      response.end(JSON.stringify({root}))
      return
    }
    const pathname = decodeURIComponent(url.pathname==='/'?'/experiences/index.html':url.pathname)
    if (!['experiences','data','captures','docs'].includes(pathname.split('/')[1])) throw new Error('Not found')
    const file = await realpath(resolve(root,'.'+pathname))
    if (!file.startsWith(root+sep) || !(await stat(file)).isFile()) throw new Error('Not found')
    response.writeHead(200,{'Content-Type':types[extname(file)] || 'application/octet-stream','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'})
    if (request.method==='HEAD') response.end()
    else createReadStream(file).pipe(response)
  } catch {
    response.writeHead(404,{'Content-Type':'text/plain'})
    response.end('Not found')
  }
})
server.listen(0,'127.0.0.1',async()=>{
  const state = {root,url:'http://127.0.0.1:'+server.address().port,pid:process.pid}
  await writeFile(resolve(root,'.server.json'),JSON.stringify(state),{mode:0o600})
  console.log(state.url)
})
