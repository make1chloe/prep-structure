/**
 * **여러 파일을 하나로 묶어 내려받게 한다** (원장님, 2026-08-11 —
 * 「파일 여러개 한번에 다운받기 가능하게해줘」).
 *
 * 붙임 파일이 다섯이면 다섯 번 눌러 다섯 번 받아야 했다. 폰에서는 더
 * 성가시다 — 받을 때마다 다른 화면으로 넘어갔다 돌아와야 한다.
 *
 * ── 왜 직접 만드나 ──────────────────────────────────────
 *
 * 묶는 일에 꾸러미(jszip 같은 것)를 새로 들이지 않는다. zip 은 규격이
 * 뚜렷하고, **압축 없이 담기만 하는(store)** 방식이면 백 줄이 안 된다.
 * 어차피 pdf·jpg 는 이미 압축돼 있어 다시 줄여도 거의 안 준다.
 *
 * 4GB 가 넘으면 zip64 라는 다른 규격이 필요하다 — 우리는 한 파일 25MB
 * 제한이라 갈 일이 없지만, **넘으면 조용히 깨진 파일을 주지 않고 막는다.**
 */

const TABLE = (() => {
  const t = new Uint32Array(256);
  for (let i = 0; i < 256; i += 1) {
    let c = i;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[i] = c >>> 0;
  }
  return t;
})();

/** 파일이 오는 길에 상하지 않았는지 보는 검사값 */
export function crc32(bytes) {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i += 1) c = TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/** 이름이 겹치면 뒤에 (2) (3) 을 붙인다 — 겹친 채로 담으면 하나만 풀린다 */
export function uniqueNames(names = []) {
  const seen = new Map();
  return names.map((raw) => {
    const name = String(raw || "파일");
    if (!seen.has(name)) {
      seen.set(name, 1);
      return name;
    }
    const n = seen.get(name) + 1;
    seen.set(name, n);
    const dot = name.lastIndexOf(".");
    return dot > 0
      ? `${name.slice(0, dot)} (${n})${name.slice(dot)}`
      : `${name} (${n})`;
  });
}

const LIMIT = 4 * 1024 * 1024 * 1024 - 1; // zip64 를 안 쓰는 한계

/**
 * @param entries [{ name, bytes: Uint8Array }]
 * @returns Uint8Array — 그대로 내보내면 zip 파일이다
 */
export function makeZip(entries = []) {
  const list = entries.filter((e) => e && e.bytes);
  const names = uniqueNames(list.map((e) => e.name));
  const enc = new TextEncoder();

  const total = list.reduce((s, e) => s + e.bytes.length, 0);
  if (total > LIMIT) throw new Error("묶기에는 너무 큽니다 (4GB 넘음).");

  const locals = [];
  const centrals = [];
  let offset = 0;

  list.forEach((e, i) => {
    const name = enc.encode(names[i]);
    const bytes = e.bytes;
    const crc = crc32(bytes);

    const local = new DataView(new ArrayBuffer(30));
    local.setUint32(0, 0x04034b50, true);
    local.setUint16(4, 20, true);      // 풀려면 이 판 이상
    local.setUint16(6, 0x0800, true);  // 이름은 UTF-8 — 한글 이름이 안 깨지게
    local.setUint16(8, 0, true);       // 담기만 (압축 없음)
    local.setUint16(10, 0, true);      // 시각 — 고정 (같은 것을 두 번 만들면 같아야 한다)
    local.setUint16(12, 0x0021, true); // 1980-01-01
    local.setUint32(14, crc, true);
    local.setUint32(18, bytes.length, true);
    local.setUint32(22, bytes.length, true);
    local.setUint16(26, name.length, true);
    local.setUint16(28, 0, true);
    locals.push(new Uint8Array(local.buffer), name, bytes);

    const central = new DataView(new ArrayBuffer(46));
    central.setUint32(0, 0x02014b50, true);
    central.setUint16(4, 20, true);
    central.setUint16(6, 20, true);
    central.setUint16(8, 0x0800, true);
    central.setUint16(10, 0, true);
    central.setUint16(12, 0, true);
    central.setUint16(14, 0x0021, true);
    central.setUint32(16, crc, true);
    central.setUint32(20, bytes.length, true);
    central.setUint32(24, bytes.length, true);
    central.setUint16(28, name.length, true);
    central.setUint32(42, offset, true);
    centrals.push(new Uint8Array(central.buffer), name);

    offset += 30 + name.length + bytes.length;
  });

  const cdSize = centrals.reduce((s, b) => s + b.length, 0);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true);
  end.setUint16(8, list.length, true);
  end.setUint16(10, list.length, true);
  end.setUint32(12, cdSize, true);
  end.setUint32(16, offset, true);

  const parts = [...locals, ...centrals, new Uint8Array(end.buffer)];
  const out = new Uint8Array(parts.reduce((s, b) => s + b.length, 0));
  let at = 0;
  parts.forEach((b) => {
    out.set(b, at);
    at += b.length;
  });
  return out;
}
