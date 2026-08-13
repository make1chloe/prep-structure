"use client";

import { useEffect, useState, useTransition } from "react";
import { myIp, listNet, addMyIp, removeIp } from "./netActions";

/**
 * 학원에서만 등원 체크가 되게.
 *
 * 아이가 오는 길에 미리 눌러버리면 등원 체크가 아무 뜻이 없다.
 * 학원 인터넷에서 온 요청만 받으면 그게 막힌다 — 아이는 아무것도 안 해도 된다.
 *
 * 켜고 끄는 스위치는 없다. **주소가 하나라도 있으면 켜진 것**이고 다 지우면 꺼진다.
 */
export default function NetBox() {
  const [rows, setRows] = useState(null);
  const [ready, setReady] = useState(true);
  const [now, setNow] = useState(null);
  const [note, setNote] = useState("");
  const [pending, startTransition] = useTransition();

  async function load() {
    const [a, b] = await Promise.all([listNet(), myIp()]);
    setRows(a.rows);
    setReady(a.ready);
    setNow(b.ip);
  }
  useEffect(() => {
    load();
  }, []);

  if (rows === null) return null;

  const here = rows.some((r) => r.ip === now);

  return (
    <div className="card">
      <div className="row" style={{ alignItems: "baseline", gap: 8 }}>
        <h2 style={{ margin: 0, fontSize: 16, fontWeight: 800 }}>학원에서만 등원 체크</h2>
        {rows.length > 0 ? (
          <span className="tag tag-mint">켜짐</span>
        ) : (
          <span className="tag tag-muted">꺼짐</span>
        )}
      </div>
      <p className="muted" style={{ margin: "6px 0 10px", fontSize: 14, lineHeight: 1.8 }}>
        아이가 오는 길에 미리 누르는 것을 막습니다. 학원 인터넷에서 온 것만 받습니다.
        <br />
        <b>주소를 하나라도 등록하면 켜지고, 다 지우면 꺼집니다.</b> 아이가 할 일은 없습니다 —
        학원 와이파이에 붙어 있으면 그냥 됩니다.
      </p>

      {!ready && (
        <div className="notice" style={{ fontSize: 14 }}>
          <b>0041 SQL</b> 을 먼저 실행해주세요.
        </div>
      )}

      <div className="row" style={{ gap: 6, alignItems: "flex-end", flexWrap: "wrap" }}>
        <div className="field" style={{ flex: 1, minWidth: 160 }}>
          <label className="label">지금 이 기기가 보이는 주소</label>
          <input className="input input-sm mono" readOnly value={now || "(못 읽음)"} />
        </div>
        <div className="field" style={{ width: 150 }}>
          <label className="label">메모 (선택)</label>
          <input
            className="input input-sm"
            placeholder="예) 학원 와이파이"
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
        </div>
        <button
          className="btn btn-primary btn-sm"
          disabled={pending || !now || here}
          onClick={() =>
            startTransition(async () => {
              const res = await addMyIp(note);
              if (res?.error) {
                alert(res.error);
                return;
              }
              setNote("");
              await load();
            })
          }
        >
          {here ? "이미 등록됨" : "지금 이 주소 등록"}
        </button>
      </div>
      <p className="hint" style={{ marginTop: 6 }}>
        <b>학원에서 이 화면을 열고</b> 누르세요. 집에서 누르면 집 주소가 등록됩니다.
      </p>

      {rows.length > 0 && (
        <div className="stack" style={{ gap: 4, marginTop: 12 }}>
          {rows.map((r) => (
            <div className="unitrow" key={r.ip}>
              <span className="mono" style={{ fontSize: 14, flex: 1 }}>{r.ip}</span>
              {r.note && <span className="hint">{r.note}</span>}
              {r.ip === now && <span className="tag tag-mint">지금 여기</span>}
              <button
                className="btn btn-ghost btn-sm"
                disabled={pending}
                onClick={() => {
                  if (!confirm(`${r.ip} 를 지울까요?\n마지막 하나를 지우면 이 기능이 꺼집니다.`))
                    return;
                  startTransition(async () => {
                    await removeIp(r.ip);
                    await load();
                  });
                }}
              >
                지우기
              </button>
            </div>
          ))}
        </div>
      )}

      {rows.length > 0 && (
        <p className="hint" style={{ marginTop: 8, lineHeight: 1.8 }}>
          인터넷 회선을 바꾸거나 통신사가 주소를 바꾸면 아이들이 못 누르게 됩니다.
          그럴 때는 <b>학원에서 이 화면을 열고 새 주소를 등록</b>하시면 됩니다.
        </p>
      )}
    </div>
  );
}
