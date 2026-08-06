"use client";

import { useState, useMemo, useTransition } from "react";
import { useRouter } from "next/navigation";
import { REASONS, parseWrongNos, specFor, byTopic, byArea } from "@/lib/examSpec";
import { saveMyScore, dropMyScore } from "./scoreActions";

/**
 * **아이가 자기 시험 결과를 적는 화면** (원장님, 2026-08-06 —
 * 「학생용 화면에서 자기 시험 결과를 입력하게 해줘 — 문법, 내신, 모의고사 전부」).
 *
 * ── 어떻게 하면 실제로 적을까 ────────────────────────────
 *
 * **45개를 하나씩 찍게 하면 아무도 안 한다.** 그래서 「틀린 번호」 를 한 줄에
 * 적는다 — `14,21,24 32` 처럼 아무렇게나 적어도 읽는다. 나머지는 맞은 것이다.
 * 노션 폼에서도 아이들이 그렇게 적고 있었다.
 *
 * **이유는 번호를 적은 뒤에 나온다.** 먼저 다 물어보면 화면이 길어서 닫는다.
 * 번호를 적으면 그만큼만 줄이 생기고, 단추 하나로 고른다.
 *
 * **적는 동안 결과가 바로 보인다.** 「빈칸추론 3/4 틀림」 이 옆에 뜨면
 * 자기가 뭘 못했는지 그 자리에서 안다 — 그게 이걸 적는 이유다.
 * 다 적고 나서 선생님만 보는 화면으로 넘어가면 아이는 이걸 숙제로 여긴다.
 *
 * **비운 이유는 비운 채로 넘어간다.** 「기타」 를 기본으로 박아두면 그 통계가
 * 거짓이 된다. 안 고른 것은 안 고른 것이다.
 */

/**
 * **문법 단원평가는 여기 없다.**
 *
 * 원장님 (2026-08-06) — 「단원평가는 현재 오늘 수업에서 적는 그거랑 같은 거야」
 *
 * 이미 선생님이 수업 중에 적고 계신다 (오늘 수업 → 테스트 → 문법).
 * 아이에게 또 적게 하면 같은 시험이 두 줄이 되고, 숫자가 다르면 어느 쪽이
 * 맞는지 아무도 모른다. **같은 것을 두 군데 두지 않는다.**
 */
const KINDS = [
  { key: "mock", label: "모의고사", hint: "학평 · 모평", nos: true },
  { key: "school", label: "내신", hint: "학교 중간·기말", nos: true },
];

const today = () => new Date().toISOString().slice(0, 10);

