"use server";
/** (어64) 직원 계정의 손 — 원장만(표 RLS 도 원장만 받지만 여기서 한 번 더 막는 것은 「말」을 위해서다).
 *  판단은 lib/staff-plan.js · 저장은 lib/staff.js 한 벌(원칙-1) */
import { guard } from "@/lib/session";
import { serviceClient } from "@/lib/supabase";
import { ROLES } from "@/lib/roles";
import { issueStaffAccount, setStaffRole, setStaffState, resetStaffPassword } from "@/lib/staff";
import { done as doneAt } from "@/lib/act";
const done = doneAt("/settings/staff", "직원 계정");

async function onlyPrincipal() { const w = await guard(); if (w.me?.role !== ROLES.PRINCIPAL) throw new Error("원장님만 하시는 일"); return w; }
export const staffIssue = done(async (form) => { const { sb } = await onlyPrincipal(); return issueStaffAccount(serviceClient(), sb, { name: form?.name, loginId: form?.loginId, role: form?.role }); });
export const staffRole = done(async (id, role) => { const { sb } = await onlyPrincipal(); return setStaffRole(sb, String(id), String(role)); });
export const staffOpen = done(async (id, state) => { const { sb, user } = await onlyPrincipal(); return setStaffState(sb, String(id), String(state), user?.id ?? null); });
/** (어74) 비밀번호 되돌리기 — 원장만 · 선생님·조교만(lib/staff 가 막는다) · 서버 자신이 인증에 적는다 */
export const staffReset = done(async (id) => { const { sb } = await onlyPrincipal(); return resetStaffPassword(serviceClient(), sb, String(id)); });
