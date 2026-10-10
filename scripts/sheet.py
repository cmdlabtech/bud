import sys
from PIL import Image
out_path, files = sys.argv[1], sys.argv[2:]
W, H = 576, 288
out = Image.new('RGBA', (W * 2 + 10, (H + 10) * ((len(files) + 1) // 2)), (40, 40, 40, 255))
for i, f in enumerate(files):
    bg = Image.new('RGBA', (W, H), (0, 0, 0, 255)); bg.alpha_composite(Image.open(f).convert('RGBA'))
    out.paste(bg, ((i % 2) * (W + 10), (i // 2) * (H + 10)))
out.save(out_path)
