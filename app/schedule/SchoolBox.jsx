"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { listAllSchools, renameSchool, mergeSchools, addSchoolByName } from "./schoolActions";
import { schoolGroups } from "@/lib/schoolName";

/**
 * 학교 명단 — **한 곳에 모아둔 학교들** (0076).
 *
 * 예전에는 학교 이름이 글자로 학생·시험에 각각 적혀 있어서, 「신송중」과
 * 「신송중학교」가 다른 학교가 됐다. 그러면 재원생과 시험 일정이 안 이어지고,
 * 등급컷을 두 번 적게 된다.
 *
 * 이제 학교가 한 줄이고 학생·시험이 그 줄을 가리킨다. 그래서 여기서 이름을
 * 고치면 **학생과 시험이 저절로 따라온다.**
 */
export default function SchoolBox() {
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState(null);
  const [err, setErr] = useState(null);
  const [editId, setEditId] = useState(null);
  const [draft, setDraft] = useState("");
  const [adding, setAdding] = useState("");
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  useEffect(() => {
    if (!open || rows) return;
    listAllSchools().then((r) => {
      if (r?.error) setErr(r.error);
      setRows(r?.rows || []);
    });
  }, [open, rows]);

  function run(fn) {
    startTransition(async () => {
      const r = await fn();
      if (r?.error) { alert(r.error); return; }
      setRows(null);        // 다시 읽는다
      setEditId(null);
      router.refresh();
    });
  }

  if (!open) {
    return (
      <button className="btn btn-ghost btn-sm" onClick={() => setOpen(true)}>
        학교 명단
      </button>
    );
  }

  // 아직 한 줄로 안 모인 것 — 이름이 조금 다른 채로 둘이 남아 있는 경우
  const dups = schoolGroups((rows || []).map((s) => s.name));

  return (
    <div className="card sect sect-info" style={{ marginTop: 10 }}>
      <div className="row" style={{ alignItems: "center" }}>
        <h2 className="secthead" style={{ margin: 0 }}>학교 명단</h2>
        <span className="spacer" />
        <button className="btn btn-ghost btn-sm" onClick={() => setOpen(false)}>닫기</button>
      </div>
      <p className="hint" style={{ margin: "6px 0 10px", lineHeight: 1.6 }}>
        학교는 <b>여기 한 곳</b>에만 있습니다. 재원생과 시험 일정이 이 줄을 가리켜요 —
        그래서 <b>여기서 이름을 고치면 학생과 시험이 저절로 따라옵니다.</b>
      </p>

      {err && <div className="err" style={{ marginBottom: 8 }}>{err}</div>}

      {dups.length > 0 && (
        <div className="notice" style={{ marginBottom: 10 }}>
          <b>같은 학교로 보이는 것이 있어요.</b> 아래에서 「합치기」 를 누르면
          학생·시험이 한쪽으로 모입니다.
          {dups.map((g) => (
            <div key={g.key} style={{ marginTop: 4 }}>· {g.names.join(" / ")}</div>
          ))}
        </div>
      )}

      <div className="row" style={{ gap: 6, marginBottom: 10 }}>
        <input
          className="input input-sm"
          style={{ width: 180 }}
          placeholder="학교 직접 추가"
          title="나이스에 없는 학교도 있어요 (전학 오기 전 학교 등)"
          value={adding}
          onChange={(e) => setAdding(e.target.value)}
        />
        <button
          className="btn btn-sm"
          disabled={pending || !adding.trim()}
          onClick={() => run(async () => {
            const r = await addSchoolByName(adding);
            if (!r?.error) setAdding("");
            return r;
          })}
        >
          추가
        </button>
      </div>

      {!rows ? (
        <p className="hint" style={{ margin: 0 }}>불러오는 중…</p>
      ) : rows.length === 0 ? (
        <p className="hint" style={{ margin: 0 }}>아직 학교가 없어요.</p>
      ) : (
        <div className="stack" style={{ gap: 3 }}>
          {rows.map((s) => {
            const twins = rows.filter(
              (x) => x.id !== s.id && dups.some((g) => g.names.includes(s.name) && g.names.includes(x.name))
            );
            return (
              <div className="unitrow" key={s.id}>
                {editId === s.id ? (
                  <>
                    <input
                      className="input input-sm"
                      style={{ width: 180 }}
                      value={draft}
                      onChange={(e) => setDraft(e.target.value)}
                    />
                    <button
                      className="btn btn-primary btn-sm"
                      disabled={pending}
                      onClick={() => run(() => renameSchool(s.id, draft))}
                    >
                      저장
                    </button>
                    <button className="btn btn-ghost btn-sm" onClick={() => setEditId(null)}>취소</button>
                    <span className="hint">학생 {s.students}명 · 시험 {s.exams}건이 같이 바뀝니다</span>
                  </>
                ) : (
                  <>
                    <b style={{ fontSize: 12.5, minWidth: 130 }}>{s.name}</b>
                    <span className={`tag ${s.linked ? "tag-mint" : "tag-muted"}`}>
                      {s.linked ? "나이스 연결됨" : "손으로 넣음"}
                    </span>
                    <span className="hint">학생 {s.students}명 · 시험 {s.exams}건</span>
                    <span className="spacer" />
                    {twins.map((t) => (
                      <button
                        key={t.id}
                        className="btn btn-sm"
                        disabled={pending}
                        title={`${t.name} 의 학생·시험을 ${s.name} 으로 옮깁니다`}
                        onClick={() => {
                          if (!confirm(
                            `「${t.name}」 를 「${s.name}」 에 합칩니다.\n\n` +
                            `학생 ${t.students}명 · 시험 ${t.exams}건이 옮겨가고,\n` +
                            `「${t.name}」 는 별칭으로 남습니다.\n\n합칠까요?`
                          )) return;
                          run(() => mergeSchools(s.id, t.id));
                        }}
                      >
                        {t.name} 합치기
                      </button>
                    ))}
                    <button
                      className="btn btn-ghost btn-sm"
                      onClick={() => { setEditId(s.id); setDraft(s.name); }}
                    >
                      이름 고치기
                    </button>
                  </>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
