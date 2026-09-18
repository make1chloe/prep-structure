/** (어79) 매일 누르는 자리 셋 — 원장님 2026-09-17:
 *   「진도 체크 할 때(교재페이지에서하든 머달로하든) 기본적으로 대단원은 [접힌] 상태이고 하다가 만 대단원이 있으면
 *     그 부분만 펼쳐진걸 기본값으로 해 줘. 전부 다 펼쳐져 있으면 너무 양이 많아.」
 *   「숙제검사-숙제배정에서 진도체크도 가능하게: 여기까지, 대단원완료」
 *   「숙제검사페이지 다음학습으로 오늘학습으로 아이콘 헷갈림」
 *   「교재 배정 할 때 필터링과 검색 가능하게 해 줘. 찾기가 어렵다.」
 *  글자만 본다 — 실제로 그러는지는 걷기(e2e/today)가 본다. */
import { readFileSync } from "node:fs";
const read = (p) => readFileSync(p, "utf8");
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:])\/\/[^\n]*/g, "$1");
let n = 0, bad = 0;
const ok = (what, cond, why = "") => { n++; if (cond) console.log(`   ✅ ${what}`); else { bad++; console.log(`   ❌ ${what}${why ? " · " + why : ""}`); } };

const row = read("app/today/row.js"), rowS = strip(row);
const asg = read("app/_shell/assignmodal.js"), asgS = strip(asg);
const emoji = read("lib/emoji.js"), walk = read("scripts/e2e/today.mjs");

console.log("■ (어79)-① 숙제 배정 모달 · 대단원은 접힌 채, 하다가 만 것 하나만");
ok("펼칠 대단원을 **하나** 고르는 판단이 있다(하다가 만 것 → 안 끝난 첫 것 → 첫 것)",
  /const firstChapter = \(us\)/.test(rowS) && /fin\(a\) > 0 && fin\(a\) < a\.length/.test(rowS));
ok("교재를 고를 때마다 그 교재의 대단원으로 다시 고른다(옛 교재의 대단원이 펴진 채로 남지 않는다)",
  /setOpenCh\(firstChapter\(r\.units \?\? \[\]\)\)/.test(rowS));
