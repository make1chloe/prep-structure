/**
 * **자료함 — 자료를 주고받는 한 곳** (계획 절 ㊸)
 *
 *   학부모·학생 → 원장   학교가 준 종이(수행평가 안내·학사일정·가정통신문)를 찍어 올린다
 *   원장 → 아이          오늘 숙제 줄과 공지에 붙인다
 *
 * 표 셋은 **이미 있다** — `v2.file`(파일 한 개) · `v2.file_bin`(자료함 묶음) ·
 * `v2.file_link`(파일이 붙은 자리). 이 파일은 **판단만** 한다. 화면은 받아서 그리기만 한다.
 *
 * ⚠️ **이 파일이 막는 사고**
 *  ① **실행되는 파일** — 아이 폰에서 아무거나 올라오면 원장님이 그걸 연다.
 *     확장자 흰 목록을 지나야만 받는다. 검은 목록만 두면 `.msc`·`.scpt` 같은 것이 새어 들어온다.
 *  ② **30장 넘게 온 것을 조용히 자르는 것** — 아이는 다 올린 줄 알고, 원장님은 다 받은 줄 안다.
 *     **아무도 오류를 못 본다.** → 한 장도 안 올리고 「나눠 올려주세요」라고 말한다.
 *  ③ **형제** — 안 물으면 형 학교 자료가 동생 칸에 들어가고, 그대로 굳는다.
 *  ④ **공지를 보낸 뒤에 붙이는 것** — **먼저 본 집은 그 붙임을 못 본다.** 오류가 안 난다.
 *  ⑤ **겹치는 것을 막는 것** — 사진 화질이 다르다(원장님 9/2). 막으면 **먼저 온 흐린 것만 남는다.**
 *     → 막지 않는다. **알리기만 한다.**
 *  ⑥ **pdf 를 줄이는 것** — 글자가 뭉개져 학사일정을 못 읽는다. **사진만** 줄인다.
 *
 * ⚠️ **Storage 버킷·정책은 `v2` 밖이다**(계획 0단계 9번). 이 파일은 **경로 문자열만** 만든다.
 *    버킷을 만들고 정책을 거는 SQL 을 공사 중에 돌리면 **구앱의 숙제 사진이 그날 저녁부터
 *    안 올라간다.** → 그 SQL 은 「전환일 적용 파일」로 따로 둔다. 마이그레이션에 넣지 않는다.
 *
 * db 는 `{ query(sql, params) -> { rows, rowCount } }` 짜리 얕은 어댑터다 (검사가 가짜를 끼운다).
 * SQL 에 `${…}` 를 끼우지 않는다 — 값은 전부 $1·$2 다.
 */

import { ymd } from "./session.js";

// ── 날짜 — **여기서 새로 짓지 않는다** ───────────────────────────────────

/** 'YYYY-MM-DD' 인가 */
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * 무엇이 오든 'YYYY-MM-DD' 로. 못 읽으면 **null**.
 *
 * ⚠️ **이 레포에서 늘 나는 사고다.** 「학원의 오늘」인 `v2.today()` 는 node-postgres 를
 *    지나면 **JS `Date` 객체**로 온다. 그대로 `String(x).split('-')` 하면
 *    `pathFor` 가 `up/Wed Sep/…` 를 짓고, `termOf` 는 학기를 못 읽고,
 *    `addMonths` 는 **`RangeError: Invalid time value` 로 그 화면을 죽인다.**
 * ⚠️ 씻는 판단을 **여기서 새로 만들지 않는다** — `lib/session.js` 의 `ymd()` 한 벌을 쓴다(원칙 1).
 *    `ymd()` 는 `toISOString()` 을 안 써서 서울 자정이 하루 앞으로 밀리지 않는다.
 * ⚠️ 씻어도 'YYYY-MM-DD' 가 아니면 **지어내지 않고 null** 이다 (대전제 0).
 */
export function dayOf(v) {
  const s = ymd(v);
  return typeof s === "string" && DAY_RE.test(s) ? s : null;
}

// ── 정해진 값 ────────────────────────────────────────────────────────────

/** 한 번에 올릴 수 있는 장수. 원장→아이 붙임도 같은 값이다 (원장님 「둘 다 30장까지」) */
export const MAX_FILES = 30;

/** 사진 긴 변. ⚠️ 폰 사진 30장 원본은 150MB 가 넘는다 — 줄이지 않으면 올리다 끊긴다 */
export const MAX_EDGE = 1600;

/**
 * 자료함 갈래.
 * ⚠️ **`v2.file_bin.kind` 의 CHECK 와 글자까지 같아야 한다.** 하나라도 다르면
 *    화면에서 고른 갈래가 **INSERT 하는 그 순간** 터진다. 검사가 진짜 CHECK 를 읽어 맞춰 본다.
 */
export const BIN_KINDS = ["수행평가", "시험 안내", "수업자료", "학사일정", "가정통신문", "그 밖"];

/** 아이가 붙임에 누르는 것 — 💾 저장 · ✓ 안 보기 (`v2.file_link.seen_by_child`) */
export const SEEN = ["saved", "skip"];

/** 원장님이 아이에게 보낸 것은 **1달** 뒤 파기. 원장님 자료함은 **계속** (원장님 9/2 확정) */
export const CHILD_KEEP_MONTHS = 1;

// ── ① 받을까 말까 ────────────────────────────────────────────────────────

