"use client";

import { useState } from "react";
import { SPEC_FROM, REASONS, byReason } from "@/lib/examSpec";

/**
 * **성적 리포트 화면** — 누적 한 장 + 회차 하나씩.
 *
 * 원장님이 주신 엑셀을 그대로 옮겼다. 다만 두 가지를 다르게 했다 —
 *
 * **막대는 SVG 로 그리지 않고 칸으로 그린다.** 그림은 폰에서 안 늘어나고,
 * 상담 중에 폰으로 보시는 화면이다. 칸으로 그리면 글자 크기를 따라간다.
 *
 * **회차는 접어둔다.** 다섯 회차의 문항표 45줄이 한 번에 펼쳐지면
 * 스크롤이 이백 줄이 된다. 보고 싶은 회차만 연다.
 */

const pct = (v) => (v == null ? "—" : `${Math.round(v * 100)}%`);
const REASON_TONE = Object.fromEntries(REASONS.map((r) => [r.key, r.tone]));

/** 가로 막대 하나 — 이름 · 칸 · 숫자 */
function Bar({ label, rate, right, total, tone = "var(--sky)" }) {
  return (
    <div className="row" style={{ gap: 8, alignItems: "center", margin: "3px 0" }}>
      <span style={{ width: 78, fontSize: 13, flexShrink: 0 }}>{label}</span>
      <span
        style={{
          flex: 1, height: 8, borderRadius: 999,
          background: "var(--border)", overflow: "hidden", minWidth: 60,
        }}
      >
        <span
          style={{
            display: "block", height: "100%", borderRadius: 999,
            width: `${Math.round((rate ?? 0) * 100)}%`, background: tone,
          }}
        />
      </span>
      <span className="hint" style={{ width: 76, fontSize: 12.5, textAlign: "right", flexShrink: 0 }}>
        {pct(rate)}{total ? ` (${right}/${total})` : ""}
      </span>
    </div>
  );
}

/** 위쪽 숫자 줄 */
function Stat({ label, value, tone }) {
  return (
    <div style={{ minWidth: 84 }}>
      <div className="hint" style={{ fontSize: 12 }}>{label}</div>
      <div style={{ fontSize: 21, fontWeight: 800, color: tone }}>{value}</div>
    </div>
  );
}

