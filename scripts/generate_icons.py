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

# Fondo redondeado con franja inferior
d.rounded_rectangle([0, 0, S, S], radius=112, fill=brand)
d.rounded_rectangle([0, 360, S, S], radius=112, fill=brand_dark)
d.rectangle([0, 360, S, 380], fill=brand_dark)

# Lista de tareas
d.rounded_rectangle([118, 88, 394, 424], radius=32, fill=white)

rows = [(160, 148), (160, 248), (160, 348)]
for index, (x, y) in enumerate(rows):
    # Casilla
    d.rounded_rectangle([x, y, x + 46, y + 46], radius=12, outline=(231, 229, 228, 255), width=6)
    if index < 2:
        d.rounded_rectangle([x + 4, y + 4, x + 42, y + 42], radius=9, fill=brand)
        # Palomita
        d.line([(x + 13, y + 23), (x + 21, y + 31), (x + 35, y + 14)], fill=white, width=8, joint="curve")
    # Líneas de texto
    width = 150 if index != 2 else 110
    d.rounded_rectangle([x + 66, y + 12, x + 66 + width, y + 30], radius=9, fill=(254, 215, 170, 255))
    d.rounded_rectangle([x + 66, y + 34, x + 66 + width - 34, y + 44], radius=6, fill=(251, 146, 60, 255))

# Chispa de IA
d.polygon(
    [(330, 74), (340, 100), (366, 110), (340, 120), (330, 146), (320, 120), (294, 110), (320, 100)],
    fill=white,
)

img.save(out / "icon-512.png")
img.resize((192, 192), Image.LANCZOS).save(out / "icon-192.png")
print("OK", out / "icon-512.png", out / "icon-192.png")
