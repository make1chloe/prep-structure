// 옛 DB 를 **세기만** 한다. 아무것도 안 고친다.
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
const env = Object.fromEntries(readFileSync(".env.local","utf8").split("\n")
  .filter(l=>l.includes("=")).map(l=>{const i=l.indexOf("=");return [l.slice(0,i).trim(), l.slice(i+1).trim()];}));
const U=env.NEXT_PUBLIC_SUPABASE_URL, K=env.SUPABASE_SERVICE_ROLE_KEY;
export function q(path, {count=false}={}) {
  const args=["-s","-H",`apikey: ${K}`,"-H",`Authorization: Bearer ${K}`];
  if (count) args.push("-H","Prefer: count=exact","-H","Range: 0-0","-D-","-o","/dev/null");
  args.push(`${U}/rest/v1/${path}`);
  const out=execFileSync("curl",args,{maxBuffer:1<<28}).toString();
  if (count) { const m=out.match(/content-range:\s*\S+\/(\d+|\*)/i); return m?(m[1]==="*"?null:+m[1]):null; }
  try { return JSON.parse(out); } catch { return out.slice(0,300); }
}

/** ⚠️ Supabase 는 한 번에 1000줄만 준다 — 계획의 그 함정. 반드시 나눠 읽는다 */
export function all(path, page=1000) {
  const out=[]; let from=0;
  for (;;) {
    const args=["-s","-H",`apikey: ${process.env.__K}`,"-H",`Authorization: Bearer ${process.env.__K}`,
                "-H",`Range: ${from}-${from+page-1}`, `${process.env.__U}/rest/v1/${path}`];
    const r=JSON.parse(execFileSync("curl",args,{maxBuffer:1<<28}).toString());
    if (!Array.isArray(r) || r.length===0) break;
    out.push(...r); if (r.length<page) break; from+=page;
  }
  return out;
}
