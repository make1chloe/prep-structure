/** ⬇ 성적 엑셀(16 · 5단계-⑤) — /api/scores/xlsx?e=<회차> 는 성적 양식(올리기와 같은 열 · 보는 아이 이름을 채우고 있는 성적은 그대로) · &q=1 은 문항표(번호 · 영역 — 모의고사는 적힌 것이 없으면 표준 문항표가 나간다).
 *  열은 lib/score-plan(exportScoreRows · exportQuestionRows) 한 벌 · 판은 score_board 한 벌. 학원 사람만 */
import { guard } from "@/lib/session";
import { isStaff } from "@/lib/roles";
import { today } from "@/lib/day";
import { scoreBoard } from "@/lib/score";
import { rowsOf, questionsFor, exportScoreRows, exportQuestionRows, SCORE_HEADERS, QUESTION_HEADERS } from "@/lib/score-plan";
import * as XLSX from "xlsx";
export const dynamic = "force-dynamic";
const file = (rows, headers, sheet, name) => {
  const ws = XLSX.utils.json_to_sheet(rows.length ? rows : [Object.fromEntries(headers.map((h) => [h, ""]))]); const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, sheet);
  const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
  return new Response(buf, { headers: { "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "Content-Disposition": `attachment; filename="${name}"`, "Cache-Control": "no-store" } });
};
export async function GET(req) {
  const { sb, me } = await guard();
  if (!isStaff(me?.role)) return new Response("학원 사람만", { status: 403 });
  const sp = new URL(req.url).searchParams, e = sp.get("e") ?? "", q = sp.get("q") === "1";
  if (!/^[0-9a-f-]{36}$/.test(e)) return new Response("회차가 아닙니다", { status: 400 });
  const board = await scoreBoard(sb, e, await today(sb));
  if (!board?.exam) return new Response("회차가 없습니다", { status: 404 });
  const tag = e.slice(0, 8);   // 파일 이름은 ASCII 로 — 헤더(Content-Disposition)는 한글을 못 싣는다(9/7 게이트: ByteString 500)
  if (q) return file(exportQuestionRows(questionsFor(board.exam)), QUESTION_HEADERS, "문항표", `questions-${tag}.xlsx`);
  return file(exportScoreRows(rowsOf(board), board.exam?.level ?? null), SCORE_HEADERS, "성적", `scores-${tag}.xlsx`);   // 등급은 학교 것만 · 학교급의 꼴로(중 「B」 · 고 「2등급」 — (가)-⑩)
}
