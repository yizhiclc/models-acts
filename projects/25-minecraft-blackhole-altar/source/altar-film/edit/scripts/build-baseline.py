"""Prepare a reversible, real-time construction edit for Premiere Pro."""

import json
from pathlib import Path
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT.parent / "recording" / "2026-09-12 10-42-01.mp4"
FPS = 60
SOURCE_FRAMES = 37413
SEQUENCE_NAME = "BlackHole Altar - Construction Baseline - 1080p60"

# OBS recording start: 10:42:01.843. Stage timestamps are from the game log.
# The foundation phase ran longer than its blueprint duration. Do not remove it.
SOURCE_BOUNDARIES_SECONDS = [
    29.751, 44.799, 122.349, 197.350, 257.399, 302.399,
    372.399, 437.399, 482.399, 512.399, 537.400,
]
LABELS = [
    ("\u573a\u5730\u8f74\u7ebf\u4e0e\u5165\u53e3\u8fb9\u754c", "Site axis and entrance"),
    ("\u5e7f\u573a\u4e0e\u57fa\u7840\u627f\u91cd", "Plaza and structural footing"),
    ("\u4e0b\u5c42\u53f0\u5730", "Lower monumental terraces"),
    ("\u4e0a\u5c42\u5e73\u53f0\u4e0e\u5723\u575b\u53f0\u9762", "Upper terraces and sanctuary deck"),
    ("\u56db\u5411\u697c\u68af\u4e0e\u680f\u6746", "Stairways and balustrades"),
    ("\u65b9\u5c16\u5854\u4e0e\u51a0\u73af\u627f\u91cd", "Obelisks and crown foundations"),
    ("\u51a0\u73af\u62f1\u9876\u4e0e\u9876\u90e8\u6954\u77f3", "Crown arch and keystone"),
    ("\u91d1\u8272\u7eb9\u6837\u4e0e\u7167\u660e", "Gilded relief and ceremonial lights"),
    ("\u4e2d\u592e\u796d\u575b\u4e0e\u6838\u5fc3", "Central altar and ceremonial core"),
    ("\u9ed1\u6d1e\u4e0e\u5438\u79ef\u76d8\u63ed\u793a", "Black hole and accretion disk reveal"),
]
boundaries = [round(t * FPS) for t in SOURCE_BOUNDARIES_SECONDS]
total_frames = boundaries[-1] - boundaries[0]
stages = [
    {
        "index": i + 1,
        "title": label[0],
        "english": label[1],
        "sourceInFrame": boundaries[i],
        "sourceOutFrame": boundaries[i + 1],
        "startFrame": boundaries[i] - boundaries[0],
        "endFrame": boundaries[i + 1] - boundaries[0],
        "startSeconds": (boundaries[i] - boundaries[0]) / FPS,
        "endSeconds": (boundaries[i + 1] - boundaries[0]) / FPS,
        "speed": 1.0,
    }
    for i, label in enumerate(LABELS)
]


def node(parent, tag, value=None, **attrs):
    child = ET.SubElement(parent, tag, attrs)
    if value is not None:
        child.text = str(value)
    return child


def rate(parent):
    r = node(parent, "rate")
    node(r, "timebase", FPS)
    node(r, "ntsc", "FALSE")


def video_characteristics(parent):
    c = node(parent, "samplecharacteristics")
    rate(c)
    node(c, "width", 1920)
    node(c, "height", 1080)
    node(c, "anamorphic", "FALSE")
    node(c, "pixelaspectratio", "square")
    node(c, "fielddominance", "none")


root = ET.Element("xmeml", version="4")
seq = node(root, "sequence", id="altar-baseline")
node(seq, "name", SEQUENCE_NAME)
node(seq, "duration", total_frames)
rate(seq)
timecode = node(seq, "timecode")
rate(timecode)
node(timecode, "string", "00:00:00:00")
node(timecode, "frame", 0)
node(timecode, "displayformat", "NDF")
media = node(seq, "media")
video = node(media, "video")
video_characteristics(node(video, "format"))
vtrack = node(video, "track")
audio = node(media, "audio")
node(audio, "numOutputChannels", 2)
achar = node(node(audio, "format"), "samplecharacteristics")
node(achar, "depth", 16)
node(achar, "samplerate", 48000)
atracks = [node(audio, "track"), node(audio, "track")]


