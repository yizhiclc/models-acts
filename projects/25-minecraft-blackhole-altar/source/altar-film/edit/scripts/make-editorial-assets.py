"""Generate full-resolution film graphics and a locally synthesized score."""

import argparse
from functools import lru_cache
import io
import json
import math
from pathlib import Path
import subprocess
import wave

import numpy as np
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]
ASSETS = ROOT / "assets"
ASSETS.mkdir(exist_ok=True)
FFMPEG = ROOT / "tools/python/imageio_ffmpeg/binaries/ffmpeg-win-x86_64-v7.1.exe"
PLAN = json.loads((ROOT / "edit-plan.json").read_text(encoding="utf-8"))
DURATION = PLAN["durationSeconds"]
STAGES = PLAN["stages"]
W, H = 1920, 1080
BOTTOM_H = 236
GRAPHICS_FPS = 30
GOLD = (231, 199, 113, 255)
WHITE = (248, 249, 251, 255)
MUTED = (210, 216, 222, 255)
FONT_REGULAR = "C:/Windows/Fonts/msyh.ttc"
FONT_BOLD = "C:/Windows/Fonts/msyhbd.ttc"
FONT_MONO = "C:/Windows/Fonts/consola.ttf"
DESCRIPTIONS = [
    "确定仪式中轴，铺出通往圣坛的第一条路径",
    "铺设广场边界与承重网格，建立巨型高台的底座",
    "逐层砌起退台石墙，让体量从地面向中央收拢",
    "继续抬升平台，在顶部形成完整的仪式空间",
    "四面石阶贯通高台，栏杆勾勒攀登与巡行路线",
    "四座方尖塔拔地而起，巨型支墩托起上方冠环",
    "两侧拱段向顶部合拢，以楔石完成冠环轮廓",
    "金色浮雕、八向地纹与灯光逐一补齐",
    "砌起黑曜石基座，为中央核心留出悬浮位置",
    "核心开启，吸积盘与光线偏折显现",
]
TITLE = "黑洞祭坛"


@lru_cache(maxsize=16)
def font(size, bold=False, mono=False):
    return ImageFont.truetype(
        FONT_MONO if mono else FONT_BOLD if bold else FONT_REGULAR, size
    )


def smooth(value):
    value = np.clip(value, 0, 1)
    return value * value * (3 - 2 * value)


def timecode(seconds):
    millis = round(seconds * 1000)
    return f"{millis // 3600000:02d}:{millis // 60000 % 60:02d}:{millis // 1000 % 60:02d},{millis % 1000:03d}"


def text_assets():
    entries = []
    for stage, description in zip(STAGES, DESCRIPTIONS):
        stage["description"] = description
        a, b = stage["startSeconds"], stage["endSeconds"]
        entries.append((a, min(a + 10, b), stage["title"] + "\n" + description))
        if b > a + 10:
            entries.append((a + 10, b, stage["title"]))
    srt = "\n\n".join(
        f"{i + 1}\n{timecode(a)} --> {timecode(b)}\n{text}"
        for i, (a, b, text) in enumerate(entries)
    ) + "\n"
    (ASSETS / "components_zh.srt").write_text(srt, encoding="utf-8-sig")
    (ASSETS / "component-copy.json").write_text(
        json.dumps(STAGES, ensure_ascii=False, indent=2), encoding="utf-8"
    )


def make_plate(index, full_description):
    image = Image.new("RGBA", (W, BOTTOM_H), (0, 0, 0, 0))
    data = np.zeros((BOTTOM_H, W, 4), dtype=np.uint8)
    data[:, :, :3] = (6, 10, 14)
    y = np.linspace(0, 1, BOTTOM_H)
    data[:, :, 3] = np.round(208 * smooth(y / 0.7))[:, None].astype(np.uint8)
    image = Image.fromarray(data, "RGBA")
    d = ImageDraw.Draw(image)
    stage = STAGES[index]
    d.rectangle((76, 50, 80, 132), fill=GOLD)
    label = f"建造阶段  {index + 1:02d} / 10"
    if index == 9:
        label = "最终呈现  10 / 10"
    d.text((100, 44), label, font=font(21), fill=GOLD)
    d.text((98, 80), stage["title"], font=font(38, bold=True), fill=WHITE)
    if full_description:
        d.text((100, 135), DESCRIPTIONS[index], font=font(23), fill=MUTED)
    return image


