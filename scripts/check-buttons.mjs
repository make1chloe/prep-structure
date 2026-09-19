/** 단추 전수 검사(검사-94 · (어49) 2026-09-16 · 원장님 「버튼에 대한 전수검사 돌려서 개선하기」 · 「진도체크들어가면 버튼이 제대로 작동하지않음」 · 「교재 진행중/ 숙제보류/ 교재보류도 버튼작동이 상당히 느림」).
 *  글자로 훑는다(주석은 먼저 지운다 · 폰-5). 단추가 「안 먹히는」 까닭을 잡는다:
 *  ① type 없는 <button>(폼 안에서 제출로 샌다) ② 서버 손을 기다리는 onClick 이 실패를 안 받는다(글이 없으면 「안 먹힘」으로 보인다) ③ 서버 손을 부르는 aria-pressed 세그·○◐✕ 가 서버 답을 기다려 눌림이 늦다(속도-5 · useState 로 먼저 바뀐다)
 *  ④ 모달(.mdlov) 안 손의 오류가 모달 뒤(판)에 뜬다(useModalErr · role=alert 가 그 조각 안에) ⑤ 진도 체크 손은 매 클릭 화면을 다시 안 그린다(wrap) · 모달의 손은 던지는 것도 받는다(call) ⑥ saidBy 는 「칸 없음」을 붙여넣기 SQL 번호로 옮긴다(실 DB 에 SQL 을 안 넣은 채 누르면 단추가 「안 먹힌다」) */
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs"; import { join } from "node:path";
import { saidBy, COL_PASTE } from "../lib/sqlError.js";
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, "")).replace(/(^|[^:\\])\/\/.*$/gm, "$1");   // 줄 수는 지킨다(줄 번호를 대야 고칠 수 있다)
const files = (dir) => readdirSync(dir).flatMap((f) => { const p = join(dir, f); return statSync(p).isDirectory() ? files(p) : /\.js$/.test(f) ? [p] : []; });
const src = files("app").map((p) => [p.replace(/\\/g, "/"), strip(readFileSync(p, "utf8"))]);
let n = 0, bad = 0;
const ok = (what, cond, why = "") => { n++; if (cond) console.log(`   ✅ ${what}`); else { bad++; console.log(`   ❌ ${what}${why ? " · " + why : ""}`); } };
const lineOf = (s, i) => s.slice(0, i).split("\n").length;
/** 여는 중괄호부터 짝이 맞는 곳까지(문자열·템플릿은 대충 건너뛴다) */
function balanced(s, i) { let d = 0, j = i, q = null; for (; j < s.length; j++) { const c = s[j]; if (q) { if (c === "\\") { j++; continue; } if (c === q) q = null; continue; } if (c === '"' || c === "'" || c === "`") { q = c; continue; } if (c === "{") d++; else if (c === "}") { d--; if (d === 0) return s.slice(i, j + 1); } } return s.slice(i); }
/** <button …> 여는 태그들(속성 글) */
const tags = (s) => [...s.matchAll(/<button\b/g)].map((m) => { const end = s.indexOf(">", m.index); const t = balancedTag(s, m.index); return { i: m.index, line: lineOf(s, m.index), t: t ?? s.slice(m.index, end + 1) }; });
function balancedTag(s, i) { let d = 0, j = i, q = null; for (; j < s.length; j++) { const c = s[j]; if (q) { if (c === "\\") { j++; continue; } if (c === q) q = null; continue; } if (c === "{") d++; else if (c === "}") d--; else if (c === '"' && d === 0) { q = c; continue; } else if (c === ">" && d === 0) return s.slice(i, j + 1); } return null; }
const allTags = src.flatMap(([p, s]) => tags(s).map((t) => ({ p, ...t })));
console.log(`■ 단추 전수 · <button ${allTags.length}개 · 파일 ${src.length}`);
// ① type
const noType = allTags.filter((t) => !/\btype=/.test(t.t));
ok("① 모든 <button> 에 type(폼 안에서 제출로 새지 않는다)", noType.length === 0, noType.map((t) => `${t.p}:${t.line}`).join(", "));
// ② 서버 손을 기다리는 onClick 은 실패를 받는다
const handlers = allTags.flatMap((t) => { const m = /onClick=\{/.exec(t.t); if (!m) return []; const body = balanced(t.t, m.index + "onClick=".length); return [{ ...t, body }]; });
const awaits = handlers.filter((h) => /\bawait\b/.test(h.body));
const catches = (b) => /\bfail\w*\(|\.ok\b|setErr\(|\brun\(|\bgo\(|\bcatch\b|\bcall\(/.test(b);
const noCatch = awaits.filter((h) => !catches(h.body));
ok(`② 서버 손을 기다리는 onClick ${awaits.length}개가 전부 실패를 받는다(fail · failM · .ok · setErr · run · go · call)`, noCatch.length === 0, noCatch.map((h) => `${h.p}:${h.line}`).join(", "));
// ③ 서버 손을 부르는 aria-pressed 는 화면 상태로 먼저 바뀐다
function stateResolver(s) {
  const state = new Set([...s.matchAll(/const \[(\w+),\s*\w+\]\s*=\s*useState/g)].map((m) => m[1]));
  const binds = [...s.matchAll(/(\w+)(?:\.\w+|\[[^\]]*\]|\([^()]*\))*\.(?:map|filter|flatMap|find|some)\(\(\[?\s*(\w+)/g)].map((m) => [m[1], m[2]]);
  const seen = new Set();
  const resolves = (id, depth = 0) => { if (state.has(id)) return true; if (depth > 4 || seen.has(id + depth)) return false; seen.add(id + depth); return binds.some(([root, bound]) => bound === id && root !== id && resolves(root, depth + 1)); };
  return resolves;
}
const pressed = handlers.filter((h) => /\baria-pressed=\{/.test(h.t) && /\bawait\b/.test(h.body) && !/\bonClick=\{\(\) => (?:set\w+|pick\w+|toggle\w*|flip)\(/.test(h.t));   // pickX(k) 꼴은 그 함수가 상태를 먼저 바꾼다(아래 ③b 가 본다)
const late = pressed.filter((h) => { const m = /aria-pressed=\{([^}]*)\}/.exec(h.t); const id = /([A-Za-z_$][\w$]*)/.exec(m?.[1] ?? "")?.[1]; return !id || !stateResolver(src.find(([p]) => p === h.p)[1])(id); });
ok(`③ 서버 손을 부르는 aria-pressed 단추 ${pressed.length}개가 전부 화면 상태(useState)로 먼저 바뀐다(속도-5 · 서버 답을 기다리는 눌림 0)`, late.length === 0, late.map((h) => `${h.p}:${h.line}`).join(", "));
{ const row = src.find(([p]) => p === "app/today/row.js")[1];
  ok("③b 01 줄이기(mode) · 교재 상태(stop) 세그는 누르면 먼저 바뀌고 실패면 되돌린다(pickMode · pickStop · useState · 원장님 9/16 「버튼작동이 상당히 느림」)", /const \[mode, setModeLocal\] = useState/.test(row) && /const pickMode = \(k\) => \{[^\n]*setModeLocal\(k\)[^\n]*setModeLocal\(prev\)/.test(row) && /const \[stop, setStopLocal\] = useState\(stopOn\(b, date\)\)/.test(row) && /const pickStop = \(m\) => \{[^\n]*setStopLocal\(m\)[^\n]*setStopLocal\(prev\)/.test(row) && /aria-pressed=\{mode === k\}/.test(row) && /aria-pressed=\{stop === k\}/.test(row)); }
// ④ 모달 안 손의 오류는 모달 안에
const chunksOf = (s) => { const lines = s.split("\n"); const heads = lines.map((l, i) => (/^(?:export default )?function \w+\(|^export function \w+\(|^const \w+ = \(/.test(l) ? i : -1)).filter((i) => i >= 0); return heads.map((h, k) => ({ line: h + 1, text: lines.slice(h, heads[k + 1] ?? lines.length).join("\n") })); };
const modalChunks = src.flatMap(([p, s]) => chunksOf(s).filter((c) => /className="mdlov"/.test(c.text)).map((c) => ({ p, ...c })));
const dumb = modalChunks.filter((c) => /\bawait\b/.test(c.text) && !/role="alert"|errNode/.test(c.text));
ok(`④ 모달(.mdlov) 조각 ${modalChunks.length}개 중 손을 부르는 것은 전부 오류 글이 모달 안(role=alert · useModalErr errNode)`, dumb.length === 0, dumb.map((c) => `${c.p}:${c.line}`).join(", "));
// ⑤ 진도 체크 손은 화면을 다시 안 그린다 · 모달의 손은 던지는 것도 받는다
{ const ta = strip(readFileSync("app/today/actions.js", "utf8")), pa = strip(readFileSync("app/_shell/progress-actions.js", "utf8")), pm = strip(readFileSync("app/_shell/progressmodal.js", "utf8")), me = strip(readFileSync("app/_shell/modalerr.js", "utf8"));
  ok("⑤ 진도 체크 손 다섯(01 · 대시보드)은 quiet(wrap · revalidatePath 없음) · 모달은 닫을 때 router.refresh 한 번", ["progressOpen", "progressSet", "progressSetMany", "progressUpTo", "progressSkip"].every((k) => new RegExp(`export const ${k} = quiet\\(`).test(ta)) && ["progressOpenFor", "progressSetFor", "progressSetManyFor", "progressUpToFor", "progressSkipFor"].every((k) => new RegExp(`export const ${k} = quiet\\(`).test(pa)) && /router\.refresh\(\)/.test(strip(readFileSync("app/today/row.js", "utf8"))) && /router\.refresh\(\)/.test(strip(readFileSync("app/dashgaps.js", "utf8"))));
  ok("⑤b 진도 체크 모달 · ○◐· 는 먼저 바꾸고(chapterSummary 한 벌로 다시 셈) 실패면 되돌린다(setT(before)) · 손은 call 로 감싸 500·끊김도 {ok:false} · 오류는 모달 안(useModalErr)", /chapterSummary\(/.test(pm) && /setT\(before\)/.test(pm) && /await call\(/.test(pm) && /useModalErr\(\)/.test(pm) && /try \{ return await run\(\); \} catch/.test(me)); }
// ⑥ 칸이 없다는 DB 말 → 어느 SQL 을 안 넣었나
{ const a = saidBy("Could not find the 'started_at' column of 'day_item' in the schema cache"), b = saidBy("column day_item.attend_reason does not exist"), c = saidBy("Could not find the 'zzz_no_such' column of 'x' in the schema cache");
  ok("⑥ 「'started_at' 칸이 없다」 → docs/sql-paste/0167.sql 을 안 넣은 것 · attend_reason → 0166 · 모르는 칸도 「붙여넣기 SQL」을 가리킨다(schema cache 글보다 먼저)", a.includes("0167") && /안 넣/.test(a) && b.includes("0166") && /sql-paste/.test(c) && !/옛 표 모양/.test(a), `${a.slice(0, 80)} | ${c.slice(0, 80)}`);
  const missing = Object.values(COL_PASTE).filter((v) => !existsSync(`docs/sql-paste/${v}.sql`));
  ok(`⑥b 칸 → 붙여넣기 번호 표(COL_PASTE ${Object.keys(COL_PASTE).length}칸)의 파일이 다 있다`, missing.length === 0, missing.join(", ")); }
/* ⑦ (어97) **한 손 줄에서 그림과 글을 섞지 않는다** — 원장님 2026-09-19 사진(05 카드: 「✓ 끝냄(글) · ✏️(그림) · 삭제(글)」):
   「아이콘이든 텍스트든 통일해줘 텍스트할거먄 완료/수정/삭제」. 한 줄이 그림 단추(icb)와 글 단추를 같이 내면 실패.
   ⚠️ 한 단추 안의 「🖨 6장 뽑기」는 섞임이 아니다 — **나란히 선 단추끼리** 꼴이 다른 것이 눈에 걸린다. */
{ const 섞인 = [];
  for (const f of files("app").filter((p) => !p.includes("/api/"))) strip(readFileSync(f, "utf8")).split("\n").forEach((l, i) => {
    const icb = (l.match(/icb"/g) ?? []).length, txt = [...l.matchAll(/>([가-힣][^<>{}]{0,8})<\/button>/g)].map((m) => m[1]);
    if (icb > 0 && txt.length) 섞인.push(`${f}:${i + 1} · 그림 ${icb} · 글 ${txt.join("·")}`);
  });
  ok("⑦ (어97) 한 손 줄에 그림 단추와 글 단추가 섞이지 않는다(그림이면 다 그림 · 글이면 다 글)", 섞인.length === 0, 섞인.slice(0, 4).join(" | ")); }

console.log(`\n■ 단추 전수 검사 ${n}건 · 실패 ${bad} · <button ${allTags.length} · 서버 손 onClick ${awaits.length} · aria-pressed 서버 손 ${pressed.length} · 모달 조각 ${modalChunks.length}`);
process.exit(bad ? 1 : 0);
