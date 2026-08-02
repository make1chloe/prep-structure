"use client";

import { useRouter, useSearchParams } from "next/navigation";

/**
 * 형제가 둘 다 다니면 **계정 하나로 둘 다** 본다 (0071).
 * 아이를 바꾸는 것은 자주 하는 일이 아니므로, 위에 조용히 둔다.
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
    <div className="row" style={{ gap: 4, marginTop: 8, flexWrap: "wrap" }}>
      {children.map((c) => (
        <button
          key={c.id}
          className={`btn btn-sm ${pick === c.id ? "btn-primary" : "btn-ghost"}`}
          onClick={() => go(c.id)}
        >
          {c.name}
        </button>
      ))}
    </div>
  );
}
