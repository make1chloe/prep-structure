"use server";
/** 아이 화면의 손 — 전부 guard(아이 계정) → lib 의 판단 한 벌 → 다시 그리기. 판단은 여기 없다.
 *  등원·하원은 서버 자신(service role)도 든다 — 판을 세우는 것은 원장 손과 같은 길이어야 하는데 아이 자격은 판을 못 깐다(lib/arrival.js). 실패는 {ok:false,msg} 로 돌려 그 자리에서 말한다 */
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { guard } from "@/lib/session";
import { ROLES } from "@/lib/roles";
import { db, serviceClient } from "@/lib/supabase";
import { today, rosterPeople } from "@/lib/day";
import { myStudent, stamp } from "@/lib/arrival";
import { clientIp, classChoice } from "@/lib/arrival-plan";
import { setStage, setDue } from "@/lib/material";
import { ask as askRequest } from "@/lib/request";
import { studentSubmit } from "@/lib/score";
import { studentMark, raiseFlag } from "@/lib/road";
import { markSeen } from "@/lib/files";
import { markSpan, fillDuration } from "@/lib/video";
const done = (fn) => async (...a) => { try { const r = await fn(...a); revalidatePath("/me"); return { ok: true, ...(r ?? {}) }; } catch (e) { return { ok: false, msg: String(e?.message ?? e) }; } };
async function child() { const w = await guard(); if (w.me?.role !== ROLES.STUDENT) throw new Error("아이 계정만 찍습니다"); return w; }
/** 걸음을 찍는다(1 핸드폰 · 2 출석 · 3 숙제 · 4 집에 가요). 반이 둘인 날은 아이가 고른 반(classId)으로 */
export const arrive = done(async (step, classId = null) => {
  const { sb, user } = await child();
  const h = await headers();
  const ip = clientIp((k) => h.get(k)) ?? "127.0.0.1";   // 주소가 없으면 로컬(눌러보기·개발) — Vercel 은 늘 x-forwarded-for 를 준다
  const svc = serviceClient();
  const [date, st] = await Promise.all([today(sb), myStudent(sb, user.id)]);
  const people = await rosterPeople(sb, date);
  const pick = classChoice(people.classes);
  const cls = classId ? people.classes.find((c) => c.id === classId) : null;
  if (Number(step) === 2 && pick.pick && !cls) throw new Error("어느 반인지 먼저 골라 주세요");
  if (Number(step) === 2 && pick.none) throw new Error("오늘은 수업이 없어요");
  return stamp(sb, svc, { studentId: st.id, step: Number(step), classId: cls?.id ?? pick.classId ?? null, date, ip, start: cls?.start ?? pick.start ?? null });
});
/** 📚 받을 학습지 — 단계 · 스스로 정한 마감(DB 문지기 0117 이 그 두 칸만 연다) */
export const stage = done(async (materialId, value) => { const { sb, user } = await child(); const st = await myStudent(sb, user.id); await setStage(sb, String(materialId), st.id, String(value)); });
export const due = done(async (materialId, dueOn) => { const { sb, user } = await child(); const st = await myStudent(sb, user.id); await setDue(sb, String(materialId), st.id, dueOn ? String(dueOn) : null); });
/** 💬 남기실 말 — 원장님께 한 줄(대시보드 답할 것에 뜬다) */
export const ask = done(async (body) => { const { sb, user } = await child(); const st = await myStudent(sb, user.id); await askRequest(sb, { profileId: user.id, studentId: st.id, body }); });
/** 「다 했어요」 — 켜고 무른다(답 ⑧). 시각은 DB 문지기가 서버 시계로 */
export const said = done(async (itemId, on) => {
  const { sb } = await child();
  const { error } = await db(sb).from("day_item").update({ said_done_at: on ? new Date().toISOString() : null }).eq("id", String(itemId));
  if (error) throw new Error(`못 적음: ${error.message}`);
});
/** 📈 내 성적 넣기 — 제 회차만 · 확인 전엔 다시 넣어 고친다(lib/score studentSubmit — RLS 도 같은 문) */
export const submitScore = done(async (examId, raw, full, wrongs) => { const { sb, user } = await child(); return studentSubmit(sb, user, { examId, raw, full: full || 100, wrongs }, await today(sb)); });
/** 🛤️ 로드맵 08 — 내 교재 진도를 찍는다(열려 있을 때 · 원장님 줄은 못 덮는다 · 확인 기다리는 중으로) · ❗ 이의(진도는 안 바뀐다). 판단은 lib/road 한 벌 */
export const markUnit = done(async (unitId, round, status) => { const { sb, user } = await child(); const st = await myStudent(sb, user.id); const r = await studentMark(sb, { studentId: st.id, unitId: String(unitId), round: Number(round) || 1, status: String(status), date: await today(sb) }); revalidatePath("/me/book"); return r; });
export const flagUnit = done(async (unitId, round, kind, said) => { const { sb, user } = await child(); const st = await myStudent(sb, user.id); const id = await raiseFlag(sb, { studentId: st.id, unitId: String(unitId), round: Number(round) || 1, kind: String(kind), said }); revalidatePath("/me/book"); return { id }; });
/** 📎 붙은 파일을 처리했다 — 💾 저장(폰에 내려받음) · ✓ 안 보기(그 줄에서만 치움). 둘 다 「지난 것 보기」에서 1달간(목업 20) */
export const seen = done(async (fileId, itemId, how) => { const { sb } = await child(); await markSeen(sb, String(fileId), String(itemId), String(how)); });
/** 🎬 지나간 구간을 찍는다(재생기가 20초마다·멈출 때) — 다시 그리지 않는다(재생 중이다). 겹침·「다 봄」은 SQL(0128 video_mark) */
export async function span(videoId, from, to, pos) { try { const { sb } = await child(); return { ok: true, r: await markSpan(sb, String(videoId), Number(from), Number(to), Number(pos)) }; } catch (e) { return { ok: false, msg: String(e?.message ?? e) }; } }
/** 🎬 길이를 모르는 영상은 재생기가 처음 알려 준다(비어 있을 때만 — SQL 이 지킨다) */
export async function duration(videoId, seconds) { try { const { sb } = await child(); return { ok: true, set: await fillDuration(sb, String(videoId), Number(seconds)) }; } catch (e) { return { ok: false, msg: String(e?.message ?? e) }; } }
