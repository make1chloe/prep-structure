"use client";

import { useState } from "react";
import StudyList from "./StudyList";

/**
 * 학생 화면은 두 상태를 **번갈아** 오간다.
 *
 *   등원 중 — 지금 학원에서 뭘 할지
 *   하원 후 — 집에서 뭘 해올지
 *
 * 한 화면에 둘 다 쌓아두면 지금 봐야 할 것이 아래로 밀린다.
 * 그래서 탭으로 나누고, **지금 상황에 맞는 쪽을 앱이 먼저 펴준다.**
 *   · 오늘 학원에서 할 것이 남아 있으면  → 등원 중
 *   · 다 끝냈거나 오늘 수업이 없으면      → 하원 후
 *
 * 물론 학생이 직접 눌러 왔다갔다 할 수 있다. 반대쪽에 남은 개수를 같이 띄운다.
 */
export default function StudyTabs({
  inClass = [],
  home = [],
  running = null,
  ready = true,
  readOnly = false,
  asId = null,
  subs = {},
  atClass = false,
  stayLeft = 0,
}) {
  const inClassLeft = inClass.filter((t) => !t.doneAt).length;
  const homeLeft = home.filter((t) => !t.doneAt).length;

  // **지금 학원에 있으면 등원 중 할 일부터** 펼친다.
  //   예전에는 "학원에서 할 게 남았으면" 만 봤다. 그래서 선생님이 아직 등원
  //   학습을 안 올렸으면, 등원해서 앉자마자 집 숙제가 펼쳐졌다.
  //   아이는 그걸 보고 학원에서 집 숙제를 하고 앉아 있는다.
  const [tab, setTab] = useState(atClass || inClassLeft > 0 ? "inclass" : "home");

  // 남아서 채우고 갈 것이 있으면 아직 학원이다. 집 숙제를 붙잡고 있으면
  // 정작 남아서 해야 할 것을 안 한다.
  const stayNotice =
    stayLeft > 0 ? `남아서 채우고 갈 것이 ${stayLeft}개 있어요. 그것부터 끝내고 가야 해요.` : "";

  if (inClass.length === 0 && home.length === 0) {
    return (
      <div className="card">
        <h2 style={{ margin: "0 0 6px", fontSize: 16, fontWeight: 800 }}>할 것</h2>
        <p className="hint" style={{ margin: 0 }}>오늘은 올라온 것이 없어요.</p>
      </div>
    );
  }

  const tabs = [
    ["inclass", "등원 중 할 일", inClassLeft, inClass.length],
    ["home", "하원 후 숙제", homeLeft, home.length],
  ];

  return (
    <div className="stack" style={{ gap: 10 }}>
      {stayNotice && (
        <div className="card card-tight" style={{ borderLeft: "3px solid var(--amber, #e0a33e)" }}>
          <b style={{ fontSize: 13.5 }}>{stayNotice}</b>
        </div>
      )}

      <div className="row" style={{ gap: 6 }}>
        {tabs.map(([k, label, left, total]) => (
          <button
            key={k}
            className={`btn btn-sm ${tab === k ? "btn-primary" : "btn-ghost"}`}
            style={{ flex: 1 }}
            onClick={() => setTab(k)}
          >
            {label}
            {total > 0 && (
              <span style={{ marginLeft: 6, opacity: 0.85 }}>
                {left > 0 ? `${left}개 남음` : "다 함 ✓"}
              </span>
            )}
          </button>
        ))}
      </div>

      {tab === "inclass" &&
        (inClass.length === 0 ? (
          <div className="card">
            <p className="hint" style={{ margin: 0 }}>
              오늘 학원에서 할 것이 아직 안 올라왔어요.{" "}
              {atClass ? "선생님이 정해주실 때까지 기다려주세요." : ""}
            </p>
            {atClass && homeLeft > 0 && (
              <p className="hint" style={{ margin: "6px 0 0", fontSize: 12 }}>
                집에서 할 숙제는 <b>하원 후 숙제</b>에 있어요. 지금은 학원이니까
                선생님께 먼저 여쭤보세요.
              </p>
            )}
          </div>
        ) : (
          <>
            <StudyList
              title="등원 중 할 일"
              hint="위에서부터 하나씩 하면 돼요. 다 하면 학습 완료를 누르고, 선생님이 부르시면 가져가세요."
              tasks={inClass}
              running={running}
              ready={ready}
              kind="inclass"
              readOnly={readOnly}
              asId={asId}
              subs={subs}
            />
            {inClassLeft === 0 && homeLeft > 0 && (
              <div className="card card-tight">
                <p className="hint" style={{ margin: 0 }}>
                  학원에서 할 것은 다 했어요. 집에 가서 할 숙제가{" "}
                  <b>{homeLeft}개</b> 있어요.{" "}
                  <button
                    className="btn btn-ghost btn-sm"
                    style={{ padding: "2px 8px" }}
                    onClick={() => setTab("home")}
                  >
                    보러 가기
                  </button>
                </p>
              </div>
            )}
          </>
        ))}

      {tab === "home" &&
        (home.length === 0 ? (
          <div className="card">
            <p className="hint" style={{ margin: 0 }}>지금은 집에서 할 숙제가 없어요.</p>
          </div>
        ) : (
          <StudyList
            title="하원 후 숙제"
            hint="집에서 할 때도 시작을 눌러주세요. 얼마나 걸렸는지 볼 수 있어요."
            tasks={home}
            running={running}
            ready={ready}
            kind="home"
            readOnly={readOnly}
            asId={asId}
            subs={subs}
          />
        ))}
    </div>
  );
}
