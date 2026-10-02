"""Derive a local 1080p60 H.264 preset without changing Adobe's presets."""

from pathlib import Path
import uuid
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parents[1]
SOURCE = Path(
    "E:/adobe premiere pro/Adobe Premiere Pro 2024/MediaIO/systempresets/"
    "4E49434B_48323634/00 - Match Source - High bitrate.epr"
)
tree = ET.parse(SOURCE)
root = tree.getroot()
values = {
    "ADBEVideoMatchSource": "false",
    "ADBEVideoWidth": "1920",
    "ADBEVideoHeight": "1080",
    "ADBEVideoFPS": "4233600000",
    "ADBEVideoFieldType": "0",
    "ADBEVideoAspect": "1,1",
    "ADBEVideoMPEGProfile": "1",
    "ADBEVideoMPEGProfileLevel": "42",
    "ADBEVideoBitrateEncoding": "1",
    "ADBEVideoTargetBitrate": "24.",
    "ADBEVideoMaxBitrate": "32.",
    "ADBEMPEGKeyframeRate": "120",
    "ADBEAudioRatePerSecond": "48000",
    "ADBEAudioNumChannels": "2",
    "ADBEAudioBitrate": "320",
}
for parameter in root.findall("ExporterParam"):
    identifier = parameter.findtext("ParamIdentifier")
    if identifier not in values:
        continue
    parameter.find("ParamValue").text = values[identifier]
    disabled = parameter.find("ParamIsDisabled")
    if disabled is not None:
        disabled.text = "false"
    # Disable the individual "match source" checkboxes: explicit values above apply.
    optional = parameter.find("IsOptionalParamEnabled")
    if optional is not None:
        optional.text = "false"
for tag, value in [
    ("PresetName", "Altar Film - 1080p60 - H264 24Mbps"),
    ("PresetID", str(uuid.uuid4())),
    ("PresetComments", "Local explicit 1920x1080 progressive 60 fps export preset."),
    ("PresetUserComments", "Original Adobe preset is unchanged."),
]:
    element = root.find(tag)
    if element is not None:
        element.text = value
for tag in ["StandardFilters/UseMaximumRenderQuality", "StandardFilters/UseFrameBlending"]:
    element = root.find(tag)
    if element is not None:
        element.text = "false"
output = ROOT / "Altar_1080p60_H264.epr"
tree.write(output, encoding="utf-8", xml_declaration=True)
print(output)
