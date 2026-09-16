"use server";
/** 「교재 배정」 손 한 벌((어41) · 원장님 9/15 「숙제를 최초에 어디서 배정을 하냐 … 배정이 없으면 걍 진도체크된거부터 뜨게하든가」) · 대시보드 17 · 오늘 01 · 학생 14 가 같은 모달(app/_shell/assignmodal.js)로 부른다.
 *  목록은 lib/routine.js bookChoices(진도 체크된 교재부터 · 전체 권수도) · 배정은 assignBook(루틴 11 과 같은 손 · 고른 것 전부) · 01 에서 부르면 오늘 수업 일지에 바로 깐다(layRoutine · 이미 깐 교재는 안 건드린다)
 *  (어49) 세운 줄 수를 돌려주고 0 이면 까닭까지(whyNotLaid) · 원장님 2026-09-16 「숙제최초배정을 아직도 할수가 없음」 */
import { revalidatePath } from "next/cache";
import { staff } from "@/lib/session";
import { done as doneAt } from "@/lib/act";
import { today } from "@/lib/day";
import { bookChoices, assignBook, layRoutine, whyNotLaid } from "@/lib/routine";
const done = doneAt("/", "교재 배정");
export const assignChoices = done(async (studentId) => { const { sb } = await staff(); const date = await today(sb); return bookChoices(sb, String(studentId), date); });   // { choices, total }
export const assignBooksFor = done(async (studentId, bookIds, date, sheetId = null) => {   // 여러 권 한 번에(고르기 한 벌 · 대전제-20) · 같은 날부터
  const { sb } = await staff(); const on = date || await today(sb); const ids = [], books = [...new Set((bookIds ?? []).map(String))];
  for (const b of books) ids.push(await assignBook(sb, String(studentId), b, on));
  if (!ids.length) throw new Error("고른 교재 없음");
  let laid = null, why = null;
  if (sheetId) { const r = await layRoutine(sb, String(sheetId)); laid = r.rows; if (!r.rows) why = await whyNotLaid(sb, String(studentId), books, on); }   // 01 에서 · 오늘 수업 일지에 그 교재 줄이 바로 선다 · 0줄이면 까닭
  revalidatePath("/today"); revalidatePath("/ops"); revalidatePath("/settings/routine");
  return { ids, laid, why };
});
