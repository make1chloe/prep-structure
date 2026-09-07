"use server";
/** 카드 순서(확정-⑮ · 4단계-6) — 로그인한 사람 제 것만(RLS own_sp). 아이·학부모·학원 사람 다 같은 손 */
import { guard } from "@/lib/session";
import { setPref } from "@/lib/pref";
export async function setPrefAct(screen, layout) { try { const { sb, me } = await guard(); if (!me) throw new Error("로그인이 필요합니다"); return { ok: true, layout: await setPref(sb, me.id, screen, layout) }; } catch (e) { return { ok: false, msg: String(e?.message ?? e) }; } }