def add_clip(track, stage, kind, channel=1, full_file=False):
    prefix = "v" if kind == "video" else f"a{channel}"
    c = node(track, "clipitem", id=f"{prefix}-{stage['index']}")
    node(c, "name", f"{stage['index']:02d} | {stage['title']}")
    node(c, "enabled", "TRUE")
    node(c, "duration", SOURCE_FRAMES)
    rate(c)
    for tag, key in [
        ("start", "startFrame"), ("end", "endFrame"),
        ("in", "sourceInFrame"), ("out", "sourceOutFrame"),
    ]:
        node(c, tag, stage[key])
    file_node = node(c, "file", id="altar-original-recording")
    if full_file:
        node(file_node, "name", SOURCE.name)
        node(file_node, "pathurl", SOURCE.as_uri())
        rate(file_node)
        node(file_node, "duration", SOURCE_FRAMES)
        source_media = node(file_node, "media")
        video_characteristics(node(source_media, "video"))
        source_audio = node(source_media, "audio")
        source_achar = node(source_audio, "samplecharacteristics")
        node(source_achar, "depth", 16)
        node(source_achar, "samplerate", 48000)
        node(source_audio, "channelcount", 2)
    source_track = node(c, "sourcetrack")
    node(source_track, "mediatype", kind)
    node(source_track, "trackindex", channel)
    if kind == "video":
        node(c, "pixelaspectratio", "square")
        node(c, "anamorphic", "FALSE")
    for link_prefix, link_kind, link_track in [
        ("v", "video", 1), ("a1", "audio", 1), ("a2", "audio", 2)
    ]:
        link = node(c, "link")
        node(link, "linkclipref", f"{link_prefix}-{stage['index']}")
        node(link, "mediatype", link_kind)
        node(link, "trackindex", link_track)
        node(link, "clipindex", stage["index"])
        if link_kind == "audio":
            node(link, "groupindex", 1)


for i, stage in enumerate(stages):
    add_clip(vtrack, stage, "video", full_file=(i == 0))
    for channel, track in enumerate(atracks, 1):
        add_clip(track, stage, "audio", channel)
    marker = node(seq, "marker")
    node(marker, "name", f"{stage['index']:02d} | {stage['title']}")
    node(marker, "comment", stage["english"] + "; source-log aligned; speed 100%.")
    node(marker, "in", stage["startFrame"])
    node(marker, "out", stage["endFrame"])

for i, track in enumerate(atracks, 1):
    node(track, "enabled", "TRUE")
    node(track, "locked", "FALSE")
    node(track, "outputchannelindex", i)
node(vtrack, "enabled", "TRUE")
node(vtrack, "locked", "FALSE")

ET.indent(root, space="  ")
xml_path = ROOT / "BlackHoleAltar_Baseline.xml"
ET.ElementTree(root).write(xml_path, encoding="utf-8", xml_declaration=True)
plan = {
    "status": "baseline_prepared",
    "sequenceName": SEQUENCE_NAME,
    "source": str(SOURCE),
    "sourceDurationSeconds": SOURCE_FRAMES / FPS,
    "sourceInSeconds": boundaries[0] / FPS,
    "sourceOutSeconds": boundaries[-1] / FPS,
    "durationSeconds": total_frames / FPS,
    "frameRate": FPS,
    "width": 1920,
    "height": 1080,
    "retimed": False,
    "syncMethod": "Game stage log minus OBS recording-start timestamp, rounded to the nearest 60 fps frame.",
    "syncToleranceNote": "Log-aligned, not image-content frame-perfect. Verify locally before final overlays.",
    "stages": stages,
    "pending": ["Chinese component overlays", "Progress bar", "Music", "Final export"],
}
(ROOT / "edit-plan.json").write_text(
    json.dumps(plan, ensure_ascii=False, indent=2), encoding="utf-8"
)
(ROOT / "scripts/premiere-edit-plan.jsx").write_text(
    "var ALTAR_EDIT_PLAN = " + json.dumps(plan, ensure_ascii=True, indent=2) + ";\n",
    encoding="ascii",
)
print(f"Timeline: {xml_path}")
print(f"Duration: {total_frames / FPS:.3f} seconds; {len(stages)} phases")
