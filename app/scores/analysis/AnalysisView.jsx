"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { shortName } from "@/lib/schoolName";
import { examTitle } from "@/lib/examList";

/**
 * **출제분석 화면.**
 *
 * 표를 먼저 놓지 않는다. 원장님이 보실 것은 「어디서 나왔나」 와 「어디서
 * 틀렸나」 두 마디이고, 45줄짜리 문항표는 그것을 확인하러 내려가는 자리다.
 * 그래서 **말 → 비중 → 표** 차례로 놓는다.
 */

const SRC_TONE = {
  교과서: "var(--mint)",
  부교재: "var(--sky)",
  "모의고사 변형": "var(--lav)",
  외부지문: "var(--red, #e5484d)",
};

function Share({ title, rows, hint }) {
  if (!rows?.length) return null;
  return (
    <div className="card card-tight">
      <b style={{ fontSize: 13 }}>{title}</b>
      <div style={{ marginTop: 8 }}>
        {rows.map((r) => (
          <div key={r.key} className="row" style={{ gap: 8, alignItems: "center", margin: "3px 0" }}>
            <span style={{ width: 96, fontSize: 12, flexShrink: 0 }}>{r.key}</span>
            <span
              style={{
                flex: 1, height: 9, borderRadius: 999,
                background: "var(--border)", overflow: "hidden", minWidth: 50,
              }}
            >
              <span
                style={{
                  display: "block", height: "100%", borderRadius: 999,
                  width: `${r.pct}%`, background: SRC_TONE[r.key] || "var(--sky)",
                }}
              />
            </span>
            <span className="hint" style={{ width: 96, fontSize: 11.5, textAlign: "right", flexShrink: 0 }}>
              {r.pct}% · {r.count}문항{r.byPoints ? ` · ${r.points}점` : ""}
            </span>
          </div>
        ))}
      </div>
      {hint && <p className="hint" style={{ margin: "6px 0 0", fontSize: 11 }}>{hint}</p>}
    </div>
  );
}

