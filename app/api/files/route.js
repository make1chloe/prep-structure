/** 📤 올리기 한 길 · 파일 하나씩(multipart). 누가 올리나: 학원 사람은 아무 아이(+ 숙제 줄에 붙이기) · 아이는 제 것 · 학부모는 제 아이(형제면 폰이 먼저 묻는다, 확정-㊸). 종류·크기는 lib/files-plan checkFile(규칙 file.max_mb) · 보관함은 서버 자신(service role)만 닿는다 · 파일 줄은 올린 사람 자격(RLS child_upload).
 *  줄이는 것은 폰이 했다(shrunk) — 여기서는 안 줄인다(서버에 그림 꾸러미가 없다). 실패는 {ok:false,msg} 로 말한다 */
import { whoami } from "@/lib/session";
import { isStaff, ROLES } from "@/lib/roles";
import { db, serviceClient } from "@/lib/supabase";
import { today } from "@/lib/day";
import { ruleMap } from "@/lib/rule";
import { myStudent } from "@/lib/arrival";
import { myChildren } from "@/lib/parent";
import { checkFile, extOf, pathFor } from "@/lib/files-plan";
import { recordFile, attachFile, attachTodo, storagePut } from "@/lib/files";
export const dynamic = "force-dynamic";
const say = (code, msg) => Response.json({ ok: false, msg }, { status: code });
export async function POST(req) {
  const { sb, me, user } = await whoami();
  if (!user || !me) return say(401, "로그인이 필요합니다");
  let fd; try { fd = await req.formData(); } catch { return say(400, "파일이 없습니다(multipart)"); }
  const file = fd.get("file"); if (!file || typeof file === "string") return say(400, "파일이 없습니다");
  const mime = String(fd.get("mime") || file.type || ""), name = String(file.name || "파일"), bytes = file.size, note = String(fd.get("note") ?? "").slice(0, 200) || null, shrunk = String(fd.get("shrunk")) === "1";
  const want = String(fd.get("student") ?? "").trim() || null, item = String(fd.get("item") ?? "").trim() || null, todo = String(fd.get("todo") ?? "").trim() || null;   // (어78) 📌 퀵 메모·업무 줄에 붙이기
  const [date, rules] = await Promise.all([today(sb), ruleMap(sb, ["file."])]);
  const why = checkFile({ name, mime, bytes }, { maxMb: Number(rules["file.max_mb"] ?? 4), audioMaxMb: Number(rules["file.audio_max_mb"] ?? 20) }); if (why) return say(400, why);   // (어76) 음성은 제 문턱
  let studentId = null;
  if (isStaff(me.role)) { if (want && !/^[0-9a-f-]{36}$/.test(want)) return say(400, "아이가 아닙니다"); studentId = want; }
  // (어76) 원장님 2026-09-17 「숙제제출한 걸 보고 검사할수 있게 … 학생이 항목별로 제출한 사진을 확인가능하게」 · 「숙제 음성녹음으로 제출도 가능하게」
  //   아이는 **제 판의 숙제 줄에만** 붙인다 — 어느 줄인지는 붙이는 자리(file_link child_attach)가 다시 본다(0176 · 여기만 믿지 않는다)
  else if (me.role === ROLES.STUDENT) { studentId = (await myStudent(sb, user.id)).id; }
  else if (me.role === ROLES.PARENT) { const kids = await myChildren(sb); const k = kids.find((x) => x.id === want) ?? (kids.length === 1 ? kids[0] : null); if (!k) return say(400, kids.length > 1 ? "누구 학교 것인지 고르세요" : "이어진 아이가 없습니다"); studentId = k.id; if (item) return say(403, "학부모는 숙제에 붙이지 못합니다"); }
  else return say(403, "올릴 수 없는 계정입니다");
  if (item && !/^[0-9a-f-]{36}$/.test(item)) return say(400, "숙제 줄이 아닙니다");
  // (어78) 업무 줄에 붙이는 것은 학원 사람뿐이다 — 붙이는 자리(file_link staff_todo_link · 0178)가 다시 본다(여기만 믿지 않는다)
  if (todo && !isStaff(me.role)) return say(403, "업무에 붙이지 못합니다");
  if (todo && !/^[0-9a-f-]{36}$/.test(todo)) return say(400, "업무 줄이 아닙니다");
  const path = pathFor(date, crypto.randomUUID(), extOf(name, mime));
  try {
    await storagePut(serviceClient(), path, Buffer.from(await file.arrayBuffer()), mime);
    const id = await recordFile(sb, { profileId: user.id, studentId, origName: name, mime, bytes, path, shrunk, note });
    if (item) await attachFile(sb, id, item);
    if (todo) await attachTodo(sb, id, todo);
    return Response.json({ ok: true, id, path });
  } catch (e) { return say(500, String(e?.message ?? e)); }
}
