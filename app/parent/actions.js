"use server";
/** 학부모 화면의 손 — 남기실 말 하나. guard(학부모 계정) → lib/request. 아이는 형제 중 고른 아이(studentId — 내 아이인지 접근 규칙이 본다) */
import { revalidatePath } from "next/cache";
import { guard } from "@/lib/session";
import { ROLES } from "@/lib/roles";
import { ask as askRequest } from "@/lib/request";
import { wrap as act } from "@/lib/act";
const wrap = (fn) => act(fn, "학부모 09");   // 손 한 벌은 lib/act.js(원칙-1)
export async function ask(studentId, body) {
  return wrap(async () => {
    const { sb, me, user } = await guard();
    if (me?.role !== ROLES.PARENT) throw new Error("학부모 계정만 씁니다");
    await askRequest(sb, { profileId: user.id, studentId: String(studentId), body });
    revalidatePath("/parent");
    return {};
  });
}
