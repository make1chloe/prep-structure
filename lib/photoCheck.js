/**
 * 올리기 전 사진 검사 — 원장님 2026-08-22:
 * 「학부모·학생 어플에서 사진이 흔들려서 글씨 못 알아보거나 잘리면
 *   업로드 아예 안 되게」.
 *
 * 판단은 여기 **한 벌** — 학생·학부모 화면의 사진 업로드 두 지점
 * (숙제 제출 app/me/SubmitBox, 전달사항 components/RequestPhotos)이
 * 같이 쓴다. 새 업로드 지점이 생기면 여기부터 물릴 것.
 *
 * 브라우저에서만 돈다 (canvas 로 픽셀을 읽는다). 보는 것 세 가지:
 *   ① 해상도 — 긴 변이 너무 짧으면 글씨가 뭉개진다
 *   ② 밝기   — 너무 어두우면 글씨가 안 보인다
 *   ③ 선명도 — 라플라시안 분산. 흔들리면 경계가 사라져 값이 뚝 떨어진다
 *
 * **잘림은 기계로 판정하지 못한다** — 문제지가 화면에 얼마나 들어와야
 * 하는지는 기계가 모른다. 그 몫은 버튼 옆 안내 문구(PHOTO_GUIDE)가 진다.
 *
 * 기준은 일부러 보수적으로(느슨하게) 잡았다 — 멀쩡한 사진이 막히면
 * 숙제를 못 내는 더 큰 사고다. 흔들린 사진 몇 장이 새는 것보다 나쁘다.
 * HEIC 등 브라우저가 못 읽는 형식은 **검사 없이 통과** — 못 읽었다는
 * 이유로 거절하면 안 된다 (서버가 받는 데는 문제가 없다).
 */

/** 검사용 축소 크기 — 선명도 값은 이미지 크기에 좌우되므로 긴 변을 여기에 고정하고 잰다 */
const CHECK_SIZE = 800;

/**
 * 긴 변 최소 픽셀. 요즘 폰 카메라는 3000px 이상이 나온다 — 700 미만이면
 * 화면 캡처 조각이거나 심하게 압축된 것. 조율: 멀쩡한 사진이 걸리면 내리고,
 * 조각 사진이 자꾸 통과하면 900~1000까지 올려본다.
 */
const MIN_LONG_EDGE = 700;

/**
 * 평균 밝기 최소 (0~255). 실내에서 찍은 문제지 사진은 보통 120~200.
 * 40 미만이면 불 끄고 찍은 수준. 조율: 어두운 사진이 자꾸 통과하면
 * 55~60까지 올려보되, 밤에 스탠드만 켜고 찍는 아이가 막히지 않는지 볼 것.
 */
const MIN_BRIGHTNESS = 40;

/**
 * 라플라시안 분산 최소값 (긴 변 800px 축소 기준). 또렷한 문제지 사진은
 * 보통 100~2000, 심하게 흔들린 사진은 한 자리수까지 떨어진다.
 * 12는 「글씨를 못 알아볼 정도」만 걸리게 잡은 값. 조율: 흔들린 사진이
 * 자꾸 통과하면 20~30까지 올려보되, 올릴수록 조명이 어중간한 멀쩡한
 * 사진이 같이 막힐 위험이 커진다.
 */
const MIN_SHARPNESS = 12;

/**
 * 사진 버튼 옆에 상시로 보여줄 안내 한 줄 (원장님 2026-08-22:
 * 「업로드 전 페이지 번호 보이게 찍으라고 경고 문구」).
 * 잘림 판정은 기계가 못 하므로 이 문구가 그 몫을 진다.
 */
export const PHOTO_GUIDE =
  "📷 페이지 번호가 보이게, 문제와 풀이가 다 들어오게 찍어주세요. 흔들린 사진은 올라가지 않아요.";

