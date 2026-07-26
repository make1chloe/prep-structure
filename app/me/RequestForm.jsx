"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createRequest } from "@/app/requests/actions";

// 학생·학부모가 결석을 미리 알리는 칸
export default function RequestForm({ studentId, mine = [] }) {
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState("absence");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [body, setBody] = useState("");
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function submit() {
    startTransition(async () => {
      const res = await createRequest({ studentId, kind, fromDate: from, toDate: to || from, body });
      if (res?.error) {
        alert(res.error);
        return;
      }
      setOpen(false);
      setFrom("");
      setTo("");
      setBody("");
      router.refresh();
    });
  }

  return (
    <div className="card">
      <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <b style={{ fontSize: 14 }}>결석 · 문의 알리기</b>
          <p className="hint" style={{ margin: "4px 0 0" }}>
            결석할 날을 미리 알려주시면 보강을 잡아드립니다.
          </p>
        </div>
        <button className="btn btn-sm btn-primary" onClick={() => setOpen(!open)}>
          {open ? "닫기" : "알리기"}
        </button>
      </div>

      {open && (
        <div className="stack" style={{ gap: 8, marginTop: 12 }}>
          <div className="row" style={{ gap: 4 }}>
            {[
              ["absence", "결석"],
              ["makeup", "보강 요청"],
              ["question", "문의"],
            ].map(([k, label]) => (
              <button
                key={k}
                className={`btn btn-sm ${kind === k ? "btn-primary" : "btn-ghost"}`}
                onClick={() => setKind(k)}
              >
                {label}
              </button>
            ))}
          </div>
          {kind !== "question" && (
            <div className="row" style={{ gap: 6, alignItems: "center" }}>
              <input className="input input-sm" type="date" style={{ width: 150 }}
                value={from} onChange={(e) => setFrom(e.target.value)} />
              <span className="hint">~</span>
              <input className="input input-sm" type="date" style={{ width: 150 }}
                value={to} onChange={(e) => setTo(e.target.value)} />
              <span className="hint">하루면 앞칸만</span>
            </div>
          )}
          <textarea
            className="input input-sm"
            rows={2}
            placeholder={kind === "absence" ? "사유 (예: 가족 여행)" : "내용을 적어주세요"}
            value={body}
            onChange={(e) => setBody(e.target.value)}
          />
          <button className="btn btn-primary btn-sm" onClick={submit}
            disabled={pending || (kind !== "question" && !from)}>
            {pending ? "보내는 중…" : "보내기"}
          </button>
        </div>
      )}

      {mine.length > 0 && (
        <div className="stack" style={{ gap: 4, marginTop: 12 }}>
          {mine.map((r) => (
            <div className="unitrow" key={r.id}>
              <span className={`tag ${r.status === "accepted" ? "tag-mint" : r.status === "declined" ? "tag-muted" : "tag-amber"}`}>
                {r.status === "accepted" ? "확인됨" : r.status === "declined" ? "확인" : "전달됨"}
              </span>
              <span style={{ fontSize: 12.5, flex: 1 }}>
                {r.from_date
                  ? `${r.from_date.slice(5)}${r.to_date && r.to_date !== r.from_date ? `~${r.to_date.slice(5)}` : ""} `
                  : ""}
                {r.body || ""}
              </span>
              {r.reply && <span className="hint">{r.reply}</span>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
