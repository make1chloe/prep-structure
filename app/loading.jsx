/**
 * **눌렀다는 것이 바로 보이게** (원장님, 2026-08-07 —
 * 「전체적으로 다 버튼실행이 조금씩 느려 특히 페이지이동할때」).
 *
 * 화면마다 그 자리에서 DB 를 읽어 만든다. 그래서 메뉴를 누르면 다 읽을
 * 때까지 **옛 화면이 그대로 서 있는다.** 아무 일도 안 일어난 것처럼 보여서
 * 한 번 더 누르시게 되고, 그러면 더 느려진다.
 *
 * 실제로 빨라지는 것은 아니다. 하지만 **누른 것이 먹었다는 것**을 그 자리에서
 * 보여주는 것만으로 체감이 크게 달라진다. 중간에 취소하고 다른 데를 누르셔도
 * 된다는 것도 알게 된다.
 *
 * 이 파일 하나가 자기 loading 이 없는 모든 화면에 쓰인다.
 */
export default function Loading() {
  return (
    <>
      {/**
        * **메뉴 자리를 지킨다** (2026-08-14 — 「메뉴 이동할 때 로딩」).
        * 로딩 화면이 메뉴 없이 뜨면 위가 통째로 사라졌다 나타나서, 빨라져도
        * 덜컹이는 느낌이 남는다. 메뉴 높이(--topbar-h, TopBarHeight 가 재둔
        * 값)만큼 빈자리를 잡아두면 아래 내용만 바뀌는 것처럼 보인다.
        */}
      <div
        style={{
          height: "var(--topbar-h, 96px)",
          borderBottom: "1px solid var(--border)",
          background: "var(--surface)",
        }}
      />
      <main className="wrap-wide">
        <div className="card" style={{ marginTop: 16, padding: 18 }}>
          <p className="hint" style={{ margin: 0 }}>불러오는 중…</p>
        </div>
      </main>
    </>
  );
}
