"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { MOCK_SPEC, TOPICS } from "@/lib/examSpec";
import { saveSpec, resetSpec, saveExamQuestions } from "./actions";
import { shortName } from "@/lib/schoolName";
import { examTitle } from "@/lib/examList";

/**
 * **문항표 고치기** (원장님, 2026-08-06 —
 * 「거의 안 바뀌긴 하는데 … 기본값을 세팅하되, 수정 가능하게 해줘」).
 *
 * 두 가지를 한 화면에서 한다.
 *   · **학원 기본 문항표** — 앞으로 계속 이렇게 갈 때
 *   · **이 회차만의 문항표** — 이번 시험만 다를 때 (내신 출제분석도 여기)
 *
 * 어느 쪽을 고치는지가 헷갈리면 지난 회차 분석까지 바뀐다. 그래서 위에
 * 고르개를 두고, **고르신 것이 어디에 저장되는지 글자로 적어둔다.**
 */

const AREAS = ["듣기", "독해", "문법", "어휘", "서술형"];
const SOURCES = ["교과서", "부교재", "모의고사 변형", "외부지문", "기타"];

export default function SpecEditor({ base = [], exams = [], examRows = {}, blocked = false }) {
  // 무엇을 고치나 — "base" 또는 회차 id
  const [target, setTarget] = useState("base");
  const [rows, setRows] = useState(() =>
    base.length > 0 ? base.map(clean) : MOCK_SPEC.map(clean)
  );
  const [dirty, setDirty] = useState(false);
  const [msg, setMsg] = useState("");
  const [pending, start] = useTransition();
  const router = useRouter();

  const onExam = target !== "base";
  const exam = exams.find((e) => e.id === target) || null;
  const fromBase = base.length > 0;

  function clean(q) {
    return {
      no: q.no, area: q.area || "", topic: q.topic || "", detail: q.detail || "",
      answer: q.answer || "", points: q.points ?? "", unit: q.unit || "", source: q.source || "",
    };
  }

  function switchTo(v) {
    setTarget(v);
    setMsg("");
    setDirty(false);
    if (v === "base") {
      setRows(base.length > 0 ? base.map(clean) : MOCK_SPEC.map(clean));
      return;
    }
    // 그 회차에 적어둔 것이 있으면 그것, 없으면 **지금 쓰이는 것을 그대로 깔아준다**
    // (빈 화면을 드리면 45줄을 처음부터 치셔야 한다)
    const mine = examRows[v] || [];
    setRows(mine.length > 0 ? mine.map(clean) : (base.length > 0 ? base : MOCK_SPEC).map(clean));
  }

  function edit(i, key, v) {
    setRows((old) => old.map((r, j) => (j === i ? { ...r, [key]: v } : r)));
    setDirty(true);
  }

  function addRow() {
    const last = rows.length ? Math.max(...rows.map((r) => Number(r.no) || 0)) : 0;
    setRows([...rows, clean({ no: last + 1 })]);
    setDirty(true);
  }

  function drop(i) {
    setRows(rows.filter((_, j) => j !== i));
    setDirty(true);
  }

  function save() {
    start(async () => {
      const res = onExam ? await saveExamQuestions(target, rows) : await saveSpec("mock", rows);
      if (res?.error) { setMsg(`❌ ${res.error}`); return; }
      setMsg(`✅ ${res.saved}문항 저장했어요.`);
      setDirty(false);
      router.refresh();
    });
  }

  if (blocked) {
    return (
      <div className="notice" style={{ marginTop: 12 }}>
        <b>0097 SQL 을 먼저 실행해주세요.</b> 문항표를 저장할 표가 아직 없습니다.
        <br />
        그때까지도 리포트는 나옵니다 — 코드에 있는 표준 문항표(45문항)를 씁니다.
      </div>
    );
  }

  return (
    <div className="stack" style={{ gap: 12, marginTop: 12 }}>
      <div className="card">
        <div className="row" style={{ gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <b style={{ fontSize: 13.5 }}>무엇을 고치나</b>
          <select
            className="input input-sm"
            style={{ minWidth: 260 }}
            value={target}
            onChange={(e) => switchTo(e.target.value)}
          >
            <option value="base">학원 기본 문항표 (모의고사) — 앞으로 계속</option>
            {exams.map((e) => (
              <option key={e.id} value={e.id}>
                이 회차만 · {shortName(e.school)} {e.grade || ""} {examTitle(e)} ({e.from_date})
                {(examRows[e.id] || []).length > 0 ? " ✓" : ""}
              </option>
            ))}
          </select>
        </div>

        <p className="hint" style={{ margin: "8px 0 0", lineHeight: 1.8 }}>
          {onExam ? (
            <>
              <b>이 회차에만</b> 쓰이는 문항표입니다. 저장하면 <b>{exam?.name || "이 시험"}</b> 을
              본 학생 전부의 분석이 이것으로 바뀌고, 다른 회차는 그대로입니다.
              <br />
              <b>내신 출제분석</b>도 여기서 합니다 — 문항마다 <b>단원</b>과 <b>출처</b>를 적어두시면
              「교과서에서 몇 %, 모의고사 변형에서 몇 %」 가 계산되고, 학생 오답과 겹쳐서
              「교과서 5과에서 우리 애들 다섯이 틀렸다」 가 나옵니다.
            </>
          ) : (
            <>
              <b>앞으로 보는 모든 모의고사</b>에 쓰입니다. 회차별로 따로 적어두신 것이 있으면
              그쪽이 이깁니다.
              <br />
              {fromBase
                ? "지금 저장된 문항표를 고치고 계십니다."
                : "아직 저장하신 것이 없어서 표준 문항표(45문항)를 깔아 두었습니다. 그대로 두셔도 되고, 고쳐서 저장하셔도 됩니다."}
            </>
          )}
        </p>

        <div className="row" style={{ gap: 6, marginTop: 10, flexWrap: "wrap" }}>
          <button className="btn btn-primary btn-sm" onClick={save} disabled={pending || !dirty}>
            {pending ? "저장 중…" : dirty ? `${rows.length}문항 저장` : "고친 것이 없어요"}
          </button>
          <button className="btn btn-ghost btn-sm" onClick={addRow} disabled={pending}>
            문항 더하기
          </button>
          {!onExam && (
            <button
              className="btn btn-ghost btn-sm"
              disabled={pending}
              onClick={() => {
                setRows(MOCK_SPEC.map(clean));
                setDirty(true);
                setMsg("표준 45문항으로 되돌렸어요. 저장을 누르셔야 반영됩니다.");
              }}
            >
              표준으로 되돌리기
            </button>
          )}
          {msg && <span className="hint">{msg}</span>}
        </div>
      </div>

      <div className="card" style={{ padding: 0, overflow: "hidden" }}>
        <div className="tblwrap" style={{ maxHeight: 620, overflowY: "auto" }}>
          <table className="tbl tbl-tight">
            <thead>
              <tr>
                <th style={{ width: 52 }}>번호</th>
                <th style={{ width: 90 }}>영역</th>
                <th style={{ width: 130 }}>분석 영역</th>
                <th>세부 유형</th>
                {onExam && <th style={{ width: 64 }}>정답</th>}
                <th style={{ width: 64 }}>배점</th>
                {onExam && <th style={{ width: 130 }}>단원</th>}
                {onExam && <th style={{ width: 120 }}>출처</th>}
                <th style={{ width: 40 }}></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i}>
                  <td>
                    <input
                      className="input input-sm" style={{ width: 44 }} inputMode="numeric"
                      value={r.no} onChange={(e) => edit(i, "no", e.target.value)}
                    />
                  </td>
                  <td>
                    <select
                      className="input input-sm" style={{ width: 82 }}
                      value={r.area} onChange={(e) => edit(i, "area", e.target.value)}
                    >
                      <option value="">—</option>
                      {AREAS.map((a) => <option key={a} value={a}>{a}</option>)}
                    </select>
                  </td>
                  <td>
                    {/* 있는 것 중에 고르되 **직접 쓰실 수도 있게** 둔다 —
                        내신은 학교마다 부르는 이름이 다르다 */}
                    <input
                      className="input input-sm" style={{ width: 122 }} list="topic-list"
                      value={r.topic} onChange={(e) => edit(i, "topic", e.target.value)}
                    />
                  </td>
                  <td>
                    <input
                      className="input input-sm" style={{ width: "100%", minWidth: 120 }}
                      value={r.detail} onChange={(e) => edit(i, "detail", e.target.value)}
                    />
                  </td>
                  {onExam && (
                    <td>
                      <input
                        className="input input-sm" style={{ width: 54 }}
                        value={r.answer} onChange={(e) => edit(i, "answer", e.target.value)}
                      />
                    </td>
                  )}
                  <td>
                    <input
                      className="input input-sm" style={{ width: 54 }} inputMode="decimal"
                      value={r.points} onChange={(e) => edit(i, "points", e.target.value)}
                    />
                  </td>
                  {onExam && (
                    <td>
                      <input
                        className="input input-sm" style={{ width: 122 }}
                        placeholder="교과서 5과"
                        value={r.unit} onChange={(e) => edit(i, "unit", e.target.value)}
                      />
                    </td>
                  )}
                  {onExam && (
                    <td>
                      <select
                        className="input input-sm" style={{ width: 112 }}
                        value={r.source} onChange={(e) => edit(i, "source", e.target.value)}
                      >
                        <option value="">—</option>
                        {SOURCES.map((x) => <option key={x} value={x}>{x}</option>)}
                      </select>
                    </td>
                  )}
                  <td>
                    <button className="btn btn-ghost btn-sm" onClick={() => drop(i)} title="이 문항 지우기">
                      ×
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <datalist id="topic-list">
        {TOPICS.map((t) => <option key={t} value={t} />)}
      </datalist>
    </div>
  );
}
