/**
 * **오늘 숙제 전체 목록** — 종이에 적거나 찍어 가라고 두는 자리.
 *
 * 원장님 (2026-08-05)
 *   「폰을 부모님이 잠가서 집에서 숙제할 때 앱을 못 쓰는 학생을 위해 스스로
 *    종이에 적어서 할 수 있도록, 아니면 캡처할 수 있도록 학생용 화면 맨 아래에
 *    당일 숙제 목록을 영역별로 정리해줘」
 *
 * 위쪽은 **하나씩 순서대로** 하는 자리다 (타이머 · 체크). 여기는 그것과 쓰임이
 * 다르다 — **한 번에 다 보이는 것**이 목적이라 접거나 나누지 않는다.
 * 한 화면에 들어와야 찍어서 가져갈 수 있다.
 *
 * 그래서 여기에는 체크박스도 타이머도 두지 않는다. 누를 것이 있으면 위와
 * 아래 두 군데서 체크하게 되고, 두 군데는 반드시 어긋난다.
 */

import { cleanNote } from "@/lib/note";

/** 영역이 없는 것은 맨 뒤 「그 밖」 으로 — 안 보여주면 그 숙제가 사라진다 */
function group(items = []) {
  const by = new Map();
  items.forEach((c) => {
    const k = c.area || "";
    if (!by.has(k)) by.set(k, []);
    by.get(k).push(c);
  });
  const keys = [...by.keys()].filter(Boolean).sort((a, b) => a.localeCompare(b, "ko"));
  const out = keys.map((k) => ({ area: k, rows: by.get(k) }));
  if (by.has("")) out.push({ area: "그 밖", rows: by.get("") });
  return out;
}

export default function HomeworkSheet({ items = [], dateLabel = "", title = "오늘 숙제 전체" }) {
  if (items.length === 0) return null;
  const groups = group(items);
  const changed = items.filter((c) => c.changedAt);

  return (
    <div className="card" style={{ marginTop: 14 }}>
      <div className="row" style={{ gap: 8, alignItems: "baseline", flexWrap: "wrap" }}>
        <b style={{ fontSize: 16 }}>{title}</b>
        {dateLabel && <span className="hint">{dateLabel}</span>}
      </div>
      {/**
        * **「바뀜」 딱지도 설명도 뺐다** (원장님 2026-08-24 — 「숙제가 바뀌면
        * 어차피 알람이 새로 가는 거 아니야? 바뀐 것·바뀜 표시 없애고, 그냥
        * 글씨체나 색깔을 강조해」 · 「이거 멘트 둘 다 빼」).
        * 바뀐 줄은 **글씨로** 말한다 — 딱지 하나에 각주 두 줄을 붙이는 것보다
        * 진하게 쓴 한 줄이 빨리 읽힌다 (화면 규칙 1·2).
        */}

      <div className="stack" style={{ gap: 12 }}>
        {groups.map((g) => (
          <div key={g.area}>
            <b style={{ fontSize: 15 }}>{g.area}</b>
            <div className="stack" style={{ gap: 4, marginTop: 4 }}>
              {g.rows.map((c) => (
                <div key={c.key} style={{ display: "flex", gap: 6, alignItems: "flex-start" }}>
                  {/* 종이에 옮겨 적을 때 그대로 따라 그릴 수 있게 네모를 둔다.
                      여기서 누르는 것이 아니라 **적어 가는** 것이다 */}
                  <span style={{ fontSize: 14.5, lineHeight: 1.6 }}>☐</span>
                  <span
                    style={{
                      fontSize: 15, lineHeight: 1.6, flex: 1,
                      ...(c.changedAt ? { fontWeight: 700, color: "var(--amber)" } : {}),
                    }}
                  >
                    {c.name}
                    {/* 무엇을 펴야 하는지 (0116) — 적어 갈 때도 같이 적는다 */}
                    {c.tool && <span className="hint"> [{c.tool}]</span>}
                    {c.units?.length > 0 && (
                      <> — {c.units.join(", ")}</>
                    )}
                    {cleanNote(c.note) && <> {cleanNote(c.note)}</>}
                    {c.method && (
                      <>
                        <br />
                        <span className="muted" style={{ fontSize: 13 }}>{c.method}</span>
                      </>
                    )}
                  </span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

    </div>
  );
}
