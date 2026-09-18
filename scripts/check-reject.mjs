/** (어76 · 묶음 B) 숙제 반려 · 아이가 낸 것(사진 · 음성) — 원장님 2026-09-17:
 *  「숙제제출한 걸 보고 검사할수 있게 숙제검사페이지에 학생이 항목별로 제출한 사진을 확인가능하게. 이때 스크롤 늘지않도록 썸네일최소화」
 *  「숙제검사에 동그라미 세모 엑스 도 이모지로 바꾸고 반려 추가. 반려 선택시 사유 … 선택하게 해줄것」
 *  「숙제 음성녹음으로 제출도 가능하게 해줘」 · 「재생 위치를 이동해서 아무데서나 확인할 수 있게도 해 줘」
 *  「알림이 떠야해. 그다음 기존사진 확인가능하게 해서 본인이 보고 그다음 삭제&다시 제출하게」
 *  여기서 잡는 것: **반려가 status 로 새지 않는가** · **낸 것과 반려가 한 곳(원래 숙제 줄)에 사는가** ·
 *  **아이가 붙일 길과 내릴 길이 열려 있는가** · **음성이 받아지고 끌리는가**. */
import { readFileSync } from "node:fs";
import { REJECT, CHECK, isReject, REJECT_MARK } from "../lib/status.js";
import { ALLOWED_MIME, isAudio, checkFile, extOf } from "../lib/files-plan.js";
import { srcOf, srcId, submitted, rejectOf, rejectText } from "../lib/item-plan.js";
import { LABEL } from "../lib/notify-plan.js";
let n = 0, bad = 0;
const ok = (what, cond, why = "") => { n++; if (cond) console.log(`   ✅ ${what}`); else { bad++; console.log(`   ❌ ${what}${why ? " · " + why : ""}`); } };
const T = (p) => readFileSync(p, "utf8");
const sql = T("supabase/migrations/0176_reject_submit.sql");
const hw = T("lib/homework.js"), row = T("app/today/row.js"), acts = T("app/today/actions.js");
const cards = T("app/me/cards.js"), mepage = T("app/me/page.js"), rec = T("app/_shell/rec.js"), play = T("app/_shell/play.js");
const up = T("app/_shell/upload.js"), api = T("app/api/files/route.js"), one = T("app/api/files/[id]/route.js");

console.log("■ 반려 사유 여섯 — 앱과 DB 가 같은 목록(원칙-1)");
ok(`사유 여섯 · ${REJECT.join(" · ")}`, REJECT.length === 6 && REJECT[5] === "기타" && isReject("화질 저하") && !isReject("화질저하"));
ok("DB 제약(0176 day_item_reject_choice)이 같은 여섯을 받는다", REJECT.every((w) => sql.includes(`'${w}'`)) && /day_item_reject_choice/.test(sql));
ok("「그 밖에」가 아니라 「기타」다((어69) 원장님 9/17 「기타는 그냥 통일하면되겠고」)", !REJECT.some((w) => /그 밖/.test(w)));

console.log("■ 반려는 status 값이 아니다 — 반려해도 검사 목록에서 안 사라진다");
ok("0176 은 day_item.status 의 값 목록을 안 건드린다(판 함수 여덟을 안 건드리는 까닭)", !/day_item_status_check|status in \(/.test(sql));
ok("칸 셋을 더한다 · reject_reason · reject_note · rejected_at(멱등 · add column if not exists)", ["reject_reason", "reject_note", "rejected_at"].every((c) => new RegExp(`add column if not exists\\s+${c}\\b`).test(sql)));
ok("lib/homework rejectItem 이 status 를 안 쓴다", /export async function rejectItem/.test(hw) && !/rejectItem[\s\S]{0,900}?status:/.test(hw));
ok("반려는 **원래 숙제 줄**(carry_of)에 적는다 — 아이 07 이 보는 줄이 그 줄이다", /const target = it\.carry_of \?\? it\.id;/.test(hw));
ok("○△✕ 를 주면 반려가 끝난다(서버가 그 줄의 반려를 지운다 · 화면도 그 자리에서)", /reject_reason: null, reject_note: null, rejected_at: null \}\)\.eq\("id", it\.carry_of \?\? it\.id\)/.test(hw) && /setRj\(null\); setAsk\(false\);/.test(row));

