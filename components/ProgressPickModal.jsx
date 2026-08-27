"use client";

import { Fragment, useMemo, useState } from "react";
import { annotateBigs, groupByParent } from "@/components/unitGroups";

/**
 * **진도 단원 골라 찍기 팝오버** (원장님 2026-08-27 오후 — 「진도는 상세
 * 단원 선택할 때 모달을 활용하는 게 낫지 않나」).
 *
 * 여태 ☑ 골라서는 **판 안에서** 칩을 체크로 바꾸는 모드였다 — 단원이 수십
 * 개인 교재(순서 밖으로 흩어진 완료를 찍을 때)는 가로로 감긴 알약 바다를
 * 판 스크롤로 오르내리며 하나씩 찾아 눌러야 했다. 여기서는 아침에 오늘
 * 수업 ③다음·미리 내기에 들어간 팝오버와 같은 자리(.sheetpop)에 단원이
 * 한 줄씩 세로로 서고, 글자로 거르고, 체크한 것들을 한 번에 찍는다.
 *
 * **UnitPickModal(단원 담기)을 그대로 못 쓰는 이유** (실측):
 * - 그건 「최종 담긴 목록」을 돌려주는 담기 계약이다 — 체크를 빼면 목록에서
 *   빠진다. 진도는 상태(안 함·◐·○)를 **찍는** 것이라, 체크 안 한 단원은
 *   「빼기」가 아니라 「안 건드림」이어야 한다.
 * - 거긴 대단원 행도 제 id 로 담긴다(대단원 통째 숙제 배정). 진도는
 *   소단원(leaf)에만 찍고, 대·중단원은 통째 토글일 뿐이다.
 * - 발단추도 「담기」 하나가 아니라 완료 · 하는 중 · 안 함 세 갈래다.
 * 그래서 같은 관례(.sheetpop · 15개 초과 글자 필터 · unit-bigbar ·
 * 일괄 반영)로 진도용을 둔다.
 *
 * **저장 판단은 여기 없다** — 체크한 id 들과 상태를 onApply 로 돌려줄 뿐,
 * 쓰는 건 BookProgress(markMany → setUnitProgress) 한 곳이다 (원칙 2).
 * 단원 위계도 판과 같은 묶기(unitGroups) 한 벌로 그린다.
 */
export default function ProgressPickModal({
  title = "단원 골라 찍기",
  units = [],            // BookProgress 의 leaf 단원들 (status 포함)
  preset = [],           // 미리 체크하고 열 단원 id (대단원 막대에서 올 때)
  isSkipped = () => false,   // ⛔ 빼는 활동 여부 — 판단은 BookProgress 것
  pending = false,
  onApply,               // (unitIds, status) => void — "done" | "doing" | null
  onClose,
}) {
  const [checked, setChecked] = useState(() => new Set(preset));
  const [q, setQ] = useState("");

  // 판과 같은 묶기 — 필터도 판의 「단원 찾기」와 같은 규칙으로 거른다
  const groups = useMemo(() => annotateBigs(groupByParent(units, q)), [units, q]);

  function toggle(id) {
    setChecked((s) => {
      const n = new Set(s);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  }

  function toggleMany(ids) {
    setChecked((s) => {
      const n = new Set(s);
      const all = ids.every((x) => n.has(x));
      ids.forEach((x) => (all ? n.delete(x) : n.add(x)));
      return n;
    });
  }

  function apply(status) {
    // 단원 순서대로 — 찍는 순서가 화면 순서와 어긋나지 않게
    const ids = units.filter((u) => checked.has(u.id)).map((u) => u.id);
    if (ids.length === 0) return;
    onApply(ids, status);
    onClose();
  }

  const nPicked = units.filter((u) => checked.has(u.id)).length;

  return (
    <div className="sheetpop card" role="dialog" aria-label="단원 골라 찍기">
      <div className="row" style={{ justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
        <b style={{ fontSize: 15 }}>{title}</b>
        <button className="btn btn-ghost btn-sm" onClick={onClose}>닫기</button>
      </div>
      {/* 글자 필터 — 단원 수십 개짜리 교재에서만 의미가 있어 그때만 보인다 */}
      {units.length > 15 && (
        <input
          className="input input-sm"
          style={{ width: "100%", marginBottom: 6 }}
          placeholder="단원 이름으로 거르기"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      )}
      {units.length === 0 ? (
        <p className="hint" style={{ margin: 0 }}>
          이 교재에 단원이 없어요 — 교재 › 교재·단원 에서 올려주세요.
        </p>
      ) : (
        <div className="stack" style={{ gap: 0 }}>
          {groups.length === 0 && (
            <p className="hint" style={{ margin: 0 }}>「{q.trim()}」 에 맞는 단원이 없어요.</p>
          )}
          {groups.map(({ head, list, mid, big, bigStart, bigIds }) => (
            <Fragment key={head || "_"}>
              {/* 대단원 막대 — 진도 판과 같은 얼굴, 누르면 통째 토글 */}
              {bigStart && (
                <button
                  className="unit-bigbar"
                  title="이 대단원의 단원 전체를 체크하거나 뺍니다"
                  onClick={() => toggleMany(bigIds)}
                >
                  {bigIds.every((x) => checked.has(x)) ? "☑" : "☐"} {big}
                </button>
              )}
              {mid && (
                <button
                  className="tag tag-sky"
                  style={{ alignSelf: "flex-start", margin: "4px 0 0 14px", cursor: "pointer", border: 0, fontFamily: "inherit" }}
                  title="이 중단원의 단원 전체를 체크하거나 뺍니다"
                  onClick={() => toggleMany(list.map((u) => u.id))}
                >
                  {list.every((u) => checked.has(u.id)) ? "☑" : "☐"} {mid}
                </button>
              )}
              {list.map((u) => {
                const tail = [
                  u.activity,
                  u.amount && `분량 ${u.amount}`,
                  u.page_start
                    ? `p${u.page_start}${u.page_end && u.page_end !== u.page_start ? `~${u.page_end}` : ""}`
                    : null,
                  isSkipped(u) && "⛔ 빠짐",
                ].filter(Boolean).join(" · ");
                return (
                  <label
                    key={u.id}
                    className="row"
                    style={{
                      gap: 8, alignItems: "center", padding: "4px 0",
                      paddingLeft: head ? (mid ? 28 : 14) : 0, cursor: "pointer",
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={checked.has(u.id)}
                      onChange={() => toggle(u.id)}
                    />
                    <span style={{ fontSize: 13.5 }}>
                      {/* 지금 상태를 같이 보여준다 — ○·◐ 를 보며 골라야
                          이미 찍힌 것을 헛짚지 않는다 */}
                      {u.status === "done" ? "○ " : u.status === "doing" ? "◐ " : ""}
                      {u.name}
                      {tail && <span className="hint"> — {tail}</span>}
                    </span>
                  </label>
                );
              })}
            </Fragment>
          ))}
        </div>
      )}
      <div className="row" style={{ gap: 6, marginTop: 8, alignItems: "center", justifyContent: "flex-end" }}>
        <b style={{ fontSize: 13.5 }}>{nPicked}개 골랐어요</b>
        <button className="btn btn-primary btn-sm" disabled={pending || nPicked === 0} onClick={() => apply("done")}>
          ○ 완료로
        </button>
        <button className="btn btn-sm" disabled={pending || nPicked === 0} onClick={() => apply("doing")}>
          ◐ 하는 중으로
        </button>
        <button className="btn btn-ghost btn-sm" disabled={pending || nPicked === 0} onClick={() => apply(null)}>
          안 함으로
        </button>
      </div>
    </div>
  );
}
