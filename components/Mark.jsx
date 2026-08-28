/**
 * lib/reportMark 이 정한 표시를 **그리기만** 한다.
 *
 * 판단(어떤 아이콘·무슨 말·무슨 색)은 전부 lib/reportMark 에 있다.
 * 여기서 조건을 하나라도 더 쓰면 규칙이 두 벌이 된다 (원칙 1).
 *
 * 아이콘 뒤에 말이 반드시 붙는다 — 아이콘만으로도, 색만으로도 뜻을
 * 나르지 않는다 (노안 규칙 · 화면 규칙 3).
 */
export default function Mark({ mark, style }) {
  if (!mark) return null;
  return (
    <span className={mark.cls} title={mark.title} style={style}>
      <span aria-hidden="true">{mark.icon}</span> {mark.label}
    </span>
  );
}