console.log("■ 알림 — 반려하면 아이에게(원장님 「알림이 떠야해」)");
ok("알림 유형에 reject 가 있다 · 이름은 「숙제 다시 내기 안내」", LABEL.reject === "숙제 다시 내기 안내");
ok("DB 제약(notify_log_kind_choice)에도 reject 가 있다", /'reject'\)\) not valid/.test(sql));
ok("보내는 길은 lib/notify 하나(대전제-7) · 받는 이는 아이(who: \"student\") · 반려 취소면 안 보낸다", /notify\(svc, \{ kind: "reject"[\s\S]{0,200}who: "student" \}\)/.test(hw) && /if \(why === null\) return \{ rejected: false/.test(hw));

console.log("■ 화면 — 검사 넷째 손 · 사유 칩 · 아이가 낸 것");
ok("검사 단추는 넷(○△✕ + ←) · 기호는 lib/status.js 에서 · (어82) 상자 색을 입는 글자다", CHECK.length === 3 && CHECK.map(([, g]) => g).join("") === "○△✕" && REJECT_MARK === "←" && /data-act="reject"/.test(row) && /\{REJECT_MARK\}/.test(row));
ok("사유는 그 자리에서 칩으로 고른다(대전제-22 · 모달 아님)", /data-g="reject-why"/.test(row) && /REJECT\.map/.test(row) && !/RejectModal/.test(row));
ok("「기타」를 고르면 한 마디 칸이 뜬다", /data-g="reject-note"/.test(row));
ok("검사 줄에 아이가 낸 것이 **작게** 뜬다(원장님 「스크롤 늘지않도록 썸네일최소화」 · 44px)", /data-g="sent"/.test(row) && /size=\{44\}/.test(row));
ok("음성은 막대로 뜬다(듣고 끌기) · 사진은 누르면 크게 · 둘 다 이미 있는 부품", /isAudio\(f\.mime\) \? <Play/.test(row) && /<Photo key=\{f\.id\}/.test(row));
ok("아이 07 은 줄마다 「내가 낸 것」을 본다 · 반려 글 · 지우기 · 다시 내기(세 걸음)", /<SubmitLine item=\{it\} rules=\{d\.rules\} \/>/.test(mepage) && /data-g="rejected"/.test(cards) && /data-act="drop"/.test(cards) && /<Upload rules=\{rules\} itemId=\{id\}/.test(cards) && /<Rec rules=\{rules\} itemId=\{id\}/.test(cards));
ok("아이 화면이 검사 부호를 제 손으로 안 적는다(lib/status CHECK 한 벌)", /const MARK = Object\.fromEntries\(CHECK\);/.test(mepage) && !/"○" : it\.status === "weak"/.test(mepage));

console.log("■ 한 곳에서 읽는다 — 낸 것도 반려도 원래 숙제 줄에 산다(lib/item-plan)");
{ const home = { id: "H", reject_reason: "페이지 잘림", reject_note: null, rejected_at: "2026-09-17T00:00:00Z",
                 file_link: [{ file: { id: "F1", mime: "image/png", state: "active", orig_name: "a.png", profiles: { role: "student" } } },
                             { file: { id: "F2", mime: "audio/webm", state: "hidden", orig_name: "b.webm", profiles: { role: "student" } } },
                             { file: { id: "F3", mime: "image/png", state: "active", orig_name: "c.png", profiles: { role: "owner" } } }] };
  const check = { id: "C", carry_of: "H", carry: home };
  ok("검사 줄은 carry 를 거쳐 원본을 읽는다 · 쓸 때도 carry_of", srcOf(check).id === "H" && srcId(check) === "H" && srcOf(home).id === "H" && srcId(home) === "H");
  ok("내린 파일(state hidden)과 **원장이 준 자료**는 「아이가 낸 것」에 안 낀다(가르는 잣대는 올린 사람의 자격)", submitted(check).map((f) => f.id).join() === "F1", submitted(check).map((f) => f.id).join());
  ok("반려 글은 한 벌 · 「기타」일 때만 한 마디를 붙인다", rejectText(rejectOf(check)) === "반려 · 페이지 잘림" && rejectText(rejectOf({ reject_reason: "기타", reject_note: "다시" })) === "반려 · 기타 · 다시" && rejectOf({}) === null); }

console.log("■ 아이가 숙제에 낸다 — 붙이는 길 · 내리는 길");
ok("올리는 길에서 아이 막이가 걷혔다(전엔 403 「아이는 숙제에 붙이지 못합니다」)", !/아이는 숙제에 붙이지 못합니다/.test(api) && /me\.role === ROLES\.STUDENT\) \{ studentId = \(await myStudent\(sb, user\.id\)\)\.id; \}/.test(api));
ok("붙일 수 있는 곳은 **제 판의 숙제 줄**뿐 · 규칙이 다시 잰다(0176 child_attach)", /create policy child_attach on v2\.file_link for insert/.test(sql) && /v2\.sheet_visible\(\(select sheet_id from v2\.day_item di where di\.id = day_item_id\)\)/.test(sql));
ok("학원 사람은 아이가 낸 것을 본다(0176 staff_link)", /create policy staff_link on v2\.file_link for select/.test(sql));
ok("지우기는 **지우지 않는다**(대전제-6) — state 를 hidden 으로 내릴 뿐 · DELETE 0", /state: "hidden"/.test(T("lib/files.js")) && !/from\("file"\)\.delete\(\)/.test(T("lib/files.js")));
ok("내릴 수 있는 것은 제가 올린 것뿐(0176 own_hide · active↔hidden 만)", /create policy own_hide on v2\.file for update/.test(sql) && /state in \('active','hidden'\)/.test(sql));

