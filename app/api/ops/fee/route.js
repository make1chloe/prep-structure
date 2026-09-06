/** 수강료 엑셀 — /api/ops/fee?m=YYYY-MM. 화면이 세는 것과 같은 줄(lib/fee-plan rowsOf → exportRows)을 xlsx 로. 학원 사람 중 수강료가 열린 사람만 */
import * as XLSX from "xlsx";
import { whoami } from "@/lib/session";
import { isStaff } from "@/lib/roles";
import { decide, OPS } from "@/lib/perm";
import { feeBoard } from "@/lib/fee";
import { rowsOf, exportRows } from "@/lib/fee-plan";
export const dynamic = "force-dynamic";
export async function GET(req) {
  const ym = new URL(req.url).searchParams.get("m") ?? "";
  if (!/^\d{4}-\d{2}$/.test(ym)) return new Response("달이 아닙니다", { status: 400 });
  const w = await whoami();
  if (!w.me || !isStaff(w.me.role)) return new Response("학원 사람만", { status: 403 });
  let board;
  try { board = await feeBoard(w.sb, ym); } catch (e) { return new Response(String(e?.message ?? e), { status: 500 }); }
  if (decide(w.me.role, board.access ?? [], OPS.fee) !== true) return new Response("수강료가 안 열려 있습니다", { status: 403 });
  const ws = XLSX.utils.json_to_sheet(exportRows(rowsOf(board, ym), ym));
  const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, ym);
  const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
  return new Response(buf, { headers: { "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "Content-Disposition": `attachment; filename="fee-${ym}.xlsx"`, "Cache-Control": "no-store" } });
}
