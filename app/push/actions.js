"use server";
/** 알림 켜기의 서버 쪽 — 공개키 한 칸(v2.push_public_key) · 기기 저장(v2.push_sub, 제 것만 — own_push) · 끄기(revoked_at, 지우지 않는다). 학생은 제 학생 줄을 붙인다 */
import { guard } from "@/lib/session";
import { db } from "@/lib/supabase";
import { ROLES } from "@/lib/roles";
import { myStudent } from "@/lib/arrival";
async function wrap(fn) { try { return { ok: true, ...(await fn()) }; } catch (e) { return { ok: false, msg: String(e?.message ?? e) }; } }
export async function publicKey() {
  return wrap(async () => {
    const { sb } = await guard();
    const { data, error } = await db(sb).rpc("push_public_key");
    if (error) throw new Error(`공개키를 못 읽음: ${error.message}`);
    if (!data) throw new Error("아직 알림 열쇠가 없습니다 — 원장님께 말씀해 주세요(연동 push 줄이 비어 있습니다)");
    return { key: data };
  });
}
export async function save(sub) {
  return wrap(async () => {
    const { sb, me, user } = await guard();
    if (!sub?.endpoint || !sub?.keys?.p256dh || !sub?.keys?.auth) throw new Error("구독 정보가 없습니다 — 다시 켜 주세요");
    const studentId = me?.role === ROLES.STUDENT ? (await myStudent(sb, user.id)).id : null;
    const { error } = await db(sb).from("push_sub").upsert({ profile_id: user.id, student_id: studentId, endpoint: sub.endpoint, p256dh: sub.keys.p256dh, auth: sub.keys.auth, revoked_at: null, agreed_at: new Date().toISOString() }, { onConflict: "endpoint" });
    if (error) throw new Error(error.code === "42501" ? "이 기기는 다른 계정으로 알림을 켠 상태입니다 — 그 계정에서 끄고 다시 켜 주세요" : `기기를 못 저장함: ${error.message}`);
    return {};
  });
}
export async function remove(endpoint) {
  return wrap(async () => {
    const { sb, user } = await guard();
    if (!endpoint) return {};
    const { error } = await db(sb).from("push_sub").update({ revoked_at: new Date().toISOString() }).eq("endpoint", endpoint).eq("profile_id", user.id);
    if (error) throw new Error(`끄기를 못 적음: ${error.message}`);
    return {};
  });
}