/**
 * **흰 목록** — 이 확장자만 받는다.
 * ⚠️ 검은 목록으로 하면 안 된다. 실행되는 확장자는 계속 늘어나고(`.msc`·`.scpt`·`.wsf`…),
 *    하나 빠뜨리면 그것만 조용히 통과한다. **모르는 것은 안 받는 쪽**이 맞다.
 * ⚠️ `html`·`svg` 는 **그림처럼 보이지만 스크립트가 산다.** 흰 목록에 넣지 않는다.
 */
export const OK_EXT = new Set([
  "jpg", "jpeg", "png", "heic", "heif", "webp", "gif", "bmp", "tif", "tiff",
  "pdf", "hwp", "hwpx", "doc", "docx", "xls", "xlsx", "ppt", "pptx", "txt", "csv",
]);

/** 줄이는 것 — 사진만. ⚠️ pdf·문서는 안 줄인다 (글자가 뭉개진다) */
export const IMG_EXT = new Set(["jpg", "jpeg", "png", "heic", "heif", "webp", "gif", "bmp", "tif", "tiff"]);

/**
 * 흰 목록에 없는 것 중 **특히 실행되는 것** — 말을 다르게 하려고만 쓴다.
 * (「안 받는 확장자입니다」보다 「실행되는 파일은 안 받습니다」가 아이에게 뜻이 통한다)
 */
export const RUN_EXT = new Set([
  "exe", "com", "bat", "cmd", "msi", "msc", "scr", "pif", "cpl", "hta", "reg", "lnk", "url",
  "jar", "js", "mjs", "vbs", "vbe", "wsf", "wsh", "ps1", "psm1", "sh", "bash", "zsh", "command",
  "scpt", "app", "dmg", "pkg", "apk", "deb", "rpm", "dll", "so", "dylib", "jse", "py", "rb", "pl", "php",
  "html", "htm", "svg", "xhtml", "shtml",
]);

/** 압축 — 안을 볼 수가 없다. 실행되는 것이 들어 있어도 모른다 */
export const ZIP_EXT = new Set(["zip", "rar", "7z", "tar", "gz", "tgz", "bz2", "xz", "alz", "egg"]);

/**
 * 이름 씻기 — 눈에 안 보이는 글자를 뺀다.
 * ⚠️ **오른쪽에서 왼쪽으로 쓰기(U+202E)** 를 끼우면 `사진gpj.exe` 가 `사진exe.jpg` 로 **보인다.**
 *    보이는 대로 믿으면 실행 파일을 사진으로 받는다.
 * ⚠️ 윈도는 이름 끝의 점·공백을 버린다 — `x.exe.` 는 실제로 `x.exe` 다.
 * ⚠️ **맥·아이폰은 한글 이름을 자모로 분해(NFD)해서 준다.** 윈도·안드로이드는 합친 꼴(NFC)이다.
 *    눈에는 똑같은 「수행평가 안내.pdf」가 **다른 글자열**이라(11자 대 20자), 안 씻으면
 *    `alreadyThere` 의 「같은 이름이 이미 있습니다」가 **통째로 안 뜬다** —
 *    아이폰으로 올린 집과 윈도로 올린 집이 섞이면 원장님은 같은 종이를 두 번 받고도 모른다.
 */
export function cleanName(name = "") {
  return String(name)
    .normalize("NFC")
    .replace(/[\u200B-\u200F\u202A-\u202E\u2066-\u2069\uFEFF\u0000]/g, "")
    .replace(/[\s.]+$/, "")
    .trim();
}

/** 이름의 **모든** 확장자 마디 — `사진.pdf.exe` → ["pdf","exe"] */
export function allExts(name = "") {
  const base = cleanName(name).split(/[/\\]/).pop();
  const parts = base.split(".");
  return parts.slice(1).map((x) => x.toLowerCase()).filter(Boolean);
}

/** 마지막 확장자 하나 (없으면 "") */
export function extOf(name = "") {
  const e = allExts(name);
  return e.length ? e[e.length - 1] : "";
}

/** 사진인가 — 줄일지 정하는 값이다 */
export const isImage = (name) => IMG_EXT.has(extOf(name));

/**
 * **확장자 → mime 한 벌.** 올리는 쪽이 이 값을 `contentType` 으로 **박아서** 보낸다.
 *
 * ⚠️ **폰이 적어 보내는 `File.type` 을 그대로 쓰면 안 된다.**
 *    브라우저에는 `.hwp`·`.hwpx` mime 이 아예 없어 `File.type` 이 빈 글자고,
 *    그때 supabase-js 는 대신 `text/plain;charset=UTF-8` 을 보낸다.
 *    카카오톡·파일앱에서 넘어온 **진짜 사진**도 `application/octet-stream` 을 달고 온다.
 * ⚠️ 그래서 **받을까 말까는 확장자로만** 정하고(`refuseReason`), mime 은 여기서 **우리가 정한다.**
 *    버킷 `allowed_mime_types` 로 한 번 더 거르면 **같은 판단이 두 벌**이 되고(원칙 1),
 *    축이 달라(확장자 대 mime) **어떤 목록을 맞춰도 어긋난다** — 앱은 「받았습니다」라고
 *    말한 뒤 Storage 가 400 으로 거절하고, 아무 오류도 화면에 안 뜬다.
 *    → 버킷은 mime 을 **안 건다**(needsDb). 판단은 이 파일 한 곳이다.
 * ⚠️ 한글 파일 mime 은 표준이 없다 — 여기 값은 **우리가 고른 값**이고, 저장된 `v2.file.mime`
 *    과 버킷 개체가 같은 글자를 갖게 하려는 것뿐이다.
 */
