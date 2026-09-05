/** 오늘 수업 — 목업 01. 검사 · 학습 · 숙제 한 화면. 판단은 lib/day · attend · homework · late 한 벌, 여기는 가져다 그린다.
 *  층은 넷(속도-상한 오늘 4단): 로그인 확인 → 오늘 → 반·아이 한 조회 → 판 한 조회 — 뒤 둘은 lib/day.roster 안. 판은 열 때 선다(있으면 그대로) — 검사 줄은 「아직 검사 안 한 지난 숙제 전부」 */
import { guard } from "@/lib/session";
import { isStaff, ROLE_NAME } from "@/lib/roles";
import { today, roster } from "@/lib/day";
import { warnBand } from "@/lib/warn";
import { commentRules } from "@/lib/comment";
import Band from "./band.js";
import Row from "./row.js";
import { isUnchecked } from "@/lib/status";
export const dynamic = "force-dynamic";
const minutesOf = (a, b) => { const m = (t) => { const [h, mi] = String(t ?? "").split(":").map(Number); return h * 60 + (mi || 0); }; return a && b ? Math.max(0, m(b) - m(a)) : 0; };   // 반 시간(분) — 「90분이면 한 항목에 6.0분」
const frame = (children) => <main className="frame" style={{ maxWidth: 960, margin: "16px auto", padding: "0 16px" }}>{children}</main>;
export default async function Today() {
  const { sb, me } = await guard();
  if (!isStaff(me?.role)) return frame(<div className="card"><div className="ctitle"><span className="cemo">📋</span>오늘 수업은 학원 사람의 화면입니다</div><p className="note">{me ? `${ROLE_NAME[me.role]} 화면은 곧 열립니다.` : "역할 줄이 없습니다."}</p></div>);
  let date, r, band, cfg;
  try { date = await today(sb); [r, band, cfg] = await Promise.all([roster(sb, date), warnBand(sb, date), commentRules(sb)]); }   // 반·아이 → 판(없으면 세운다 — 검사 줄이 따라온다) ∥ 월초 정리 띠
  catch (e) {   // 화면이 스스로 말한다(대전제-0) — 운영 빌드는 오류 글을 감추고 「This page couldn't load」만 보인다(원장님 9/5 폰 캡처). 표·함수가 아직 없는 DB 면 여기서 그 이름이 보인다
    return frame(<div className="card"><div className="ctitle"><span className="cemo">⚠️</span>오늘 수업을 못 열었습니다</div><p className="note">{String(e?.message ?? e)}</p><p className="note">표·함수가 없다는 말이면 새 앱 마이그레이션(0100~)을 이 DB 에 아직 안 돌린 것입니다 — `docs/미리보기-켜기.md`</p></div>);
  }
  const unchecked = r.classes.flatMap((c) => c.students).reduce((n, s) => n + (s.sheet?.check.filter(isUnchecked).length ?? 0), 0);
  if (!r.classes.length) return frame(<div className="card"><div className="ctitle"><span className="cemo">📋</span>오늘 수업 없음 · {date}</div><p className="note">오늘 도는 반이 없습니다. 반 시간표는 반 화면에서 봅니다.</p></div>);
  return frame(<>
    <Band band={band} />
    <div className="wv" style={{ marginBottom: 8 }}>
      <span className="pill">{date}</span>
      {r.classes.map((c) => { const abs = c.students.filter((s) => s.plan?.absent).length; return <span key={c.id ?? "makeup"} className="pill">{c.nickname || (c.kind === "special" ? "특강" : c.kind === "makeup" ? "보강" : "정규")} {c.start}{c.end ? `–${c.end}` : ""} · {c.students.length}명{c.kind !== "makeup" ? ` · 결석 예정 ${abs ? `${abs}명` : "없음"}` : ""}</span>; })}
      {unchecked > 0 && <span className="pill warn">검사 안 본 것 {unchecked}</span>}
    </div>
    {r.classes.map((c) => (
      <section key={c.id ?? "makeup"} aria-label={c.nickname || c.start}>
        {r.classes.length > 1 && <div className="hh" style={{ margin: "8px 0" }}>{c.nickname || (c.kind === "special" ? "특강" : "정규")} · {c.start}</div>}
        {!c.students.length && <div className="card"><p className="note">이 반에 오늘 오는 아이가 없습니다.</p></div>}
        {c.students.map((s, i) => <Row key={s.id} student={s} sheet={s.sheet} classId={c.id} date={date} minutes={minutesOf(c.start, c.end)} defaultOpen={i === 0 && !s.sheet?.closed && !s.plan?.absent} cfg={cfg} />)}
      </section>
    ))}
  </>);
}
