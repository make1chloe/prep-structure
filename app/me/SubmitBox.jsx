"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { submitFile, submitChecklist, removeSubmission, answerViewUrls } from "./submitActions";
import { checkPhoto, PHOTO_GUIDE } from "@/lib/photoCheck";
import { isImage, shownName, fileKind } from "@/lib/noticeFile";

/** 서울 기준 오늘 (YYYY-MM-DD) — reportItemId 가 없을 때 저장 키에 쓴다 */
function seoulToday() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" }).format(new Date());
}

/**
 * 숙제 한 건을 낸다.
 *
 * 아이가 쓰는 화면이라 **버튼 세 개**로 끝낸다.
 *   사진     — 카메라가 바로 열린다 (capture)
 *   녹음     — 누르면 녹음, 다시 누르면 끝 · 바로 올라간다
 *   체크리스트 — 선생님이 숙제마다 미리 적어둔 항목을 하나씩 짚는다
 *
 * 낸 것은 아래에 남고, 선생님이 보기 전까지는 지울 수 있다.
 *
 * openList — 숙제(하원 후) 모드에서는 체크리스트를 **버튼 없이 바로 편다**
 * (원장님 2026-08-21: 「전체 목록과 체크리스트가 한 번에 보이는 게 맞아」).
 *
 * answer — 파일형 답지 (0148). 있으면 열리기 전엔 「제출하면 열려요」 힌트,
 * 열리면 「채점해서 오세요」 + 답지 보기. 없으면 아무 표시 없음 (지금 그대로).
 */