export const MIME_FOR = {
  jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", heic: "image/heic",
  heif: "image/heif", webp: "image/webp", gif: "image/gif", bmp: "image/bmp",
  tif: "image/tiff", tiff: "image/tiff",
  pdf: "application/pdf",
  hwp: "application/x-hwp", hwpx: "application/hwp+zip",
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xls: "application/vnd.ms-excel",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ppt: "application/vnd.ms-powerpoint",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  txt: "text/plain", csv: "text/csv",
};

/** 올릴 때 박아 보낼 mime. 흰 목록을 지난 뒤에만 부른다 */
export function contentTypeFor(name) {
  return MIME_FOR[extOf(name)] ?? "application/octet-stream";
}

/**
 * 이 파일 하나를 받을까. **받으면 `null`**, 안 받으면 까닭 하나를 돌려준다.
 * @param f { name, mime, bytes }
 */
export function refuseReason(f = {}) {
  const name = cleanName(f.name);
  if (!name) return { code: "noname", say: "파일 이름이 없습니다." };

  const exts = allExts(name);
  if (!exts.length) return { code: "noext", say: "확장자가 없는 파일은 안 받습니다." };

  // ⚠️ **마디를 전부 본다.** `사진.jpg.exe` 는 마지막이 exe 라 걸리고,
  //    `x.exe.jpg` 는 마지막이 jpg 라 흰 목록은 통과하지만 **가운데 exe 가 여기서 걸린다.**
  for (const e of exts) {
    if (RUN_EXT.has(e)) return { code: "run", say: "실행되는 파일은 안 받습니다.", ext: e };
    if (ZIP_EXT.has(e)) return { code: "zip", say: "압축 파일은 안 받습니다 — 안을 볼 수가 없어요. 풀어서 사진·PDF 로 올려주세요.", ext: e };
  }

  const last = exts[exts.length - 1];
  if (!OK_EXT.has(last))
    return { code: "notlisted", say: `안 받는 파일입니다 (.${last}). 사진·PDF·한글·워드만 올라갑니다.`, ext: last };

  // ⚠️ mime 은 **아이 폰이 적어 보내는 값이라 못 믿는다.** 그래서 확장자를 먼저 봤다.
  //    여기서는 **대놓고 실행 파일이라고 적어 온 것**만 잡는다.
  // ⚠️ **「사진 확장자인데 mime 이 image/ 가 아니면 막는다」를 여기 두면 안 된다.**
  //    카카오톡·파일앱에서 온 진짜 사진이 `application/octet-stream` 을 달고 오므로
  //    **다시 올려도 같은 값이라 영영 안 올라간다.** 학부모는 시키는 대로 다섯 번 올리고
  //    원장님께 전화한다(대전제 3 정반대). 흰 목록을 지났으면 mime 으로 또 막지 않는다.
  //    저장할 mime 은 `contentTypeFor()` 가 **확장자에서 정한다.**
  const mime = String(f.mime ?? "").toLowerCase();
  if (/^application\/(x-msdownload|x-executable|x-sh|x-msdos-program|vnd\.microsoft\.portable-executable)/.test(mime))
    return { code: "run", say: "실행되는 파일은 안 받습니다.", ext: last };

  const bytes = Number(f.bytes ?? 0);
  if (!(bytes > 0)) return { code: "empty", say: "빈 파일입니다." };

  return null;
}

/**
 * 한 묶음을 받을까.
 *
 * ⚠️ **30장이 넘으면 한 장도 안 올린다.** 앞에서 30장만 잘라 넣으면 아이는 다 올린 줄 알고,
 *    원장님은 다 받은 줄 안다. **오류가 안 나므로 아무도 모른다** — 학사일정 뒷장이 통째로 빈다.
 *
 * @param files [{name, mime, bytes}]
 * @param already 그 자리에 **이미 붙어 있는** 장수 (공지·숙제 붙임은 합쳐서 30장)
 * @returns { take, refused, over, room, say }
 */
export function acceptBatch(files = [], { already = 0, max = MAX_FILES } = {}) {
  const take = [], refused = [];
  for (const f of files) {
    const why = refuseReason(f);
    if (why) refused.push({ name: cleanName(f?.name), ...why });
    else take.push(f);
  }
  const room = Math.max(0, max - Number(already || 0));
  const over = take.length > room;

  // ⚠️ **자리가 0 이면 「나눠 올려주세요」라고 하면 안 된다.** 나눠 올려도 한 장도 안 들어가는데
  //    학부모는 그 말대로 몇 번이고 다시 올린다 (대전제 3 정반대).
  // ⚠️ **넘침과 거절은 같이 난다.** 한쪽만 말하면 못 받은 exe 이야기가 사라지고,
  //    30장으로 줄여 다시 올려야 그때서야 그 이야기가 나온다.
  const lines = [];
  if (over) {
    if (room <= 0)
      lines.push(`여기엔 이미 ${already}장이 붙어 있어 **더 못 붙입니다** — `
               + `공지를 새로 내거나 붙임을 먼저 빼주세요. (한 자리에 ${max}장까지)`);
    else if (already > 0)
      lines.push(`한 번에 ${max}장까지입니다. 여기엔 이미 ${already}장이 붙어 있어 ${room}장만 더 들어갑니다 — 나눠 올려주세요.`);
    else
      lines.push(`한 번에 ${max}장까지입니다. 지금 ${take.length}장이라 나눠 올려주세요.`);
  }
  if (refused.length) lines.push(`${refused.length}장은 못 받았습니다 — ${refused[0].say}`);

  // ⚠️ over 면 **take 를 비운다.** 「그럼 30장만이라도」 하고 싶은 유혹이 여기서 사고가 된다
  return { take: over ? [] : take, refused, over, room, say: lines.join(" ") };
}

