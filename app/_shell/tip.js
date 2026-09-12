"use client";
/** ⓘ — 「어떻게 도는지」 설명 한 줄. **접혀 있는 것이 기본**이고 눌러야 펴진다(원장님 2026-09-12 「필요없는 설명좀빼」).
 *  ⚠️ 툴팁(title)이 아니라 접기인 까닭: 원장님은 **폰으로** 쓰신다 — 폰에는 마우스가 없어 툴팁을 못 본다.
 *  이걸 쓰는 것은 **원리·딴 화면 이야기**뿐이다. 「지금 어떤 상태인가」·「없으면 무엇을 하면 되나」는 늘 보이게 둔다(대전제-0). */
import { useState } from "react";
export default function Tip({ children, label = "어떻게 도나" }) {
  const [on, setOn] = useState(false);
  return (<>
    <button className="btn sm gho" type="button" aria-expanded={on} aria-label={label} data-act="tip" onClick={() => setOn(!on)} style={{ padding: "0 6px" }}>ⓘ</button>
    {on && <p className="note k" data-g="tip" style={{ margin: "4px 0 0", flexBasis: "100%" }}>{children}</p>}
  </>);
}
