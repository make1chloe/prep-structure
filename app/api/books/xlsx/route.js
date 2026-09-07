/** 교재 엑셀 — /api/books/xlsx?b=<교재> 는 그 교재의 단원 · 없으면 단원 전부 · ?s=books 는 교재 시트(교재명 · 교재ID · 영역 · 출판사 · 연도 · 레벨 · 교재비 · 구매링크 · 단원수 — 5단계-④).
 *  둘 다 올리기 양식과 같은 열(lib/book-plan exportRows · exportBookRows 한 벌). 학원 사람만 */
import * as XLSX from "xlsx";
import { whoami } from "@/lib/session";
import { isStaff } from "@/lib/roles";
import { db } from "@/lib/supabase";
import { exportRows, exportBookRows, UNIT_HEADERS, BOOK_HEADERS } from "@/lib/book-plan";
export const dynamic = "force-dynamic";
const file = (rows, sheet, name) => {
  const ws = XLSX.utils.json_to_sheet(rows); const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, sheet);
  const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
  return new Response(buf, { headers: { "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "Content-Disposition": `attachment; filename="${name}"`, "Cache-Control": "no-store" } });
};
const empty = (headers) => [Object.fromEntries(headers.map((h) => [h, ""]))];
export async function GET(req) {
  const sp = new URL(req.url).searchParams, b = sp.get("b") ?? "", s = sp.get("s") ?? "";
  const w = await whoami(); if (!w.me || !isStaff(w.me.role)) return new Response("학원 사람만", { status: 403 });
  if (s === "books") {
    const [bk, un] = await Promise.all([db(w.sb).from("books").select("id,code,name,area,publisher,pub_year,level,price,buy_url,state").neq("state", "stopped"), db(w.sb).from("units").select("book_id").eq("state", "active")]);
    if (bk.error || un.error) return new Response((bk.error ?? un.error).message, { status: 500 });
    const cnt = {}; for (const u of un.data ?? []) cnt[u.book_id] = (cnt[u.book_id] ?? 0) + 1;
    const rows = exportBookRows((bk.data ?? []).map((x) => ({ ...x, units: cnt[x.id] ?? 0 })));
    return file(rows.length ? rows : empty(BOOK_HEADERS), "교재", "books.xlsx");
  }
  let q = db(w.sb).from("units").select("id,book_id,chapter,mid,sub,activity,is_workbook,sort,page_start,page_end,q_count,q_range,gist,books!inner(id,name,code,area,state)").eq("state", "active").order("sort");
  if (b) { if (!/^[0-9a-f-]{36}$/.test(b)) return new Response("교재가 아닙니다", { status: 400 }); q = q.eq("book_id", b); } else q = q.eq("books.state", "active");
  const { data, error } = await q; if (error) return new Response(error.message, { status: 500 });
  const byBook = new Map(); for (const u of data ?? []) { if (!byBook.has(u.book_id)) byBook.set(u.book_id, { book: u.books, units: [] }); byBook.get(u.book_id).units.push(u); }
  const rows = [...byBook.values()].sort((x, y) => String(x.book.name).localeCompare(String(y.book.name))).flatMap(({ book, units }) => exportRows(units, book));
  return file(rows.length ? rows : empty(UNIT_HEADERS), "단원", `units${b ? "-" + b.slice(0, 8) : ""}.xlsx`);
}
