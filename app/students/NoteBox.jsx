"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { listNotes, saveNote, deleteNote } from "./noteActions";
import { summarizeConsult, aiReady } from "@/app/ai/actions";

const KINDS = [
  { key: "consult", label: "상담" },
  { key: "call", label: "통화" },
  { key: "observe", label: "관찰" },
];

/**
 * 상담일지 — 말하면서 적는다.
 *
 * 상담 중에 자판을 두드리면 학부모 얼굴을 못 본다. 그래서 **받아쓰기**로
 * 흘려두고, 끝나고 한 번 다듬는다.
 *
 * 받아쓰기는 크롬에 들어 있는 것을 쓴다 (추가 비용 없음).
 * 사파리에서는 안 되므로, 안 되면 그냥 손으로 적게 둔다.
 */
export default function NoteBox({ studentId, name }) {
  const [rows, setRows] = useState(null);
  const [draft, setDraft] = useState(null);      // 지금 쓰고 있는 것
  const [listening, setListening] = useState(false);
  const [canDictate, setCanDictate] = useState(false);
  const [ai, setAi] = useState(null);      // AI 키가 들어와 있나
  const [err, setErr] = useState("");      // 실패한 이유를 화면에 남긴다
  const [ask, setAsk] = useState("");      // 이번 정리에만 부탁할 것
  const [pending, startTransition] = useTransition();
  const recog = useRef(null);
  const baseRef = useRef("");

  useEffect(() => {
    listNotes(studentId).then(setRows);
    aiReady().then(setAi);
    const SR = typeof window !== "undefined"
      ? window.SpeechRecognition || window.webkitSpeechRecognition
      : null;
    setCanDictate(!!SR);
  }, [studentId]);

  function reload() {
    listNotes(studentId).then(setRows);
  }

  function blank() {
    return { id: null, kind: "consult", title: "", raw: "", body: "", with_whom: "학부모", minutes: "" };
  }

  function toggleDictate() {
    if (listening) {
      recog.current?.stop();
      return;
    }
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) return;
    const r = new SR();
    r.lang = "ko-KR";
    r.continuous = true;
    r.interimResults = true;
    baseRef.current = draft?.raw || "";

    r.onresult = (e) => {
      let add = "";
      for (let i = e.resultIndex; i < e.results.length; i += 1) {
        add += e.results[i][0].transcript;
        if (e.results[i].isFinal) {
          baseRef.current = `${baseRef.current} ${e.results[i][0].transcript}`.trim();
          add = "";
        }
      }
      setDraft((d) => ({ ...d, raw: `${baseRef.current} ${add}`.trim() }));
    };
    r.onend = () => setListening(false);
    r.onerror = () => setListening(false);
    r.start();
    recog.current = r;
    setListening(true);
  }

  if (!rows) return <p className="hint" style={{ margin: 0 }}>불러오는 중…</p>;
  if (rows.error) return <div className="err">{rows.error}</div>;

  return (
    <div className="stack" style={{ gap: 10 }}>
      <div className="row" style={{ gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <b style={{ fontSize: 13.5 }}>{name} 상담일지</b>
        <span className="hint" style={{ fontSize: 12 }}>{rows.rows.length}건</span>
        <span className="spacer" />
        {!draft && (
          <button className="btn btn-primary btn-sm" onClick={() => setDraft(blank())}>
            ＋ 새로 쓰기
          </button>
        )}
      </div>

      {draft && (
        <div className="card card-tight stack" style={{ gap: 8 }}>
          <div className="row" style={{ gap: 6, flexWrap: "wrap", alignItems: "center" }}>
            {KINDS.map((k) => (
              <button
                key={k.key}
                className={`btn btn-sm ${draft.kind === k.key ? "btn-primary" : "btn-ghost"}`}
                onClick={() => setDraft({ ...draft, kind: k.key })}
              >
                {k.label}
              </button>
            ))}
            <input
              className="input input-sm"
              style={{ width: 110 }}
              placeholder="누구와"
              value={draft.with_whom}
              onChange={(e) => setDraft({ ...draft, with_whom: e.target.value })}
            />
            <input
              className="input input-sm"
              style={{ width: 74 }}
              placeholder="분"
              inputMode="numeric"
              value={draft.minutes}
              onChange={(e) => setDraft({ ...draft, minutes: e.target.value })}
            />
          </div>

          <div className="row" style={{ gap: 6, alignItems: "center", flexWrap: "wrap" }}>
            <span className="hint" style={{ fontSize: 12 }}>말한 것</span>
            {canDictate ? (
              <button
                className={`btn btn-sm ${listening ? "btn-primary" : ""}`}
                onClick={toggleDictate}
              >
                {listening ? "⏹ 받아쓰기 멈춤" : "🎤 받아쓰기"}
              </button>
            ) : (
              <span className="hint" style={{ fontSize: 11.5 }}>
                이 브라우저는 받아쓰기가 안 돼요 (크롬에서 열면 됩니다)
              </span>
            )}
            <span className="spacer" />
            {/* 이번 정리에만 부탁할 것 — 늘 지킬 것은 설정 › AI 초안 에 적어둔다 */}
            <input
              className="input input-sm"
              style={{ width: 160 }}
              placeholder="이번만 요청"
              title="이 정리에만 적용됩니다. 매번 지킬 것은 설정 › AI 초안 에 적어두세요"
              value={ask}
              onChange={(e) => setAsk(e.target.value)}
            />
            <button
              className="btn btn-sm"
              disabled={pending || (draft.raw || "").trim().length < 10 || ai?.ready === false}
              title={
                ai?.ready === false
                  ? "설정 → Supabase SQL → AI 초안 에서 키를 먼저 넣어주세요"
                  : "받아쓴 것을 읽을 수 있게 정리합니다"
              }
              onClick={() =>
                startTransition(async () => {
                  setErr("");
                  const r = await summarizeConsult(draft.raw, name, { ask });
                  if (r?.error) { setErr(r.error); return; }
                  if (!r?.text) { setErr("AI 가 빈 답을 보냈어요. 다시 눌러주세요."); return; }
                  setDraft((d) => ({ ...d, body: r.text }));
                })
              }
            >
              {pending ? "정리하는 중…" : ai?.ready === false ? "AI 키 없음" : "AI 로 정리"}
            </button>
          </div>

          {err && <div className="err" style={{ fontSize: 12.5 }}>{err}</div>}
          {ai?.ready === false && (
            <div className="notice" style={{ fontSize: 12.5 }}>
              AI 정리를 쓰려면 <b>설정 → Supabase SQL → AI 초안</b> 에서 키를 넣어주세요.
              키가 없어도 <b>받아쓰기와 저장은 그대로 됩니다.</b>
            </div>
          )}
          <textarea
            className="input"
            rows={4}
            placeholder="받아쓰기를 켜고 말씀하시면 여기에 쌓입니다. 직접 적으셔도 됩니다."
            value={draft.raw}
            onChange={(e) => setDraft({ ...draft, raw: e.target.value })}
          />

          <span className="hint" style={{ fontSize: 12 }}>정리한 것</span>
          <textarea
            className="input"
            rows={6}
            placeholder="AI 로 정리를 누르면 여기에 초안이 들어옵니다. 고쳐서 저장하세요."
            value={draft.body}
            onChange={(e) => setDraft({ ...draft, body: e.target.value })}
          />

          <div className="row" style={{ gap: 6 }}>
            <button
              className="btn btn-primary btn-sm"
              disabled={pending}
              onClick={() =>
                startTransition(async () => {
                  const r = await saveNote(studentId, draft);
                  if (r?.error) { alert(r.error); return; }
                  setDraft(null);
                  reload();
                })
              }
            >
              저장
            </button>
            <button className="btn btn-ghost btn-sm" onClick={() => setDraft(null)}>취소</button>
          </div>
        </div>
      )}

      <div className="stack" style={{ gap: 6 }}>
        {rows.rows.map((n) => (
          <div className="card card-tight" key={n.id}>
            <div className="row" style={{ gap: 8, alignItems: "baseline", flexWrap: "wrap" }}>
              <span className="tag tag-sky">
                {KINDS.find((k) => k.key === n.kind)?.label || n.kind}
              </span>
              <b style={{ fontSize: 13 }}>{n.date}</b>
              <span className="hint" style={{ fontSize: 12 }}>
                {[n.with_whom, n.minutes ? `${n.minutes}분` : ""].filter(Boolean).join(" · ")}
              </span>
              <span className="spacer" />
              <button
                className="btn btn-ghost btn-sm"
                onClick={() => setDraft({ ...n, minutes: n.minutes ?? "" })}
              >
                고치기
              </button>
              <button
                className="btn btn-ghost btn-sm"
                disabled={pending}
                onClick={() => {
                  if (!confirm("이 상담일지를 지울까요?")) return;
                  startTransition(async () => {
                    await deleteNote(n.id);
                    reload();
                  });
                }}
              >
                지우기
              </button>
            </div>
            {n.body && (
              <p style={{ margin: "6px 0 0", fontSize: 13, whiteSpace: "pre-wrap" }}>{n.body}</p>
            )}
          </div>
        ))}
        {rows.rows.length === 0 && !draft && (
          <p className="hint" style={{ margin: 0 }}>아직 상담일지가 없습니다.</p>
        )}
      </div>
    </div>
  );
}
