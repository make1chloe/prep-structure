/** ⬇ 내신 자료 엑셀(04) — 회차 하나: 학생 × 자료 줄(학교 · 학교 진도 · 자료 종류 · 갈래 · 항목 · 받음 · 단계). 학원 사람만 · 판은 prep_board 한 벌 */
import { guard } from "@/lib/session";
import { isStaff } from "@/lib/roles";
import { today } from "@/lib/day";
import { prepBoard } from "@/lib/todo";
import { STAGES } from "@/lib/material-plan";
import * as XLSX from "xlsx";
export const dynamic = "force-dynamic";
export async function GET(req) {
  const { sb, me } = await guard();
  if (!isStaff(me?.role)) return new Response("학원 사람만", { status: 403 });
  const e = new URL(req.url).searchParams.get("e");
  if (!/^[0-9a-f-]{36}$/.test(String(e ?? ""))) return new Response("회차가 없습니다(?e=)", { status: 400 });
  const b = await prepBoard(sb, e, await today(sb));
  const stage = (k) => STAGES.find(([x]) => x === k)?.[1] ?? k;
  const rows = [];
  for (const t of b.takers ?? []) {
    const mine = (b.materials ?? []).filter((m) => m.state !== "dropped" && (m.gives ?? []).some((g) => g.student_id === t.id));
    if (!mine.length) rows.push({ 학생: t.name, 학교: t.school ?? "", 학년: t.grade ?? "", "학교 진도": t.school_prog ?? "", 출처: "", 자료종류: "", 갈래: "", 항목: "", 받음: "", 단계: "" });
    for (const m of mine) { const g = m.gives.find((x) => x.student_id === t.id); rows.push({ 학생: t.name, 학교: t.school ?? "", 학년: t.grade ?? "", "학교 진도": t.school_prog ?? "", 출처: m.source, 자료종류: m.type, 갈래: m.title, 항목: (m.items ?? []).map((i) => i.name).join(", "), 받음: g?.handed_at ? "줌" : "", 단계: stage(g?.stage ?? "none") }); }
  }
  const ws = XLSX.utils.json_to_sheet(rows, { header: ["학생", "학교", "학년", "학교 진도", "출처", "자료종류", "갈래", "항목", "받음", "단계"] });
  const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, "내신자료");
  const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
  const name = encodeURIComponent(`내신자료-${b.exam?.school ?? "전국"}-${b.exam?.name ?? ""}.xlsx`);
  return new Response(buf, { headers: { "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "content-disposition": `attachment; filename*=UTF-8''${name}` } });
}
