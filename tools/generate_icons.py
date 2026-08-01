import math
import os
import struct
import zlib


ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "icons")


def clamp(value, low=0, high=255):
    return max(low, min(high, int(round(value))))


def mix(a, b, t):
    return tuple(a[i] + (b[i] - a[i]) * t for i in range(4))


def blend(dst, src):
    sa = src[3] / 255
    da = dst[3] / 255
    out_a = sa + da * (1 - sa)
    if out_a == 0:
        return (0, 0, 0, 0)
    return tuple(
        clamp((src[i] * sa + dst[i] * da * (1 - sa)) / out_a) for i in range(3)
    ) + (clamp(out_a * 255),)


def write_png(path, width, height, pixels):
    raw = bytearray()
    for y in range(height):
        raw.append(0)
        row = pixels[y * width:(y + 1) * width]
        for pixel in row:
            raw.extend(bytes(pixel))

    def chunk(kind, data):
        return (
            struct.pack(">I", len(data))
            + kind
            + data
            + struct.pack(">I", zlib.crc32(kind + data) & 0xFFFFFFFF)
        )

    data = b"".join([
        b"\x89PNG\r\n\x1a\n",
        chunk(b"IHDR", struct.pack(">IIBBBBB", width, height, 8, 6, 0, 0, 0)),
        chunk(b"IDAT", zlib.compress(bytes(raw), 9)),
        chunk(b"IEND", b""),
    ])
    with open(path, "wb") as file:
        file.write(data)


def canvas(width, height, color=(0, 0, 0, 0)):
    return [color for _ in range(width * height)]


def put(pixels, width, height, x, y, color):
    if 0 <= x < width and 0 <= y < height:
        index = y * width + x
        pixels[index] = blend(pixels[index], color)


def rounded_rect(pixels, width, height, x0, y0, x1, y1, radius, color):
    x0, y0, x1, y1, radius = map(float, (x0, y0, x1, y1, radius))
    for y in range(max(0, int(y0) - 2), min(height, int(y1) + 3)):
        for x in range(max(0, int(x0) - 2), min(width, int(x1) + 3)):
            px = x + 0.5
            py = y + 0.5
            cx = min(max(px, x0 + radius), x1 - radius)
            cy = min(max(py, y0 + radius), y1 - radius)
            dist = math.hypot(px - cx, py - cy)
            if px >= x0 + radius and px <= x1 - radius and py >= y0 and py <= y1:
                dist = 0
            if py >= y0 + radius and py <= y1 - radius and px >= x0 and px <= x1:
                dist = 0
            alpha = max(0, min(1, radius + 0.75 - dist))
            if alpha > 0:
                put(pixels, width, height, x, y, color[:3] + (clamp(color[3] * alpha),))


def circle(pixels, width, height, cx, cy, radius, color):
    for y in range(max(0, int(cy - radius - 2)), min(height, int(cy + radius + 3))):
        for x in range(max(0, int(cx - radius - 2)), min(width, int(cx + radius + 3))):
            dist = math.hypot(x + 0.5 - cx, y + 0.5 - cy)
            alpha = max(0, min(1, radius + 0.75 - dist))
            if alpha > 0:
                put(pixels, width, height, x, y, color[:3] + (clamp(color[3] * alpha),))


def dist_to_segment(px, py, ax, ay, bx, by):
    dx = bx - ax
    dy = by - ay
    if dx == 0 and dy == 0:
        return math.hypot(px - ax, py - ay)
    t = max(0, min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)))
    return math.hypot(px - (ax + t * dx), py - (ay + t * dy))


def polyline(pixels, width, height, points, thickness, color):
    pad = int(thickness + 3)
    min_x = max(0, int(min(point[0] for point in points)) - pad)
    max_x = min(width, int(max(point[0] for point in points)) + pad)
    min_y = max(0, int(min(point[1] for point in points)) - pad)
    max_y = min(height, int(max(point[1] for point in points)) + pad)
    radius = thickness / 2
    for y in range(min_y, max_y):
        for x in range(min_x, max_x):
            d = min(dist_to_segment(x + 0.5, y + 0.5, *points[i], *points[i + 1]) for i in range(len(points) - 1))
            alpha = max(0, min(1, radius + 0.75 - d))
            if alpha > 0:
                put(pixels, width, height, x, y, color[:3] + (clamp(color[3] * alpha),))
    for point in points:
        circle(pixels, width, height, point[0], point[1], radius, color)


