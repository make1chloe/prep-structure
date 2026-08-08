import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { menuTodos, TODO_LABEL } from "@/lib/menuBadges";
import { ALL_ITEMS, findSection } from "@/lib/menu";

/**
 * **메뉴에 뜬 숫자가 무엇인지, 여기 그대로 적는다.**
 *
 * 원장님 (2026-08-08) — 「지금 알림이 발송과 학생에 있는데 왜 뜬 건지
 * 모르겠어」
 *
 * 배지는 「무언가 남았다」 까지만 말한다. 무엇이 남았는지는 마우스를
 * 올려야 나오는데, 폰에서는 올릴 마우스가 없다. 그러면 배지는 사람을
 * 화면마다 눌러보게 만드는 물건이 된다 — 없느니만 못하다.
 *
 * **같은 셈을 그대로 쓴다** (lib/menuBadges). 대시보드가 따로 세면
 * 언젠가 두 숫자가 달라지고, 그때부터 둘 다 못 믿게 된다. 그래서 여기
 * 적힌 것과 위 메뉴에 뜬 것은 **항상 같다.**
 */
export default async function TodoBar() {
  const todos = await menuTodos(createClient());
  const keys = Object.keys(todos);
  if (keys.length === 0) return null;

  const itemOf = (k) => ALL_ITEMS.find((i) => i.key === k) || null;
  const total = keys.reduce((s, k) => s + todos[k], 0);

  return (
    <div className="card sect sect-warn" style={{ marginTop: 12 }}>
      <div className="row" style={{ gap: 8, alignItems: "baseline", flexWrap: "wrap" }}>
        <b style={{ fontSize: 14 }}>남은 일</b>
        <span className="tag tag-amber">{total}건</span>
        <span className="hint" style={{ fontSize: 11.5 }}>
          위 메뉴에 붙은 숫자가 이것입니다 — 누르면 그 화면으로 갑니다.
        </span>
      </div>
      <div className="row" style={{ gap: 6, marginTop: 8, flexWrap: "wrap" }}>
        {keys.map((k) => {
          const it = itemOf(k);
          if (!it) return null;
          const sec = findSection(it.group);
          return (
            <Link
              key={k}
              href={it.href}
              className="btn btn-sm"
              style={{ borderColor: "var(--amber)" }}
            >
              {/* **어느 메뉴 것인지 같이 적는다** — 배지는 묶음 이름에도
                  붙으므로, 「발송」 에 뜬 숫자가 어느 화면 것인지 여기서
                  이어져야 한다 */}
              <span className="hint" style={{ fontSize: 11 }}>
                {sec?.label ? `${sec.label} · ` : ""}{it.label}
              </span>
              <span style={{ fontSize: 12.5 }}>
                {TODO_LABEL[k]?.(todos[k]) || `${todos[k]}건`}
              </span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