/** 총점 추이 — 점을 이어 그린다 (회차가 둘 이상일 때만 뜻이 있다) */
function Trend({ rounds }) {
  const pts = rounds.map((r) => r.point).filter((p) => p != null);
  if (pts.length < 2) return null;
  const lo = Math.max(0, Math.min(...pts) - 5);
  const hi = Math.min(100, Math.max(...pts) + 5);
  const span = Math.max(1, hi - lo);
  return (
    <div className="card card-tight">
      <b style={{ fontSize: 14.5 }}>총점 추이</b>
      <div
        className="row"
        style={{ gap: 2, alignItems: "flex-end", height: 96, marginTop: 8 }}
      >
        {rounds.map((r, i) => {
          const p = r.point;
          const h = p == null ? 0 : Math.round(((p - lo) / span) * 100);
          return (
            <div key={i} style={{ flex: 1, textAlign: "center", minWidth: 34 }}>
              <div style={{ fontSize: 12, fontWeight: 700 }}>{p == null ? "—" : p}</div>
              <div
                style={{
                  height: `${Math.max(4, h)}%`, minHeight: 4,
                  background: "var(--sky)", borderRadius: "3px 3px 0 0", marginTop: 2,
                }}
              />
              <div className="hint" style={{ fontSize: 12, marginTop: 2 }}>{i + 1}회</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function ReportView({ name, kind, rounds = [], st, notes = [] }) {
  // 마지막 회차를 펼쳐둔다 — 리포트를 여는 이유가 대개 「이번에 어땠나」다
  const [open, setOpen] = useState(rounds.length ? rounds.length - 1 : -1);

  if (rounds.length === 0) {
    return (
      <div className="card" style={{ marginTop: 12 }}>
        <p style={{ margin: 0 }}>아직 이 종류의 성적이 없어요.</p>
        <p className="hint" style={{ margin: "6px 0 0" }}>
          <a className="sky" href="/import">자료 옮기기</a> 에서 노션 자료를 올리시거나,{" "}
          <a className="sky" href="/scores">성적 화면</a> 에서 직접 넣으실 수 있어요.
        </p>
      </div>
    );
  }

  const hasTopics = (st.topics || []).some((t) => t.total > 0);

  return (
    <div className="stack" style={{ gap: 12, marginTop: 12 }}>
      {/* ── 누적 ─────────────────────────────────────────── */}
      <div className="card">
        <div className="row" style={{ gap: 18, flexWrap: "wrap", alignItems: "flex-start" }}>
          <Stat label={`${st.n}회 평균`} value={st.mean == null ? "—" : `${st.mean}점`} />
          <Stat label="최근 점수" value={st.last == null ? "—" : `${st.last}점`} />
          <Stat label="최고 점수" value={st.best == null ? "—" : `${st.best}점`} />
          <Stat label="최근 등급" value={st.grade == null ? "—" : `${st.grade}등급`} />
          {st.listen && <Stat label="듣기 평균" value={pct(st.listen.rate)} />}
          {st.read && <Stat label="독해 평균" value={pct(st.read.rate)} />}
          <Stat
            label="성적 흐름"
            value={st.trend.label}
            tone={
              st.trend.key === "up" ? "var(--mint)"
              : st.trend.key === "down" ? "var(--red, #e5484d)"
              : undefined
            }
          />
        </div>
      </div>

      <div className="grid-side">
        <Trend rounds={rounds} />
        {hasTopics && (
          <div className="card card-tight">
            <b style={{ fontSize: 14.5 }}>영역별 누적 정답률</b>
            <div style={{ marginTop: 8 }}>
              {st.topics.map((t) => (
                <Bar
                  key={t.topic}
                  label={t.topic}
                  rate={t.rate}
                  right={t.right}
                  total={t.total}
                  // **문항이 하나뿐인 영역은 흐리게.** 어법은 45문항 중 한
                  // 문항이라 0% 나 100% 밖에 안 나온다 — 같은 굵기로 그리면
                  // 「어법이 완전히 무너졌다」 로 읽힌다
                  tone={t.total >= 3 ? "var(--sky)" : "var(--border)"}
                />
              ))}
            </div>
            <p className="hint" style={{ margin: "6px 0 0", fontSize: 12 }}>
              흐린 막대는 문항이 세 개 미만이라 한 문항에 크게 흔들립니다.
            </p>
          </div>
        )}
      </div>

      {/* ── 학습포인트 ───────────────────────────────────── */}
      {notes.length > 0 && (
        <div className="card" style={{ background: "var(--surface-2)" }}>
          <b style={{ fontSize: 15 }}>분석 및 학습포인트</b>
          <div className="stack" style={{ gap: 8, marginTop: 8 }}>
            {notes.map((n, i) => (
              <div key={i}>
                <b style={{ fontSize: 14 }}>[{n.head}]</b>
                <p style={{ margin: "2px 0 0", fontSize: 14, lineHeight: 1.75 }}>{n.body}</p>
              </div>
            ))}
          </div>
          <p className="hint" style={{ margin: "8px 0 0", fontSize: 12 }}>
            숫자에서 나온 문장입니다. 상담 때 아이 얘기를 얹어서 쓰시라고 초안만 씁니다.
          </p>
        </div>
      )}

      {/* ── 회차별 ───────────────────────────────────────── */}
      <div className="card" style={{ padding: 0, overflow: "hidden" }}>
        <div style={{ padding: "12px 14px 4px" }}>
          <b style={{ fontSize: 15 }}>회차별 성적</b>
        </div>
        <div className="tblwrap">
          <table className="tbl tbl-tight">
            <thead>
              <tr>
                <th>회차</th><th>시험명</th><th>시행일</th><th>총점</th><th>등급</th>
                <th>듣기</th><th>독해</th><th>전체 정답률</th><th></th>
              </tr>
            </thead>
            <tbody>
              {rounds.map((r, i) => (
                <tr key={i} style={open === i ? { background: "var(--surface-2)" } : undefined}>
                  <td>{i + 1}</td>
                  <td style={{ fontWeight: 600 }}>{r.score.term || "—"}</td>
                  <td className="muted">{r.score.taken_on || "—"}</td>
                  <td>{r.point == null ? "—" : `${r.point}점`}</td>
                  <td className="muted">{r.grade == null ? "—" : `${r.grade}등급`}</td>
                  <td className="muted">{r.listen ? pct(r.listen.rate) : "—"}</td>
                  <td className="muted">{r.read ? pct(r.read.rate) : "—"}</td>
                  <td className="muted">{pct(r.rate)}</td>
                  <td>
                    <button
                      className="btn btn-ghost btn-sm"
                      onClick={() => setOpen(open === i ? -1 : i)}
                    >
                      {open === i ? "접기" : "펼치기"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {open >= 0 && rounds[open] && <Round r={rounds[open]} n={open + 1} name={name} />}
    </div>
  );
}

/** 한 회차 상세 — 엑셀의 「개인 N회차 상세 성적표」 */
function Round({ r, n, name }) {
  const from = SPEC_FROM[r.spec.from] || SPEC_FROM.none;
  const wrong = new Set(r.wrongNos);
  const reasonOf = new Map(r.items.map((it) => [Number(it.no), it.reason || ""]));
  const reasons = byReason(r.items);
  const hasSpec = r.spec.some((q) => q.topic || q.area);

  return (
    <div className="card">
      <div className="row" style={{ gap: 8, alignItems: "baseline", flexWrap: "wrap" }}>
        <b style={{ fontSize: 15 }}>{n}회차 · {r.score.term || "—"}</b>
        <span className="hint">{r.score.taken_on}</span>
        <span className={`tag ${from.tone}`}>{from.text}</span>
      </div>

      <div className="row" style={{ gap: 18, flexWrap: "wrap", marginTop: 10 }}>
        <Stat label="총점" value={r.point == null ? "—" : `${r.point}점`} />
        <Stat label="등급" value={r.grade == null ? "—" : `${r.grade}등급`} />
        <Stat label="전체 정답률" value={pct(r.rate)} />
        {r.listen && <Stat label="듣기 정답" value={`${r.listen.right}/${r.listen.total}`} />}
        {r.read && <Stat label="독해 정답" value={`${r.read.right}/${r.read.total}`} />}
        <Stat label="오답 수" value={`${r.wrong}문항`} />
      </div>

      {hasSpec && r.topics.length > 0 && (
        <div style={{ marginTop: 12 }}>
          <b style={{ fontSize: 14.5 }}>영역별 정답률</b>
          <div style={{ marginTop: 6 }}>
            {r.topics.map((t) => (
              <Bar
                key={t.topic}
                label={t.topic}
                rate={t.rate}
                right={t.right}
                total={t.total}
                tone={t.total >= 3 ? "var(--sky)" : "var(--border)"}
              />
            ))}
          </div>
        </div>
      )}

      {/* **왜 틀렸나**를 세어 보여준다. 영역보다 이쪽이 시킬 것을 바로 정해준다
          — 「해석을 못했어요 13개」 면 그날 수업이 정해진다 */}
      {reasons.length > 0 && (
        <div style={{ marginTop: 12 }}>
          <b style={{ fontSize: 14.5 }}>왜 틀렸나</b>
          <div className="row" style={{ gap: 5, flexWrap: "wrap", marginTop: 6 }}>
            {reasons.map((x) => (
              <span key={x.reason} className={`tag ${REASON_TONE[x.reason] || "tag-muted"}`}>
                {x.reason} {x.n}
              </span>
            ))}
          </div>
        </div>
      )}

      {r.score.self_note && (
        <div className="notice" style={{ marginTop: 12, fontSize: 14, whiteSpace: "pre-wrap" }}>
          <b>{name} 학생이 적은 것</b>
          {"\n"}{r.score.self_note}
        </div>
      )}
      {r.score.note && (
        <p className="hint" style={{ margin: "8px 0 0" }}>{r.score.note}</p>
      )}

      {r.spec.length > 0 && (
        <div style={{ marginTop: 12 }}>
          <b style={{ fontSize: 14.5 }}>문항</b>
          <div className="tblwrap" style={{ marginTop: 6, maxHeight: 420, overflowY: "auto" }}>
            <table className="tbl tbl-tight">
              <thead>
                <tr>
                  <th>번호</th><th>영역</th><th>유형</th><th>정오</th><th>왜 틀렸나</th>
                  {r.spec.some((q) => q.unit) && <th>단원</th>}
                  {r.spec.some((q) => q.source) && <th>출처</th>}
                </tr>
              </thead>
              <tbody>
                {r.spec.map((q) => {
                  const bad = wrong.has(q.no);
                  return (
                    <tr key={q.no} style={bad ? { background: "var(--surface-2)" } : undefined}>
                      <td>{q.no}</td>
                      <td className="muted">{q.area || "—"}</td>
                      <td className="muted">{q.detail || q.topic || "—"}</td>
                      <td>
                        <span className={`tag ${bad ? "tag-amber" : "tag-mint"}`}>
                          {bad ? "X" : "O"}
                        </span>
                      </td>
                      <td className="muted" style={{ maxWidth: 260, whiteSpace: "normal" }}>
                        {bad ? reasonOf.get(q.no) || "—" : ""}
                      </td>
                      {r.spec.some((x) => x.unit) && <td className="muted">{q.unit || "—"}</td>}
                      {r.spec.some((x) => x.source) && <td className="muted">{q.source || "—"}</td>}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