export default function SubmitBox({ itemId, reportItemId, asId = null, mine = [], readOnly = false, checklist = [], answer = null, openList = false }) {
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(null);        // null | "list"
  /**
   * 체크 3단계 (원장님 2026-08-21 — 「숙제검사와 마찬가지로: 안 누르면
   * 빨강 미이행 · 한 번 누르면 노랑 하는 중 · 두 번 누르면 초록 완료」).
   * 검사 ○△✕ 와 같은 문법이라 학생·원장이 같은 색말을 쓴다.
   * marks[i]: 0 미이행 · 1 하는 중 · 2 완료 (누를 때마다 0→1→2→0)
   */
  const [marks, setMarks] = useState({});
  const [rec, setRec] = useState(null);          // MediaRecorder
  const [recSec, setRecSec] = useState(0);
  const [ansFiles, setAnsFiles] = useState(null);   // 열어본 답지 파일들 (0148)
  const fileRef = useRef(null);
  const timerRef = useRef(null);
  const router = useRouter();

  /**
   * **체크는 껐다 켜도 남는다** (원장님 2026-08-21 — 「체크리스트를 지워
   * 가면서 학생이 숙제를 끝낼 수 있게」). 전에는 useState 뿐이라 화면을
   * 닫는 순간 다 사라졌다 — 며칠에 걸쳐 하는 숙제에서 하다 만 표시가
   * 매번 날아갔다. localStorage 에 두고 열 때 되살린다.
   * reportItemId 가 없으면 항목id+오늘 날짜로 대신한다.
   */
  const storeKey = reportItemId
    ? `hwck-${reportItemId}`
    : itemId
    ? `hwck-${itemId}-${seoulToday()}`
    : null;
  useEffect(() => {
    if (!storeKey || checklist.length === 0) return;
    try {
      const raw = JSON.parse(localStorage.getItem(storeKey) || "null");
      if (raw && typeof raw === "object" && !Array.isArray(raw)) {
        const next = {};
        Object.entries(raw).forEach(([k, v]) => {
          const i = Number(k);
          if (Number.isInteger(i) && i >= 0 && i < checklist.length && (v === 1 || v === 2)) next[i] = v;
        });
        setMarks(next);
      } else if (Array.isArray(raw)) {
        // 옛 저장(체크한 번호 배열) — 체크했던 것은 완료(2)로 이어받는다
        const next = {};
        raw.forEach((i) => {
          if (Number.isInteger(i) && i >= 0 && i < checklist.length) next[i] = 2;
        });
        setMarks(next);
      }
    } catch { /* 못 읽으면 빈 채로 — 표시일 뿐이라 화면은 그대로 돈다 */ }
  }, [storeKey, checklist.length]);

  function saveMarks(next) {
    setMarks(next);   // 화면 먼저 (낙관) — 저장은 뒤따라간다
    try {
      if (storeKey) localStorage.setItem(storeKey, JSON.stringify(next));
    } catch { /* 저장 공간이 막혀도 체크 자체는 화면에 남는다 */ }
  }
  const doneCount = checklist.reduce((a, _, i) => a + (marks[i] === 2 ? 1 : 0), 0);
  const touchedCount = checklist.reduce((a, _, i) => a + (marks[i] ? 1 : 0), 0);

  // 전부 완료(초록)면 「끝」 — 이제 완료(내기)를 누르라는 뜻이다
  const allTicked = checklist.length > 0 && doneCount === checklist.length;
  const listOpen = openList || open === "list";

  function send(form) {
    startTransition(async () => {
      const res = await submitFile(form);
      if (res?.error) alert(res.error);
      router.refresh();
    });
  }

  async function pickFile(e) {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    // 흔들리거나 너무 어두운 사진은 올리기 전에 막는다 (원장님 2026-08-22:
    // 「사진이 흔들려서 글씨 못 알아보면 업로드 아예 안 되게」).
    // 판단은 lib/photoCheck 한 벌 — 탈락이면 이유를 말해주고 끝낸다.
    const chk = await checkPhoto(f);
    if (!chk.ok) {
      alert(chk.message);
      return;
    }
    const form = new FormData();
    form.set("file", f);
    form.set("kind", f.type.startsWith("audio") ? "audio" : "photo");
    if (itemId) form.set("itemId", itemId);
    if (reportItemId) form.set("reportItemId", reportItemId);
    if (asId) form.set("asId", asId);
    send(form);
  }

  async function toggleRec() {
    if (rec) {
      rec.stop();
      return;
    }
    let stream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      alert("마이크를 쓸 수 없어요. 브라우저에서 마이크를 허용해주세요.");
      return;
    }
    const mr = new MediaRecorder(stream);
    const chunks = [];
    let sec = 0;
    setRecSec(0);
    timerRef.current = setInterval(() => setRecSec((sec += 1)), 1000);

    mr.ondataavailable = (e) => e.data.size > 0 && chunks.push(e.data);
    mr.onstop = () => {
      clearInterval(timerRef.current);
      stream.getTracks().forEach((t) => t.stop());
      setRec(null);
      const blob = new Blob(chunks, { type: mr.mimeType || "audio/webm" });
      const form = new FormData();
      form.set("file", new File([blob], "rec.webm", { type: blob.type }));
      form.set("kind", "audio");
      form.set("seconds", String(sec));
      if (itemId) form.set("itemId", itemId);
      if (reportItemId) form.set("reportItemId", reportItemId);
      if (asId) form.set("asId", asId);
      send(form);
    };
    mr.start();
    setRec(mr);
  }

  /** 답지 링크는 누를 때 만든다 — 비공개 버킷이라 10분짜리 링크다 */
  function toggleAnswer() {
    if (ansFiles) { setAnsFiles(null); return; }
    startTransition(async () => {
      const res = await answerViewUrls(itemId, asId);
      if (res?.error) { alert(res.error); return; }
      setAnsFiles(res.files || []);
    });
  }

  return (
    <div className="stack" style={{ gap: 6, marginTop: 8 }}>
      {/* **답지** (0148, 원장님 2026-08-22 — 「답지 없으면 그냥 제출까지,
          답지 있으면 채점하라는 메시지까지 나오기」). 답지 없는 숙제는
          이 자리가 통째로 없다 — 지금 그대로. */}
      {answer && !answer.opened && (
        <p className="hint" style={{ margin: 0, fontSize: 13 }}>
          📖 이 숙제는 답지가 있어요 — <b>제출하면 선생님 확인 후 답지가 열려요.</b>
        </p>
      )}
      {answer?.opened && (
        <div className="stack" style={{ gap: 6 }}>
          <div className="row" style={{ gap: 6, alignItems: "center", flexWrap: "wrap" }}>
            <b style={{ fontSize: 14, color: "var(--mint)" }}>
              📖 답지가 열렸어요 — 답지 보고 채점해서 오세요!
            </b>
            <button className="btn btn-sm" disabled={pending} onClick={toggleAnswer}>
              {ansFiles ? "답지 닫기" : "📖 답지 보기"}
            </button>
          </div>
          {ansFiles &&
            ansFiles.map((f) =>
              isImage(f.path) ? (
                <a key={f.path} href={f.url} target="_blank" rel="noreferrer">
                  <img
                    src={f.url}
                    alt="답지"
                    style={{ maxWidth: "100%", borderRadius: 8, display: "block" }}
                  />
                </a>
              ) : (
                // pdf·hwp 는 이름표로 — 눌러서 새 창에 연다
                <a
                  key={f.path}
                  className="btn btn-ghost btn-sm"
                  style={{ justifyContent: "flex-start" }}
                  href={f.url}
                  target="_blank"
                  rel="noreferrer"
                >
                  {fileKind(f.path)} · {shownName(f.path)}
                </a>
              )
            )}
        </div>
      )}

      <div className="row" style={{ gap: 6, flexWrap: "wrap" }}>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          capture="environment"
          hidden
          onChange={pickFile}
        />
        <button
          className="btn btn-sm"
          disabled={pending || readOnly || !!rec}
          onClick={() => fileRef.current?.click()}
        >
          📷 사진
        </button>
        <button
          className={`btn btn-sm ${rec ? "btn-primary" : ""}`}
          disabled={pending || readOnly}
          onClick={toggleRec}
        >
          {rec ? `⏹ 녹음 끝내기 ${recSec}초` : "🎤 녹음"}
        </button>
        {checklist.length > 0 && !openList && (
          <button
            className="btn btn-sm"
            disabled={pending || readOnly || !!rec}
            onClick={() => setOpen(open === "list" ? null : "list")}
          >
            ☑ 체크리스트
          </button>
        )}
        {/* 전부 체크 = 이 항목은 다 한 것 — 완료(내기)로 이끈다 */}
        {allTicked && <span className="tag tag-mint">체크리스트 끝 ✓</span>}
      </div>

      {/* 찍는 법 안내 — 잘림은 기계가 못 걸러서 이 한 줄이 그 몫을 진다 (lib/photoCheck 참고) */}
      {!readOnly && (
        <div className="hint" style={{ fontSize: 12 }}>{PHOTO_GUIDE}</div>
      )}

      {checklist.length > 0 && listOpen && (
        <div className="stack" style={{ gap: 6 }}>
          {checklist.map((line, i) => {
            const st = marks[i] || 0;   // 0 미이행(빨강) · 1 하는 중(노랑) · 2 완료(초록)
            const color = st === 2 ? "var(--mint)" : st === 1 ? "var(--amber)" : "var(--red)";
            return (
              <button
                type="button"
                key={i}
                className="unitrow"
                disabled={readOnly}
                style={{
                  cursor: readOnly ? "default" : "pointer",
                  textAlign: "left",
                  borderLeft: `4px solid ${color}`,
                  background: "var(--surface-2)",
                }}
                onClick={() => saveMarks({ ...marks, [i]: (st + 1) % 3 })}
                title="누를 때마다 미이행 → 하는 중 → 완료"
              >
                <b style={{ color, minWidth: 34, fontSize: 13 }}>
                  {st === 2 ? "○ 완료" : st === 1 ? "△ 중" : "✕"}
                </b>
                <span style={{ fontSize: 15, flex: 1, textDecoration: st === 2 ? "line-through" : "none" }}>
                  {line}
                </span>
              </button>
            );
          })}
          <button
            className="btn btn-primary btn-sm"
            disabled={pending || readOnly || touchedCount === 0}
            onClick={() =>
              startTransition(async () => {
                // 상태째 낸다 — 원장님 검사 화면에서 ○△✕ 그대로 보인다
                const done = checklist.map((text, i) => ({
                  text,
                  done: marks[i] === 2,
                  state: marks[i] === 2 ? "done" : marks[i] === 1 ? "doing" : "missing",
                }));
                const res = await submitChecklist(itemId, reportItemId, done, asId);
                if (res?.error) { alert(res.error); return; }
                // 낸 뒤에는 표시를 비운다 — 낸 것은 아래 줄로 남는데,
                // 체크가 그대로면 「내기」 가 살아 있어 또 내게 된다
                saveMarks({});
                setOpen(null);
                router.refresh();
              })
            }
          >
            ○{doneCount}{touchedCount > doneCount ? ` △${touchedCount - doneCount}` : ""}/{checklist.length} 내기
          </button>
        </div>
      )}

      {mine.length > 0 && (
        <div className="stack" style={{ gap: 3 }}>
          {mine.map((m) => (
            <div className="unitrow" key={m.id}>
              <span className="tag tag-mint">
                {m.kind === "audio" ? "녹음" : m.kind === "checklist" ? "체크" : "사진"}
              </span>
              <span className="hint" style={{ flex: 1, fontSize: 13 }}>
                {m.kind === "audio" && m.seconds ? `${m.seconds}초 · ` : ""}
                {new Date(m.created_at).toLocaleTimeString("ko-KR", {
                  timeZone: "Asia/Seoul", hour: "2-digit", minute: "2-digit",
                })}{" "}
                냈어요
              </span>
              {m.checked_at ? (
                <span className="tag tag-sky">선생님 확인</span>
              ) : (
                <button
                  className="btn btn-ghost btn-sm"
                  disabled={pending || readOnly}
                  onClick={() =>
                    startTransition(async () => {
                      const res = await removeSubmission(m.id);
                      if (res?.error) alert(res.error);
                      router.refresh();
                    })
                  }
                >
                  지우기
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
