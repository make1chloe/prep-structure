import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import TopBar from "@/components/TopBar";
import { findSection } from "@/lib/menu";

export const dynamic = "force-dynamic";

/**
 * 묶음 하나를 펼친 화면.
 *
 * 위에는 큰 이름 다섯 개만 두고, 들어오면 여기서 고른다.
 * 큼직한 카드로 두는 것은 폰에서 손가락으로 누르기 위해서다.
 */
export default async function MenuSection({ params }) {
  const section = findSection(params.section);
  if (!section || section.items.length === 0) notFound();

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  let profile = null;
  if (user) {
    const { data } = await supabase.from("profiles").select("*").eq("id", user.id).single();
    profile = data;
  }

  return (
    <>
      <TopBar profile={profile} active={section.key} />
      <main className="wrap">
        <div className="page-head">
          <p className="eyebrow">메뉴</p>
          <h1 className="h1">{section.label}</h1>
        </div>
        <div className="menugrid">
          {section.items.map((it) => (
            <Link key={it.key} href={it.href} className="menucard">
              <b>{it.label}</b>
              {it.desc && <span>{it.desc}</span>}
            </Link>
          ))}
        </div>
      </main>
    </>
  );
}