export default function AnalysisView({ exams = [], qCount = {}, pick, exam, a, notes = [] }) {
  const [sort, setSort] = useState("no");   // no | wrong
  const router = useRouter();

  const label = (e) =>
    `${shortName(e.school)} ${e.grade || ""} ${examTitle(e)} (${e.from_date})${qCount[e.id] ? ` · 문항표 ${qCount[e.id]}` : ""}`;

  const rows = a?.rows || [];
  const shown = sort === "wrong"
    ? [...rows].sort((x, y) => y.wrong - x.wrong || x.no - y.no)
    : rows;

  return (
    <div className="stack" style={{ gap: 12, marginTop: 12 }}>
      <div className="card card-tight">
        <div className="row" style={{ gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <b style={{ fontSize: 13 }}>어느 시험</b>
          <select
            className="input input-sm"
            style={{ minWidth: 280, flex: 1 }}
            value={pick || ""}
            onChange={(e) => router.push(`/scores/analysis?exam=${e.target.value}`)}
          >
            {exams.length === 0 && <option value="">학사일정에 시험이 없어요</option>}
            {exams.map((e) => (
              <option key={e.id} value={e.id}>{label(e)}</option>
            ))}
          </select>
          <a className="btn btn-ghost btn-sm" href={`/scores/spec`}>문항표 적기</a>
        </div>
        {exams.length === 0 && (
          <p className="hint" style={{ margin: "6px 0 0" }}>
            <a className="sky" href="/todo">할일 · 일정</a> 에서 시험 회차를 먼저 만들어주세요
            (나이스에서 받아오면 저절로 생깁니다).
          </p>
        )}
      </div>

      {!a && exam && <div className="card"><p style={{ margin: 0 }}>불러오지 못했어요.</p></div>}

      {a && (
        <>
          {/* ── 무엇부터 할까 ─────────────────────────────── */}
          {notes.length > 0 && (
            <div className="card" style={{ background: "var(--surface-2)" }}>
              <div className="stack" style={{ gap: 8 }}>
                {notes.map((n, i) => (
                  <div key={i}>
                    <b style={{ fontSize: 12.5 }}>[{n.head}]</b>
                    <p style={{ margin: "2px 0 0", fontSize: 12.5, lineHeight: 1.75 }}>
                      {/* **굵게 표시한 곳만 굵게.** 문장 전체가 굵으면 아무 데도 안 굵다 */}
                      {n.body.split("**").map((part, j) =>
                        j % 2 === 1 ? <b key={j}>{part}</b> : <span key={j}>{part}</span>
                      )}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="row" style={{ gap: 6, flexWrap: "wrap", alignItems: "center" }}>
            <span className="tag tag-muted">문항 {a.questionCount}</span>
            {a.totalPoints && <span className="tag tag-muted">{a.totalPoints}점</span>}
            <span className={`tag ${a.n >= 3 ? "tag-sky" : "tag-amber"}`}>응시 {a.n}명</span>
            {/* **추측으로 묶은 것은 밝힌다.** 엉뚱한 시험지로 분석하면 전부 어긋난다 */}
            {a.guessed && (
              <span className="tag tag-amber" title="성적에 시험 회차가 안 적혀 있어 날짜·학교로 찾았습니다">
                날짜로 찾은 성적
              </span>
            )}
            {!a.hasSpec && <span className="tag tag-amber">문항표 없음</span>}
          </div>

          {/* ── 어디서 나왔나 ─────────────────────────────── */}
          {a.hasSpec ? (
            <div className="grid-side">
              <Share
                title="출처별"
                rows={a.bySource}
                hint={
                  a.hasSource
                    ? "배점을 다 적으신 시험은 배점으로, 아니면 문항 수로 셉니다."
                    : undefined
                }
              />
              <Share title="단원별" rows={a.byUnit} />
            </div>
          ) : (
            <div className="notice">
              <b>아직 이 시험의 문항표가 없습니다.</b>{" "}
              <a className="sky" href="/scores/spec">문항표 적기</a> 에서 이 회차를 골라
              문항마다 <b>단원</b>과 <b>출처</b>를 적어주시면, 여기에
              「교과서에서 몇 %」 가 나옵니다.
              <br />
              시험지 하나에 한 번만 적으시면 <b>그 시험을 본 아이 전부</b>에게 쓰입니다.
            </div>
          )}

          {a.hasSpec && a.byArea.length > 0 && <Share title="영역별" rows={a.byArea} />}

          {/* ── 우리 애들 ─────────────────────────────────── */}
          {a.n >= 3 && a.weakUnits.length > 0 && (
            <div className="card">
              <b style={{ fontSize: 13.5 }}>우리 애들이 몰려 틀린 단원</b>
              <div className="tblwrap" style={{ marginTop: 8 }}>
                <table className="tbl tbl-tight">
                  <thead>
                    <tr>
                      <th>단원</th><th>문항</th><th>틀린 문항</th><th>틀린 횟수</th><th>틀린 비율</th>
                    </tr>
                  </thead>
                  <tbody>
                    {a.weakUnits.map((w) => (
                      <tr key={w.unit}>
                        <td style={{ fontWeight: 600 }}>{w.unit}</td>
                        <td className="muted">{w.questions}</td>
                        <td className="muted">{w.touched}</td>
                        <td className="muted">{w.wrongTotal} / {w.questions * a.n}</td>
                        <td>
                          <span className={`tag ${w.wrongPct >= 50 ? "tag-amber" : "tag-muted"}`}>
                            {w.wrongPct}%
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="hint" style={{ margin: "6px 0 0", fontSize: 11 }}>
                「틀린 횟수」 는 아이들이 그 단원 문항을 푼 횟수 중 틀린 수입니다
                ({a.n}명 × 문항 수).
              </p>
            </div>
          )}

          {/* ── 문항표 ────────────────────────────────────── */}
          {rows.length > 0 && (
            <div className="card" style={{ padding: 0, overflow: "hidden" }}>
              <div className="row" style={{ padding: "12px 14px 4px", gap: 8, alignItems: "center" }}>
                <b style={{ fontSize: 13.5 }}>문항별</b>
                <span className="spacer" />
                <button
                  className={`btn btn-sm ${sort === "no" ? "btn-primary" : "btn-ghost"}`}
                  onClick={() => setSort("no")}
                >
                  번호순
                </button>
                <button
                  className={`btn btn-sm ${sort === "wrong" ? "btn-primary" : "btn-ghost"}`}
                  onClick={() => setSort("wrong")}
                >
                  많이 틀린 순
                </button>
              </div>
              <div className="tblwrap" style={{ maxHeight: 520, overflowY: "auto" }}>
                <table className="tbl tbl-tight">
                  <thead>
                    <tr>
                      <th>번호</th><th>유형</th><th>단원</th><th>출처</th><th>배점</th>
                      <th>틀림</th><th>누가</th>
                    </tr>
                  </thead>
                  <tbody>
                    {shown.map((r) => {
                      // 절반 넘게 틀린 문항 — 아이 문제가 아니다
                      const many = a.n >= 3 && r.wrong >= Math.ceil(a.n / 2);
                      return (
                        <tr key={r.no} style={many ? { background: "var(--surface-2)" } : undefined}>
                          <td style={{ fontWeight: 600 }}>{r.no}</td>
                          <td className="muted">{r.detail || r.topic || r.area || "—"}</td>
                          <td className="muted">{r.unit || "—"}</td>
                          <td className="muted">{r.source || "—"}</td>
                          <td className="muted">{r.points ?? "—"}</td>
                          <td>
                            {a.n > 0 ? (
                              <span className={`tag ${many ? "tag-amber" : r.wrong > 0 ? "tag-muted" : "tag-mint"}`}>
                                {r.wrong}/{a.n}
                              </span>
                            ) : (
                              <span className="hint">—</span>
                            )}
                          </td>
                          <td className="muted" style={{ maxWidth: 220, whiteSpace: "normal" }}>
                            {r.who.join(", ") || ""}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {a.n === 0 && a.hasSpec && (
            <p className="hint" style={{ margin: 0 }}>
              아직 이 시험 성적이 없습니다. 아이들이 학생 화면에서 오답을 적어 내면
              여기에 「몇 명이 몇 번을 틀렸나」 가 채워집니다.
            </p>
          )}
        </>
      )}
    </div>
  );
}
