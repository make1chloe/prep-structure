"use client";

/**
 * 등원해서 먼저 할 것 — 폰 · 숙제.
 *
 * 학생 화면에서는 **알려주기만** 한다. 냈다고 누르는 것은 선생님이다.
 * 아이가 스스로 체크하게 하면 안 내고도 눌러버린다.
 *
 * 둘 다 끝나면 조용히 사라진다. 학습 화면이 앞으로 나와야 하기 때문이다.
 */
export default function ArrivalCard({ phone = false, homework = false }) {
  if (phone && homework) return null;

  const steps = [
    ["핸드폰 내기", phone],
    ["숙제 내기", homework],
  ];

  return (
    <div className="card card-tight" style={{ borderLeft: "3px solid var(--amber, #e0a33e)" }}>
      <b style={{ fontSize: 13.5 }}>먼저 할 것</b>
      <div className="stack" style={{ gap: 4, marginTop: 6 }}>
        {steps.map(([label, done]) => (
          <div className="unitrow" key={label}>
            <span className={`tag ${done ? "tag-mint" : "tag-amber"}`}>{done ? "✓" : "!"}</span>
            <span
              style={{
                fontSize: 14,
                flex: 1,
                textDecoration: done ? "line-through" : "none",
                opacity: done ? 0.6 : 1,
              }}
            >
              {label}
            </span>
          </div>
        ))}
      </div>
      <p className="hint" style={{ margin: "6px 0 0", fontSize: 11.5 }}>
        선생님께 내고 나면 여기가 사라져요.
      </p>
    </div>
  );
}