ok("접힌 대단원은 소단원을 **안 그린다**(그래야 양이 준다) · 머리에 펼침 여부가 적힌다",
  /\{chOpen && g\.us\.map/.test(rowS) && /data-open=\{chOpen \? "1" : "0"\}/.test(rowS));
ok("대단원 머리가 누르는 손이다(▸ ▾ · aria-expanded)",
  /data-act="chapter-open"/.test(rowS) && /aria-expanded=\{chOpen\}/.test(rowS));

console.log("\n■ (어79)-② 같은 모달에서 진도도 — 「여기까지 ○」 · 「이 대단원 완료」");
ok("두 손 다 있다 · **펼친 대단원에만** 「이 대단원 완료」가 선다",
  /data-act="unit-upto"/.test(rowS) && /data-act="chapter-done"/.test(rowS) && /\{chOpen && <><button[^>]*chapter-all[\s\S]{0,400}?chapter-done/.test(rowS));
ok("손은 진도 체크 모달과 **같은 것**을 쓴다(새로 안 짓는다 · 원칙-1) — progressUpTo · progressSetMany",
  /progressUpTo\(sheet\.id, bookId, u\.id\)/.test(rowS) && /progressSetMany\(sheet\.id, ids, "done"\)/.test(rowS));
ok("화면을 먼저 바꾸고 실패하면 **되돌린다**(속도-3) · 이미 ○ 인 줄은 다시 안 적는다",
  /const manyDone = \(list, run\)/.test(rowS) && /setSeen\(\(o\) => \(\{ \.\.\.o, \.\.\.prev \}\)\)/.test(rowS) && /stOf\(u\) !== "done"/.test(rowS));
ok("다 끝낸 대단원에서는 「이 대단원 완료」가 잠긴다(화면이 거짓말하지 않는다 · 대전제-0)",
  /disabled=\{chFin\}/.test(rowS) && /const chFin = g\.us\.every/.test(rowS));

console.log("\n■ (어79)-③ 「다음 시간으로」 ↔ 「오늘 학습으로」 — 반대 짝이라 눈이 가른다");
ok("두 그림이 **서로 반대**다(⏭ 미루기 ↔ ⏮ 당기기) · 옛 🏫 는 안 쓴다",
  /data-act="line-next"[\s\S]{0,300}?>⏭</.test(rowS) && /data-act="line-class"[\s\S]{0,300}?>⏮</.test(rowS) && !/data-act="line-class"[\s\S]{0,300}?>🏫</.test(rowS));
ok("이름도 갈렸다 — 「다음 시간」 · 「오늘 학습」(툴팁은 미루기 · 당기기)",
  /icon\("오늘 학습", "오늘 학습으로 당기기"\)/.test(rowS) && /icon\("다음 시간", "다음 시간으로 미루기"\)/.test(rowS));
ok("그림 표에도 짝으로 적혀 있다(lib/emoji ACT · 대전제-25)", /skip: "⏭️", pull: "⏮️"/.test(emoji));

console.log("\n■ (어79)-④ 교재 배정 · 찾기(원장님 「찾기가 어렵다」)");
ok("이름 검색칸과 영역 칩이 있다", /data-g="assign-q"/.test(asgS) && /data-act="assign-area"/.test(asgS));
ok("거르개는 **몇 권 넘을 때만** 뜬다(두 권뿐이면 되레 짐이다)", /const sift = \(rows \?\? \[\]\)\.length >= 3/.test(asgS));
ok("고른 것은 걸러도 **그대로 남는다** — 「전체」는 지금 보이는 것만 집는다(PickGroup)",
  /<PickGroup pick=\{pk\} ids=\{shown\.map/.test(asgS) && !/PickAll/.test(asg));
ok("걸러서 0건이면 **까닭을 말한다**(빈 자리로 두지 않는다 · 대전제-0)", /data-g="assign-nohit"/.test(asgS));
ok("영역 칩은 **있는 영역만** · 하나뿐이면 안 낸다", /areas\.length > 1/.test(asgS));

console.log("\n■ 걷기가 눈으로 본다");
ok("걷기가 ① 대단원 접힘 ② 「이 대단원 완료」·「여기까지 ○」 ③ 여기까지 누르면 ○ 가 는다를 본다",
  /\(어79\) 대단원은 \*\*접힌 채\*\*/.test(walk) && /data-act=chapter-done/.test(walk) && /data-act=unit-upto/.test(walk));


/* (어90) 원장님 2026-09-18 「진도체크시 대단원선택은 접힌 상태에서 가능하도록, 대단원 전체선택가능하도록,
   선택후 일괄변경가능하도록, **저장버튼 누르지않으면 반영안되도록** 변경해」 */
console.log("\n■ (어90) 진도 체크 — 접힌 채 고르기 · 전체 · 일괄 · 저장 눌러야 반영");
{ const pm = readFileSync("app/_shell/progressmodal.js", "utf8");
  ok("① 대단원 네모가 **접혀 있어도** 보인다(머리 .acch 는 button 이라 그 옆에 둔다 · 단추 속 단추 0)",
     /data-g="chapter-pick"[\s\S]{0,200}<PickGroup pick=\{pk\} ids=\{c\.units/.test(pm) && !/<button type="button" className="acch"[^>]*>[\s\S]{0,200}<PickGroup/.test(pm));
  ok("② 맨 위에 **전체**(모든 대단원 한 번에)", /data-g="prog-all"[\s\S]{0,120}<PickGroup pick=\{pk\} ids=\{allIds\}/.test(pm));
  ok("③ 고른 것에 **한 번에**(띠의 ○◐·) — 있던 것 그대로", /<PickBar pick=\{pk\} unit="개">/.test(pm));
  ok("④ **저장을 눌러야 적힌다** — 손들은 화면만 바꾸고(put) 서버는 save 가 한 번 부른다",
     /const set = \(u, st\) => put\(/.test(pm) && /const setMany = \(st\) => \{[^}]*put\(/.test(pm)
     && /const save = \(\) => start\(async \(\) => \{/.test(pm) && /api\.setMany\(ids, st\)/.test(pm));
  ok("④b 「이 대단원 건너뛰기」도 저장 때 부른다(setMany 로는 못 보낸다 · 손이 따로다)",
     /setSkipSet\(\(s\) => new Set\(s\)\.add\(chapter\)\)/.test(pm) && /for \(const ch of skipSet\)[\s\S]{0,80}api\.skip\(b\.book_id, ch\)/.test(pm));
  ok("④c 실패하면 **마지막으로 저장된 모습**으로 되돌린다(속도-3 · check-buttons ⑤b 와 같은 뜻)",
     /const before = base;/.test(pm) && (pm.match(/setT\(before\)/g) ?? []).length >= 2);
  ok("④d 저장 뒤 **서버가 적은 것으로 다시 읽는다** — 화면과 DB 가 어긋나지 않는다", /await load\(\);   \/\/ 서버가 적은 것으로/.test(pm));
  ok("⑤ **안 저장한 채 닫으면 묻는다**(조용히 잃지 않는다 · 대전제-0) · 되돌리기도 있다",
     /data-g="prog-dirty"/.test(pm) && /data-act="prog-save"/.test(pm) && /data-act="prog-revert"/.test(pm)
     && /const tryClose = \(\) => \{ if \(dirty > 0\) \{ setAsking\(true\); return; \}/.test(pm)
     && /data-act="prog-discard"/.test(pm) && /<\/>, tryClose\);/.test(pm)); }
console.log(`\n■ (어79) 매일 누르는 자리 검사 ${n}건 · 실패 ${bad}`);
process.exit(bad ? 1 : 0);
