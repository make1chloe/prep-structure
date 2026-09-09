"use server";
/** 수강료 손 — 학원 사람 중 수강료가 열린 사람만(ops.fee). 판단·쓰기는 lib/fee.js 한 벌 */
import { guard } from "@/lib/session";
import { isStaff } from "@/lib/roles";
import { decide, OPS } from "@/lib/perm";
import { feeBoard, savePayments, importPayments, remindFees, setByGrade } from "@/lib/fee";
import { scheduleFor } from "@/lib/send";
import { today } from "@/lib/day";
import { rowsOf } from "@/lib/fee-plan";
import { serviceClient } from "@/lib/supabase";
import { parseSheet } from "@/lib/fee-plan";
import * as XLSX from "xlsx";
async function feeStaff(ym) {
  const w = await guard(); if (!isStaff(w.me?.role)) throw new Error("학원 사람만 씁니다");
  const board = await feeBoard(w.sb, ym);
  if (decide(w.me.role, board.access ?? [], OPS.fee) !== true) throw new Error("이 계정에는 수강료가 안 열려 있습니다");
  return { ...w, board };
}
async function wrap(fn) { try { return { ok: true, ...(await fn()) }; } catch (e) { return { ok: false, msg: String(e?.message ?? e) }; } }
export async function saveAct(ym, edits) { return wrap(async () => { const { sb, board } = await feeStaff(ym); return savePayments(sb, ym, edits, board); }); }
export async function byGradeAct(ym, f) { return wrap(async () => { const { sb } = await feeStaff(ym); return setByGrade(sb, f); }); }
export async function remindAct(ym) { return wrap(async () => { const { sb, board } = await feeStaff(ym); return remindFees(serviceClient(), sb, ym, board); }); }
export async function scheduleFeesAct(ym, choice, custom) { return wrap(async () => { const { sb, board, user } = await feeStaff(ym); const ids = rowsOf(board, ym).filter((r) => r.state === "unpaid" && r.payment_id).map((r) => r.student_id); return scheduleFor(sb, "fee", ym, ids, choice, custom, user.id, await today(sb)); }); }   // (어) ⏰ 안 받은 집 예약 — 지금 안 받은 집(때가 되면 그때 다시 본다)
export async function importAct(ym, formData) {
  return wrap(async () => {
    const { sb, board } = await feeStaff(ym);
    const f = formData?.get?.("file"); if (!f || typeof f.arrayBuffer !== "function") throw new Error("엑셀 파일을 고르세요");
    const wb = XLSX.read(Buffer.from(await f.arrayBuffer()), { type: "buffer" });
    const ws = wb.Sheets[wb.SheetNames[0]]; if (!ws) throw new Error("시트가 없습니다");
    const parsed = parseSheet(XLSX.utils.sheet_to_json(ws, { defval: "" }), Number(ym.slice(0, 4)));
    if (!parsed.length) throw new Error("읽을 줄이 없습니다 — 학생 이름 열(학생명·이름·성명)이 있어야 합니다");
    return importPayments(sb, ym, parsed, board);
  });
}
