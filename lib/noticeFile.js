/**
 * **전달사항에 붙이는 파일** (원장님, 2026-08-11 — 「pdf나 그냥 파일도
 * 가능하게 해주고」).
 *
 * 전에는 모르는 갈래를 **전부 `.jpg` 로 바꿔** 담았다
 * (`EXT[file.type] || "jpg"`). 한글(hwp)·엑셀을 붙이면 `.jpg` 가 되어
 * **열리지 않는 그림**이 됐다 — 오류는 아무 데도 안 났다.
 *
 * 이름도 살린다. 「가정통신문」 인지 「시간표」 인지는 **이름에만** 있다.
 * 붙일 칸을 새로 만들지 않고 **경로 안에** 둔다 (표를 안 고친다) —
 *   `<공지 id>/<시각>-<무작위>-<원래 이름>`
 * 맨 앞 칸이 공지 id 라는 규칙은 그대로다 (0064 의 권한 규칙이 그걸 본다).
 *
 * 넣는 쪽(서버)과 보여주는 쪽(화면)이 **같은 규칙 한 벌**을 쓴다.
 */

/** 올릴 수 있는 최대 크기 — 버킷 상한과 같다 (0064·0068·0147: 26214400) */
export const MAX_UPLOAD = 25 * 1024 * 1024;

/** 이름에 확장자가 없을 때만 쓰는 되돌림표 */
export const EXT = {
  "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp",
  "image/heic": "heic", "image/heif": "heic", "application/pdf": "pdf",
};

/**
 * 올릴 파일의 경로용 이름 — **원래 이름을 살리고**, 확장자가 없을 때만
 * 갈래(mime)로 되돌린다. 공지(0064)·빠른 메모 첨부(0147)가 같은 규칙을 쓴다.
 */
export function uploadName(file) {
  let name = safeName(file?.name || "");
  if (!/\.[a-z0-9]{1,8}$/i.test(name)) {
    const ext = EXT[file?.type] || (String(file?.type || "").startsWith("image/") ? "jpg" : "");
    if (ext) name = `${name}.${ext}`;
  }
  return name;
}

/** 경로에 담아도 되는 이름으로 (칸을 가르는 글자·안 보이는 글자를 턴다) */
export function safeName(name = "") {
  const t = String(name)
    .replace(/[\\/]/g, " ")
    .replace(/[\u0000-\u001f\u007f]/g, " ")  // 안 보이는 글자
    // 빈칸은 밑줄로 — 보관함 열쇠와 내려받기 주소에서 탈이 없다
    .replace(/\s+/g, "_")
    .replace(/^_+|_+$/g, "");
  // 너무 길면 자른다 — 확장자는 살려서
  if (t.length <= 80) return t || "파일";
  const dot = t.lastIndexOf(".");
  const ext = dot > 0 && t.length - dot <= 8 ? t.slice(dot) : "";
  return t.slice(0, 80 - ext.length) + ext;
}

/** 경로에서 사람이 읽을 이름만 꺼낸다 (앞에 붙인 시각·무작위는 뗀다) */
export function shownName(path = "") {
  const base = String(path).split("/").pop() || "";
  return base.replace(/^\d{10,}-[a-z0-9]{2,8}-/, "") || base;
}

/** 화면에 그림으로 펼쳐 보일 것인가 (아니면 이름표로) */
export function isImage(path = "") {
  return /\.(jpe?g|png|webp|gif|heic|heif|avif)$/i.test(shownName(path));
}

/** 이름표에 붙일 갈래 (PDF · HWP …) */
export function fileKind(path = "") {
  const m = shownName(path).match(/\.([a-z0-9]{1,8})$/i);
  return m ? m[1].toUpperCase() : "파일";
}
