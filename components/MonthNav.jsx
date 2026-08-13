"use client";

/**
 * **달을 하나씩, 넘겨 가며 본다** (원장님, 2026-08-09 — 「달력의 세부 내용을
 * 보려면 스크롤을 끝까지 내려서 보고 다시 위로 올라와야 해. 달력을 오늘이
 * 포함된 월부터 한 칸만 보여주고 양옆으로 버튼 눌러 넘겨서 보는 방식으로
 * 바꿔줘. 전체 페이지에 있는 모든 달력들 다 그렇게 바꿔줘」).
 *
 * 달력을 여러 개 쌓아 놓으면 화면이 길어져서, 아래에 있는 것을 보려면
 * 스크롤을 끝까지 내렸다가 다시 올라와야 한다. **보는 것은 늘 한 달**이고,
 * 나머지 달은 넘겨서 본다.
 *
 * 이 조각은 **머리(◂ 8월 ▸)만** 맡는다. 달력 칸을 그리는 방법은 화면마다
 * 다르지만(대시보드는 제목까지, 나이스 원본은 점만), 넘기는 방법은 하나여야
 * 한다 — 세 군데가 저마다 다르게 넘기면 원장님이 화면마다 다시 배우신다.
 *
 * @param month   지금 보고 있는 달 "2026-08"
 * @param onChange(ym)
 * @param home    「이번 달」 로 돌아갈 달 (없으면 그 단추를 안 낸다)
 * @param bounds  넘길 수 있는 범위 { min, max } — 벗어나면 단추가 꺼진다
 * @param children 달 이름 옆에 붙일 것 (몇 건인지 등)
 */
import { addMonths } from "@/lib/day";

export default function MonthNav({ month, onChange, home = "", bounds = null, children = null }) {
  const back = addMonths(month, -1);
  const next = addMonths(month, 1);
  // 있는 것보다 밖으로 나가면 빈 달만 보게 된다 — 그럴 땐 아예 못 누르게
  const canBack = !bounds?.min || back >= bounds.min;
  const canNext = !bounds?.max || next <= bounds.max;

  return (
    <div className="row" style={{ gap: 8, alignItems: "baseline", flexWrap: "wrap" }}>
      <h2 style={{ margin: 0, fontSize: 16, fontWeight: 800 }}>
        {/* **몇 년인지도 적는다** — 학사일정은 3월에 시작해 다음 해 2월에 끝난다.
            넘기다 보면 해가 바뀌는데 「2월」 만 적혀 있으면 어느 해인지 모른다 */}
        {Number(month.slice(0, 4))}년 {Number(month.slice(5, 7))}월
      </h2>
      {children}
      <span className="spacer" />
      <button
        type="button" className="btn btn-ghost btn-sm" disabled={!canBack}
        title={canBack ? `${Number(back.slice(5, 7))}월로` : "앞은 없습니다"}
        onClick={() => onChange(back)}
      >
        ◂
      </button>
      {home && (
        <button
          type="button" className="btn btn-ghost btn-sm"
          disabled={month === home}
          onClick={() => onChange(home)}
        >
          이번 달
        </button>
      )}
      <button
        type="button" className="btn btn-ghost btn-sm" disabled={!canNext}
        title={canNext ? `${Number(next.slice(5, 7))}월로` : "뒤는 없습니다"}
        onClick={() => onChange(next)}
      >
        ▸
      </button>
    </div>
  );
}