def icon_pixels(size):
    pixels = canvas(size, size)
    teal = (0, 231, 167, 255)
    cyan = (6, 182, 212, 255)
    purple = (139, 92, 246, 255)
    navy = (15, 23, 42, 255)
    for y in range(size):
        for x in range(size):
            t = (x + y) / (size * 2)
            base = mix(teal, cyan, min(t * 1.7, 1))
            if t > 0.48:
                base = mix(cyan, purple, min((t - 0.48) * 2.4, 1))
            if t > 0.78:
                base = mix(purple, navy, min((t - 0.78) * 3.8, 1))
            pixels[y * size + x] = tuple(clamp(v) for v in base)

    rounded_rect(pixels, size, size, size * 0.13, size * 0.18, size * 0.87, size * 0.84, size * 0.13, (255, 255, 255, 42))
    rounded_rect(pixels, size, size, size * 0.18, size * 0.42, size * 0.88, size * 0.75, size * 0.12, (255, 255, 255, 235))
    rounded_rect(pixels, size, size, size * 0.27, size * 0.33, size * 0.72, size * 0.52, size * 0.08, (255, 255, 255, 190))
    rounded_rect(pixels, size, size, size * 0.61, size * 0.53, size * 0.84, size * 0.66, size * 0.06, (15, 23, 42, 230))
    circle(pixels, size, size, size * 0.62, size * 0.595, size * 0.024, (255, 214, 102, 255))
    circle(pixels, size, size, size * 0.69, size * 0.38, size * 0.11, (216, 162, 27, 255))
    circle(pixels, size, size, size * 0.69, size * 0.38, size * 0.075, (255, 224, 138, 210))
    polyline(
        pixels,
        size,
        size,
        [(size * 0.28, size * 0.66), (size * 0.43, size * 0.57), (size * 0.52, size * 0.61), (size * 0.68, size * 0.49)],
        max(3, size * 0.038),
        (0, 216, 255, 235),
    )
    polyline(pixels, size, size, [(size * 0.66, size * 0.49), (size * 0.73, size * 0.50), (size * 0.70, size * 0.57)], max(2, size * 0.028), (0, 216, 255, 235))
    return pixels


def splash_pixels(width, height):
    pixels = canvas(width, height)
    top = (2, 6, 23, 255)
    mid = (15, 118, 110, 255)
    blue = (29, 78, 216, 255)
    bottom = (17, 24, 39, 255)
    for y in range(height):
        t = y / max(height - 1, 1)
        if t < 0.45:
            color = mix(top, mid, t / 0.45)
        elif t < 0.72:
            color = mix(mid, blue, (t - 0.45) / 0.27)
        else:
            color = mix(blue, bottom, (t - 0.72) / 0.28)
        for x in range(width):
            pixels[y * width + x] = tuple(clamp(v) for v in color)

    mark = icon_pixels(220)
    left = (width - 220) // 2
    top_y = int(height * 0.36)
    for y in range(220):
        for x in range(220):
            put(pixels, width, height, left + x, top_y + y, mark[y * 220 + x])
    return pixels


def main():
    os.makedirs(OUT, exist_ok=True)
    for name, size in {
        "icon-512.png": 512,
        "icon-192.png": 192,
        "apple-touch-icon.png": 180,
        "icon-96.png": 96,
        "favicon.png": 32,
    }.items():
        write_png(os.path.join(OUT, name), size, size, icon_pixels(size))
    write_png(os.path.join(OUT, "splash-640x1136.png"), 640, 1136, splash_pixels(640, 1136))


if __name__ == "__main__":
    main()
