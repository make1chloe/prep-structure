/**
 * 원장님이 적어두신 안내 한 덩이 (0093).
 *
 * **안 적으셨으면 아무것도 안 그린다.** 할 말이 없는데 자리만 만들어 두면
 * 빈 상자가 눈에 걸리고, 그 화면이 어수선해진다.
 *
 * 원래 문구를 대신하는 자리에서는 `fallback` 을 넘긴다 — 그러면 안 적으신
 * 동안에는 지금까지 나오던 말이 그대로 나온다. 빈 화면이 되면 안 된다.
 */
export default function ScreenNote({ text, tone = "hint", style = {} }) {
  const body = (text || "").trim();
  if (!body) return null;

  // hint  옅은 한 줄 — 제목 밑에 붙는 설명
  // card  네모 한 칸 — 화면 맨 위의 인사말처럼 **읽히라고** 두는 것
  if (tone === "card") {
    return (
      <div className="card card-tight" style={{ ...style }}>
        <p style={{ margin: 0, fontSize: 13.5, lineHeight: 1.75, whiteSpace: "pre-wrap" }}>
          {body}
        </p>
      </div>
    );
  }
  return (
    <p className="hint" style={{ margin: "0 0 8px", lineHeight: 1.7, whiteSpace: "pre-wrap", ...style }}>
      {body}
    </p>
  );
}
