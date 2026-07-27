"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { setMakeup } from "./plan/actions";
import { dayLabel as fmtDay } from "@/lib/day";

const DOWN = ["일", "월", "화", "수", "목", "금", "토"];

const dayLabel = fmtDay;

/**
 * 결석했는데 보강일이 안 잡힌 학생 목록.
 * 여기서 바로 보강 날짜를 정할 수 있다.
 */
export default function MakeupInbox({ rows = [] }) {
  const [pick, setPick] = useState({});
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function schedule(r) {
    const d = pick[`${r.studentId}|${r.date}`];
    if (!d) return;
    startTransition(async () => {
      const res = await setMakeup(r.studentId, d, r.date);
      if (res?.error) {
        alert(res.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="card">
      <h2 style={{ margin: "0 0 4px", fontSize: 15, fontWeight: 800 }}>
        보강 잡을 것{" "}
        {rows.length > 0 && <span className="tag tag-amber">{rows.length}</span>}
      </h2>
      <p className="hint" style={{ margin: "0 0 10px" }}>
        결석했는데 보강일이 아직 없는 학생입니다. 날짜를 고르면 그날 <b>보강</b>으로 들어갑니다.
      </p>

      {rows.length === 0 ? (
        <p className="hint" style={{ margin: 0 }}>보강 잡을 학생이 없습니다 👍</p>
      ) : (
        <div className="stack" style={{ gap: 6 }}>
          {rows.map((r) => {
            const key = `${r.studentId}|${r.date}`;
            return (
              <div className="unitrow" key={key}>
                <span className={`tag ${r.planned ? "tag-amber" : "tag-muted"}`}>
                  {r.planned ? "사전 연락" : "결석"}
                </span>
                <b style={{ fontSize: 12.5 }}>{r.name}</b>
                <span className="hint">{dayLabel(r.date)} 결석</span>
                {r.reason && <span className="hint">· {r.reason}</span>}
                {r.classDays?.length > 0 && (
                  <span className="hint">· 수업 {r.classDays.join("·")}</span>
                )}
                <span className="spacer" />
                <input
                  className="input input-sm"
                  type="date"
                  style={{ width: 145 }}
                  value={pick[key] || ""}
                  onChange={(e) => setPick({ ...pick, [key]: e.target.value })}
                />
                <button
                  className="btn btn-primary btn-sm"
                  onClick={() => schedule(r)}
                  disabled={pending || !pick[key]}
                >
                  보강 잡기
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
