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

export default function HomeworkSheet({ items = [], dateLabel = "" }) {
  if (items.length === 0) return null;
  const groups = group(items);
  const changed = items.filter((c) => c.changedAt);

  return (
    <div className="card" style={{ marginTop: 14 }}>
      <div className="row" style={{ gap: 8, alignItems: "baseline", flexWrap: "wrap" }}>
        <b style={{ fontSize: 15 }}>오늘 숙제 전체</b>
        {dateLabel && <span className="hint">{dateLabel}</span>}
        {changed.length > 0 && (
          <span className="tag tag-amber">바뀐 것 {changed.length}</span>
        )}
      </div>
      <p className="hint" style={{ margin: "4px 0 10px" }}>
        집에서 폰을 못 쓰면 <b>이 부분만 찍어 두거나 종이에 옮겨 적어</b> 가세요.
        위에서 하나씩 하는 것과 같은 내용입니다.
      </p>

      <div className="stack" style={{ gap: 12 }}>
        {groups.map((g) => (
          <div key={g.area}>
            <b style={{ fontSize: 13.5 }}>{g.area}</b>
            <div className="stack" style={{ gap: 4, marginTop: 4 }}>
              {g.rows.map((c) => (
                <div key={c.key} style={{ display: "flex", gap: 6, alignItems: "flex-start" }}>
                  {/* 종이에 옮겨 적을 때 그대로 따라 그릴 수 있게 네모를 둔다.
                      여기서 누르는 것이 아니라 **적어 가는** 것이다 */}
                  <span style={{ fontSize: 13, lineHeight: 1.6 }}>☐</span>
                  <span style={{ fontSize: 13.5, lineHeight: 1.6, flex: 1 }}>
                    {c.name}
                    {c.units?.length > 0 && (
                      <> — {c.units.join(", ")}</>
                    )}
                    {c.note && <> {c.note}</>}
                    {c.changedAt && (
                      <span className="tag tag-amber" style={{ marginLeft: 4, fontSize: 10.5 }}>
                        바뀜
                      </span>
                    )}
                    {c.method && (
                      <>
                        <br />
                        <span className="muted" style={{ fontSize: 12 }}>{c.method}</span>
                      </>
                    )}
                  </span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      {changed.length > 0 && (
        <p className="hint" style={{ margin: "10px 0 0" }}>
          <b>바뀜</b> 은 선생님이 나중에 더하거나 고치신 것입니다.
          아까 적어둔 것과 다를 수 있으니 한 번 더 봐주세요.
        </p>
      )}
    </div>
  );
}
