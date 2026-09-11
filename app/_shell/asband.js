/** 👁 「지금 누구 화면을 보는 중」 띠 — 아이 07·학부모 09 와 그 아래 넷이 같은 것을 쓴다(원칙-1 · 판단은 lib/asview.js).
 *  화면이 스스로 말한다(대전제-0) — 원장님이 「내가 지금 아이 것을 보고 있구나 · 여기선 아무것도 못 누르는구나」를 읽고 아신다. */
import Link from "next/link";
export default function AsBand({ name, kind = "me" }) {
  return (
    <div className="lf warn" data-g="as-view" style={{ marginBottom: 10 }}>
      <span className="ln">👁</span>
      <div>
        <b>{name} {kind === "parent" ? "학부모님" : "아이"}가 보는 화면입니다</b>
        <small>원장님은 <b>읽기만</b> 하십니다 — 여기서 누른 것은 저장되지 않습니다(아이·학부모 계정으로만 됩니다).</small>
      </div>
      <span className="spacer" />
      <Link prefetch={false} className="btn sm gho" href="/ops/students" data-act="as-exit">← 재원생</Link>
    </div>
  );
}
