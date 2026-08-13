"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { mergeTextbooks } from "./actions";

/**
 * 같은 교재로 보이는 것 — **합치기.**
 *
 * 엑셀 교재명이 앱에 있던 것과 조금 달라서 교재가 둘로 갈렸던 것을 되돌린다.
 * 이제는 올릴 때 알아서 붙지만, 이미 갈려버린 것은 여기서 손으로 합친다.
 *
 * 합치기는 되돌릴 수 없으니 **무엇이 어디로 가는지 먼저 보여준다.**
 * 남길 쪽은 학생이 많은 쪽으로 미리 골라두되, 원장님이 바꿀 수 있다.
 */
export default function DupBooks({ groups = [] }) {
  const [open, setOpen] = useState(false);
  const [keep, setKeep] = useState({});     // key → 남길 교재 id
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  if (groups.length === 0) return null;

  function merge(g) {
    const keepId = keep[g.key] || g.keepId;
    const drops = g.books.filter((b) => b.id !== keepId);
    const keepBook = g.books.find((b) => b.id === keepId);
    const msg =
      `「${keepBook?.name}」 하나로 합칩니다.\n\n` +
      drops.map((b) => `· ${b.name} (학생 ${b.students}명 · 단원 ${b.units}개)`).join("\n") +
      `\n\n안에 있던 단원·배정·진도는 전부 남는 교재로 옮겨집니다.\n되돌릴 수 없어요. 합칠까요?`;
    if (!confirm(msg)) return;
    startTransition(async () => {
      const res = await mergeTextbooks(keepId, drops.map((b) => b.id));
      if (res?.error) alert(res.error);
      router.refresh();
    });
  }

  return (
    <div className="card sect sect-warn" style={{ marginTop: 12 }}>
      <button
        className="row"
        onClick={() => setOpen(!open)}
        style={{
          all: "unset", cursor: "pointer", display: "flex",
          alignItems: "center", gap: 8, width: "100%",
        }}
      >
        <b style={{ fontSize: 15 }}>같은 교재로 보이는 것</b>
        <span className="tag tag-amber">{groups.length}묶음</span>
        <span className="spacer" />
        <span className="hint">{open ? "접기" : "펼쳐서 합치기"}</span>
      </button>

      {open && (
        <>
          <p className="hint" style={{ margin: "8px 0 10px", lineHeight: 1.6 }}>
            띄어쓰기나 <b>「2025 개정」</b> 같은 표기만 다른 교재예요. 갈라져 있으면
            배정은 이쪽에 · 단원은 저쪽에 붙어서 <b>진도가 둘로 나뉩니다.</b>
            앞으로 올리는 것은 알아서 붙지만, 이미 갈린 것은 여기서 합쳐주세요.
          </p>
          <div className="stack" style={{ gap: 8 }}>
            {groups.map((g) => {
              const keepId = keep[g.key] || g.keepId;
              return (
                <div key={g.key} className="unitrow" style={{ alignItems: "flex-start" }}>
                  <div className="stack" style={{ gap: 4, flex: 1, minWidth: 200 }}>
                    {g.books.map((b) => (
                      <label
                        key={b.id}
                        className="row"
                        style={{ gap: 6, alignItems: "center", cursor: "pointer" }}
                      >
                        <input
                          type="radio"
                          name={`keep-${g.key}`}
                          checked={keepId === b.id}
                          onChange={() => setKeep({ ...keep, [g.key]: b.id })}
                        />
                        <b style={{ fontSize: 14 }}>{b.name}</b>
                        {b.area && <span className="tag tag-muted">{b.area}</span>}
                        <span className="hint">학생 {b.students}명 · 단원 {b.units}개</span>
                        {keepId === b.id && <span className="tag tag-mint">이걸 남김</span>}
                      </label>
                    ))}
                  </div>
                  <button className="btn btn-sm" disabled={pending} onClick={() => merge(g)}>
                    합치기
                  </button>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
