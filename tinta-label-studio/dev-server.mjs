import http from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import generate from './api/generate.js';

const projectRoot=path.dirname(fileURLToPath(import.meta.url));
const root=path.join(projectRoot,'public');
// Load developer-only secrets without dependencies; .env.local is gitignored.
try {
  const localEnv=await readFile(path.join(projectRoot,'.env.local'),'utf8');
  for(const line of localEnv.split(/\r?\n/)) {
    const match=/^([A-Z][A-Z0-9_]*)=(.*)$/.exec(line.trim());
    if(match && !process.env[match[1]]) process.env[match[1]]=match[2].replace(/^['"]|['"]$/g,'');
  }
} catch {}
const port=Number(process.env.PORT||4173);
const types={'.html':'text/html; charset=utf-8','.js':'application/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.png':'image/png','.webmanifest':'application/manifest+json'};
http.createServer(async(req,res)=>{
  const pathname=new URL(req.url,'http://localhost').pathname;
  if(pathname==='/api/generate')return generate(req,res);
  const file=pathname==='/'?'/index.html':pathname;
  const target=path.resolve(root,'.'+file);
  if(!target.startsWith(root+path.sep)){res.writeHead(403);res.end('Forbidden');return;}
  try{
    const content=await readFile(target);
    res.writeHead(200,{'Content-Type':types[path.extname(target)]||'application/octet-stream','Cache-Control':'no-cache'});
    res.end(content);
  }catch{res.writeHead(404);res.end('Not found');}
}).listen(port,'0.0.0.0',()=>console.log(`Tinta Studio: http://localhost:${port}`));
