"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { saveWordTest, nextRound } from "@/app/progress/actions";
import { TYPES, total, label } from "@/lib/wordTest";

/**
 * 단어시험 방식 — 이 학생이 이 교재를 어떻게 보는지.
 *
 * 네 가지를 합쳐서 100%가 되게 배분한다. 0인 것은 안 보는 것이다.
 * 교재를 시작할 때 한 번 정하고, 다 끝내고 한 번 더 돌릴 때 다시 정한다.
 * 그래서 회독마다 설정이 따로 남는다 — 2회독은 보통 더 어렵게 바꾸기 때문이다.
 */
export default function WordTest({ studentId, book }) {
  const cur = book.wordTest;
  const [open, setOpen] = useState(false);
  const [cfg, setCfg] = useState(() => ({
    mc_meaning: cur?.mc_meaning ?? 0,
    sa_meaning: cur?.sa_meaning ?? 0,
    mc_word: cur?.mc_word ?? 0,
    sa_word: cur?.sa_word ?? 0,
    first_hint: cur?.first_hint ?? false,
    units_per: cur?.units_per ?? "",
  }));
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  const sum = total(cfg);
  const base = label(cur ? { ...cur, round: book.round } : null);
  const text = base && cur?.units_per ? `${base} · ${cur.units_per}단원씩` : base;

  function save() {
    startTransition(async () => {
      const res = await saveWordTest(studentId, book.id, book.round || 1, cfg);
      if (res?.error) {
        alert(res.error);
        return;
      }
      setOpen(false);
      router.refresh();
    });
  }

  if (!open) {
    return (
      <button
        className={`btn btn-ghost btn-sm ${cur ? "" : "btn-warn"}`}
        onClick={() => setOpen(true)}
        title="이 교재를 어떻게 시험 보는지"
        style={{ padding: "2px 8px", fontSize: 12 }}
      >
        {text || `${book.round || 1}회독 · 시험 방식 미설정`}
      </button>
    );
  }

  return (
    <div className="card card-tight" style={{ width: "100%", marginTop: 6 }}>
      <div className="row" style={{ justifyContent: "space-between", alignItems: "baseline" }}>
        <b style={{ fontSize: 14.5 }}>
          {book.name} · {book.round || 1}회독 단어시험 방식
        </b>
        <span className={`tag ${sum === 100 ? "tag-mint" : "tag-amber"}`}>합 {sum}%</span>
      </div>
      <p className="hint" style={{ margin: "4px 0 8px" }}>
        네 가지를 합쳐 100%가 되게 나눠주세요. 안 보는 유형은 0으로 두면 됩니다.
      </p>

      <div className="editgrid">
        {TYPES.map((t) => (
          <div className="field" key={t.key}>
            <label className="label">{t.label}</label>
            <input
              className="input input-sm"
              inputMode="numeric"
              value={cfg[t.key]}
              onChange={(e) =>
                setCfg({ ...cfg, [t.key]: e.target.value.replace(/[^\d]/g, "") })
              }
            />
          </div>
        ))}
      </div>

      <div className="row" style={{ gap: 7, marginTop: 10, alignItems: "center" }}>
        <span style={{ fontSize: 14.5 }}>한 번에</span>
        <input
          className="input input-sm"
          inputMode="numeric"
          style={{ width: 52, textAlign: "center" }}
          value={cfg.units_per}
          onChange={(e) => setCfg({ ...cfg, units_per: e.target.value.replace(/[^\d]/g, "") })}
        />
        <span style={{ fontSize: 14.5 }}>단원씩 외우기</span>
        <span className="hint">비우면 지난번에 낸 개수만큼</span>
      </div>

      {Number(cfg.sa_word) > 0 && (
        <label
          className="row"
          style={{ gap: 7, marginTop: 10, alignItems: "center", cursor: "pointer" }}
        >
          <input
            type="checkbox"
            checked={!!cfg.first_hint}
            onChange={(e) => setCfg({ ...cfg, first_hint: e.target.checked })}
          />
          <span style={{ fontSize: 14.5 }}>
            주관식 영단어에 <b>첫 글자 힌트</b> 주기
          </span>
        </label>
      )}

      <div className="row" style={{ gap: 6, marginTop: 12, justifyContent: "flex-end" }}>
        <button
          className="btn btn-ghost btn-sm"
          disabled={pending}
          title="이 교재를 다 끝내서 처음부터 한 번 더 돕니다. 끝낸 단원이 비워집니다"
          onClick={() => {
            if (
              !confirm(
                `${book.name} 을 ${(book.round || 1) + 1}회독으로 넘길까요?\n` +
                  "끝낸 단원이 비워지고, 새 회독의 시험 방식을 다시 정하게 됩니다."
              )
            )
              return;
            startTransition(async () => {
              const res = await nextRound(studentId, book.id);
              if (res?.error) {
                alert(res.error);
                return;
              }
              setCfg({ mc_meaning: 0, sa_meaning: 0, mc_word: 0, sa_word: 0, first_hint: false, units_per: "" });
              router.refresh();
            });
          }}
        >
          ⟳ 다음 회독으로
        </button>
        <button className="btn btn-ghost btn-sm" onClick={() => setOpen(false)}>
          닫기
        </button>
        <button
          className="btn btn-primary btn-sm"
          onClick={save}
          disabled={pending || sum !== 100}
        >
          저장
        </button>
      </div>
    </div>
  );
}
