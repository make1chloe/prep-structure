#!/usr/bin/env python3
"""홈 화면 아이콘을 만든다.

학생이 「홈 화면에 추가」 를 하면 폰 바탕에 아이콘이 하나 생긴다. 지금까지는
그게 **아무 그림도 없는 남색 사각형**이었다 (icon-512.png 가 단색이었다).

만드는 것
    public/icon-192.png            안드로이드 · 크롬
    public/icon-512.png
    public/icon-192-maskable.png   안드로이드가 동그랗게 잘라내는 판 (안쪽 80%만 씀)
    public/icon-512-maskable.png
    public/apple-touch-icon.png    아이폰 (180px · 투명 금지 — 투명하면 검게 나온다)
    public/favicon.png             브라우저 탭

**진짜 로고 파일이 있으면 그걸 쓴다.**
    public/logo.png (또는 logo-src.png) 를 두고 이 파일을 다시 돌리면
    거기서 아이콘을 다시 만든다. 아래 그리기 코드는 파일이 없을 때만 쓰는
    **손으로 다시 그린 것**이라, 진짜 파일이 생기면 그것으로 바꿔야 한다.

    python3 scripts/make-icons.py
"""

import math
import os
import sys

from PIL import Image, ImageChops, ImageDraw

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PUB = os.path.join(ROOT, "public")

NAVY = (10, 30, 90)
ORANGE = (245, 150, 10)
BG = (255, 255, 255)
SS = 4  # 슈퍼샘플링 — 비스듬한 선이 계단처럼 보이지 않게


def _hexagon(cx, cy, R):
    """위아래가 납작하고 좌우가 뾰족한 육각형"""
    return [
        (cx + R * math.cos(math.radians(60 * i)),
         cy + R * math.sin(math.radians(60 * i)))
        for i in range(6)
    ]


def _mask(size, fn):
    m = Image.new("L", size, 0)
    fn(ImageDraw.Draw(m))
    return m


def _star(cx, cy, R, r, rot=-90, n=5):
    pts = []
    for i in range(n * 2):
        a = math.radians(rot + i * 180 / n)
        rad = R if i % 2 == 0 else r
        pts.append((cx + rad * math.cos(a), cy + rad * math.sin(a)))
    return pts


def draw_logo(W=1024):
    """로고를 도형으로 다시 그린다 (진짜 파일이 없을 때만).

    육각 띠 두 겹 — 바깥은 오른쪽이, 안쪽은 왼쪽이 벌어져 있다 — 과
    오른쪽 위의 별.
    """
    S = (W * SS, W * SS)
    img = Image.new("RGBA", S, (0, 0, 0, 0))

    cx, cy = S[0] * 0.46, S[1] * 0.54
    R = S[0] * 0.42
    t = R * 0.27        # 띠 두께
    gap = R * 0.17      # 두 띠 사이 흰 틈
    slot = t * 0.95     # 벌어진 입의 높이

    outer = _mask(S, lambda d: d.polygon(_hexagon(cx, cy, R), fill=255))
    hole = _mask(S, lambda d: d.polygon(_hexagon(cx, cy, R - t), fill=255))
    ring1 = ImageChops.subtract(outer, hole)
    ring1 = ImageChops.subtract(ring1, _mask(S, lambda d: d.rectangle(
        [cx, cy - slot / 2, S[0], cy + slot / 2], fill=255)))

    R2 = R - t - gap
    outer2 = _mask(S, lambda d: d.polygon(_hexagon(cx, cy, R2), fill=255))
    hole2 = _mask(S, lambda d: d.polygon(_hexagon(cx, cy, R2 - t), fill=255))
    ring2 = ImageChops.subtract(outer2, hole2)
    ring2 = ImageChops.subtract(ring2, _mask(S, lambda d: d.rectangle(
        [0, cy - slot / 2, cx, cy + slot / 2], fill=255)))

    # 안쪽 글자의 가로 막대
    bar = _mask(S, lambda d: d.rectangle(
        [cx - slot * 0.2, cy - slot / 2, cx + R2, cy + slot / 2], fill=255))
    bar = ImageChops.multiply(bar, outer2)
    ring2 = ImageChops.lighter(ring2, bar)

    img.paste(Image.new("RGBA", S, NAVY + (255,)), (0, 0),
              ImageChops.lighter(ring1, ring2))

    st = _mask(S, lambda d: d.polygon(
        _star(S[0] * 0.815, S[1] * 0.145, S[0] * 0.115, S[0] * 0.115 * 0.40), fill=255))
    img.paste(Image.new("RGBA", S, ORANGE + (255,)), (0, 0), st)

    return img.resize((W, W), Image.LANCZOS)


def load_logo():
    """진짜 로고 파일이 있으면 그것을 쓴다 — 정사각 안에 여백까지 맞춰서."""
    for name in ("logo.png", "logo-src.png", "logo.webp"):
        p = os.path.join(PUB, name)
        if not os.path.exists(p):
            continue
        src = Image.open(p).convert("RGBA")
        # 그림이 실제로 차지하는 부분만 잘라낸다 (파일에 여백이 있을 수 있다)
        box = src.getbbox()
        if box:
            src = src.crop(box)
        side = max(src.size)
        canvas = Image.new("RGBA", (side, side), (0, 0, 0, 0))
        canvas.paste(src, ((side - src.width) // 2, (side - src.height) // 2))
        print(f"  {name} 을(를) 씁니다")
        return canvas.resize((1024, 1024), Image.LANCZOS)
    print("  로고 파일이 없어 도형으로 그립니다 (public/logo.png 를 두면 그걸 씁니다)")
    return draw_logo(1024)


def square(logo, size, inner=0.80, bg=BG):
    """정사각 아이콘 — 배경을 채우고 로고를 가운데 놓는다.

    `inner` 는 로고가 차지하는 비율이다. 안드로이드가 동그랗게 잘라내는
    판(maskable)은 **가장자리가 잘리므로** 더 작게 넣는다.
    """
    img = Image.new("RGB", (size, size), bg)
    w = int(size * inner)
    small = logo.resize((w, w), Image.LANCZOS)
    img.paste(small, ((size - w) // 2, (size - w) // 2), small)
    return img


def main():
    os.makedirs(PUB, exist_ok=True)
    logo = load_logo()

    out = [
        ("icon-192.png", 192, 0.86),
        ("icon-512.png", 512, 0.86),
        # 잘려나갈 것을 감안해 안쪽 62% 에만 그린다 (안전 영역 80% 의 안쪽)
        ("icon-192-maskable.png", 192, 0.62),
        ("icon-512-maskable.png", 512, 0.62),
        # 아이폰은 투명을 검게 칠한다. 그래서 흰 바탕으로 굽는다
        ("apple-touch-icon.png", 180, 0.84),
        ("favicon.png", 64, 0.90),
    ]
    for name, size, inner in out:
        square(logo, size, inner).save(os.path.join(PUB, name))
        print(f"  {name}  {size}x{size}")

    # 원본도 남겨둔다 — 나중에 어디에 쓸지 모른다
    logo.save(os.path.join(PUB, "logo-1024.png"))
    print("  logo-1024.png  1024x1024 (투명 배경)")


if __name__ == "__main__":
    sys.exit(main())
