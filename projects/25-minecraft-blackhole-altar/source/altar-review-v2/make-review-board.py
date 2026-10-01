from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent
REVIEW = ROOT / 'review'
items = [
    ('01-overall-clean.png', '01  整体结构 / 关闭黑洞'),
    ('03-rear-clean.png', '02  背面结构 / 对称双冠环'),
    ('05-grounded-pier-detail.png', '03  主柱与落地扶壁'),
    ('06-stair-landings.png', '04  四向楼梯与休息平台'),
    ('07-sanctuary-detail.png', '05  中央祭坛与守卫柱'),
    ('08-front-arcades.png', '06  拱龛、壁柱与入口拱门'),
]
board = Image.new('RGB', (1920, 1920), '#15191c')
draw = ImageDraw.Draw(board)
bold = ImageFont.truetype('C:/Windows/Fonts/msyhbd.ttc', 42)
normal = ImageFont.truetype('C:/Windows/Fonts/msyh.ttc', 24)
draw.text((40, 26), '黑洞祭坛 V2 | 成品审阅', font=bold, fill='#f5f6f7')
draw.text((42, 87), '实际游戏截图；先审阅结构，确认后再规划施工拍摄。', font=normal, fill='#c2c8ce')
for i, (name, label) in enumerate(items):
    x, y = 24+(i%2)*948, 145+(i//2)*582
    frame = Image.open(REVIEW/name).convert('RGB')
    frame.thumbnail((924, 520), Image.Resampling.LANCZOS)
    board.paste(frame, (x+(924-frame.width)//2, y))
    draw.text((x+8, y+528), label, font=normal, fill='#e5c984')
board.save(REVIEW/'V2-review-board.jpg', quality=94)
print(REVIEW/'V2-review-board.jpg')
