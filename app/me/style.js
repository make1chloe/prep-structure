/**
 * 학생 화면에만 붙는 스타일.
 *
 * ⚠️ **새 색·새 글씨 크기를 만들지 않는다.** 값은 전부 `app/globals.css` 의 토큰이다
 *    (`var(--…)`). 여기에 `#` 으로 시작하는 색이나 맨 숫자 px 글씨 크기가 한 줄이라도 생기면
 *    그날부터 배색 다섯 벌 중 어딘가에서 **흰 바탕에 흰 글씨**가 난다.
 *    `scripts/check-screen-me.mjs` 가 이 파일을 훑어 그것을 잡는다.
 *
 * ⚠️ 클래스 이름은 전부 `me-` 로 시작한다. `app/globals.css` 의 이름 대장은 남의 담당이라
 *    거기에 이름을 더할 수 없어서, **겹칠 수 없는 앞가지**로 가른다.
 *    한 낱말 상태 이름(`.open`·`.on`·`.sel`)은 안 쓴다 — 이 저장소에서 세 번 터진 자리다.
 *    상태는 `is-` 를 붙이되 **반드시 `me-` 클래스와 함께** 쓴다(`.me-unit.is-wait`).
 *
 * ⚠️ 늘어나는 칸에는 **basis 를 준다**(`flex:1 1 …`). 맨 `flex:1` 은 390px 에서 26px 로 눌린다.
 * ⚠️ 입력칸 글씨는 여기서 안 건드린다 — globals 의 `(pointer:coarse)` 규칙이 16px 로 올린다.
 *    여기서 font-size 를 걸면 그 규칙을 이겨 **아이폰이 화면을 확대하고 안 돌아온다.**
 */
