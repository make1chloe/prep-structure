"use client";

import { endOfMonth, DOW } from "@/lib/day";

/**
 * 한 달 달력 — **반을 다 합쳐서 하나로** 그린다.
 *
 * 전에는 반마다 그 달 수업일을 「9/1(월) 9/3(수) …」 태그로 죽 늘어놓았고,
 * 그 다음엔 반마다 달력을 하나씩 놓았다. 반이 여섯이면 같은 9월이 여섯 번
 * 나온다. 원장님이 보고 싶은 것은 「9월에 무슨 일이 있나」 이지 「월수반의
 * 9월」 이 아니다. 그래서 **달력은 하나**, 무슨 일인지는 아래에 반별로 적는다.
 *
 * **여느 때대로 수업하는 날은 아무 표시도 안 한다.** 정상 수업까지 칠하면
 * 챙길 날이 그 안에 묻힌다.
 *
 * **누르면 아래에 적힌다.** 손가락으로는 마우스를 올릴 수 없다.
 */

const DOW_HEAD = ["월", "화", "수", "목", "금", "토", "일"];

/**
 * 월요일을 첫 칸으로.
 *
 * lib/day 의 dowOf 는 **글자**("목")를 돌려준다. 예전에 그걸 숫자처럼
 * 더해서 NaN 이 나왔고, 그래서 앞을 비우는 칸이 0개가 되어 **모든 달이
 * 월요일에서 시작**했다 — 달력에 적힌 요일이 통째로 어긋나 있었다.
 * 그래서 날짜에서 직접 센다.
 */
export function colOf(date) {
  const [y, m, d] = date.split("-").map(Number);
  const day = new Date(Date.UTC(y, m - 1, d)).getUTCDay();   // 0=일
  return (day + 6) % 7;                                      // 0=월
}

/** 이 날 이 반에 무슨 일이 있나 */
function whatHappens(c, d) {
  const m = c.month || {};
  const out = [];
  // 이 반 수업일이 아니면 할 말이 없다 (영어 시험 전날은 수업일이 아니어도 등원한다)
  if (!(m.all || []).includes(d) && !(m.engEve || []).some((x) => x.date === d)) return out;

  if ((m.off || []).includes(d)) {
    out.push({ tag: "휴강", cls: "tag-muted", text: "이 날은 수업하지 않습니다." });
  }
  const eve = (m.engEve || []).find((x) => x.date === d);
  if (eve) {
    out.push({
      tag: "영어 시험 전날",
      cls: "tag-lav",
      text:
        `${[eve.school, eve.grade].filter(Boolean).join(" ")} 영어 시험(${eve.english_on?.slice(5) || "?"}) 전날` +
        (eve.isClassDay ? "" : " — 정규수업이 아니지만 등원이 필요합니다"),
      who: (eve.who || []).map((x) => x.name),
    });
  }
  if ((m.inExam || []).includes(d)) {
    out.push({
      tag: "시험 기간",
      cls: "tag-amber",
      text: "타과목 시험 기간입니다 — 결석이 있을 수 있습니다.",
    });
  }
  const abs = (c.absents || []).filter((a) => a.date === d);
  if (abs.length) {
    out.push({
      tag: abs.every((a) => a.planned) ? "결석 예정" : "결석",
      cls: "tag-red",
      text: abs.map((a) => `${a.name}${a.reason ? ` (${a.reason})` : ""}`).join(", "),
    });
  }
  // **아무 일도 없으면 아무것도 안 적는다.** 「여느 때대로 수업합니다」 를
  // 반마다 적으면 챙길 것이 그 사이에 묻힌다.
  return out;
}