console.log("■ 음성 — 받고 · 듣고 · 끈다");
ok(`받는 종류에 음성 여섯이 있다(${ALLOWED_MIME.filter(isAudio).length}가지) · 확장자도 안다`, ALLOWED_MIME.filter(isAudio).length === 6 && extOf("x", "audio/webm") === "webm" && extOf("x", "audio/mp4") === "m4a");
ok("음성은 제 크기 문턱을 쓴다(file.audio_max_mb) · 사진 문턱에 안 걸린다", checkFile({ name: "a.webm", mime: "audio/webm", bytes: 9 * 1048576 }, { maxMb: 4, audioMaxMb: 20 }) === null && checkFile({ name: "a.webm", mime: "audio/webm", bytes: 30 * 1048576 }, { maxMb: 4, audioMaxMb: 20 } ) !== null);
ok("규칙 두 줄이 0176 에 선다 · 크기와 길이", /file\.audio_max_mb/.test(sql) && /file\.audio_max_sec/.test(sql));
ok("보관함도 음성을 받는다 · 버킷 목록은 전환일 파일 9000 이 짓는다(0176 은 v2 만 건드린다)", T("supabase/migrations/9000_switch_day.sql").includes("'audio/webm'") && !/^\s*(update|insert into|alter table)\s+storage\./mi.test(sql));
ok("녹음 부품은 올리는 길을 새로 안 판다(같은 /api/files)", /fetch\("\/api\/files", \{ method: "POST"/.test(rec) && /itemId/.test(rec));
ok("못 쓰는 기기는 그 자리에서 까닭을 말한다(대전제-0 · 조용히 사라지지 않는다)", /이 기기에서는 녹음이 안 돼요/.test(rec) && /마이크 허락이 필요해요/.test(rec));
ok("길이가 넘으면 폰이 스스로 멈춘다(file.audio_max_sec)", /if \(n >= maxSec\) stop\(\)/.test(rec));
ok("올리기 부품도 음성을 고를 수 있다(accept)", /accept="image\/\*,audio\/\*/.test(up));
ok("듣기는 브라우저 막대 한 벌(<audio controls>) · 우리가 다시 안 짓는다", /<audio data-g="play"[^>]*controls/.test(play) && !/currentTime =/.test(play));
ok("**서버가 구간 요청에 206 으로 답한다** — 안 그러면 막대가 잠긴다(원장님 「재생 위치를 이동해서 아무데서나」)", /accept-ranges": "bytes"/.test(one) && /status: 206/.test(one) && /content-range/.test(one) && /status: 416/.test(one));

console.log(`\n■ 반려·제출 검사 ${n}건 · 실패 ${bad}`);
process.exit(bad ? 1 : 0);
