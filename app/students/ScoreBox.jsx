"use client";

import { useEffect, useState } from "react";
import { KIND_LABEL } from "@/lib/scores";
import { listStudentScores } from "./scoreActions";

/**
 * **재원생 정보 안의 성적** (원장님, 2026-08-06 —
 * 「재원생 정보에도 성적이 연결되어야 해」).
 *
 * 성적 화면(`/scores`)은 **넣는 곳**이고, 여기는 아이를 보다가 **곁들여
 * 보는 곳**이다. 상담 전에 재원생 목록을 여시는데 거기서 성적을 보려면
 * 화면을 옮겨야 했고, 옮기면 보던 것을 놓친다.
 *
 * 그래서 여기는 **읽기만** 한다. 넣는 칸을 또 만들면 같은 것을 두 군데서
 * 넣게 되고, 두 군데는 반드시 어긋난다.
 *
 * 한 줄에 다 담지 않고 **종류별로 최근 것부터** 보여준다 — 내신·모의고사·
 * 단원평가는 성격이 달라서 섞으면 흐름이 안 보인다.
 */
export default function ScoreBox({ studentId, name }) {
  const [rows, setRows] = useState(null);
  const [err, setErr] = useState("");

  useEffect(() => {
    let alive = true;
    setRows(null);
    setErr("");
    listStudentScores(studentId).then((r) => {
      if (!alive) return;
      if (r?.error) setErr(r.error);
      setRows(r?.rows || []);
    });
    return () => { alive = false; };
  }, [studentId]);

  if (err) {
    return <p className="hint" style={{ margin: 0 }}>{err}</p>;
  }
  if (rows === null) {
    return <p className="hint" style={{ margin: 0 }}>불러오는 중…</p>;
  }

  const by = (k) => rows.filter((r) => r.kind === k);
  const pct = (r) => {
    const raw = Number(r.raw_score);
    const full = Number(r.full_score);
    if (!Number.isFinite(raw)) return null;
    if (!Number.isFinite(full) || full <= 0) return raw;
    return Math.round((raw / full) * 1000) / 10;
  };

  return (
    <div className="stack" style={{ gap: 10 }}>
      <div className="row" style={{ gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <b style={{ fontSize: 13.5 }}>{name} 성적</b>
        <span className="hint" style={{ fontSize: 11.5 }}>{rows.length}건</span>
        <span className="spacer" />
        {/* 넣고 고치는 것은 저쪽에서. 여기서 또 넣게 하면 두 군데가 어긋난다 */}
        {/* 공개 대상은 **리포트 화면 맨 위**에 있다. 여기에 또 두면 두 군데가
            어긋나고, 어느 쪽이 지금 값인지 모르게 된다 */}
        <a className="btn btn-primary btn-sm" href={`/scores/${studentId}`}>
          리포트 · 공개 대상
        </a>
        <a className="btn btn-ghost btn-sm" href={`/scores?s=${studentId}`}>성적 넣기</a>
      </div>

      {rows.length === 0 && (
        <p className="hint" style={{ margin: 0 }}>
          아직 성적이 없어요. <b>모의고사·내신</b>은 아이가 학생 화면에서 직접 내고,
          <b> 문법 단원평가</b>는 오늘 수업에서 단원명을 적으시면 여기에 쌓입니다.
        </p>
      )}

      {["school", "mock", "unit"].map((k) => {
        const mine = by(k);
        if (mine.length === 0) return null;
        const pts = mine.map(pct).filter((v) => v != null);
        const mean = pts.length ? Math.round((pts.reduce((a, b) => a + b, 0) / pts.length) * 10) / 10 : null;
        return (
          <div key={k} className="card card-tight">
            <div className="row" style={{ gap: 6, alignItems: "baseline", flexWrap: "wrap" }}>
              <b style={{ fontSize: 12.5 }}>{KIND_LABEL[k]}</b>
              <span className="hint" style={{ fontSize: 11.5 }}>{mine.length}건</span>
              {mean != null && (
                <span className="tag tag-sky">평균 {mean}</span>
              )}
              {/* 단원평가는 평균보다 **몇 번 재시험을 봤나**가 중요하다 */}
              {k === "unit" && (
                <span className="tag tag-amber">
                  재시험 {mine.filter((r) => (r.note || "").includes("재시험")).length}
                </span>
              )}
            </div>
            <div className="stack" style={{ gap: 2, marginTop: 6 }}>
              {mine.slice(0, 6).map((r) => (
                <div key={r.id} className="row" style={{ gap: 6, alignItems: "baseline", flexWrap: "wrap" }}>
                  <span className="hint" style={{ fontSize: 11.5, width: 74 }}>{r.taken_on || "—"}</span>
                  <span style={{ fontSize: 12.5, flex: 1, minWidth: 110 }}>{r.term || "—"}</span>
                  {r.raw_score != null && (
                    <b style={{ fontSize: 12.5 }}>
                      {r.raw_score}
                      {r.full_score ? `/${r.full_score}` : ""}
                    </b>
                  )}
                  {r.grade != null && <span className="tag tag-muted">{r.grade}등급</span>}
                  {r.wrongCount > 0 && (
                    <span className="hint" style={{ fontSize: 11 }}>틀린 {r.wrongCount}</span>
                  )}
                  {/* 누가 넣었나 — 아이가 낸 것과 선생님이 매긴 것은 무게가 다르다 */}
                  {r.source === "form" && <span className="tag tag-sky">아이가 냄</span>}
                  {r.source === "class" && <span className="tag tag-mint">수업에서</span>}
                  {(r.note || "").includes("재시험") && <span className="tag tag-amber">재시험</span>}
                </div>
              ))}
              {mine.length > 6 && (
                <span className="hint" style={{ fontSize: 11 }}>… 그 밖 {mine.length - 6}건</span>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
