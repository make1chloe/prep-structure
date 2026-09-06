/** 교재 단원 엑셀 — /api/books/xlsx?b=<교재> (하나) · 없으면 전부. 올리기 양식과 같은 열(lib/book-plan exportRows). 학원 사람만 */
import * as XLSX from "xlsx";
import { whoami } from "@/lib/session";
import { isStaff } from "@/lib/roles";
import { db } from "@/lib/supabase";
import { exportRows } from "@/lib/book-plan";
export const dynamic = "force-dynamic";
export async function GET(req) {
  const b = new URL(req.url).searchParams.get("b") ?? "";
  const w = await whoami(); if (!w.me || !isStaff(w.me.role)) return new Response("학원 사람만", { status: 403 });
  let q = db(w.sb).from("units").select("id,book_id,chapter,mid,sub,activity,is_workbook,sort,page_start,page_end,q_count,q_range,gist,books!inner(id,name,code,area,state)").eq("state", "active").order("sort");
  if (b) { if (!/^[0-9a-f-]{36}$/.test(b)) return new Response("교재가 아닙니다", { status: 400 }); q = q.eq("book_id", b); } else q = q.eq("books.state", "active");
  const { data, error } = await q; if (error) return new Response(error.message, { status: 500 });
  const byBook = new Map(); for (const u of data ?? []) { if (!byBook.has(u.book_id)) byBook.set(u.book_id, { book: u.books, units: [] }); byBook.get(u.book_id).units.push(u); }
  const rows = [...byBook.values()].sort((x, y) => String(x.book.name).localeCompare(String(y.book.name))).flatMap(({ book, units }) => exportRows(units, book));
  const ws = XLSX.utils.json_to_sheet(rows.length ? rows : [{ 교재명: "", 교재ID: "", 대단원: "", 중단원: "", 소단원: "", 활동명: "", 워크북: "", 시작페이지: "", 끝페이지: "", 문항수: "", 문항범위: "", 핵심내용: "" }]);
  const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, "단원");
  const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
  return new Response(buf, { headers: { "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "Content-Disposition": `attachment; filename="units${b ? "-" + b.slice(0, 8) : ""}.xlsx"`, "Cache-Control": "no-store" } });
}