export default function MyScoreForm({ mine = [], base = [], canWrite = true }) {
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState("mock");
  const [term, setTerm] = useState("");
  const [day, setDay] = useState(today());
  const [point, setPoint] = useState("");
  const [nosText, setNosText] = useState("");
  const [reasons, setReasons] = useState({});     // 번호 → 이유
  const [good, setGood] = useState("");
  const [bad, setBad] = useState("");
  const [word, setWord] = useState("");
  const [editId, setEditId] = useState("");
  const [msg, setMsg] = useState("");
  const [pending, start] = useTransition();
  const router = useRouter();

  const meta = KINDS.find((k) => k.key === kind);
  const nos = useMemo(() => parseWrongNos(nosText), [nosText]);

  // 적는 동안 바로 보여주는 것 — 문항표를 아는 종류만 (모의고사)
  const live = useMemo(() => {
    if (nos.length === 0) return null;
    const spec = specFor(kind, [], 0, base);
    if (spec.length === 0) return null;
    return { area: byArea(spec, nos), topics: byTopic(spec, nos).filter((t) => t.wrong > 0) };
  }, [kind, nos, base, meta]);

  function reset() {
    setTerm(""); setDay(today()); setPoint(""); setNosText(""); setReasons({});
    setGood(""); setBad(""); setWord(""); setEditId(""); setMsg("");
  }

  function submit() {
    start(async () => {
      const self = [
        good && `잘한 점: ${good}`,
        bad && `부족했던 점: ${bad}`,
        word && `하고 싶은 말: ${word}`,
      ].filter(Boolean).join("\n");

      const res = await saveMyScore({
        id: editId || undefined,
        kind, term, taken_on: day,
        raw_score: point === "" ? null : point,
        full_score: 100,
        self_note: self,
        items: nos.map((no) => ({ no, reason: reasons[no] || null })),
      });
      if (res?.error) { setMsg(`❌ ${res.error}`); return; }
      setMsg("✅ 냈어요. 선생님이 볼 수 있어요.");
      reset();
      setOpen(false);
      router.refresh();
    });
  }

  if (!canWrite) {
    return (
      <div className="card card-tight">
        <b style={{ fontSize: 14 }}>시험 결과 적기</b>
        <p className="hint" style={{ margin: "6px 0 0" }}>
          이 화면은 학생 본인만 쓸 수 있어요. (어머니가 대신 적어주시면 기록이
          아이 것이 아니게 됩니다.)
        </p>
      </div>
    );
  }

  return (
    <div className="card">
      <div className="row" style={{ gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <b style={{ fontSize: 14 }}>시험 결과 적기</b>
        <span className="hint">모의고사 · 내신</span>
        <span className="spacer" />
        {!open && (
          <button className="btn btn-primary btn-sm" onClick={() => { reset(); setOpen(true); }}>
            적기
          </button>
        )}
        {open && (
          <button className="btn btn-ghost btn-sm" onClick={() => { reset(); setOpen(false); }}>
            닫기
          </button>
        )}
      </div>

      {/* 지금까지 낸 것 — 냈는지 안 냈는지가 안 보이면 또 낸다 */}
      {!open && mine.length > 0 && (
        <div className="stack" style={{ gap: 4, marginTop: 8 }}>
          {mine.slice(0, 5).map((s) => (
            <div key={s.id} className="row" style={{ gap: 6, alignItems: "baseline", flexWrap: "wrap" }}>
              <span className="tag tag-muted">
                {KINDS.find((k) => k.key === s.kind)?.label || s.kind}
              </span>
              <span style={{ fontSize: 12.5, fontWeight: 600 }}>{s.term}</span>
              <span className="hint" style={{ fontSize: 11.5 }}>{s.taken_on}</span>
              {s.raw_score != null && (
                <span className="hint" style={{ fontSize: 11.5 }}>{s.raw_score}점</span>
              )}
              {s.wrongCount > 0 && (
                <span className="hint" style={{ fontSize: 11.5 }}>틀린 {s.wrongCount}문항</span>
              )}
              {s.source === "form" && (
                <button
                  className="btn btn-ghost btn-sm"
                  disabled={pending}
                  onClick={() =>
                    start(async () => {
                      const r = await dropMyScore(s.id);
                      if (r?.error) setMsg(`❌ ${r.error}`);
                      else router.refresh();
                    })
                  }
                >
                  지우기
                </button>
              )}
            </div>
          ))}
          {mine.length > 5 && (
            <span className="hint" style={{ fontSize: 11.5 }}>… 그 밖 {mine.length - 5}건</span>
          )}
        </div>
      )}

      {open && (
        <div className="stack" style={{ gap: 10, marginTop: 10 }}>
          <div className="row" style={{ gap: 4 }}>
            {KINDS.map((k) => (
              <button
                key={k.key}
                className={`btn btn-sm ${kind === k.key ? "btn-primary" : "btn-ghost"}`}
                onClick={() => { setKind(k.key); setNosText(""); setReasons({}); }}
              >
                {k.label}
              </button>
            ))}
            <span className="spacer" />
            {/* **문법 단원평가는 여기 없다.** 어디에 있는지 안 알려주면
                「내 단원평가는 왜 없지」 를 아이가 혼자 궁금해한다 */}
            <span className="hint" style={{ fontSize: 11 }}>
              문법 단원평가는 선생님이 수업에서 적어요
            </span>
          </div>

          <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
            <div className="field" style={{ flex: 1, minWidth: 180 }}>
              <label className="label">시험 이름</label>
              <input
                className="input input-sm"
                placeholder={kind === "school" ? "1학기 중간고사" : "26년 6월 고1 모의고사"}
                value={term}
                onChange={(e) => setTerm(e.target.value)}
              />
            </div>
            <div className="field" style={{ width: 150 }}>
              <label className="label">본 날</label>
              <input className="input input-sm" type="date" value={day} onChange={(e) => setDay(e.target.value)} />
            </div>
            <div className="field" style={{ width: 92 }}>
              <label className="label">점수</label>
              <input
                className="input input-sm" inputMode="decimal" placeholder="75"
                value={point} onChange={(e) => setPoint(e.target.value)}
              />
            </div>
          </div>

          <>
              <div className="field">
                <label className="label">틀린 문제 번호</label>
                <input
                  className="input input-sm"
                  placeholder="14,21,24,32  (쉼표나 띄어쓰기 아무렇게나)"
                  value={nosText}
                  onChange={(e) => setNosText(e.target.value)}
                />
                <p className="hint" style={{ marginTop: 4 }}>
                  틀린 것만 적으면 돼요. 나머지는 맞은 것으로 봅니다.
                  {nos.length > 0 && <b> — {nos.length}문항</b>}
                </p>
              </div>

              {/* **적는 동안 바로 보인다.** 다 적고 나서야 알게 되면
                  이걸 왜 적는지 모른다 */}
              {live && (
                <div className="notice" style={{ fontSize: 12.5 }}>
                  <b>지금까지 적은 걸로 보면</b>
                  <br />
                  듣기 {live.area.listen.right}/{live.area.listen.total} ·
                  {" "}독해 {live.area.read.right}/{live.area.read.total}
                  {live.topics.length > 0 && (
                    <>
                      <br />
                      약한 곳: {live.topics.slice(0, 3).map((t) => `${t.topic} ${t.wrong}/${t.total}`).join(" · ")}
                    </>
                  )}
                </div>
              )}

              {nos.length > 0 && (
                <div className="stack" style={{ gap: 6 }}>
                  <b style={{ fontSize: 13 }}>왜 틀렸어요?</b>
                  <p className="hint" style={{ margin: 0 }}>
                    생각 안 나는 건 안 골라도 돼요. 고른 것만 셉니다.
                  </p>
                  {nos.map((no) => (
                    <div key={no} className="card card-tight" style={{ padding: "8px 10px" }}>
                      <div className="row" style={{ gap: 6, alignItems: "center", flexWrap: "wrap" }}>
                        <b style={{ fontSize: 13, width: 34 }}>{no}번</b>
                        {REASONS.map((r) => {
                          const on = reasons[no] === r.key;
                          return (
                            <button
                              key={r.key}
                              className={`btn btn-sm ${on ? "btn-primary" : "btn-ghost"}`}
                              style={{ fontSize: 11.5, padding: "3px 8px" }}
                              onClick={() =>
                                setReasons({ ...reasons, [no]: on ? "" : r.key })
                              }
                            >
                              {r.key.replace(/어요$/, "")}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              )}
          </>

          <div className="field">
            <label className="label">이번 시험에서 잘한 점</label>
            <input
              className="input input-sm" placeholder="모르는 단어가 줄었어요"
              value={good} onChange={(e) => setGood(e.target.value)}
            />
          </div>
          <div className="field">
            <label className="label">부족했던 점</label>
            <input
              className="input input-sm" placeholder="시간이 모자랐어요"
              value={bad} onChange={(e) => setBad(e.target.value)}
            />
          </div>
          <div className="field">
            <label className="label">선생님에게 하고 싶은 말</label>
            <input
              className="input input-sm" placeholder="안 적어도 돼요"
              value={word} onChange={(e) => setWord(e.target.value)}
            />
          </div>

          <div className="row" style={{ gap: 6, alignItems: "center" }}>
            <button className="btn btn-primary btn-block" onClick={submit} disabled={pending}>
              {pending ? "내는 중…" : "내기"}
            </button>
          </div>
        </div>
      )}

      {msg && <p className="hint" style={{ marginTop: 8 }}>{msg}</p>}
    </div>
  );
}
