from PIL import Image, ImageDraw
from pathlib import Path

out = Path("public/icons")
out.mkdir(parents=True, exist_ok=True)
S = 512
img = Image.new("RGBA", (S, S), (0, 0, 0, 0))
d = ImageDraw.Draw(img)

brand = (234, 88, 12, 255)
brand_dark = (194, 65, 12, 255)
white = (255, 255, 255, 255)

# Fondo redondeado
d.rounded_rectangle([0, 0, S, S], radius=112, fill=brand)
d.rounded_rectangle([0, 360, S, S], radius=112, fill=brand_dark)
d.rectangle([0, 360, S, 380], fill=brand_dark)

# Recibo blanco
left, top, right = 146, 96, 366
body_bottom = 372
d.rounded_rectangle([left, top, right, body_bottom], radius=26, fill=white)

# Borde inferior en zigzag
tooth = 28
points = [(left, body_bottom - 8)]
x = left
down = True
while x < right:
    x2 = min(x + tooth, right)
    points.append((x2, body_bottom + 26 if down else body_bottom - 8))
    down = not down
    x = x2
points.append((right, body_bottom - 8))
d.polygon(points, fill=white)

# Líneas de texto
line_color = (254, 215, 170, 255)
for i, y in enumerate([150, 196, 242]):
    d.rounded_rectangle([186, y, 326 - i * 26, y + 16], radius=8, fill=line_color)
d.rounded_rectangle([186, 300, 286, 320], radius=8, fill=(251, 146, 60, 255))

# Chispa "IA"
d.polygon(
    [(392, 96), (404, 130), (438, 142), (404, 154), (392, 188), (380, 154), (346, 142), (380, 130)],
    fill=white,
)

img.save(out / "icon-512.png")
img.resize((192, 192), Image.LANCZOS).save(out / "icon-192.png")
print("OK", out / "icon-512.png", out / "icon-192.png")
