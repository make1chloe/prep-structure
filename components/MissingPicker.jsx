"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { saveMissingKeys } from "@/app/settings/missingActions";

/**
 * **「빠진 것」 의 기준을 그 자리에서 고른다** (원장님, 2026-08-14 —
 * 「누락 시 표시 과다 — 필수값 선택 필요」).
 *
 * 목록마다 채워야 하는 칸이 다르다. 「빠진 것만」 체크박스 옆의 ⚙ 를
 * 누르면 그 목록의 후보 칸들이 나오고, 체크한 칸만 센다. 저장은 DB 라
 * 폰에서 정한 기준이 PC 에도 그대로다.
 *
 * @param listKey "students" | "textbooks" | "homework"
 * @param defs    그 목록의 후보 칸 (NEED 전체)
 * @param chosen  지금 세는 칸 key 목록 (null 이면 전부)
 */
export default function MissingPicker({ listKey, defs = [], chosen = null }) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const on = new Set(chosen === null ? defs.map((d) => d.key) : chosen);

  function toggle(key) {
    const n = new Set(on);
    n.has(key) ? n.delete(key) : n.add(key);
    startTransition(async () => {
      const res = await saveMissingKeys(listKey, [...n]);
      if (res?.error) { alert(res.error); return; }
      router.refresh();
    });
  }

  return (
    <span className="row" style={{ gap: 4, alignItems: "center" }}>
      <button
        className={`btn btn-ghost btn-sm ${open ? "btn-primary" : ""}`}
        style={{ padding: "2px 8px" }}
        title="이 목록에서 어떤 칸이 비면 「빠졌다」 로 셀지 고릅니다"
        onClick={() => setOpen(!open)}
      >
        ⚙ 기준
      </button>
      {open && (
        <>
          {defs.map((d) => (
            <button
              key={d.key}
              className={`hwchip ${on.has(d.key) ? "hw-next" : ""}`}
              disabled={pending}
              onClick={() => toggle(d.key)}
              title={on.has(d.key) ? "누르면 안 셉니다" : "누르면 셉니다"}
            >
              {on.has(d.key) ? "☑" : "☐"} {d.label}
            </button>
          ))}
          <span className="hint" style={{ fontSize: 12 }}>체크한 칸만 셉니다</span>
        </>
      )}
    </span>
  );
}
