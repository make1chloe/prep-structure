/**
 * 엑셀 **내려받기** — 화면이 아니라 파일을 주는 문이다.
 *
 * ⚠️ **내려받기는 모든 표에 둔다** (확정 ⑤) — 눈으로 훑고 백업하는 길이라 **주인과 무관하다.**
 * ⚠️ **내려받기와 올리기는 같은 모양이다** (엑셀 규칙 1). 내려받은 파일을 고쳐 그대로 올릴 수 있어야
 *    하므로, 머리줄·첫 칸(번호)·날짜 열 텍스트 고정을 전부 `lib/excel.js` 한 벌이 만든다.
 *    여기서 파일 모양을 손대면 그날부터 왕복이 깨진다.
 * ⚠️ **역할을 스스로 본다.** 문지기는 역할로 주소를 안 지킨다 — 이 문이 열려 있으면
 *    학생 세션으로 교재·학생 명단이 통째로 빠져나간다.
 * ⚠️ 서비스 열쇠를 안 쓴다. 로그인한 그 사람으로 갈아탄 뒤 읽으므로 접근 규칙이 그대로 걸린다.
 */
import { staffOnly } from "../who.js";
import { openAs } from "../db.js";
import { downloadRows, makeWorkbook } from "../../../lib/excel.js";
import { SHEET_KEYS, sheetTitle } from "../read.js";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const UUID = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;
const say = (msg, code) => new Response(msg, { status: code, headers: { "content-type": "text/plain; charset=utf-8" } });

export async function GET(req) {
  const me = await staffOnly();
  if (!me.ok) return say(`못 내려받습니다 — ${me.msg}`, me.why === "not-staff" ? 403 : 401);

  const url = new URL(req.url);
  const sheet = String(url.searchParams.get("sheet") ?? "");
  if (!SHEET_KEYS.includes(sheet))
    return say(`이 화면이 다루는 표가 아닙니다 — ${SHEET_KEYS.join(" · ")} 만 받습니다`, 400);

  // 단원표는 **고른 교재만** 내려받는다 — 5,638줄을 통째로 받으면 고쳐 올리기 어렵다
  const b = String(url.searchParams.get("b") ?? "");
  const scope = sheet === "units" && UUID.test(b)
    ? { scopeCol: "book_id", scopeVals: [b] } : {};

  const conn = await openAs(me.profileId);
  if (!conn.ok) return say(conn.why, 500);
  try {
    const d = await downloadRows(conn.db, sheet, scope);
    const buf = makeWorkbook({ head: d.head, rows: d.rows, dateHeads: d.dateHeads, title: d.title });
    const name = `${sheetTitle(sheet)}.xlsx`;
    return new Response(buf, {
      headers: {
        "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        // ⚠️ 한글 파일 이름은 RFC5987 로 적는다. 안 그러면 브라우저가 이름을 깨뜨린다
        "content-disposition": `attachment; filename="books-${sheet}.xlsx"; filename*=UTF-8''${encodeURIComponent(name)}`,
        "cache-control": "no-store",
      },
    });
  } catch (e) {
    return say(`엑셀을 못 만들었습니다 — ${String(e?.message ?? e).slice(0, 300)}`, 500);
  } finally {
    await conn.end();
  }
}
