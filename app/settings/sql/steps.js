"use server";

import fs from "node:fs/promises";
import path from "node:path";

/**
 * 마이그레이션을 **한 개씩** 내어준다.
 *
 * 전체를 한 번에 붙였는데 중간에서 멈추면 어디서 걸렸는지 알 수 없다.
 * (Supabase 는 한 덩어리로 실행하므로 하나라도 실패하면 전부 취소된다)
 * 그래서 막힌 것부터 하나씩 돌려볼 수 있게 나눠서 준다.
 */
export async function loadSteps() {
  const dir = path.join(process.cwd(), "supabase", "migrations");
  let names = [];
  try {
    names = (await fs.readdir(dir)).filter((f) => f.endsWith(".sql")).sort();
  } catch {
    return [];
  }
  const out = [];
  for (const name of names) {
    try {
      const body = await fs.readFile(path.join(dir, name), "utf8");
      out.push({ id: name.slice(0, 4), name, body, lines: body.split("\n").length });
    } catch {
      /* 못 읽는 것은 건너뛴다 */
    }
  }
  return out;
}
