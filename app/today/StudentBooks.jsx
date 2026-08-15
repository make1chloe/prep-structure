"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { setStudentTextbooks, addStudentBookDated } from "@/app/progress/actions";
import BookPickPanel from "@/components/BookPickPanel";

// 학생 한 명의 교재.
//
// 교재는 **학생마다 다르다** — 같은 반이어도 다르다. 반에 붙이는 것은 여러 명에게
// 한 번에 넣어주는 지름길일 뿐이고, 진짜 배정은 여기다.
/**
 * @param alwaysOpen 재원생 화면의 「교재」 탭처럼 **이미 교재를 보러 들어온 자리**
 *   에서는 접어둘 이유가 없다. 한 번 더 누르게 하면 그만큼 늦어진다.
 */
export default function StudentBooks({ studentId, myBooks = [], textbooks = [], alwaysOpen = false }) {
  const [open, setOpen] = useState(alwaysOpen);
  const [picked, setPicked] = useState(() => new Set(myBooks.map((b) => b.id)));
  /**
   * **날짜를 지정해서 추가** (원장님, 2026-08-14 — 「사용예정 교재 추가가
   * 필요해. 시작날짜를 입력하고 … 이미 쓴 적 있는데 기록이 없는 교재를
   * 추가할 수 있어야 해」). 위의 고르기는 「오늘부터 쓴다」 한 가지다 —
   * 다음 달부터 쓸 책과 예전에 끝낸 책은 여기서 날짜와 함께 넣는다.
   */
  const [dOpen, setDOpen] = useState(false);
  const [dBook, setDBook] = useState("");
  const [dStart, setDStart] = useState("");
  const [dEnd, setDEnd] = useState("");
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function addDated() {
    startTransition(async () => {
      const res = await addStudentBookDated(studentId, dBook, dStart || null, dEnd || null);
      if (res?.error) { alert(res.error); return; }
      setDBook(""); setDStart(""); setDEnd(""); setDOpen(false);
      router.refresh();
    });
  }

  const dirty =
    picked.size !== myBooks.length || myBooks.some((b) => !picked.has(b.id));

  function save() {
    startTransition(async () => {
      const res = await setStudentTextbooks(studentId, [...picked]);
      if (res?.error) {
        alert(res.error);
        return;
      }
      setOpen(false);
      router.refresh();
    });
  }

  if (!open && !alwaysOpen) {
    return (
      <button className="btn btn-ghost btn-sm" onClick={() => setOpen(true)}>
        {myBooks.length > 0 ? `교재 ${myBooks.length}권 바꾸기` : "교재 배정"}
      </button>
    );
  }

  return (
    <div className="card card-tight" style={{ width: "100%", marginTop: 6 }}>
      <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
        <b style={{ fontSize: 14.5 }}>이 학생의 교재 {picked.size}권</b>
        <div className="row" style={{ gap: 4 }}>
          <button className="btn btn-primary btn-sm" onClick={save} disabled={pending || !dirty}>
            {dirty ? "저장" : "저장됨"}
          </button>
          <button className="btn btn-ghost btn-sm" onClick={() => setOpen(false)}>닫기</button>
        </div>
      </div>
      <p className="hint" style={{ margin: "6px 0 8px" }}>
        교재는 학생마다 따로 정합니다. 뺀 교재는 지워지지 않고 <b>중단</b>으로 남아,
        지금까지 나간 진도가 그대로 보존돼요. 다시 넣으면 이어서 갑니다.
      </p>
      {/* 고르는 판은 한 벌 (components/BookPickPanel) — 신규 상담도 같은 판을 쓴다 */}
      <BookPickPanel
        books={textbooks}
        picked={picked}
        onToggle={(id) => {
          const n = new Set(picked);
          n.has(id) ? n.delete(id) : n.add(id);
          setPicked(n);
        }}
      />

      {/* 날짜 지정 추가 — 예정 교재(시작일 미래) · 지난 교재(종료일까지) */}
      <div style={{ marginTop: 10, borderTop: "1px solid var(--border)", paddingTop: 8 }}>
        {!dOpen ? (
          <button className="btn btn-ghost btn-sm" onClick={() => setDOpen(true)}>
            📅 날짜 지정해서 추가 (예정 교재 · 지난 교재)
          </button>
        ) : (
          <div className="stack" style={{ gap: 6 }}>
            <div className="row" style={{ gap: 6, alignItems: "flex-end", flexWrap: "wrap" }}>
              <div className="field" style={{ minWidth: 200, flex: 1 }}>
                <label className="label">교재</label>
                <select className="input input-sm" value={dBook} onChange={(e) => setDBook(e.target.value)}>
                  <option value="">교재 고르기…</option>
                  {textbooks.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.area ? `[${b.area}] ` : ""}{b.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label className="label">시작일</label>
                <input className="input input-sm" type="date" value={dStart} onChange={(e) => setDStart(e.target.value)} />
              </div>
              <div className="field">
                <label className="label">종료일 (끝낸 교재만)</label>
                <input className="input input-sm" type="date" value={dEnd} onChange={(e) => setDEnd(e.target.value)} />
              </div>
              <button className="btn btn-primary btn-sm" onClick={addDated} disabled={pending || !dBook}>
                추가
              </button>
              <button className="btn btn-ghost btn-sm" onClick={() => setDOpen(false)}>닫기</button>
            </div>
            <p className="hint" style={{ margin: 0 }}>
              시작일이 미래면 <b>사용 예정</b>으로 들어가 그날부터 숙제·진도에 나와요.
              종료일까지 적으면 <b>끝낸 교재</b> 기록으로 바로 들어가요 — 앱 쓰기 전에
              끝낸 교재를 남길 때 쓰세요. 지금 쓰는 교재를 끝낼 때는 진도 판의
              「이 교재 끝냄」 이 종료처리예요.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
