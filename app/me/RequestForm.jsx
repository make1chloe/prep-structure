"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createRequest } from "@/app/requests/actions";
import RequestPhotos from "@/components/RequestPhotos";

// 학생·학부모가 결석을 미리 알리는 칸
export default function RequestForm({ studentId, mine = [], asId = null, readOnly = false }) {
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState("absence");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [body, setBody] = useState("");
  const [photos, setPhotos] = useState([]);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function submit() {
    startTransition(async () => {
      const res = await createRequest({
        studentId, kind, fromDate: from, toDate: to || from, body, photos,
      });
      if (res?.error) {
        alert(res.error);
        return;
      }
      setOpen(false);
      setFrom("");
      setTo("");
      setBody("");
      setPhotos([]);
      router.refresh();
    });
  }

  return (
    <div className="card">
      <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
        <div>
          {/* **이름에 무엇을 보내는 곳인지 다 적는다** (원장님, 2026-08-07).
              「결석 · 문의」 로는 학교 유인물이나 수행평가 안내를 여기로
              보내면 된다는 것을 알 수가 없다. 「문의」 는 뺐다 —
              물어보시는 것은 「선생님께 질문」 한 곳으로 모은다 */}
          <b style={{ fontSize: 14 }}>결석 · 학교공지 · 수행평가 · 학교유인물 전달</b>
          <p className="hint" style={{ margin: "4px 0 0" }}>
            결석할 날을 미리 알려주시면 보강을 잡아드립니다.
            <br />
            {/* **당일 결석은 사진이 있어야 보강해 드린다** (원장님, 2026-08-05).
                미리 알려주시는 결석과 당일 결석은 다르다 — 당일은 자리를 비워
                두게 되므로, 아프셨다는 것이 확인돼야 보강으로 채워 드린다.
                이걸 안 적어두면 나중에 「왜 보강이 안 되냐」 가 된다. */}
            <b>당일 결석</b>은 <b>약봉투나 처방전 사진</b>을 같이 올려주셔야
            보강을 잡아드릴 수 있습니다.
            학교 시험 시간표 · 가정통신문 · 수행평가 안내처럼 <b>날짜 없이 알려주실 것은
            「전달」</b>로 보내주세요. <b>물어보실 것은 「선생님께 질문」</b>에서 보내주세요.
            <b>글로 적어주셔도 되고, 종이는 찍어서 붙여주셔도 됩니다</b> — 둘 다 보내셔도 돼요.
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
              // 「보강 요청」 → 어느 때가 되는지를 적어주시는 칸이다
              ["makeup", "보강가능시간"],
              ["info", "전달"],
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
          {kind !== "question" && kind !== "info" && (
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
            placeholder={
              kind === "absence"
                ? "사유 (예: 가족 여행)"
                : kind === "info"
                ? "무엇인지 적어주세요 (예: 2학기 중간고사 시간표)"
                : "언제가 되는지 적어주세요 (예: 금요일 5시 이후)"
            }
            value={body}
            onChange={(e) => setBody(e.target.value)}
          />
          {/* 옮겨 적으면 틀린다. 틀리면 그게 더 큰일이다 — 찍어서 그대로 */}
          <RequestPhotos paths={photos} onChange={setPhotos} asId={asId} readOnly={readOnly} />

          <button className="btn btn-primary btn-sm" onClick={submit}
            disabled={
              pending || readOnly ||
              (kind !== "question" && kind !== "info" && !from) ||
              ((kind === "question" || kind === "info") && !body.trim() && photos.length === 0)
            }>
            {pending ? "보내는 중…" : photos.length ? `사진 ${photos.length}장과 보내기` : "보내기"}
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
              {(r.photos || []).length > 0 && (
                <RequestPhotos paths={r.photos} readOnly small />
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
