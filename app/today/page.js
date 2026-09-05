/** 오늘 수업 — 목업 01. 검사 · 학습 · 숙제 한 화면. 판단은 lib/day · attend · homework · late 한 벌, 여기는 가져다 그린다.
 *  층은 넷(속도-상한 오늘 4단): 로그인 확인 → 오늘 → 반·아이 한 조회 → 판 한 조회 — 뒤 둘은 lib/day.roster 안. 판은 열 때 선다(있으면 그대로) — 검사 줄은 「아직 검사 안 한 지난 숙제 전부」 */
import { guard } from "@/lib/session";
import { isStaff, ROLE_NAME } from "@/lib/roles";
import { today, roster } from "@/lib/day";
import Row from "./row.js";
import { isUnchecked } from "@/lib/status";
export const dynamic = "force-dynamic";
const frame = (children) => <main className="frame" style={{ maxWidth: 960, margin: "16px auto", padding: "0 16px" }}>{children}</main>;
export default async function Today() {
  const { sb, me } = await guard();
  if (!isStaff(me?.role)) return frame(<div className="card"><div className="ctitle"><span className="cemo">📋</span>오늘 수업은 학원 사람의 화면입니다</div><p className="note">{me ? `${ROLE_NAME[me.role]} 화면은 곧 열립니다.` : "역할 줄이 없습니다."}</p></div>);
  const date = await today(sb);
  const r = await roster(sb, date);                                  // 반·아이 → 판(없으면 세운다 — 검사 줄이 따라온다)
  const unchecked = r.classes.flatMap((c) => c.students).reduce((n, s) => n + (s.sheet?.check.filter(isUnchecked).length ?? 0), 0);
  if (!r.classes.length) return frame(<div className="card"><div className="ctitle"><span className="cemo">📋</span>오늘 수업 없음 · {date}</div><p className="note">오늘 도는 반이 없습니다. 반 시간표는 반 화면에서 봅니다.</p></div>);
  return frame(<>
    <div className="wv" style={{ marginBottom: 8 }}>
      <span className="pill">{date}</span>
      {r.classes.map((c) => <span key={c.id} className="pill">{c.nickname || (c.kind === "special" ? "특강" : "정규")} {c.start}{c.end ? `–${c.end}` : ""} · {c.students.length}명</span>)}
      {unchecked > 0 && <span className="pill warn">검사 안 본 것 {unchecked}</span>}
    </div>
    {r.classes.map((c) => (
      <section key={c.id} aria-label={c.nickname || c.start}>
        {r.classes.length > 1 && <div className="hh" style={{ margin: "8px 0" }}>{c.nickname || (c.kind === "special" ? "특강" : "정규")} · {c.start}</div>}
        {!c.students.length && <div className="card"><p className="note">이 반에 오늘 오는 아이가 없습니다.</p></div>}
        {c.students.map((s, i) => <Row key={s.id} student={s} sheet={s.sheet} classId={c.id} date={date} defaultOpen={i === 0 && !s.sheet?.closed} />)}
      </section>
    ))}
  </>);
}