/** 줄일까 — 사진만 긴 변 1600px. ⚠️ pdf·문서는 그대로 (줄이면 글자가 뭉개진다) */
export function shrinkPlan(f = {}) {
  return isImage(f.name)
    ? { shrink: true, maxEdge: MAX_EDGE, why: "사진은 긴 변 1600px 로 줄인다" }
    : { shrink: false, maxEdge: null, why: "pdf·문서는 안 줄인다 — 글자가 뭉개진다" };
}

/**
 * Storage 경로. ⚠️ **아이 이름을 경로에 넣지 않는다** —
 *    파기가 `path` 를 무덤값으로 덮어도 버킷 목록에는 이름이 남고, 그건 v2 밖이라 안 지워진다.
 * ⚠️ `v2.file.path` 는 **겹치면 안 되는 칸**이다(unique). 그래서 파일 id 를 그대로 쓴다.
 * ⚠️ `on` 은 **`dayOf()` 로 씻어서** 쓴다. 안 씻으면 `v2.today()` 가 준 Date 객체가
 *    `up/Wed Sep/…` 를 짓고, 그 경로는 `v2.file.path` 에 든 값과 **다른 글자열**이 된다 —
 *    버킷에서 안 열리고, 파기의 `storagePaths` 도 엉뚱한 경로를 지워 **진짜 파일이 남는다.**
 */
export const BUCKET = "files";
export function pathFor({ fileId, name, on }) {
  const ext = extOf(name);
  const day = dayOf(on);
  const d = day ? day.slice(0, 7).replace("-", "/") : "0000/00";
  return `up/${d}/${fileId}${ext ? "." + ext : ""}`;
}

// ── ② 분류는 저절로 — 학교·학년·학기는 **올린 아이에게서** 온다 ─────────

/**
 * 학년도 — 3월에 바뀐다. 2026-02-10 은 **2025 학년도**다.
 * ⚠️ 이걸 달력 해로 잡으면 2월에 올린 겨울 자료가 **다음 학년도 묶음**에 들어간다.
 */
export function schoolYear(dateStr) {
  const d = dayOf(dateStr);
  if (!d) return null;
  const [y, m] = d.split("-").map(Number);
  return m >= 3 ? y : y - 1;
}

/**
 * 학기 — `26-1` 모양 (`v2.file_bin.term`).
 *
 * ⚠️ **확인 안 됨 — 방학 두 달(8월·2월)이 어느 학기인지 원장님께 안 여쭤봤다.**
 *    지어내지 않고 **모른다고 표시해서** 돌려준다(`sure:false`). 화면은 그때만
 *    「2학기 자료 맞나요?」를 한 번 보여 주면 된다 — 나머지 열 달은 안 묻는다.
 */
export const TERM_MONTH = { 3: 1, 4: 1, 5: 1, 6: 1, 7: 1, 8: 2, 9: 2, 10: 2, 11: 2, 12: 2, 1: 2, 2: 2 };
const TERM_UNSURE = new Set([8, 2]);

/**
 * ⚠️ `sure:false` 에는 **서로 다른 두 가지**가 있다. 한 값으로 뭉치면 화면이
 *    「2학기 자료 맞나요?」를 띄우는데 뒤쪽은 **애초에 학기가 없다.**
 *      · `cannotRead:false` — 방학 달이라 어느 학기인지 애매하다 (학기 값은 있다)
 *      · `cannotRead:true`  — **날짜를 아예 못 읽었다** (학기가 null 이다)
 */
export function termOf(dateStr) {
  const d = dayOf(dateStr);
  const m = d ? Number(d.split("-")[1]) : NaN;
  const n = TERM_MONTH[m];
  if (!n) return { term: null, sure: false, cannotRead: true, why: "날짜를 못 읽었다" };
  const yy = String(schoolYear(d) % 100).padStart(2, "0");
  return {
    term: `${yy}-${n}`,
    sure: !TERM_UNSURE.has(m),
    cannotRead: false,
    why: TERM_UNSURE.has(m)
      ? "⚠️ 확인 안 됨 — 방학 달이라 어느 학기 자료인지 앱이 못 정한다"
      : "",
  };
}

/**
 * 이 아이가 올린 것이 들어갈 **묶음 열쇠.** 원장님은 **갈래만** 고른다.
 *
 * ⚠️ 학교가 안 적힌 아이면 **묶지 않는다.** 학교 없는 묶음을 하나 만들면
 *    여러 학교 자료가 거기 섞이고, `file_bin` 은 (학교,학년,학기,갈래)가 열쇠라
 *    **한 줄에 다 쌓여 갈라놓을 수가 없다.** → 학교를 먼저 적어 달라고 말한다.
 *
 * ⚠️ **학기에도 똑같이 건다.** 날짜를 못 읽어 `term` 이 비면 `file_bin` 의
 *    `unique nulls not distinct (school_id, grade, term, kind)` 때문에 **학기 없는 줄이 딱 하나**
 *    생기고 26-1 자료와 26-2 자료가 거기 다 쌓인다 — **다시 갈라놓을 수 없다.**
 *    학교가 없을 때와 **같은 처리**여야 한다: 세우고 묻는다.
 */
