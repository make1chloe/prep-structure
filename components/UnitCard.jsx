import { unitProgress, RETEST_WARN_AT } from "@/lib/unitStreak";

/**
 * **문법 단원평가 카드** — 학생·학부모 화면에 같은 모양으로.
 *
 * ── 왜 만들었나 (2026-08-06, 한 달 살아보기에서) ─────────
 *
 * 9월 한 달을 돌려봤더니 단원평가가 **66건** 쌓이고 그중 **12건이 재시험**
 * 이었다. 그런데 아이도 어머니도 그것을 볼 자리가 없었다 — 성장 카드는
 * 모의고사·내신만 그렸고, 성적 화면에는 66줄이 날짜순으로 늘어서 있을 뿐이었다.
 *
 * **날짜순 66줄로는 「관계사에서 세 번 막혔다」 를 못 읽는다.** 그래서
 * 단원별로 접어서, 몇 번 만에 넘었는지를 한 줄로 보여준다.
 *
 * 점수보다 **통과/재시험**이 앞이다 (원장님, 2026-08-06 — 「보시는 것은
 * 점수가 아니라 몇 번 만에 통과했나」).
 */
export default function UnitCard({ scores = [], max = 8, forParent = false }) {
  const p = unitProgress(scores);
  if (p.total === 0) return null;

  return (
    <div className="card">
      <div className="row" style={{ gap: 8, alignItems: "baseline", flexWrap: "wrap" }}>
        <h2 style={{ margin: 0, fontSize: 17.5, fontWeight: 800 }}>문법 단원평가</h2>
        <span className="tag tag-mint">통과 {p.passed}/{p.total}</span>
        {p.retests > 0 && <span className="tag tag-amber">재시험 {p.retests}번</span>}
        {p.rate != null && <span className="tag tag-muted">{p.rate}%</span>}
      </div>

      {/* **지금 붙들고 있는 단원이 맨 위다.** 지난 것보다 이게 급하다 */}
      {p.now && (
        <div
          className="notice"
          style={{ marginTop: 8, fontSize: 14 }}
        >
          {p.now.tries >= RETEST_WARN_AT ? (
            <>
              <b>{p.now.unit}</b> 을 <b>{p.now.tries}번째</b> 보고 있어요.
              {forParent
                ? " 이 단원은 수업에서 다시 짚어드리겠습니다."
                : " 이번엔 틀린 문제부터 다시 보고 오자."}
            </>
          ) : (
            <>
              지금은 <b>{p.now.unit}</b> 을 보고 있어요
              {p.now.tries > 1 ? ` (${p.now.tries}번째)` : ""}.
            </>
          )}
        </div>
      )}

      <div className="stack" style={{ gap: 3, marginTop: 8 }}>
        {p.units.slice(0, max).map((u) => (
          <div className="unitrow" key={u.unit}>
            <span
              className={`tag ${u.passed ? "tag-mint" : "tag-amber"}`}
              style={{ minWidth: 46, textAlign: "center" }}
            >
              {u.passed ? "통과" : "재시험"}
            </span>
            <b style={{ fontSize: 14, flex: 1, minWidth: 90 }}>{u.unit}</b>
            {/* **몇 번 만에 넘었나** — 이 숫자가 이 화면의 알맹이다 */}
            {u.tries > 1 && (
              <span className={`tag ${u.tries >= RETEST_WARN_AT ? "tag-amber" : "tag-muted"}`}>
                {u.tries}번
              </span>
            )}
            {u.last != null && <span className="hint" style={{ fontSize: 12.5 }}>{u.last}점</span>}
            <span className="hint" style={{ fontSize: 12 }}>
              {(u.passedOn || u.lastOn || "").slice(2).replaceAll("-", ".")}
            </span>
          </div>
        ))}
        {p.units.length > max && (
          <span className="hint" style={{ fontSize: 12 }}>… 그 밖 {p.units.length - max}단원</span>
        )}
      </div>
    </div>
  );
}