def graphics():
    text_assets()
    plates = [make_plate(i, False) for i in range(10)]
    detail_plates = [make_plate(i, True) for i in range(10)]
    for i, plate in enumerate(detail_plates):
        canvas = Image.new("RGBA", (W, H), (0, 0, 0, 0))
        canvas.alpha_composite(plate, (0, H - BOTTOM_H))
        canvas.save(ASSETS / f"component_{i + 1:02d}.png")

    title = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(title)
    d.text((76, 72), TITLE, font=font(62, bold=True), fill=WHITE,
           stroke_width=1, stroke_fill=(10, 15, 19, 190))
    d.text((80, 154), "建造纪实  /  BLACK HOLE ALTAR", font=font(23),
           fill=(239, 240, 243, 255), stroke_width=1, stroke_fill=(10, 15, 19, 160))
    title.save(ASSETS / "opening-title.png")

    out = ASSETS / "construction_graphics_alpha.mov"
    count = math.ceil(DURATION * GRAPHICS_FPS)
    command = [
        str(FFMPEG), "-hide_banner", "-loglevel", "error", "-y",
        "-f", "rawvideo", "-pixel_format", "rgba",
        "-video_size", f"{W}x{BOTTOM_H}", "-framerate", str(GRAPHICS_FPS),
        "-i", "-", "-vf", f"pad={W}:{H}:0:{H - BOTTOM_H}:color=0x00000000",
        "-c:v", "qtrle", "-pix_fmt", "argb", "-an", str(out),
    ]
    index = 0
    with (ROOT / "graphics-encode.log").open("w", encoding="utf-8") as log:
        proc = subprocess.Popen(command, stdin=subprocess.PIPE, stderr=log)
        try:
            for frame in range(count):
                t = frame / GRAPHICS_FPS
                while index < 9 and t >= STAGES[index]["endSeconds"]:
                    index += 1
                local = t - STAGES[index]["startSeconds"]
                remain = STAGES[index]["endSeconds"] - t
                plate = detail_plates[index] if local < 9 else plates[index]
                image = plate.copy()
                # Dissolve just the description during its last second.
                if 9 <= local < 10:
                    image = Image.blend(detail_plates[index], plates[index], local - 9)
                d = ImageDraw.Draw(image)
                x0, x1, ybar = 76, 1844, 201
                d.rectangle((x0, ybar, x1, ybar + 3), fill=(132, 140, 149, 160))
                progress = min(1.0, t / (DURATION - 2))
                length = (x1 - x0) * progress
                whole = int(length)
                if whole:
                    d.rectangle((x0, ybar, x0 + whole, ybar + 3), fill=GOLD)
                fraction = length - whole
                if fraction and x0 + whole + 1 <= x1:
                    d.line((x0 + whole + 1, ybar, x0 + whole + 1, ybar + 3),
                           fill=(231, 199, 113, round(fraction * 255)))
                for other in STAGES[1:]:
                    tick = x0 + (x1 - x0) * other["startSeconds"] / DURATION
                    d.line((tick, ybar - 3, tick, ybar + 6), fill=(236, 240, 244, 160))
                elapsed = f"{int(t) // 60:02d}:{int(t) % 60:02d}"
                percent = min(100, int(progress * 100))
                d.text((1844, 146), f"{percent:3d}%   {elapsed} / 08:28",
                       font=font(22, mono=True), anchor="ra", fill=MUTED)
                # Fade chapter changes without changing the camera or source footage.
                opacity = min(float(smooth(local / .45)),
                              float(smooth(remain / .35)))
                if opacity < 1:
                    image.putalpha(image.getchannel("A").point(
                        [round(a * opacity) for a in range(256)]
                    ))
                if frame in (90, 60 * GRAPHICS_FPS, 460 * GRAPHICS_FPS):
                    preview = Image.new("RGBA", (W, H), (0, 0, 0, 0))
                    preview.alpha_composite(image, (0, H - BOTTOM_H))
                    preview.save(ASSETS / f"graphics-preview-{round(t):03d}.png")
                proc.stdin.write(image.tobytes())
                if frame % (GRAPHICS_FPS * 60) == 0:
                    print(f"Graphics {t:.0f}/{DURATION:.0f}s", flush=True)
            proc.stdin.close()
            code = proc.wait()
            if code:
                raise RuntimeError(f"Graphics encoder exited {code}; see graphics-encode.log")
        except BaseException:
            if proc.poll() is None:
                proc.terminate()
                proc.wait()
            raise
    print(f"Graphics complete: {out}", flush=True)


