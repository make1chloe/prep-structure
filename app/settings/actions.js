"use server";
/** 설정의 손 — 학원 회선 주소 더하기(원장만). 그 자리의 주소를 읽어 v2.integration arrival 에 적는다(답 ⑨). 판단은 lib/arrival.js */
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { guard } from "@/lib/session";
import { ROLES } from "@/lib/roles";
import { allowIp } from "@/lib/arrival";
import { saveKeys, testSms } from "@/lib/integration";   // (터) 연동 열쇠 — 원장만
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
/** (터) 연동 열쇠 — **원장만**. 판단·쓰기는 lib/integration.js 한 벌 · 화면으로는 가린 것만 나간다(확정-72) */
async function principal() { const w = await guard(); if (w.me?.role !== ROLES.PRINCIPAL) throw new Error("원장님만 쓰는 자리입니다"); return w; }
export async function saveKeysAct(id, form) { try { await principal(); return { ok: true, ...(await saveKeys(id, form ?? {})) }; } catch (e) { return { ok: false, msg: String(e?.message ?? e) }; } }
export async function testSmsAct(to) { try { await principal(); return { ok: true, ...(await testSms(to)) }; } catch (e) { return { ok: false, msg: String(e?.message ?? e) }; } }
