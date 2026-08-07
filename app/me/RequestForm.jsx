"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createRequest, cancelRequest } from "@/app/requests/actions";
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

  /**
   * **잘못 보낸 것을 무른다** (0108, 원장님 — 「학부모, 학생 화면에서
   * 전달 취소가 가능하게 해줘」).
   *
   * 날짜를 잘못 골라 보내면 선생님이 그걸 받아 결석 예정을 깔게 된다.
   * 그러면 다시 연락을 드려야 하고, 두 군데에 말이 남는다.
   *
   * 이미 확인하신 것은 못 무른다 — 그때는 새로 보내주시는 편이 맞다.
   */
  function drop(r) {
    if (!confirm("보낸 것을 취소할까요?")) return;
    startTransition(async () => {
      const res = await cancelRequest(r.id);
      if (res?.error) { alert(res.error); return; }
      router.refresh();
    });
  }

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
              {/**
                * **「제출 완료」 만 보여드린다** (원장님, 2026-08-07 —
                * 「제출을 했을 때는 정상적으로 제출 됐다는 의미로 제출 완료만
                * 표시 하고, 그걸 내가 확인 했는지 안했는지까지는 노출시키지 마」).
                *
                * 「전달됨」 이 며칠 그대로 있으면 「왜 안 보시지」 가 된다.
                * 수업 중에는 화면을 못 여시는 것이 당연한데, 그 사정은
                * 어머니께 안 보인다 — 보이는 것은 안 읽힌 표시뿐이다.
                *
                * 답을 드릴 것은 **답장이 온다** (아래 r.reply, 그리고 폰 알림).
                * 그러니 여기서는 「잘 들어갔습니다」 만 말하면 된다.
                */}
              {r.canceled_at ? (
                <span className="tag tag-muted">취소함</span>
              ) : (
                <span className="tag tag-mint">제출 완료</span>
              )}
              <span style={{ fontSize: 12.5, flex: 1 }}>
                {r.from_date
                  ? `${r.from_date.slice(5)}${r.to_date && r.to_date !== r.from_date ? `~${r.to_date.slice(5)}` : ""} `
                  : ""}
                {r.body || ""}
              </span>
              {/* 오간 말 — 선생님이 여러 번 답하실 수 있다 (0108) */}
              {Array.isArray(r.thread) && r.thread.length > 0 ? (
                <span className="hint" style={{ flexBasis: "100%" }}>
                  {r.thread.map((t, i) => (
                    <span key={i} style={{ display: "block" }}>선생님 — {t.text}</span>
                  ))}
                </span>
              ) : r.reply ? (
                <span className="hint">선생님 — {r.reply}</span>
              ) : null}
              {(r.photos || []).length > 0 && (
                <RequestPhotos paths={r.photos} readOnly small />
              )}
              {/* **아직 답이 오기 전이면 무를 수 있다.** 확인하신 뒤에는
                  새로 보내주시는 편이 맞다 — 이미 결석 예정이 깔렸을 수 있다 */}
              {!readOnly && !r.canceled_at && !r.handled_at && (
                <button
                  className="btn btn-ghost btn-sm"
                  onClick={() => drop(r)}
                  disabled={pending}
                  style={{ fontSize: 11, padding: "2px 8px" }}
                >
                  취소
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
