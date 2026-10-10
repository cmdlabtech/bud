# 24x24 1-bit store icon, built on a 12x12 grid scaled x2 so every lit pixel is part of a
# 2x2 block (Even portal icon editor rule). Speech bubble with three dots: "talk to your bots".
from PIL import Image
GRID = """
.XXXXXXXXXX.
X..........X
X..........X
X..........X
X.XX.XX.XX.X
X.XX.XX.XX.X
X..........X
X..........X
.XXXXXXXXXX.
..XX........
..X.........
.X..........
""".strip().splitlines()
assert len(GRID) == 12 and all(len(r) == 12 for r in GRID)
img = Image.new('1', (24, 24), 0)
for y, row in enumerate(GRID):
    for x, c in enumerate(row):
        if c == 'X':
            for dy in (0, 1):
                for dx in (0, 1):
                    img.putpixel((2 * x + dx, 2 * y + dy), 1)
# validate: every lit pixel belongs to some fully lit 2x2 block
px = img.load()
def in_block(x, y):
    for ox in (-1, 0):
        for oy in (-1, 0):
            xs, ys = x + ox, y + oy
            if 0 <= xs < 23 and 0 <= ys < 23 and all(px[xs + a, ys + b] for a in (0, 1) for b in (0, 1)):
                return True
    return False
bad = [(x, y) for y in range(24) for x in range(24) if px[x, y] and not in_block(x, y)]
assert not bad, bad
img.save('icon-24.png')
img.resize((240, 240), Image.NEAREST).save('icon-24-preview-x10.png')
with open('icon-24.txt', 'w') as f:
    for y in range(24):
        f.write(''.join('#' if px[x, y] else '.' for x in range(24)) + '\n')
print('icon ok: 24x24, 1-bit, all lit pixels in 2x2 blocks')
