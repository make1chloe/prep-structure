"use client";

import { useRouter, useSearchParams } from "next/navigation";

/**
 * 형제가 둘 다 다니면 **계정 하나로 둘 다** 본다 (0071).
 *
 * **아이 탭이 화면의 맨 위다** (원장님 확정 2026-08-27 — 학생 우선 계층).
 * 전에는 새로고침 단추 아래 작은 알약이라, 둘째 아이 화면이 있는 줄도
 * 모르고 지나가기 좋았다. 이제 큰 탭(이름 크게 + 학년 작게)으로 못 박고,
 * 탭 아래 화면 **전체가 고른 아이 것**이다 — 메뉴마다 아이를 다시 고르게
 * 하는 방식은 기각됐다.
 *
 * 바꾸는 방식은 그대로다 — ?c= 쿼리로 같은 화면을 다시 그린다 (겉만 컸다).
 * 아이가 하나면 이 탭은 아예 안 그린다 (page.jsx 의 children.length > 1).
 */
export default function ChildPicker({ children = [], pick }) {
  const router = useRouter();
  const params = useSearchParams();

  function go(id) {
    const p = new URLSearchParams(params.toString());
    p.set("c", id);
    router.push(`/parent?${p.toString()}`);
  }

  return (
    <div className="row" style={{ gap: 8, marginTop: 10, flexWrap: "wrap" }}>
      {children.map((c) => {
        const on = pick === c.id;
        return (
          <button
            key={c.id}
            className={`btn ${on ? "btn-on" : "btn-ghost"}`}
            aria-pressed={on}
            onClick={() => go(c.id)}
            style={{
              flex: "1 1 120px",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 2,
              padding: "10px 12px",
            }}
          >
            <b style={{ fontSize: 17 }}>{c.name}</b>
            <span style={{ fontSize: 12.5, opacity: 0.85 }}>
              {c.grade || c.school || " "}
            </span>
          </button>
        );
      })}
    </div>
  );
}