def music():
    sample_rate = 48000
    n = round(DURATION * sample_rate)
    score = np.zeros((n, 2), dtype=np.float32)
    rng = np.random.default_rng(20260912)

    def add_note(start, length, midi, gain, pan=0, kind="pad"):
        first = max(0, round(start * sample_rate))
        last = min(n, round((start + length) * sample_rate))
        if last <= first:
            return
        t = np.arange(last - first, dtype=np.float32) / sample_rate
        hz = 440 * 2 ** ((midi - 69) / 12)
        phase = float(rng.uniform(0, 2 * np.pi))
        if kind == "pad":
            env = smooth(t / 2.8) * smooth((length - t) / 4.5)
            signal = (
                np.sin(2 * np.pi * hz * t + phase)
                + .23 * np.sin(2 * np.pi * hz * 1.0015 * t + phase + .6)
                + .13 * np.sin(2 * np.pi * hz * 2 * t + phase)
            ) * env
        elif kind == "bell":
            env = (1 - np.exp(-t * 35)) * np.exp(-t * 1.3) * smooth((length - t) / .4)
            signal = (
                np.sin(2 * np.pi * hz * t)
                + .28 * np.sin(2 * np.pi * hz * 2 * t) * np.exp(-t * 2)
                + .09 * np.sin(2 * np.pi * hz * 3 * t) * np.exp(-t * 3)
            ) * env
        else:
            env = (1 - np.exp(-t * 20)) * np.exp(-t * 4) * smooth((length - t) / .2)
            signal = np.sin(2 * np.pi * hz * t) * env
        signal = signal.astype(np.float32) * gain
        score[first:last, 0] += signal * math.sqrt((1 - pan) / 2)
        score[first:last, 1] += signal * math.sqrt((1 + pan) / 2)

    beat = 60 / 72
    bar = beat * 4
    harmony = [
        [38, 50, 57, 60, 64],
        [34, 46, 53, 57, 60],
        [41, 53, 57, 60, 67],
        [36, 48, 55, 62, 67],
    ]
    chord_span = bar * 4
    for chord_index, start in enumerate(np.arange(0, DURATION, chord_span)):
        chord = harmony[chord_index % len(harmony)]
        for j, note in enumerate(chord):
            add_note(start - .5 if start else 0, chord_span + 3.5,
                     note, .052 if j else .075, (j - 2) * .23)
        if chord_index % 4 == 0:
            print(f"Music harmony {start:.0f}/{DURATION:.0f}s", flush=True)
    melody_offsets = [0, 2, 3, 1, 2, 4, 3, 2]
    for i, start in enumerate(np.arange(16 * beat, DURATION - 8, 2 * beat)):
        chord = harmony[int(start // chord_span) % 4]
        phase = next(s for s in STAGES if start < s["endSeconds"])
        density = .018 if phase["index"] < 6 else .026
        if i % 8 in (3, 7):
            continue
        note = chord[1:][melody_offsets[i % len(melody_offsets)] % 4] + 12
        add_note(start, 3.5, note, density, math.sin(i * .71) * .62, "bell")
    for i, start in enumerate(np.arange(45, DURATION - 9, 2 * beat)):
        chord = harmony[int(start // chord_span) % 4]
        add_note(start, .8, chord[0], .041 if start < 395 else .05, 0, "pulse")

    # A finite, stereo cross-delay adds space without external samples.
    for delay, gain in [(0.23, .14), (.47, .09), (.71, .05)]:
        offset = round(delay * sample_rate)
        score[offset:, 0] += score[:-offset, 1] * gain
        score[offset:, 1] += score[:-offset, 0] * gain
    for first in range(0, n, sample_rate * 10):
        last = min(n, first + sample_rate * 10)
        t = np.arange(first, last, dtype=np.float32) / sample_rate
        envelope = smooth(t / 8) * smooth((DURATION - t) / 9)
        score[first:last] *= envelope[:, None]
    peak = float(np.max(np.abs(score)))
    score *= .48 / max(peak, 1e-9)
    raw = ASSETS / "Eventide_Altar_synth_raw.wav"
    with wave.open(str(raw), "wb") as out:
        out.setnchannels(2)
        out.setsampwidth(2)
        out.setframerate(sample_rate)
        for first in range(0, n, sample_rate * 10):
            block = score[first:first + sample_rate * 10]
            out.writeframes((np.clip(block, -1, 1) * 32767).astype("<i2").tobytes())
    out = ASSETS / "Eventide_Altar_music.wav"
    result = subprocess.run(
        [str(FFMPEG), "-hide_banner", "-y", "-i", str(raw),
         "-af", "loudnorm=I=-21:TP=-2:LRA=8:print_format=json",
         "-ar", "48000", "-c:a", "pcm_s24le", "-t", str(DURATION), str(out)],
        capture_output=True, text=True, check=True
    )
    (ASSETS / "music-loudness.txt").write_text(result.stderr, encoding="utf-8")
    (ASSETS / "MUSIC-NOTES.md").write_text(
        "# Eventide / Altar\n\n"
        "Locally generated instrumental score for this construction film.\n"
        "Method: seeded additive synthesis; no downloaded recordings or samples.\n"
        "72 BPM; slow pads, sparse bell tones, and restrained low pulses.\n"
        "Stereo, 48 kHz, 24-bit PCM; fades at both ends.\n"
        "Normalization target: -21 LUFS, true peak at most -2 dBTP.\n"
        "The source game recording is effectively silent (-91 dBFS peak).\n"
        "This is a synthesized soundtrack, not a licensed commercial song.\n",
        encoding="utf-8"
    )
    print(f"Music complete: {out}", flush=True)


def preview():
    result = subprocess.run(
        [str(FFMPEG), "-hide_banner", "-loglevel", "error",
         "-ss", str(PLAN["sourceInSeconds"] + 60), "-i", PLAN["source"],
         "-frames:v", "1", "-f", "image2pipe", "-vcodec", "png", "-"],
        check=True, capture_output=True
    )
    image = Image.open(io.BytesIO(result.stdout)).convert("RGBA")
    image.alpha_composite(Image.open(ASSETS / "graphics-preview-060.png"))
    image.convert("RGB").save(ROOT / "edit-preview.jpg", quality=93)
    print(ROOT / "edit-preview.jpg")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("mode", choices=["graphics", "music", "preview"])
    mode = parser.parse_args().mode
    {"graphics": graphics, "music": music, "preview": preview}[mode]()
