"use client";

import { useState } from "react";
import { endOfMonth, dowOf } from "@/lib/day";

/**
 * 한 반 · 한 달을 **달력으로** 본다.
 *
 * 전에는 그 달 수업일을 「9/1(월) 9/3(수) 9/8(월) …」 처럼 태그로 죽 늘어놓았다.
 * 한 반에 열두 줄, 반이 여섯이면 한 화면에 칠십 줄이다. 무엇이 휴강이고 무엇이
 * 시험 기간인지는 **색으로만** 갈라져 있었고, 무슨 색인지는 마우스를 올려야
 * 알 수 있었다 — 폰에는 올릴 마우스가 없다.
 *
 * 달력은 날짜를 읽을 필요가 없다. **자리로** 안다. 둘째 주 수요일이 비어 있으면
 * 그게 휴강이다.
 *
 * **누르면 아래에 적힌다.** 손가락으로는 마우스를 올릴 수 없으니, 표시의 뜻과
 * 누가 빠지는지를 눌러서 읽는다.
 */

const DOW_HEAD = ["월", "화", "수", "목", "금", "토", "일"];

/** 월요일을 첫 칸으로 — 학원 주는 월요일에 시작한다 */
function col(date) {
  return (dowOf(date) + 6) % 7;
}

export default function MonthGrid({ month, absents = [] }) {
  const [openDay, setOpenDay] = useState(null);
  const { ym, all = [], off = [], inExam = [], engEve = [] } = month || {};
  if (!ym) return null;

  const last = Number(endOfMonth(ym).slice(8, 10));
  const days = [];
  for (let i = 1; i <= last; i += 1) {
    days.push(`${ym}-${String(i).padStart(2, "0")}`);
  }

  const isClass = new Set(all);
  const isOff = new Set(off);
  const isExam = new Set(inExam);
  const eveOf = new Map(engEve.map((x) => [x.date, x]));
  // 학생별 결석 — 같은 날 여러 명일 수 있다
  const absOf = new Map();
  absents.forEach((a) => {
    if (!absOf.has(a.date)) absOf.set(a.date, []);
    absOf.get(a.date).push(a);
  });

  /** 이 날 무슨 일이 있나 — 눌렀을 때 아래에 적을 말 */
  function detail(d) {
    const out = [];
    if (isOff.has(d)) out.push({ tag: "휴강", cls: "tag-muted", text: "이 날은 수업하지 않습니다." });
    const eve = eveOf.get(d);
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
    if (isExam.has(d)) {
      out.push({ tag: "시험 기간", cls: "tag-amber", text: "타과목 시험 기간입니다 — 결석이 있을 수 있습니다." });
    }
    const abs = absOf.get(d) || [];
    if (abs.length) {
      out.push({
        tag: abs[0].planned ? "결석 예정" : "결석",
        cls: "tag-red",
        text: abs.map((a) => `${a.name}${a.reason ? ` (${a.reason})` : ""}`).join(", "),
        who: [],
      });
    }
    if (out.length === 0 && isClass.has(d)) {
      out.push({ tag: "수업", cls: "tag-muted", text: "여느 때대로 수업합니다 — 챙길 것 없습니다." });
    }
    return out;
  }

  const shown = openDay ? detail(openDay) : [];

  return (
    <div style={{ marginTop: 8 }}>
      <div className="calgrid">
        {DOW_HEAD.map((h, i) => (
          <div key={h} className={`calhead${i >= 5 ? " calhead-wk" : ""}`}>{h}</div>
        ))}
        {/* 1일이 무슨 요일인지에 맞춰 앞을 비운다 */}
        {Array.from({ length: col(days[0]) }, (_, i) => (
          <div key={`pad${i}`} />
        ))}
        {days.map((d) => {
          const cls = isClass.has(d);
          const offDay = isOff.has(d);
          const eve = eveOf.get(d);
          const abs = absOf.get(d) || [];
          // **여느 때대로 수업하는 날은 아무 표시도 안 한다.**
          //   달력을 보는 까닭은 「무슨 일이 있는 날이 언제인가」 이지
          //   「수업하는 날이 언제인가」 가 아니다. 정상 수업까지 칠해두면
          //   특이사항이 그 안에 묻힌다.
          //   대신 수업이 아예 없는 날은 흐리게 둔다 — 그건 구별돼야 한다.
          // 색은 하나만 — 여러 개면 **더 챙겨야 하는 쪽**을 쓴다
          const mark =
            offDay ? "off"
            : abs.length ? "abs"
            : eve ? "eve"
            : isExam.has(d) ? "exam"
            : cls ? "plain"
            : "none";
          return (
            <button
              key={d}
              type="button"
              className={`calday${mark ? ` calday-${mark}` : ""}${openDay === d ? " calday-on" : ""}`}
              onClick={() => setOpenDay(openDay === d ? null : d)}
            >
              <span className="calnum">{Number(d.slice(8, 10))}</span>
              {/* 이름은 칸 안에 다 못 들어간다. 몇 명인지만 적고 누르면 펼친다 */}
              {abs.length > 0 && <span className="calbadge">{abs.length}</span>}
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

      {openDay && (
        <div className="card card-tight" style={{ marginTop: 8 }}>
          <b style={{ fontSize: 13 }}>
            {Number(openDay.slice(5, 7))}월 {Number(openDay.slice(8, 10))}일 ({DOW_HEAD[col(openDay)]})
          </b>
          {shown.length === 0 ? (
            <p className="muted" style={{ margin: "4px 0 0", fontSize: 13 }}>
              이 날은 이 반 수업이 없습니다.
            </p>
          ) : (
            <div className="stack" style={{ gap: 4, marginTop: 6 }}>
              {shown.map((x, i) => (
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
          )}
        </div>
      )}
    </div>
  );
}
