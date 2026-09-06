"use server";
/** 설정의 손 — 학원 회선 주소 더하기(원장만). 그 자리의 주소를 읽어 v2.integration arrival 에 적는다(답 ⑨). 판단은 lib/arrival.js */
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { guard } from "@/lib/session";
import { ROLES } from "@/lib/roles";
import { allowIp } from "@/lib/arrival";
import { clientIp } from "@/lib/arrival-plan";
export async function allowThisIp() {
  try {
    const { sb, me } = await guard();
    if (me?.role !== ROLES.PRINCIPAL) throw new Error("원장님만 더할 수 있습니다");
    const h = await headers();
    const ip = clientIp((k) => h.get(k)) ?? "127.0.0.1";
    const r = await allowIp(sb, ip, "설정에서 더함");
    revalidatePath("/settings");
    return { ok: true, ip, ...r };
  } catch (e) { return { ok: false, msg: String(e?.message ?? e) }; }
}
