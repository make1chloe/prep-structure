/** 화면이 스스로 말한다(대전제-0) — 「못 열었습니다」 카드 한 벌. 화면마다 베끼지 않는다(원칙-1).
 *  ⚠️ 곁의 안내는 **그 오류일 때만** 붙는다 — 2026-09-11 첫 주 돌려보기에서, 앱 안의 오류(`c is not iterable`)에도
 *     「마이그레이션을 안 돌린 것입니다」가 늘 붙어 있었다. 엉뚱한 데를 가리키는 안내는 없느니만 못하다. */
import { saidBy } from "@/lib/sqlError";
export function Oops({ what, e, kind = "card" }) {   // kind: "card" 원장·강사 쪽 · "task" 아이·학부모 쪽(껍데기가 다르다)
  const raw = String(e?.message ?? e);
  const 말 = saidBy(raw);
  const DB = 말 !== raw;   // saidBy 가 바꿨다 = DB 가 한 말이고, 원장님이 고치실 수 있는 것
  const 뒷말 = !DB && <p className="note" style={{ margin: "8px 0 0" }}>앱 안에서 난 오류입니다 — 이 글을 그대로 알려 주시면 됩니다(서버 자취에 까닭이 남았습니다).</p>;
  if (kind === "task") return <div className="task"><div className="h"><b>⚠️ {what}을 못 열었습니다</b></div><p className="note" style={{ margin: "8px 0 0" }}>{말}</p>{뒷말}</div>;
  return <div className="card"><div className="ctitle"><span className="cemo">⚠️</span>{what}을 못 열었습니다</div><p className="note">{말}</p>{뒷말}</div>;
}