/** 탈락 이유별 문구 — 왜 안 되는지 말해줘야 다시 찍을 수 있다 (조용히 삼키기 금지) */
const FAIL_MESSAGES = {
  blur: "사진이 흔들렸어요 — 폰을 고정하고 다시 찍어주세요.",
  dark: "사진이 너무 어두워요 — 밝은 곳에서 다시 찍어주세요.",
  small: "사진이 너무 작아요 — 카메라로 다시 찍어주세요.",
};

function fail(reason) {
  return { ok: false, reason, message: FAIL_MESSAGES[reason] };
}

/**
 * 사진 한 장을 검사한다. 업로드 지점에서 파일을 고른 직후 부른다.
 *
 * @param {File} file 고른 파일
 * @returns {Promise<{ok: boolean, reason?: string, message?: string}>}
 *   ok=false 면 message 를 사용자에게 그대로 보여주고 업로드하지 않는다.
 *   절대 throw 하지 않는다 — 검사가 못 돌면(형식·환경) 통과로 친다.
 */
export async function checkPhoto(file) {
  // 사진이 아니면(PDF 등) 검사 대상이 아니다 — 그대로 통과
  if (!file || !file.type?.startsWith("image/")) return { ok: true };
  // 브라우저 밖(SSR 등)에서는 canvas 가 없다 — 검사 불가면 막지 않는다
  if (typeof document === "undefined") return { ok: true };

  let src = null;   // ImageBitmap 또는 HTMLImageElement
  let url = null;
  try {
    try {
      src = await createImageBitmap(file);
    } catch {
      // createImageBitmap 이 안 되는 형식/브라우저 — <img> 로 한 번 더
      url = URL.createObjectURL(file);
      const img = new Image();
      img.src = url;
      await img.decode();
      src = img;
    }
  } catch {
    // HEIC 등 브라우저가 아예 못 읽는 형식 — 검사 없이 통과 (거절 금지)
    if (url) URL.revokeObjectURL(url);
    return { ok: true };
  }

  try {
    const w = src.naturalWidth || src.width || 0;
    const h = src.naturalHeight || src.height || 0;
    const long = Math.max(w, h);
    if (!long) return { ok: true };            // 크기를 못 읽으면 통과
    if (long < MIN_LONG_EDGE) return fail("small");

    // 긴 변을 CHECK_SIZE 로 줄여 그리고, 픽셀을 읽는다
    const scale = Math.min(1, CHECK_SIZE / long);
    const cw = Math.max(1, Math.round(w * scale));
    const ch = Math.max(1, Math.round(h * scale));
    const canvas = document.createElement("canvas");
    canvas.width = cw;
    canvas.height = ch;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return { ok: true };             // canvas 못 쓰는 환경 — 통과
    ctx.drawImage(src, 0, 0, cw, ch);
    let data;
    try {
      data = ctx.getImageData(0, 0, cw, ch).data;
    } catch {
      return { ok: true };                     // 픽셀을 못 읽으면(희귀) 통과
    }

    // 회색조 + 평균 밝기
    const gray = new Float32Array(cw * ch);
    let sum = 0;
    for (let i = 0, p = 0; p < gray.length; i += 4, p++) {
      const g = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
      gray[p] = g;
      sum += g;
    }
    const brightness = sum / gray.length;
    if (brightness < MIN_BRIGHTNESS) return fail("dark");

    // 라플라시안(상하좌우 4이웃) 분산 — 흔들린 사진은 경계가 뭉개져 분산이 작다
    let lapSum = 0;
    let lapSq = 0;
    let n = 0;
    for (let y = 1; y < ch - 1; y++) {
      for (let x = 1; x < cw - 1; x++) {
        const p = y * cw + x;
        const v = gray[p - cw] + gray[p + cw] + gray[p - 1] + gray[p + 1] - 4 * gray[p];
        lapSum += v;
        lapSq += v * v;
        n++;
      }
    }
    if (n > 0) {
      const mean = lapSum / n;
      const variance = lapSq / n - mean * mean;
      if (variance < MIN_SHARPNESS) return fail("blur");
    }

    return { ok: true };
  } finally {
    if (src && typeof src.close === "function") src.close();  // ImageBitmap 메모리 반납
    if (url) URL.revokeObjectURL(url);
  }
}
