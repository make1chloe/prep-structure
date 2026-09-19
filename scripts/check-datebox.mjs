/** 날짜·시각 칸은 **비울 수 있다** — (어93) · 원장님 2026-09-19 「시간 날짜를 한번 선택하면 삭제가 안돼 되게해」.
 *
 *  브라우저의 `<input type=date>` 에는 비우는 손이 없다. 폰에서는 한 번 고르면 지울 길이 아예 없다.
 *  그래서 비어도 되는 칸은 전부 한 벌(`app/_shell/datebox.js` DateBox)을 쓴다 — 값이 있을 때만 ✕ 가 옆에 선다.
 *  손으로 마흔 곳에 ✕ 를 붙이면 반드시 몇 곳이 빠지고, **빠진 곳은 눈으로 안 보인다**(멀쩡해 보인다).
 *  그래서 검사가 지킨다: 날것 `type="date|time|datetime-local|month"` 은 아래 KEEP 말고는 없어야 한다.
 *
 *  KEEP — 화면이 그 값으로 서 있어서 비우면 죽는 칸. 늘리려면 **까닭을 함께** 적을 것. */
import { readFileSync, readdirSync, statSync } from "node:fs"; import { join } from "node:path";
let n = 0, bad = 0;
const ok = (what, cond, why = "") => { n++; if (cond) console.log(`   ✅ ${what}`); else { bad++; console.log(`   ❌ ${what}${why ? " · " + why : ""}`); } };
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, "")).replace(/(^|[^:\\])\/\/.*$/gm, "$1");
const walk = (d, out = []) => { for (const e of readdirSync(d)) { const p = join(d, e); if (statSync(p).isDirectory()) walk(p, out); else if (p.endsWith(".js")) out.push(p); } return out; };
const RAW = () => /<input[^>]*type="(date|time|datetime-local|month)"/g;   // 쓸 때마다 새로 — g 붙은 정규식은 lastIndex 를 들고 다녀 다음 부름이 어긋난다
const KEEP = { "app/today/daypick.js": "01 이 그 날짜로 서 있다. 비우면 아무 날도 못 연다" };

console.log("■ (어93) 날짜·시각 칸은 비울 수 있다 — 브라우저 날짜 상자에는 비우는 손이 없다(원장님 9/19)");
const raw = [];
for (const f of walk("app").filter((p) => !p.includes("/api/") && !KEEP[p])) {
  const s = strip(readFileSync(f, "utf8"));
  for (const m of s.matchAll(RAW())) raw.push(`${f}:${s.slice(0, m.index).split("\n").length}`);
}
ok("날것 날짜·시각 칸 0 — 비어도 되는 칸은 모두 DateBox 한 벌(비우면 안 되는 칸은 KEEP 에 까닭과 함께)", raw.length === 0, raw.join(" · "));

const box = readFileSync("app/_shell/datebox.js", "utf8");
ok("✕ 는 값이 있을 때만 선다 — 빈 칸에 선 ✕ 는 무엇을 지우는지 말해주지 못한다", /v !== ""/.test(box));
ok("✕ 는 잠긴 칸에는 안 선다", /!p\.disabled/.test(box));
ok('✕ 는 부르던 손(onChange)을 **빈 값으로 그대로** 부른다 — 마흔 곳의 손을 하나도 안 고치려고 이렇게 했다', /put\(""\)/.test(box) && /p\.onChange\?\.\(\{ target: \{ value: nv \} \}\)/.test(box));
ok('걷기가 잡을 이름이 있다(data-act="dt-clear")', /data-act="dt-clear"/.test(box));
ok("남이 값을 안 쥐면(defaultValue) 제가 쥔다 — 07 「내가 정한 마감」이 그 꼴이다", /const free = p\.value === undefined/.test(box) && /useState\(defaultValue \?\? ""\)/.test(box));
ok("이름·툴팁은 한 벌(icon) 에서 온다((어51))", /from "\.\/icon\.js"/.test(box));

for (const [f, why] of Object.entries(KEEP)) ok(`비우면 안 되는 칸 ${f} 이 아직 그 자리다 (${why})`, RAW().test(readFileSync(f, "utf8")));

const walkjs = readFileSync("scripts/e2e/today.mjs", "utf8");
ok("걷기가 실제로 ✕ 를 눌러 본다 — 글자만 보는 검사는 화면이 진짜 비는지 모른다", /data-act=dt-clear/.test(walkjs));

console.log(`\n■ 날짜 비우기 검사 ${n}건 · 실패 ${bad}`);
process.exit(bad ? 1 : 0);
