"""One bounded metadata and four-frame inspection of the actual exported film."""

import io
import json
from pathlib import Path
import re
import subprocess

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]
FFMPEG = ROOT / "tools/python/imageio_ffmpeg/binaries/ffmpeg-win-x86_64-v7.1.exe"
VIDEO = ROOT / "BlackHoleAltar_1080p60.mp4"

result = subprocess.run(
    [str(FFMPEG), "-hide_banner", "-i", str(VIDEO), "-t", "0", "-f", "null", "-"],
    capture_output=True, text=True, check=True,
)
(ROOT / "export-metadata.txt").write_text(result.stderr, encoding="utf-8")
duration = re.search(r"Duration: (\d+):(\d+):(\d+\.\d+)", result.stderr)
if not duration:
    raise RuntimeError("The export does not expose a valid duration.")
hours, minutes, seconds = map(float, duration.groups())
total = hours * 3600 + minutes * 60 + seconds
if "1920x1080" not in result.stderr or "60 fps" not in result.stderr:
    raise RuntimeError("Export dimensions or frame rate do not match the required format.")
if abs(total - 507.65) > .1:
    raise RuntimeError(f"Unexpected export duration: {total}")
if "Audio: aac" not in result.stderr:
    raise RuntimeError("No AAC audio stream was found.")

times = [3, 98, 347, 501]
sheet = Image.new("RGB", (1280, 772), "#151515")
draw = ImageDraw.Draw(sheet)
font = ImageFont.truetype("C:/Windows/Fonts/consola.ttf", 20)
for i, t in enumerate(times):
    frame = subprocess.run(
        [str(FFMPEG), "-hide_banner", "-loglevel", "error",
         "-ss", str(t), "-i", str(VIDEO),
         "-frames:v", "1", "-vf", "scale=640:360",
         "-f", "image2pipe", "-vcodec", "png", "-"],
        check=True, capture_output=True
    )
    x, y = i % 2 * 640, i // 2 * 386
    sheet.paste(Image.open(io.BytesIO(frame.stdout)), (x, y))
    draw.text((x + 8, y + 362), f"Export {t // 60:02d}:{t % 60:02d}", font=font, fill="white")
sheet.save(ROOT / "export-contact-sheet.jpg", quality=94)
report = {
    "export": str(VIDEO),
    "bytes": VIDEO.stat().st_size,
    "durationSeconds": total,
    "resolution": "1920x1080",
    "fps": 60,
    "audioCodec": "aac",
    "inspectedFrameTimes": times,
    "scope": "Metadata and four decoded frames only; not a full playback audit.",
}
(ROOT / "export-check.json").write_text(json.dumps(report, indent=2), encoding="utf-8")
print(json.dumps(report, indent=2))
