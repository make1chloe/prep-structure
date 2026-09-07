/** 자료함 20 의 손 — 판 읽기(한 벌 file_board) · 갈래 고르기(file_sort) · 파일 줄 남기기(올린 사람 자격 — RLS child_upload) · 숙제에 붙이기 · 아이가 처리(💾 저장 · ✓ 안 보기) · 보관함(Storage 버킷 files, 서버 자신만 닿는다).
 *  판단은 lib/files-plan.js(순수). 지우지 않는다 — 원장님 9/3 「그냥 둬. 지우지 마」 */
import { db } from "./supabase.js";
import { isKind } from "./files-plan.js";
const BUCKET = "files";
const row = (r, what) => { if (r?.error) throw new Error(`${what}: ${r.error.message}`); return r?.data ?? null; };
export async function fileBoard(sb, date) {
  const { data, error } = await db(sb).rpc("file_board", { p_on: date });
  if (error) throw new Error(`자료함을 못 읽음: ${error.message}`);
  if (!data) throw new Error("자료함은 학원 사람의 화면입니다");
  return data;
}
/** 갈래 고르기 — 학교·학년·학기는 아이에게서 저절로(SQL 이 붙인다). 「그 밖」은 아이별 칸 */
export async function sortFile(sb, fileId, kind) {
  if (!isKind(kind)) throw new Error(`갈래가 아닙니다: ${kind}`);
  return row(await db(sb).rpc("file_sort", { p_file: fileId, p_kind: kind }), "갈래를 못 고름");
}
/** 파일 줄 — 올린 사람 자격으로 남긴다(by_profile = 나 · RLS child_upload). 보관함에는 이미 올라가 있다 */
export async function recordFile(sb, { profileId, studentId = null, origName, mime, bytes, path, shrunk = false, note = null }) {
  const ins = row(await db(sb).from("file").insert({ by_profile: profileId, student_id: studentId, orig_name: origName, mime, bytes, path, shrunk, note: note || null }).select("id").single(), "파일 줄을 못 남김");
  return ins.id;
}
/** 숙제 줄에 붙인다 — 학원 사람만(RLS staff_all). 같은 자리에 두 번은 없다 */
export async function attachFile(sb, fileId, itemId) { row(await db(sb).from("file_link").upsert({ file_id: fileId, day_item_id: itemId }, { onConflict: "file_id,bin_id,day_item_id,notice_id,consult_id", ignoreDuplicates: true }), "숙제에 못 붙임"); }
/** 아이가 처리했다 — 💾 저장(폰에 내려받음) · ✓ 안 보기(그 줄에서만 치움). RLS child_seen 이 제 판의 줄만 연다 */
export async function markSeen(sb, fileId, itemId, how) {
  if (!["saved", "skip"].includes(how)) throw new Error("저장 또는 안 보기");
  const { error, count } = await db(sb).from("file_link").update({ seen_by_child: how, seen_at: new Date().toISOString() }, { count: "exact" }).eq("file_id", fileId).eq("day_item_id", itemId);
  if (error) throw new Error(`처리를 못 남김: ${error.message}`);
  if (!count) throw new Error("내 숙제에 붙은 파일이 아닙니다");
}
/** 내(아이·학부모) 숙제에 붙은 파일 — 지난 60일(1달 창은 판단이 규칙으로 자른다). RLS own_link 가 제 판(학부모는 마감한 판)만 준다 */
export const LINK_SEL = "file_id,day_item_id,seen_by_child,seen_at,created_at,file(id,orig_name,mime,bytes,note),day_item!inner(id,slot,range_note,item_id,learn_items(name),day_sheet!inner(student_id,date))";
export const myLinks = (sb, studentId, lo) => db(sb).from("file_link").select(LINK_SEL).eq("day_item.day_sheet.student_id", studentId).gte("created_at", `${lo}T00:00:00Z`).order("created_at", { ascending: false });
/** 파일 한 줄 — 읽기 규칙(RLS own_file · staff_all)이 결정한다. 없으면 null(남의 것도 「없음」) */
export async function fileById(sb, id) { return row(await db(sb).from("file").select("id,orig_name,mime,bytes,path,by_profile,student_id").eq("id", id).maybeSingle(), "파일을 못 읽음"); }
/** 보관함 — 서버 자신만 닿는다(버킷은 비공개 · 읽기 규칙은 v2.file 을 빌려 쓴다, 9000). 같은 경로에 덮지 않는다 */
export async function storagePut(svc, path, bytes, mime) {
  const { error } = await svc.storage.from(BUCKET).upload(path, bytes, { contentType: mime, upsert: false });
  if (error) throw new Error(`보관함에 못 올림: ${error.message}`);
}
export async function storageGet(svc, path) {
  const { data, error } = await svc.storage.from(BUCKET).download(path);
  if (error) throw new Error(`보관함에서 못 읽음: ${error.message}`);
  return Buffer.from(await data.arrayBuffer());
}
/** ② 원장님 답 한 줄 — 학원 사람만(RLS staff_all · 아이·학부모는 update 정책이 없다). 비우면 자동 답 자리로 돌아간다 */
export async function setReply(sb, fileId, text) {
  const t = String(text ?? "").trim().slice(0, 200) || null;
  const { error, count } = await db(sb).from("file").update({ reply: t, replied_at: t ? new Date().toISOString() : null }, { count: "exact" }).eq("id", fileId);
  if (error) throw new Error(`답을 못 적음: ${error.message}`);
  if (!count) throw new Error("파일이 없습니다");
}
/** 내가 보낸 것(아이·학부모) — 지난 60일 · RLS own_file(by_profile = 나). 아이 이름은 학부모 카드가 형제를 가를 때 */
export const mySent = (sb, profileId, lo) => db(sb).from("file").select("id,orig_name,mime,bytes,note,uploaded_at,reply,replied_at,student_id,students(name)").eq("by_profile", profileId).gte("uploaded_at", `${lo}T00:00:00Z`).order("uploaded_at", { ascending: false }).limit(20);
