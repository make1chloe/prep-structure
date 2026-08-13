"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { seedBasicHomework } from "./actions";
import { BASIC_HOMEWORK } from "@/lib/basicHomework";

export default function SeedBasicButton() {
  const [open, setOpen] = useState(false);
  const [msg, setMsg] = useState(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  const byCat = BASIC_HOMEWORK.reduce((m, i) => {
    (m[i.category] = m[i.category] || []).push(i);
    return m;
  }, {});

  function run() {
    startTransition(async () => {
      const r = await seedBasicHomework();
      if (r?.error) setMsg({ err: r.error });
      else setMsg({ ok: r });
      router.refresh();
    });
  }

  if (!open) {
    return (
      <button className="btn btn-ghost btn-sm" onClick={() => setOpen(true)}>
        노션 기본숙제 가져오기
      </button>
    );
  }

  return (
    <div className="card card-tight" style={{ marginTop: 10, width: "100%" }}>
      <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
        <h2 style={{ margin: 0, fontSize: 15, fontWeight: 800 }}>노션 기본숙제 가져오기</h2>
        <button className="btn btn-ghost btn-sm" onClick={() => setOpen(false)}>닫기</button>
      </div>

      <p className="sub" style={{ marginTop: 8 }}>
        노션 3재원생DB 의 <b>숙제 칸 · 학습 칸</b>에 반복해서 적혀 있던 것들을
        학습 항목으로 정리한 목록이에요. <b>이름이 같은 항목이 이미 있으면 그대로 둡니다</b> —
        고쳐두신 학습 방법을 덮어쓰지 않아요. 여러 번 눌러도 괜찮습니다.
        학생마다 다른 교재 이름·단원·점수는 넣지 않았어요. 그건 교재에서 나옵니다.
      </p>

      <div className="stack" style={{ gap: 8, marginTop: 10 }}>
        {Object.entries(byCat).map(([cat, list]) => (
          <div key={cat} className="row" style={{ gap: 6, alignItems: "baseline", flexWrap: "wrap" }}>
            <b style={{ width: 44, fontSize: 13 }}>{cat}</b>
            {list.map((i) => (
              <span key={i.name} className="tag" title={i.method || ""}>
                {i.name}
                {i.kind === "inclass" ? " · 등원" : ""}
                {i.inPerson ? " · 직접검사" : ""}
              </span>
            ))}
          </div>
        ))}
      </div>

      <div className="row" style={{ gap: 8, marginTop: 12, alignItems: "center" }}>
        <button className="btn btn-primary btn-sm" onClick={run} disabled={pending}>
          {pending ? "넣는 중…" : `${BASIC_HOMEWORK.length}개 넣기`}
        </button>
        {msg?.err ? <span className="err">{msg.err}</span> : null}
        {msg?.ok ? (
          <span className="sub">
            새로 넣음 {msg.ok.added}개 · 이미 있어서 그대로 둠 {msg.ok.kept}개
            {msg.ok.paired ? ` · 숙제로 낼 때 바뀌게 이어둠 ${msg.ok.paired}개` : ""}
          </span>
        ) : null}
      </div>
    </div>
  );
}