export function binKeyFor({ student = {}, kind, on }) {
  if (!BIN_KINDS.includes(kind))
    return { ok: false, ask: "kind", say: `갈래를 골라주세요 — ${BIN_KINDS.join(" · ")}` };
  const schoolId = student.school_id ?? student.schoolId ?? null;
  if (!schoolId)
    return { ok: false, ask: "school", say: `${student.name ?? "이 아이"} 학교가 안 적혀 있습니다. 학교를 먼저 적어주세요.` };
  const t = termOf(on);
  if (t.cannotRead)
    return { ok: false, ask: "date",
             say: "자료 날짜를 못 읽었습니다. 학기 없는 묶음은 나중에 갈라놓을 수가 없어 안 만듭니다 — 날짜를 'YYYY-MM-DD' 로 주세요." };
  return {
    ok: true,
    key: { schoolId, grade: student.grade ?? null, term: t.term, kind },
    sure: t.sure,
    say: t.sure ? "" : t.why,
  };
}

// ── ③ 형제 — 누구 것인지 **먼저 묻는다** ─────────────────────────────────

/**
 * 이 계정이 올릴 수 있는 아이들.
 * ⚠️ 학생 본인 계정이면 자기 하나, 학부모면 자녀 전부다. **둘이 넘으면 물어야 한다** —
 *    안 물으면 형 학교 자료가 동생 칸에 들어가고, 그때부터 학교·학년이 전부 어긋난다.
 */
export function myStudentsSql() {
  return `select s.id, s.name, s.grade, s.school_id, sc.name as school_name
            from v2.students s
            left join v2.schools sc on sc.id = s.school_id
           where s.state <> 'left'
             and (s.profile_id = $1
                  or exists (select 1 from v2.parent_student ps
                              where ps.student_id = s.id and ps.parent_profile_id = $1))
           order by s.grade desc nulls last, s.name`;
}

export async function whoseUpload(db, profileId) {
  const r = await db.query(myStudentsSql(), [profileId]);
  const students = r.rows ?? [];
  return {
    students,
    // ⚠️ 하나뿐이면 안 묻는다 (대전제 3 — 누를 것을 늘리지 않는다)
    ask: students.length > 1,
    only: students.length === 1 ? students[0] : null,
    say: students.length > 1 ? "누구 자료인가요?" : students.length === 0 ? "이을 아이가 없습니다." : "",
  };
}

// ── ④ 묶음 찾기·만들기 ─────────────────────────────────────────────────

export function binFindSql() {
  return `select id from v2.file_bin
           where school_id is not distinct from $1
             and grade is not distinct from $2
             and term is not distinct from $3
             and kind = $4`;
}

export function binMakeSql() {
  return `insert into v2.file_bin(school_id, grade, term, kind)
          values ($1, $2, $3, $4) on conflict do nothing returning id`;
}

/**
 * 같은 (학교·학년·학기·갈래)면 **한 묶음**이다. 두 번째 아이가 또 올려도 묶음은 하나다.
 * ⚠️ 만들기와 찾기를 **한 문장으로 합치지 않는다** — `unique nulls not distinct` 에
 *    `on conflict (…) do update` 를 걸면 널이 낀 열쇠에서 어긋난다. 찾고 · 넣고 · 다시 찾는다.
 */
export async function findOrMakeBin(db, key) {
  const p = [key.schoolId ?? null, key.grade ?? null, key.term ?? null, key.kind];
  const got = await db.query(binFindSql(), p);
  if (got.rows?.length) return { binId: got.rows[0].id, made: false };
  const made = await db.query(binMakeSql(), p);
  if (made.rows?.length) return { binId: made.rows[0].id, made: true };
  const again = await db.query(binFindSql(), p);
  return { binId: again.rows?.[0]?.id ?? null, made: false };
}

/** 그 묶음에 이미 있는 것 — **막으려고 읽는 게 아니라 알리려고** 읽는다 */
export function binFilesSql() {
  return `select f.id, f.orig_name, f.bytes, f.uploaded_at, f.by_profile,
                 p.name as by_name, f.student_id
            from v2.file_link l
            join v2.file f on f.id = l.file_id
            left join v2.profiles p on p.id = f.by_profile
           where l.bin_id = $1 and f.state = 'active'
           order by f.uploaded_at desc`;
}

/**
 * **「이미 있습니다」** — 세워서 알리기만 한다.
 *
 * ⚠️ **막지 마라.** 원장님이 중복을 허가하셨다(9/2) — 같은 종이라도 **사진 화질이 다르다.**
 *    막으면 먼저 온 흐린 것만 남고, 잘 찍은 것은 영영 못 올라간다.
 *    그래서 이 함수는 `block` 을 **안 돌려준다.** 돌려주는 것은 말 한 줄뿐이다.
 */
