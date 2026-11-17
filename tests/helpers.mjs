import {spawnSync} from 'node:child_process'
import {fileURLToPath} from 'node:url'
import {join} from 'node:path'

export const root = fileURLToPath(new URL('../',import.meta.url))
export const runner = join(root,'scripts/prepare.mjs')
export function run(command,args,options={}) {
  const result = spawnSync(command,args,{encoding:'utf8',maxBuffer:80*1024*1024,...options})
  if (result.error) throw result.error
  if (result.status!==0) throw new Error(result.stderr || result.stdout)
  return result.stdout
}
export function fixture(folder,part=0) {
  const path = join(folder,'conversations-'+String(part).padStart(3,'0')+'.zip')
  run(process.env.PYTHON_BIN || 'python3',['-c',`
import json,sys
from zipfile import ZipFile
index=sys.argv[2]
rows=[{'uuid':'fixture-'+index,'name':'Fixture $& </script>', 'created_at':'2026-01-01T10:00:00Z','chat_messages':[
 {'sender':'human','created_at':'2026-01-01T10:00:01Z','text':'hello hello world','content':[]},
 {'sender':'assistant','created_at':'2026-01-01T10:00:02Z','content':[{'type':'text','text':'hello sky'},{'type':'tool_result','name':'web_search','content':[{'url':'https://en.wikipedia.org/wiki/Sky','title':'Sky'}]}]}
]}]
with ZipFile(sys.argv[1],'w') as z:
 z.writestr('nested/conversations.json',json.dumps(rows))
 z.writestr('../../escape.txt','this must stay inside the archive')
`,path,String(part)])
  return path
}
