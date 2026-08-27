"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createRequest, cancelRequest } from "@/app/requests/actions";
import RequestPhotos from "@/components/RequestPhotos";

// 학생·학부모가 결석을 미리 알리는 칸.
// student=true 면 설명이 한 줄 축약판 — 약봉투·처방전 문단(8/5 확정)은
// 학부모용 말이라 아이에게 그대로 읽히면 길고 어렵다 (탭 개편 C1b,
// 문구는 원장 기본안 채택 확정 2026-08-27)
export default function RequestForm({ studentId, mine = [], readOnly = false, student = false }) {
  /**
   * **끝난 것은 접어 둔다** (원장님, 2026-08-23 — 「선생님이 확인한 건 더
   * 안 보게 해줘 … 답장이 달렸어도 아이 확인 누르면 더보기 눌러야 보이게.
   * 아니면 지난 한 달 것만 — 여기서 한 달은 지금부터 30일 전」).
   *
   * 바로 보이는 것 = **30일 안**이면서 **아직 볼 것이 남은 것**
   *   · 선생님이 아직 확인 안 함
   *   · 「조정필요」 — 아이가 다시 해야 한다
   *   · 답장이 달렸는데 아직 확인 안 눌렀다
   * 나머지(끝난 것 · 30일 지난 것)는 「지난 것 보기」 안으로 들어간다.
   */
  const [showOld, setShowOld] = useState(false);
  // 답장을 읽고 「확인」 을 누른 것 — 이 기기에 기억한다 (숙제 체크와 같은 방식).
  // 표를 늘리지 않는다: 아이가 읽었다는 사실은 선생님이 쓸 일이 없다.
  const [seen, setSeen] = useState(() => new Set());
  useEffect(() => {
    try {
      const raw = localStorage.getItem("req-seen");
      if (raw) setSeen(new Set(JSON.parse(raw)));
    } catch { /* 사생활 보호 모드 — 그냥 다 보인다 */ }
  }, []);
  function markSeen(id) {
    setSeen((prev) => {
      const n = new Set(prev).add(id);
      try { localStorage.setItem("req-seen", JSON.stringify([...n])); } catch { /* 무시 */ }
      return n;
    });
  }

  const days30 = Date.now() - 30 * 24 * 60 * 60 * 1000;
  const isFresh = (r) => !r.created_at || new Date(r.created_at).getTime() >= days30;
  const isLive = (r) =>
    !r.canceled_at &&
    (!r.handled_at || r.status === "declined" || (r.reply && !seen.has(r.id)));
  const live = (mine || []).filter((r) => isFresh(r) && isLive(r));
  const old = (mine || []).filter((r) => !(isFresh(r) && isLive(r)));
  const shown = showOld ? [...live, ...old] : live;
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
          <b style={{ fontSize: 15 }}>결석 · 학교공지 · 수행평가 · 학교유인물 전달</b>
          {student ? (
            <p className="hint" style={{ margin: "4px 0 0" }}>
              결석·지각은 미리 알려줘요. 학교에서 받은 종이는 찍어서 보내요.
            </p>
          ) : (
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
          )}
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
              // 늦게 가는 날도 알려야 한다 — 결석과 다르다 (원장님 2026-08-23)
              ["late", "늦어요"],
              // 「보강 요청」 → 어느 때가 되는지를 적어주시는 칸이다
              ["makeup", "보강가능시간"],
              ["info", "전달"],
            ].map(([k, label]) => (
              <button
                key={k}
                className={`btn btn-sm ${kind === k ? "btn-on" : "btn-ghost"}`}
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
          <RequestPhotos paths={photos} onChange={setPhotos} studentId={studentId} readOnly={readOnly} />

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

      {old.length > 0 && (
        <button
          className="btn btn-ghost btn-sm"
          style={{ marginTop: 8 }}
          onClick={() => setShowOld(!showOld)}
        >
          {showOld ? "지난 것 접기" : `지난 것 보기 (${old.length})`}
        </button>
      )}

      {shown.length > 0 && (
        <div className="stack" style={{ gap: 4, marginTop: 12 }}>
          {shown.map((r) => (
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
              ) : r.status === "declined" ? (
                /* **조정필요는 눈에 띄어야 한다** (원장님, 2026-08-11 — 「본문
                   확인했을때도 좀더 눈에 띄게 표시해줘. 애들은 안봐」).
                   「일정 조정」 은 결석·보강 이야기다 — 사진·질문에 누른 것까지
                   일정이라 하면 딴 소리가 된다 (같은 날 두 번째 말씀) */
                <span className="tag tag-amber">
                  {r.kind === "absence" || r.kind === "makeup" ? "⚠️ 조정 필요" : "⚠️ 확인 필요"}
                </span>
              ) : (
                <span className="tag tag-mint">제출 완료</span>
              )}
              <span style={{ fontSize: 14, flex: 1 }}>
                {r.from_date
                  ? `${r.from_date.slice(5)}${r.to_date && r.to_date !== r.from_date ? `~${r.to_date.slice(5)}` : ""} `
                  : ""}
                {r.body || ""}
              </span>
              {/* 오간 말 — 선생님이 여러 번 답하실 수 있다 (0108).
                  조정필요면 회색 잔글씨가 아니라 **노란 상자**로 — 그 사유를
                  읽으라고 보낸 것이다 */}
              {(() => {
                const talks = Array.isArray(r.thread) && r.thread.length > 0
                  ? r.thread.map((t) => t.text)
                  : r.reply ? [r.reply] : [];
                if (talks.length === 0) return null;
                const loud = r.status === "declined" && !r.canceled_at;
                return (
                  <span
                    style={{
                      flexBasis: "100%",
                      ...(loud
                        ? {
                            background: "var(--amber-soft)",
                            border: "1px solid var(--amber)",
                            borderRadius: 8, padding: "6px 9px",
                            fontSize: 14.5, fontWeight: 600, lineHeight: 1.6,
                          }
                        : { fontSize: 13, color: "var(--muted)" }),
                    }}
                  >
                    {talks.map((t, i) => (
                      <span key={i} style={{ display: "block" }}>선생님 — {t}</span>
                    ))}
                  </span>
                );
              })()}
              {(r.photos || []).length > 0 && (
                <RequestPhotos paths={r.photos} readOnly small />
              )}
              {/* 답을 읽었으면 눌러서 치운다 — 다음부터는 「지난 것 보기」 안에 있다
                  (원장님 2026-08-23 「아이 확인 누르면 더보기 눌러야 보이게」) */}
              {!readOnly && r.reply && !seen.has(r.id) && (
                <button
                  className="btn btn-ghost btn-sm"
                  style={{ flexBasis: "100%" }}
                  onClick={() => markSeen(r.id)}
                >
                  확인했어요
                </button>
              )}
              {/* **아직 답이 오기 전이면 무를 수 있다.** 확인하신 뒤에는
                  새로 보내주시는 편이 맞다 — 이미 결석 예정이 깔렸을 수 있다 */}
              {!readOnly && !r.canceled_at && !r.handled_at && (
                <button
                  className="btn btn-ghost btn-sm"
                  onClick={() => drop(r)}
                  disabled={pending}
                  style={{ fontSize: 12, padding: "2px 8px" }}
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