export default function MonthGrid({ ym, classes = [], openDay = null, onPick }) {
  if (!ym) return null;

  const last = Number(endOfMonth(ym).slice(8, 10));
  const days = [];
  for (let i = 1; i <= last; i += 1) days.push(`${ym}-${String(i).padStart(2, "0")}`);

  // 하루에 무슨 표시를 할지 — 반을 다 합쳐서 **더 챙겨야 하는 쪽**을 쓴다
  const markOf = new Map();
  const absCount = new Map();
  const anyClass = new Set();
  classes.forEach((c) => {
    const m = c.month || {};
    (m.all || []).forEach((d) => anyClass.add(d));
    (m.engEve || []).forEach((x) => anyClass.add(x.date));
    const put = (d, mark, rank) => {
      const cur = markOf.get(d);
      if (!cur || rank > cur.rank) markOf.set(d, { mark, rank });
    };
    (m.off || []).forEach((d) => put(d, "off", 1));
    (m.inExam || []).forEach((d) => put(d, "exam", 2));
    (m.engEve || []).forEach((x) => put(x.date, "eve", 3));
    (c.absents || []).forEach((a) => {
      put(a.date, "abs", 4);
      absCount.set(a.date, (absCount.get(a.date) || 0) + 1);
    });
  });

  // 누른 날 — 반별로 무슨 일이 있는지
  const picked = openDay
    ? classes
        .map((c) => ({ name: c.name, rows: whatHappens(c, openDay) }))
        .filter((x) => x.rows.length > 0)
    : [];

  return (
    <div style={{ marginTop: 8 }}>
      <div className="calgrid">
        {DOW_HEAD.map((h, i) => (
          <div key={h} className={`calhead${i >= 5 ? " calhead-wk" : ""}`}>{h}</div>
        ))}
        {Array.from({ length: colOf(days[0]) }, (_, i) => (
          <div key={`pad${i}`} />
        ))}
        {days.map((d) => {
          const mark = markOf.get(d)?.mark || (anyClass.has(d) ? "plain" : "none");
          const n = absCount.get(d) || 0;
          return (
            <button
              key={d}
              type="button"
              className={`calday calday-${mark}${openDay === d ? " calday-on" : ""}`}
              onClick={() => onPick?.(d)}
            >
              <span className="calnum">{Number(d.slice(8, 10))}</span>
              {n > 0 && <span className="calbadge">{n}</span>}
            </button>
          );
        })}
      </div>

      {/* 뜻풀이 — 마우스를 올릴 수 없는 화면에서도 색을 읽을 수 있게 */}
      <div className="row" style={{ gap: 4, marginTop: 6, flexWrap: "wrap" }}>
        {[
          ["off", "휴강"],
          ["exam", "시험 기간"],
          ["eve", "영어 시험 전날"],
          ["abs", "결석"],
        ].map(([k, label]) => (
          <span key={k} className="callegend">
            <i className={`caldot caldot-${k}`} />
            {label}
          </span>
        ))}
      </div>

      {openDay && openDay.startsWith(ym) && (
        <div className="card card-tight" style={{ marginTop: 8 }}>
          <b style={{ fontSize: 13 }}>
            {Number(openDay.slice(5, 7))}월 {Number(openDay.slice(8, 10))}일 (
            {DOW[new Date(`${openDay}T00:00:00Z`).getUTCDay()]})
          </b>
          {picked.length === 0 ? (
            <p className="muted" style={{ margin: "4px 0 0", fontSize: 13 }}>
              챙길 것이 없습니다.
            </p>
          ) : (
            <div className="stack" style={{ gap: 8, marginTop: 6 }}>
              {picked.map((c) => (
                <div key={c.name}>
                  {/* **반별로** 적는다 — 한 날에 반마다 사정이 다르다 */}
                  <b style={{ fontSize: 12.5 }}>{c.name}</b>
                  <div className="stack" style={{ gap: 3, marginTop: 3 }}>
                    {c.rows.map((x, i) => (
                      <div className="unitrow" key={i} style={{ alignItems: "flex-start" }}>
                        <span className={`tag ${x.cls}`}>{x.tag}</span>
                        <span style={{ fontSize: 12.5, flex: 1 }}>
                          {x.text}
                          {x.who?.length > 0 && (
                            <>
                              <br />
                              <span style={{ fontSize: 12, lineHeight: 1.7 }}>
                                {x.who.join(", ")}{" "}
                                <span className="muted">({x.who.length}명)</span>
                              </span>
                            </>
                          )}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
