"use server";
/** 진도 체크 손 · 아이·오늘 기준((어41) · 대시보드 17 이 수업 일지 없이 그 자리에서 찍는다 · 원장님 9/15 「누르면 팝업이든 모달이든 뜨고 저장 하면 페이지도 안 벗어나고」).
 *  01 은 수업 일지 기준 손(app/today/actions.js)을 쓰고, 모달 부품(app/_shell/progressmodal.js)은 둘이 같은 것. 판단·쓰기는 lib/progress.js 한 벌(treeFor · setUnitsFor · doneUpToFor · skipChapterFor) */
import { staff } from "@/lib/session";
import { done as doneAt } from "@/lib/act";
import { today } from "@/lib/day";
import { treeFor, setUnitsFor, doneUpToFor, skipChapterFor } from "@/lib/progress";
const done = doneAt("/", "대시보드 17 진도 체크");
export const progressOpenFor = done(async (studentId, bookId) => { const { sb } = await staff(); const date = await today(sb); return { tree: await treeFor(sb, { studentId: String(studentId), date }, String(bookId)) }; });
export const progressSetFor = done(async (studentId, unitId, status) => { const { sb } = await staff(); const date = await today(sb); const r = await setUnitsFor(sb, { studentId: String(studentId), date }, [String(unitId)], status); return { changed: r.n > 0, status }; });
export const progressSetManyFor = done(async (studentId, unitIds, status) => { const { sb } = await staff(); const date = await today(sb); return setUnitsFor(sb, { studentId: String(studentId), date }, unitIds, status); });
export const progressUpToFor = done(async (studentId, bookId, unitId) => { const { sb } = await staff(); const date = await today(sb); return doneUpToFor(sb, { studentId: String(studentId), date }, String(bookId), String(unitId)); });
export const progressSkipFor = done(async (studentId, bookId, chapter) => { const { sb } = await staff(); const date = await today(sb); return skipChapterFor(sb, { studentId: String(studentId), date }, String(bookId), String(chapter)); });