export async function alreadyThere(db, binId, files = []) {
  const r = await db.query(binFilesSql(), [binId]);
  const have = r.rows ?? [];
  const names = new Set(have.map((x) => cleanName(x.orig_name).toLowerCase()));
  const same = files.filter((f) => names.has(cleanName(f?.name).toLowerCase()));
  return {
    have,
    same,
    // ⚠️ 여기 `block: true` 를 더하고 싶어질 때가 온다. 더하면 흐린 사진만 남는다
    say: same.length
      ? `이 묶음에 같은 이름이 ${same.length}장 이미 있습니다. 그래도 올립니다 — 화질이 다를 수 있으니까요.`
      : have.length
        ? `이 묶음엔 이미 ${have.length}장이 있습니다.`
        : "",
  };
}

// ── ⑤ 파일 넣기·붙이기 ─────────────────────────────────────────────────

/**
 * ⚠️ **`id` 를 올리는 쪽이 만들어 넣는다.** DB 기본값(`gen_random_uuid()`)에 맡기면
 *    **`pathFor()` 와 물리지 않는다** — 경로는 파일 id 로 짓는데(`path` 는 `not null unique`)
 *    id 는 insert 하는 그 순간에야 생기고, `v2.file` 에는 authenticated 용 update 정책이
 *    **없어서 나중에 고칠 수도 없다.** 「넣고 → 받은 id 로 경로를 짓는다」로 짜면 버킷에 올린
 *    경로와 `path` 칸이 **다른 글자열**이 되어, 원장님이 자료함에서 눌러도 안 열리고
 *    파기의 `storagePaths` 는 엉뚱한 경로를 지워 **진짜 파일이 버킷에 영원히 남는다**
 *    (개인정보가 남는 쪽이다). → uuid 를 먼저 만들고, `pathFor({fileId: 그 uuid})` 로
 *    경로를 지어 **둘을 같이 넣는다.** 검사가 진짜 insert 로 둘이 같은지 본다.
 */
export function fileInsertSql() {
  return `insert into v2.file(id, by_profile, student_id, orig_name, mime, bytes, path, shrunk, purge_on)
          values ($1, $2, $3, $4, $5, $6, $7, $8, $9)
          returning id, path, orig_name, uploaded_at, purge_on`;
}

export function linkInsertSql() {
  return `insert into v2.file_link(file_id, bin_id, day_item_id, notice_id, consult_id)
          values ($1, $2, $3, $4, $5) on conflict do nothing
          returning file_id, created_at`;
}

/**
 * **「방금 온 것」** — 아무 데도 안 붙은 파일.
 *
 * ⚠️ **정직하게 — 아이가 아무거나 올리는 것을 앱이 못 막는다.** 갈래를 고르기 전까지는
 *    여기에만 있고 어느 묶음에도 안 들어간다. 여기 있는 동안은 **원장님만** 본다.
 */
export function inboxSql() {
  return `select f.id, f.orig_name, f.mime, f.bytes, f.shrunk, f.uploaded_at, f.path,
                 f.student_id, s.name as student_name, s.grade,
                 sc.name as school_name, p.name as by_name
            from v2.file f
            left join v2.students s on s.id = f.student_id
            left join v2.schools sc on sc.id = s.school_id
            left join v2.profiles p on p.id = f.by_profile
           where f.state = 'active'
             and not exists (select 1 from v2.file_link l where l.file_id = f.id)
           order by f.uploaded_at desc`;
}

export async function inbox(db) {
  const r = await db.query(inboxSql(), []);
  return r.rows ?? [];
}

/** 붙임 목록 — 숙제 한 줄에 붙은 것 */
export function dayItemFilesSql() {
  return `select l.file_id, f.orig_name, f.mime, f.bytes, f.path,
                 l.seen_by_child, l.seen_at, l.created_at
            from v2.file_link l
            join v2.file f on f.id = l.file_id
           where l.day_item_id = $1 and f.state = 'active'
           order by l.created_at`;
}

/** 붙임 목록 — 공지에 붙은 것 */
export function noticeFilesSql() {
  return `select l.file_id, f.orig_name, f.mime, f.bytes, f.path, l.created_at
            from v2.file_link l
            join v2.file f on f.id = l.file_id
           where l.notice_id = $1 and f.state = 'active'
           order by l.created_at`;
}

/** 아이가 누른 것 — 💾 저장 · ✓ 안 보기. 누르면 그 줄에서 없어진다 */
export function markSeenSql() {
  return `update v2.file_link set seen_by_child = $3, seen_at = now()
           where file_id = $1 and day_item_id = $2`;
}

export async function markSeen(db, { fileId, dayItemId, how }) {
  if (!SEEN.includes(how)) throw new Error(`모르는 표시 '${how}' — ${SEEN.join(" · ")} 만 있다`);
  const r = await db.query(markSeenSql(), [fileId, dayItemId, how]);
  // ⚠️ 몇 줄이 바뀌었는지 못 세면 **접근 규칙이 막았을 때도 화면이 「됐습니다」라고 말한다**
  if (typeof r?.rowCount !== "number") throw new Error("어댑터가 rowCount 를 안 준다 — file_link");
  return { changed: r.rowCount };
}

// ── ⑥ 공지 붙임 문 — **붙인 뒤에만 보내기가 열린다** ────────────────────

export function noticeStateSql() {
  return `select n.id, n.title, n.to_role, n.sent_at, n.publish_at,
                 (select count(*)::int from v2.file_link l join v2.file f on f.id = l.file_id
                   where l.notice_id = n.id and f.state = 'active') as n_files,
                 (select count(*)::int from v2.notice_read r where r.notice_id = n.id) as n_read
            from v2.notice n where n.id = $1`;
}

