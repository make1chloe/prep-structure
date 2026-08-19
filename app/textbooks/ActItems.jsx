"use client";

import { useState, useTransition } from "react";
import { getActItems, saveActItems } from "./actions";

/**
 * **활동 요약 + 학습항목 연결** (0138, 원장님 2026-08-19 — 「교재에서는
 * 개념설명 문제풀이 복습이 8단원 있다를 간단히 표시하고, 개념설명에 학습
 * 배정, 문제풀이에 학습 배정 이렇게는 안 될까?」).
 *
 * 단원 표 위에 「개념설명 8 · 문제풀이 8 · 복습 8」 한 줄 — 활동마다
 * 학습항목을 연결해두면, 진도 판에서 그 활동의 단원을 숙제로 담을 때
 * 그 항목으로 들어간다. 단원 표 자체는 안 바뀐다.
 *
 * @param acts [{ name, count }] — 이 교재 소단원의 활동별 개수
 */
export default function ActItems({ textbookId, acts = [] }) {
  const [open, setOpen] = useState(false);
  const [map, setMap] = useState(null);      // 활동 → 항목 id
  const [items, setItems] = useState([]);
  const [needSql, setNeedSql] = useState(false);
  const [pending, startTransition] = useTransition();

  if (acts.length === 0) return null;

  async function openUp() {
    setOpen(true);
    if (map !== null) return;
    const res = await getActItems(textbookId);
    setMap(res.map || {});
    setItems(res.items || []);
    setNeedSql(!!res.needSql);
  }

  function save() {
    startTransition(async () => {
      const res = await saveActItems(textbookId, map || {});
      if (res?.error) { alert(res.error); return; }
      setOpen(false);
    });
  }

  return (
    <div className="stack" style={{ gap: 4, margin: "0 0 8px" }}>
      <div className="row" style={{ gap: 6, alignItems: "center", flexWrap: "wrap" }}>
        <span className="hint">
          활동: {acts.map((a) => `${a.name} ${a.count}`).join(" · ")}
        </span>
        {!open && (
          <button className="btn btn-ghost btn-sm" onClick={openUp}>
            학습 연결
          </button>
        )}
      </div>
      {open && (
        <div className="card card-tight" style={{ maxWidth: 460 }}>
          <b style={{ fontSize: 14 }}>활동마다 어느 학습항목으로 담을까요?</b>
          <p className="hint" style={{ margin: "4px 0 8px" }}>
            진도 판에서 「📝 숙제로」 담을 때 이 연결이 먼저 쓰여요. 비우면 영역으로 짐작합니다.
          </p>
          {needSql && (
            <p className="err" style={{ margin: "0 0 8px" }}>
              관리자 → SQL 확인에서 <b>0138</b> 을 먼저 실행해 주세요.
            </p>
          )}
          {map !== null &&
            acts.map((a) => (
              <div className="row" style={{ gap: 6, alignItems: "center", marginBottom: 4 }} key={a.name}>
                <span style={{ width: 110, fontSize: 13.5 }}>{a.name}</span>
                <select
                  className="input input-sm"
                  style={{ flex: 1, maxWidth: 240 }}
                  value={map[a.name] || ""}
                  onChange={(e) => setMap({ ...map, [a.name]: e.target.value })}
                >
                  <option value="">— (영역으로 짐작)</option>
                  {items.map((i) => (
                    <option key={i.id} value={i.id}>
                      {i.category ? `[${i.category}] ` : ""}{i.name}
                    </option>
                  ))}
                </select>
              </div>
            ))}
          <div className="row" style={{ gap: 6, marginTop: 6, justifyContent: "flex-end" }}>
            <button className="btn btn-ghost btn-sm" onClick={() => setOpen(false)}>취소</button>
            <button className="btn btn-primary btn-sm" disabled={pending || map === null} onClick={save}>
              저장
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
