import { TOPICS } from "@/lib/examSpec";

/**
 * **성장 카드** — 학생·학부모 화면에 같은 모양으로 붙는다.
 *
 * 원장님 (2026-08-06) — 다른 학원의 학부모 화면을 보여주시며 「장점만 취해」.
 * 취한 것은 셋이다.
 *
 *   · 맨 위에 **숫자 넉 줄** (최근 · 최고 · 평균 · 흐름)
 *   · **영역별 누적 정답률 막대** — 어디가 약한지가 한눈에 보인다
 *   · **강점 · 보완 꼬리표** 한 쌍
 *
 * 안 가져온 것은 꺾은선 그래프다. 어머니 폰에서 다섯 점짜리 선은 읽히지
 * 않고, 우리는 회차 표를 이미 보여드리고 있다.
 *
 * ── 왜 학생·학부모가 같은 것을 보나 ─────────────────────
 *
 * 집에서 나란히 놓고 보시는 일이 흔하다. 다르면 「엄마 폰에는 다르게 나오는데」
 * 가 되고, 그때부터 둘 다 못 믿게 된다. 달력을 한 곳(`lib/studentCalendar`)에
 * 모은 것과 같은 이유다.
 *
 * **서버 컴포넌트다** — 누르는 것이 없다. 자세한 것은 리포트 화면에서 본다.
 */

const pct = (v) => (v == null ? "—" : `${Math.round(v * 100)}%`);

function Bar({ label, rate, right, total, weak }) {
  return (
    <div className="row" style={{ gap: 8, alignItems: "center", margin: "3px 0" }}>
      <span style={{ width: 72, fontSize: 12, flexShrink: 0 }}>{label}</span>
      <span
        style={{
          flex: 1, height: 8, borderRadius: 999,
          background: "var(--border)", overflow: "hidden", minWidth: 50,
        }}
      >
        <span
          style={{
            display: "block", height: "100%", borderRadius: 999,
            width: `${Math.round((rate ?? 0) * 100)}%`,
            // **제일 약한 곳만 빨갛다.** 다 색을 다르게 하면 어디를 봐야
            // 하는지 오히려 모른다
            background: weak ? "var(--red, #e5484d)" : total >= 3 ? "var(--sky)" : "var(--border)",
          }}
        />
      </span>
      <span className="hint" style={{ width: 68, fontSize: 11, textAlign: "right", flexShrink: 0 }}>
        {pct(rate)} {total ? `${right}/${total}` : ""}
      </span>
    </div>
  );
}

/**
 * @param st        lib/report.js 의 stack()
 * @param kindLabel 「모의고사」 · 「내신」
 * @param rounds    회차 표에 쓸 것 (최근 것부터 몇 줄)
 */
export default function GrowthCard({ st, kindLabel = "모의고사", max = 5 }) {
  if (!st || st.n === 0) return null;

  // **문항이 셋 이상인 영역만 견준다.** 어법은 45문항 중 하나라 한 번만
  // 틀려도 0% 가 되는데, 그것을 「제일 약한 곳」 이라고 표시하면 매번 어법이다
  const solid = (st.topics || []).filter((t) => t.total >= 3 && t.rate != null);
  const sorted = [...solid].sort((a, b) => b.rate - a.rate);
  const best = sorted[0];
  const worst = sorted.length >= 2 ? sorted[sorted.length - 1] : null;

  const shown = (st.topics || []).filter((t) => t.total > 0);
  const order = new Map(TOPICS.map((t, i) => [t, i]));
  shown.sort((a, b) => (order.get(a.topic) ?? 99) - (order.get(b.topic) ?? 99));

  const rows = [...(st.rounds || [])].filter((r) => r.point != null).reverse().slice(0, max);

  return (
    <div className="card">
      <div className="row" style={{ gap: 8, alignItems: "baseline", flexWrap: "wrap" }}>
        <h2 style={{ margin: 0, fontSize: 16, fontWeight: 800 }}>{kindLabel}</h2>
        {st.last != null && <span className="tag tag-sky">최근 {st.last}점</span>}
        {st.best != null && <span className="tag tag-mint">최고 {st.best}점</span>}
        {st.mean != null && <span className="tag tag-muted">평균 {st.mean}점</span>}
        {st.grade != null && <span className="tag tag-lav">{st.grade}등급</span>}
        {st.n >= 2 && st.trend?.key && st.trend.key !== "none" && (
          <span
            className={`tag ${
              st.trend.key === "up" ? "tag-mint" : st.trend.key === "down" ? "tag-amber" : "tag-muted"
            }`}
          >
            {st.trend.key === "up" ? "▲" : st.trend.key === "down" ? "▼" : "―"} {st.trend.label}
          </span>
        )}
      </div>

      {shown.length > 0 && (
        <div style={{ marginTop: 10 }}>
          <b style={{ fontSize: 12.5 }}>영역별 누적 정답률</b>
          <div style={{ marginTop: 4 }}>
            {shown.map((t) => (
              <Bar
                key={t.topic}
                label={t.topic}
                rate={t.rate}
                right={t.right}
                total={t.total}
                weak={worst && t.topic === worst.topic}
              />
            ))}
          </div>
          <div className="row" style={{ gap: 5, marginTop: 6, flexWrap: "wrap" }}>
            {best && <span className="tag tag-mint">강점 {best.topic}</span>}
            {worst && <span className="tag tag-amber">보완 {worst.topic}</span>}
            {/* 문항이 적은 영역이 흐린 까닭 — 안 적어두면 「어법은 왜 회색이지」 */}
            {shown.some((t) => t.total < 3) && (
              <span className="hint" style={{ fontSize: 11 }}>
                흐린 막대는 문항이 두 개 이하라 크게 흔들립니다
              </span>
            )}
          </div>
        </div>
      )}

      {rows.length > 0 && (
        <div className="stack" style={{ gap: 3, marginTop: 10 }}>
          {rows.map((r, i) => (
            <div className="unitrow" key={i}>
              <span className="hint" style={{ minWidth: 62, fontSize: 11.5 }}>
                {r.score?.taken_on ? r.score.taken_on.slice(2).replaceAll("-", ".") : ""}
              </span>
              <b style={{ fontSize: 12.5, flex: 1, minWidth: 100 }}>{r.score?.term || "—"}</b>
              <span style={{ fontSize: 12.5 }}>
                {r.point}
                {r.score?.full_score ? `/${r.score.full_score}` : ""}
              </span>
              {r.grade != null && <span className="tag tag-muted">{r.grade}등급</span>}
              {r.rate != null && (
                <span className="hint" style={{ fontSize: 11.5 }}>{pct(r.rate)}</span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