/**
 * 이 공지를 지금 보낼 수 있나 · 지금 붙일 수 있나.
 *
 * ⚠️ **보낸 뒤에 붙이면 먼저 본 집은 그 붙임을 못 본다.** 다시 안 열어 보니까.
 *    오류도 안 나고 원장님 화면에는 붙임이 멀쩡히 보인다 — **몇 집이 못 봤는지 알 길이 없다.**
 *    → 보낸 공지에는 **못 붙인다.** 붙일 것이 생기면 공지를 새로 낸다.
 *
 * ⚠️ **올리는 중인 붙임이 하나라도 남아 있으면 보내기가 안 열린다.** 안 그러면
 *    사진이 다 안 올라간 채 공지가 나가고, 그때는 이미 늦다.
 *
 * @param notice  { sent_at, n_files, n_read }
 * @param pending 아직 다 안 올라간 붙임 장수
 */
export function noticeGate(notice = {}, { pending = 0 } = {}) {
  const sent = !!notice.sent_at;
  const nFiles = Number(notice.n_files ?? 0);
  const nRead = Number(notice.n_read ?? 0);

  if (sent) {
    return {
      canAttach: false,
      canSend: false,
      why: nRead > 0
        ? `이미 보냈고 ${nRead}곳이 열어 봤습니다. 지금 붙이면 그 집들은 못 봅니다 — 공지를 새로 내주세요.`
        : "이미 보낸 공지입니다. 붙일 것이 생기면 공지를 새로 내주세요.",
    };
  }
  if (pending > 0) {
    return { canAttach: true, canSend: false,
      why: `붙임 ${pending}장이 아직 올라가는 중입니다. 다 올라가면 보내기가 열립니다.` };
  }
  if (nFiles > MAX_FILES) {
    return { canAttach: false, canSend: false,
      why: `붙임이 ${nFiles}장입니다 — ${MAX_FILES}장까지만 나갑니다. 나눠 내주세요.` };
  }
  return { canAttach: true, canSend: true, why: nFiles ? `붙임 ${nFiles}장과 함께 나갑니다.` : "" };
}

export async function noticeGateOf(db, noticeId, opts = {}) {
  const r = await db.query(noticeStateSql(), [noticeId]);
  const n = r.rows?.[0];
  if (!n) return { canAttach: false, canSend: false, why: "그 공지가 없습니다." };
  return { ...noticeGate(n, opts), notice: n };
}

// ── ⑦ 누가 보나 — **말로만** 한다 ──────────────────────────────────────

/**
 * **아직 안 조인 접근 규칙** — 화면이 거짓말을 안 하게 하려고 여기 적어 둔다.
 *
 * ⚠️ 이건 규칙을 **한 벌 더 쓴 것이 아니다.** 규칙은 DB 에만 있고, 이 목록은
 *    「그 규칙이 아직 안 조여졌다」는 **사실 표시**다. `scripts/check-files.mjs` 가
 *    진짜 `pg_policies` 를 읽어 이 목록과 맞물려 보고, **어느 쪽으로든 어긋나면 빨개진다** —
 *    needsDb 의 SQL 을 넣고 여기서 안 빼도, 안 넣고 여기서 빼도 잡힌다.
 *
 *   `file.notice`         `own_file`·`own_link` 의 공지 가지가 `notice_id is not null` **하나뿐**이라
 *                         **로그인한 사람 전원**이 본다. 학부모 전용 공지의 붙임을 학생이 보고,
 *                         **아직 안 보낸 초안 공지의 붙임도 미리 본다**(`sent_at` 을 안 본다).
 *                         대조 — 같은 파일의 `notice/read_notice` 는 `sent_at`·`to_role` 을 제대로 본다.
 *   `file_link.child_seen` 아이가 누르는 UPDATE 정책의 `with check` 가 `true` 라,
 *                         아이가 **그 줄의 아무 칸이나** 바꾼다 (`day_item_id = null` 로 붙임을 없앤다).
 */
export const RLS_NOT_YET = new Set(["file.notice", "file_link.child_seen"]);

/**
 * 화면에 띄우는 한 줄.
 *
 * ⚠️ **이 함수는 막지 않는다.** 진짜로 막는 것은 접근 규칙(RLS)이다
 *    (`0016_rls_rest.sql` 의 `own_file`·`own_link`).
 *    여기서 `boolean` 을 돌려주면 **같은 판단이 두 벌**이 되고(원칙 1), 언젠가 둘이 어긋난다.
 *    어긋난 쪽이 느슨하면 **다른 아이 학교 자료가 보인다.**
 *
 * ⚠️ **붙은 자리를 전부 보고 제일 넓은 쪽을 말한다.** 첫 자리 하나만 보고 끝내면
 *    자료함에도 넣고 공지에도 붙인 한 줄을 「원장님만」이라고 말하는데 — 그건
 *    `linkInsertSql()` 이 `bin_id`·`notice_id` 를 한 줄에 같이 받으므로 **실제로 생기는 모양**이고
 *    (학교에서 온 학사일정을 자료함에 넣고 그대로 공지로 보내는, 이 기능의 본래 흐름),
 *    원장님이 그 글자를 믿고 상담·성적 자료를 같이 붙이면 **그대로 나간다.**
 *    → 좁은 쪽으로 틀리지 않는다. 넓은 쪽으로 말한다.
 */
