import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
const e=Object.fromEntries(readFileSync(".env.local","utf8").split("\n").filter(l=>l.includes("="))
  .map(l=>{const i=l.indexOf("=");return[l.slice(0,i).trim(),l.slice(i+1).trim()];}));
const U=e.NEXT_PUBLIC_SUPABASE_URL, K=e.SUPABASE_SERVICE_ROLE_KEY;
export function all(path, page=1000){
  const out=[]; let from=0;
  for(;;){
    const a=["-s","-H",`apikey: ${K}`,"-H",`Authorization: Bearer ${K}`,"-H",`Range: ${from}-${from+page-1}`,`${U}/rest/v1/${path}`];
    let r; try{ r=JSON.parse(execFileSync("curl",a,{maxBuffer:1<<28}).toString()); }catch{ break; }
    if(!Array.isArray(r)||!r.length) break;
    out.push(...r); if(r.length<page) break; from+=page;
  }
  return out;
}
export function cnt(t){
  const a=["-s","-H",`apikey: ${K}`,"-H",`Authorization: Bearer ${K}`,"-H","Prefer: count=exact","-H","Range: 0-0","-D-","-o","/dev/null",`${U}/rest/v1/${t}`];
  const m=execFileSync("curl",a,{maxBuffer:1<<20}).toString().match(/content-range:\s*\S+\/(\d+)/i);
  return m?+m[1]:null;
}