export const css = `
/* ── 머리 ─────────────────────────────────────────────── */
.me-head{display:flex;flex-wrap:wrap;gap:var(--s2);align-items:baseline;margin:0 0 var(--s4)}
.me-head h1{margin:0}
.me-when{color:var(--mid);font-size:var(--fs5)}

/* 「무엇이 없어서 비었나」 — ⚠️ 흐리게 하지 않는다. 색으로 말한다 */
.me-why{margin:0 0 var(--s4);padding:var(--s3);border-radius:var(--r2);
  background:var(--warn-bg);color:var(--warn-fg);font-size:var(--fs3)}
.me-why ul{margin:var(--s2) 0 0;padding-left:var(--s5)}
.me-why li{margin:var(--s1) 0}
.me-block{padding:var(--s4);border-radius:var(--r2);background:var(--bad-bg);color:var(--bad-fg)}

/* ── 카드 틀 ──────────────────────────────────────────── */
.me-cards{display:flex;flex-direction:column;gap:var(--s4)}
.me-cardhd{display:flex;flex-wrap:wrap;gap:var(--s2);align-items:center;margin-bottom:var(--s3)}
.me-ttl{flex:1 1 150px;font-size:var(--fs7);font-weight:700}
.me-ttl2{font-size:var(--fs6)}
.me-tool{display:flex;flex-wrap:wrap;gap:var(--s1);align-items:center;margin-bottom:var(--s2)}
.me-right{justify-content:flex-end}
.me-mt{margin-top:var(--s2)}
.me-mt4{margin-top:var(--s4)}
.me-group{margin-top:var(--s4)}
/* 작은 네모 단추 — 손가락 규칙(44px)을 스스로 지킨다 */
.me-sq{display:inline-flex;align-items:center;justify-content:center;
  min-width:var(--tap);min-height:var(--tap);padding:0 var(--s2);
  border:1px solid var(--line);border-radius:var(--r2);
  background:var(--surface);color:var(--fg);font-family:inherit;font-size:var(--fs5);cursor:pointer}
.me-sq:disabled{background:var(--off-bg);color:var(--off-fg);cursor:default}
.me-sq:focus-visible{outline:2px solid var(--accent);outline-offset:2px}
/* 끌기 손잡이 — 폰에서 끌기는 자주 실패해서 ▲▼ 를 **같이** 둔다 */
.me-grip{cursor:grab;touch-action:auto}
.me-card.is-drag{opacity:.55}

/* ── 오늘 할 것 ───────────────────────────────────────── */
.me-list{display:flex;flex-direction:column;gap:var(--s2);margin:0;padding:0;list-style:none}
.me-item{display:flex;flex-wrap:wrap;gap:var(--s2);align-items:flex-start;
  padding:var(--s3);border:1px solid var(--line);border-radius:var(--r2);background:var(--surface)}
/* 아직 차례가 아닌 줄 — ⚠️ 투명도가 아니라 **가라앉은 배경**으로 말한다 */
.me-item.is-later{background:var(--sunk);border-style:dashed}
.me-item.is-done{background:var(--ok-bg);border-color:var(--ok)}
.me-seq{flex:0 0 auto;display:inline-flex;align-items:center;justify-content:center;
  min-width:var(--s5);height:var(--s5);border-radius:999px;
  background:var(--sunk);color:var(--mid);font-size:var(--fs2);font-weight:700}
.me-body{flex:1 1 170px;display:flex;flex-direction:column;gap:var(--s1)}
.me-name{font-size:var(--fs5);font-weight:600}
.me-sub{color:var(--mid);font-size:var(--fs2)}
.me-act{flex:0 0 auto;display:flex;gap:var(--s1);align-items:center}

/* 접기 — 끝낸 것은 아래로. ⚠️ 접혀도 **분자에는 그대로 든다** */
.me-fold{margin-top:var(--s3);border-top:1px solid var(--line);padding-top:var(--s3)}
.me-fold summary{cursor:pointer;min-height:var(--tap);display:flex;align-items:center;
  gap:var(--s2);color:var(--mid);font-size:var(--fs3)}

/* ── 교재 로드맵 ──────────────────────────────────────── */
.me-book{border:1px solid var(--line);border-radius:var(--r2);background:var(--surface);padding:var(--s3)}
.me-book + .me-book{margin-top:var(--s3)}
.me-bar{height:var(--s2);border-radius:999px;background:var(--sunk);overflow:hidden;margin:var(--s2) 0}
.me-bar span{display:block;height:100%;background:var(--ok)}
.me-chap{border:1px solid var(--line);border-radius:var(--r1);margin-top:var(--s2);background:var(--surface)}
.me-chap.is-open{border-color:var(--accent)}
.me-chaphd{display:flex;flex-wrap:wrap;gap:var(--s2);align-items:center;width:100%;
  min-height:var(--tap);padding:var(--s2) var(--s3);border:0;border-radius:var(--r1);
  background:transparent;color:var(--fg);font-family:inherit;font-size:var(--fs4);
  font-weight:600;text-align:left;cursor:pointer}
.me-chapnm{flex:1 1 140px}
.me-chapbd{padding:var(--s2) var(--s3) var(--s3);border-top:1px solid var(--line)}

/* 소단원 한 줄 — ⚠️ 「쌤/내가」가 줄마다 붙는다(표 4-8) */
.me-unit{display:flex;flex-wrap:wrap;gap:var(--s2);align-items:center;
  padding:var(--s2);border:1px solid var(--line);border-radius:var(--r1);background:var(--surface)}
.me-unit + .me-unit{margin-top:var(--s1)}
/* ⭐ 아이가 찍은 줄 = **확인 기다리는 중** (절 ㊶ ②). 노란 테두리 */
.me-unit.is-wait{border:2px solid var(--warn);background:var(--warn-bg);color:var(--warn-fg)}
.me-unit.is-locked{background:var(--sunk)}
.me-mark{display:flex;gap:var(--s1)}
.me-mk{min-width:var(--tap);min-height:var(--tap);border:1px solid var(--line);border-radius:var(--r1);
  background:var(--surface);color:var(--fg);font-family:inherit;font-size:var(--fs6);cursor:pointer}
.me-mk.is-sel{border-color:var(--accent);color:var(--accent);font-weight:700}
.me-mk:disabled{background:var(--off-bg);color:var(--off-fg);cursor:default}

/* ❗ 이의 — 그 자리에서 펼친다(덮개 판을 안 띄운다) */
.me-flag{margin-top:var(--s2);padding:var(--s3);border:1px solid var(--line);
  border-radius:var(--r2);background:var(--sunk)}
/* ⚠️ 라디오는 폭을 100% 로 늘리면 안 된다 — globals 가 이미 빼 두었다(not[type=radio]).
 *    여기서 다시 크기를 걸지 않는다. 줄 높이만 손가락 규칙(44px)에 맞춘다 */
.me-radio{display:flex;gap:var(--s2);align-items:center;min-height:var(--tap);font-size:var(--fs3)}
.me-flag textarea{min-height:calc(var(--tap) * 2)}

/* ── 달력 ─────────────────────────────────────────────── */
.me-calhd{display:flex;flex-wrap:wrap;gap:var(--s2);align-items:center;margin-bottom:var(--s2)}
.me-calnm{flex:1 1 120px;font-size:var(--fs6);font-weight:700;text-align:center}
.me-dow{display:grid;grid-template-columns:repeat(7,minmax(92px,1fr));gap:1px;
  min-width:calc(92px * 7 + 1px * 6);color:var(--mid);font-size:var(--fs2)}
.me-dow span{padding:var(--s1) var(--s2)}
.me-dnum{font-weight:700}
.me-dot{display:block;margin-top:2px;font-size:var(--fs1)}
.me-cell-none{background:var(--sunk)}

/* ── 알림 줄 (실패했을 때 그 단추만 되돌리고 알린다) ──── */
.me-toast{margin:var(--s3) 0;padding:var(--s3);border-radius:var(--r2);
  background:var(--bad-bg);color:var(--bad-fg);font-size:var(--fs3)}

@media (max-width:700px){
  .me-ttl{flex:1 1 120px;font-size:var(--fs6)}
  .me-body{flex:1 1 140px}
}
`;