export function seenByLabel(link = {}) {
  const notice = link.notice_id ?? link.noticeId;
  const dayItem = link.day_item_id ?? link.dayItemId;
  const bin = link.bin_id ?? link.binId;
  const consult = link.consult_id ?? link.consultId;

  if (notice)
    // ⚠️ 규칙이 안 조여진 동안은 「이 공지를 받는 사람만」이 **거짓말**이다 (대전제 0)
    return RLS_NOT_YET.has("file.notice")
      ? "⚠️ 로그인한 사람 전원 — 공지 붙임 접근 규칙을 아직 못 조였습니다"
      : "이 공지를 받는 사람만";
  if (dayItem) return "이 숙제를 받는 아이와 그 집만";
  if (bin || consult) return "원장님만";
  return "원장님만 — 아직 아무 데도 안 붙었습니다";
}

// ── ⑧ 보관·파기 ────────────────────────────────────────────────────────

/**
 * 날짜에 달을 더한다. 없는 날(1/31 + 1달)은 그 달 마지막 날로 (2/28·2/29)
 * ⚠️ 못 읽는 날짜를 받으면 **그 자리에서 던진다.** 안 던지면 `Invalid time value` 라는
 *    말만 화면에 뜨고 **어느 파일이 원인인지 아무 데도 안 나온다.**
 */
export function addMonths(dateStr, n) {
  const s = dayOf(dateStr);
  if (!s)
    throw new Error(`⚠️ addMonths 는 'YYYY-MM-DD' 만 받는다 — 받은 것: ${JSON.stringify(dateStr)}`);
  const [y, m, d] = s.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1 + Number(n), 1));
  const last = new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth() + 1, 0)).getUTCDate();
  t.setUTCDate(Math.min(d, last));
  return t.toISOString().slice(0, 10);
}

/**
 * 파기 예정일 (`v2.file.purge_on`).
 *
 *   `child` 원장님 → 아이 (숙제 붙임·공지 붙임)   **1달** 뒤
 *   `bin`   학교 자료함                           **그 학기가 끝나고 1년**
 *   `own`   원장님이 그냥 가진 것                  **계속** (null)
 *
 * ⚠️ **`bin` 은 지금 날짜를 못 낸다 — 학기가 끝나는 날을 앱이 모른다.**
 *    지어내면 **학교 자료가 엉뚱한 날 사라진다.** → `null` 을 주고 `sure:false` 로 밝힌다.
 *    파기일이 없는 파일은 `lib/purge.js` 의 `filesDue` 가 **안 집는다** — 그대로 남는다.
 *    남는 쪽이 없어지는 쪽보다 낫지만, **원장님께 학기 끝 날짜를 여쭤야 풀린다.**
 *
 * ⚠️ 날짜는 **`dayOf()` 로 씻는다.** 안 씻으면 `v2.today()` 가 준 Date 객체에
 *    `RangeError: Invalid time value` 로 **터져서 숙제에 붙임을 다는 그 화면이 죽는다.**
 *    못 읽는 날짜는 터뜨리지 않고 **비워 두고 밝힌다** (대전제 0 · 남는 쪽이 낫다).
 */
export function purgeOnFor({ to, on, termEndOn = null } = {}) {
  if (to === "child") {
    const d = dayOf(on);
    if (!d) return { purgeOn: null, sure: false,
                     why: on ? "⚠️ 올린 날짜를 못 읽었다 — 파기일을 비워 둔다" : "올린 날짜를 모른다" };
    return { purgeOn: addMonths(d, CHILD_KEEP_MONTHS), sure: true,
             why: "아이에게 보낸 것은 1달 (원장님 9/2 확정)" };
  }
  if (to === "bin") {
    const e = dayOf(termEndOn);
    if (e) return { purgeOn: addMonths(e, 12), sure: true,
                    why: "학교 자료는 그 학기가 끝나고 1년" };
    return { purgeOn: null, sure: false,
             why: termEndOn
               ? "⚠️ 학기가 끝나는 날을 못 읽었다 — 지어내지 않고 비워 둔다"
               : "⚠️ 확인 안 됨 — 학기가 끝나는 날을 앱이 모른다. 지어내지 않고 비워 둔다" };
  }
  return { purgeOn: null, sure: true, why: "원장님 자료함은 계속 (원장님 9/2 확정)" };
}

/**
 * 한 집이 퇴원해도 **학교 묶음의 것은 안 내린다** — 다른 아이 것이기도 하다.
 * ⚠️ 이 규칙은 `lib/purge.js` 의 `REACH.file.exceptRow` **한 곳에만** 산다.
 *    여기서 다시 쓰지 않는다 (원칙 1).
 * ⚠️ **「그 글자가 아직 있나」만 보면 안 된다.** 앞 판에서 그렇게 봤다가,
 *    술어가 줄 내리기(row)에만 걸리고 **이름 가리기(mask)와 Storage 경로 목록에는 안 걸린** 채로
 *    검사 102건이 전부 통과했다. `scripts/check-files.mjs` 는 이제
 *    `planFor()` 를 **실제로 돌려** 나온 문장 전부에 술어가 있는지 보고,
 *    `purgeStudent`/`purgeFiles` 가 낸 `storagePaths` 에 자료함 파일이 **안 실리는지**까지 본다.
 */
export function binFilesKeptSql() {
  return `select count(*)::int as n from v2.file
           where id in (select file_id from v2.file_link where bin_id is not null)`;
}
