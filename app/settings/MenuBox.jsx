"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { saveMenuPrefs, resetMenuPrefs } from "./menuActions";
import { ALL_ITEMS } from "@/lib/menu";

/**
 * 맨 위 메뉴에 무엇을 어떤 순서로 놓을지.
 *
 * 화면이 스물두 개인데 매일 여는 것은 대여섯 개다. 자주 쓰는 것을 앞으로
 * 당기고, 한 달에 한 번도 안 여는 것은 접어둔다.
 *
 * 숨겨도 **주소로는 그대로 열린다.** 메뉴에서만 빠지는 것이라, 실수로
 * 숨겨도 갇히지 않는다.
 *
 * 드래그는 쓰지 않는다. 폰에서 드래그로 순서를 바꾸는 건 잘 안 잡힌다.
 * ↑ ↓ 로 한 칸씩 옮긴다.
 */
export default function MenuBox({ profile }) {
  const initHidden = new Set(profile?.menu_hidden || []);
  const initOrder = (profile?.menu_order || []).filter((k) =>
    ALL_ITEMS.some((i) => i.key === k)
  );
  const rest = ALL_ITEMS.filter((i) => !initOrder.includes(i.key)).map((i) => i.key);

  const [order, setOrder] = useState([...initOrder, ...rest]);
  const [hidden, setHidden] = useState(initHidden);
  const [msg, setMsg] = useState(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  const byKey = new Map(ALL_ITEMS.map((i) => [i.key, i]));
  const shownCount = order.filter((k) => !hidden.has(k)).length;

  function move(i, dir) {
    const j = i + dir;
    if (j < 0 || j >= order.length) return;
    const n = [...order];
    [n[i], n[j]] = [n[j], n[i]];
    setOrder(n);
  }

  function toggle(k) {
    const n = new Set(hidden);
    n.has(k) ? n.delete(k) : n.add(k);
    setHidden(n);
  }

  function save() {
    startTransition(async () => {
      const r = await saveMenuPrefs([...hidden], order);
      setMsg(r?.error ? { err: r.error } : { ok: "저장했어요." });
      router.refresh();
    });
  }

  function reset() {
    startTransition(async () => {
      const r = await resetMenuPrefs();
      if (r?.error) setMsg({ err: r.error });
      else {
        setHidden(new Set());
        setOrder(ALL_ITEMS.map((i) => i.key));
        setMsg({ ok: "처음 상태로 되돌렸어요." });
      }
      router.refresh();
    });
  }

  return (
    <div className="card">
      <h2 style={{ margin: "0 0 4px", fontSize: 16, fontWeight: 800 }}>맨 위 메뉴</h2>
      <p className="sub" style={{ margin: "0 0 10px" }}>
        자주 쓰는 화면을 앞으로 당기고, 안 쓰는 것은 접어두세요.
        <b> 접어도 주소로는 그대로 열립니다</b> — 메뉴에서만 빠져요.
        이 설정은 <b>내 계정에만</b> 적용됩니다.
      </p>

      {/* 지금 어떻게 보이는지 — 저장하기 전에 눈으로 확인한다 */}
      <div className="navgrid" style={{ padding: "8px 0 12px" }}>
        {order
          .filter((k) => !hidden.has(k))
          .map((k) => (
            <span key={k} className="tag tag-muted">{byKey.get(k)?.label}</span>
          ))}
      </div>

      <div className="stack" style={{ gap: 2 }}>
        {order.map((k, i) => {
          const it = byKey.get(k);
          if (!it) return null;
          const off = hidden.has(k);
          return (
            <div className="unitrow" key={k} style={{ opacity: off ? 0.45 : 1 }}>
              <span className="hint" style={{ minWidth: 22, textAlign: "right" }}>{i + 1}</span>
              <b style={{ fontSize: 14.5, minWidth: 120 }}>{it.label}</b>
              <span className="hint" style={{ flex: 1, fontSize: 12.5 }}>{it.desc || ""}</span>
              <button className="btn btn-ghost btn-sm" onClick={() => move(i, -1)} disabled={i === 0}>↑</button>
              <button
                className="btn btn-ghost btn-sm"
                onClick={() => move(i, 1)}
                disabled={i === order.length - 1}
              >
                ↓
              </button>
              <button
                className={`btn btn-sm ${off ? "btn-ghost" : "btn-on"}`}
                onClick={() => toggle(k)}
                style={{ minWidth: 60 }}
              >
                {off ? "접힘" : "보임"}
              </button>
            </div>
          );
        })}
      </div>

      <div className="row" style={{ gap: 8, marginTop: 12, alignItems: "center" }}>
        <button className="btn btn-primary btn-sm" onClick={save} disabled={pending}>
          {pending ? "저장 중…" : `저장 (${shownCount}개 보임)`}
        </button>
        <button className="btn btn-ghost btn-sm" onClick={reset} disabled={pending}>
          처음 상태로
        </button>
        {msg?.err && <span className="err">{msg.err}</span>}
        {msg?.ok && <span className="hint">{msg.ok}</span>}
      </div>
    </div>
  );
}
