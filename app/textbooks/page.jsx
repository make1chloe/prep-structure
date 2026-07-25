import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import TopBar from "@/components/TopBar";
import { addTextbook, addUnit, deleteUnit } from "./actions";
import TextbookUpload from "./TextbookUpload";

export const dynamic = "force-dynamic";

const AREAS = ["독해", "듣기", "영작", "문법", "단어", "내신"];
const ACTIVITIES = ["설명", "실전모의고사", "워크북"];

export default async function TextbooksPage({ searchParams }) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let profile = null;
  if (user) {
    const { data } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", user.id)
      .single();
    profile = data;
  }

  const { data: textbooks } = await supabase
    .from("textbooks")
    .select("id, name, area, target_grade, total_pages, price, word_range, created_at")
    .order("created_at", { ascending: false });

  const selectedId = searchParams?.tb || textbooks?.[0]?.id || null;
  const selected = textbooks?.find((t) => t.id === selectedId) || null;

  let units = [];
  if (selectedId) {
    const { data } = await supabase
      .from("textbook_units")
      .select("id, name, sort, activity")
      .eq("textbook_id", selectedId)
      .order("sort", { ascending: true });
    units = data || [];
  }

  return (
    <>
      <TopBar profile={profile} active="textbooks" />
      <main className="wrap">
        <div className="page-head">
          <p className="eyebrow">교재 관리</p>
          <h1 className="h1">교재 · 단원</h1>
          <p className="sub">
            교재를 추가하고, 교재를 선택하면 오른쪽에서 단원(제목·순서)을
            정리할 수 있어요.
          </p>
          <TextbookUpload />
        </div>

        <div className="grid2" style={{ marginTop: 18, alignItems: "start" }}>
          {/* 왼쪽: 교재 추가 + 목록 */}
          <div className="stack" style={{ gap: 14 }}>
            <div className="card">
              <h2 style={{ margin: "0 0 14px", fontSize: 15, fontWeight: 800 }}>
                교재 추가
              </h2>
              <form action={addTextbook} className="stack">
                <div className="field">
                  <label className="label">교재명 *</label>
                  <input className="input" name="name" required placeholder="리딩튜터 입문" />
                </div>
                <div className="row">
                  <div className="field" style={{ flex: 1 }}>
                    <label className="label">영역</label>
                    <select className="input" name="area" defaultValue="">
                      <option value="">선택</option>
                      {AREAS.map((a) => (
                        <option key={a} value={a}>{a}</option>
                      ))}
                    </select>
                  </div>
                  <div className="field" style={{ flex: 1 }}>
                    <label className="label">레벨</label>
                    <input className="input" name="target_grade" placeholder="중2 / 중1-중2" />
                  </div>
                </div>
                <div className="row">
                  <div className="field" style={{ flex: 1 }}>
                    <label className="label">전체 페이지</label>
                    <input className="input" name="total_pages" inputMode="numeric" placeholder="120" />
                  </div>
                  <div className="field" style={{ flex: 1 }}>
                    <label className="label">교재비(원)</label>
                    <input className="input" name="price" inputMode="numeric" placeholder="15000" />
                  </div>
                  <div className="field" style={{ flex: 1 }}>
                    <label className="label">단어범위</label>
                    <input className="input" name="word_range" inputMode="numeric" placeholder="800" />
                  </div>
                </div>
                <div className="field">
                  <label className="label">구매링크</label>
                  <input className="input" name="purchase_url" placeholder="https://..." />
                </div>
                <div className="field">
                  <label className="label">비고</label>
                  <input className="input" name="feature" placeholder="교재 특징 메모" />
                </div>
                <button className="btn btn-primary btn-block" type="submit">
                  저장
                </button>
              </form>
            </div>

            <div className="card" style={{ padding: 0, overflow: "hidden" }}>
              <div style={{ padding: "16px 18px 0" }}>
                <h2 style={{ margin: 0, fontSize: 15, fontWeight: 800 }}>
                  교재 목록{" "}
                  <span className="muted" style={{ fontWeight: 600, fontSize: 13 }}>
                    {textbooks?.length || 0}권
                  </span>
                </h2>
              </div>
              {textbooks && textbooks.length > 0 ? (
                <table className="tbl" style={{ marginTop: 12 }}>
                  <tbody>
                    {textbooks.map((t) => (
                      <tr
                        key={t.id}
                        style={
                          t.id === selectedId
                            ? { background: "var(--surface-2)" }
                            : undefined
                        }
                      >
                        <td>
                          <Link
                            href={`/textbooks?tb=${t.id}`}
                            style={{ fontWeight: 700, textDecoration: "none", color: "inherit" }}
                          >
                            {t.name}
                          </Link>
                          <div className="muted" style={{ fontSize: 12, marginTop: 2 }}>
                            {[t.area, t.target_grade].filter(Boolean).join(" · ") || "—"}
                          </div>
                        </td>
                        <td className="muted" style={{ textAlign: "right", fontSize: 12.5 }}>
                          {t.total_pages ? `${t.total_pages}p` : ""}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <div style={{ padding: 18 }}>
                  <p className="muted" style={{ margin: 0, fontSize: 13.5 }}>
                    아직 교재가 없습니다. 위에서 첫 교재를 추가해보세요.
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* 오른쪽: 선택한 교재의 단원 */}
          <div className="card">
            {selected ? (
              <>
                <h2 style={{ margin: "0 0 4px", fontSize: 15, fontWeight: 800 }}>
                  {selected.name} · 단원
                </h2>
                <p className="muted" style={{ margin: "0 0 14px", fontSize: 12.5 }}>
                  순서를 비우면 맨 뒤에 자동으로 붙어요.
                </p>

                <form action={addUnit} className="row" style={{ alignItems: "flex-end", marginBottom: 16 }}>
                  <input type="hidden" name="textbook_id" value={selected.id} />
                  <div className="field" style={{ width: 70 }}>
                    <label className="label">순서</label>
                    <input className="input" name="sort" inputMode="numeric" placeholder="자동" />
                  </div>
                  <div className="field" style={{ flex: 1 }}>
                    <label className="label">단원명 *</label>
                    <input className="input" name="name" required placeholder="Unit 1. 관계사" />
                  </div>
                  <div className="field" style={{ width: 130 }}>
                    <label className="label">활동</label>
                    <select className="input" name="activity" defaultValue="">
                      <option value="">없음</option>
                      {ACTIVITIES.map((a) => (
                        <option key={a} value={a}>{a}</option>
                      ))}
                    </select>
                  </div>
                  <button className="btn btn-primary" type="submit" style={{ marginBottom: 2 }}>
                    추가
                  </button>
                </form>

                {units.length > 0 ? (
                  <table className="tbl">
                    <thead>
                      <tr>
                        <th style={{ width: 50 }}>순서</th>
                        <th>단원명</th>
                        <th style={{ width: 90 }}>활동</th>
                        <th style={{ width: 40 }}></th>
                      </tr>
                    </thead>
                    <tbody>
                      {units.map((u) => (
                        <tr key={u.id}>
                          <td className="muted">{u.sort}</td>
                          <td style={{ fontWeight: 600 }}>{u.name}</td>
                          <td className="muted">{u.activity || "—"}</td>
                          <td>
                            <form action={deleteUnit}>
                              <input type="hidden" name="id" value={u.id} />
                              <button
                                type="submit"
                                className="btn btn-ghost"
                                style={{ padding: "2px 8px", fontSize: 12 }}
                              >
                                삭제
                              </button>
                            </form>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <p className="muted" style={{ fontSize: 13.5 }}>
                    아직 단원이 없습니다. 위에서 단원을 추가해보세요.
                  </p>
                )}
              </>
            ) : (
              <p className="muted" style={{ fontSize: 13.5 }}>
                왼쪽에서 교재를 선택하면 단원을 정리할 수 있어요.
              </p>
            )}
          </div>
        </div>
      </main>
    </>
  );
}
