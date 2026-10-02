PAYLOAD = '{"parts": [{"name": "25-2026-09-25 11-15-02.mp4.part01", "size": 1610612736, "sha256": "753db2efd9462b731d76844e9398c098144e316a5c83d3dc2d2be956bf5b6207"}, {"name": "25-2026-09-25 11-15-02.mp4.part02", "size": 1427671570, "sha256": "e9023e794d2bd40427f318b841a86e0585d828813f969131c73d5423ae609607"}], "output": "2026-09-25 11-15-02.mp4", "size": 3038284306, "sha256": "5e3495a9dce411006cc1be10e0a1ecc2492015591e6f88be64f5c5f2aa238729"}'
import hashlib, json
from pathlib import Path
ROOT = Path(__file__).resolve().parent
DATA = json.loads(PAYLOAD)
def digest(path):
    h=hashlib.sha256()
    with path.open('rb') as f:
        for chunk in iter(lambda:f.read(4*1024*1024),b''):h.update(chunk)
    return h.hexdigest()
for part in DATA['parts']:
    p=ROOT/part['name']
    if not p.is_file() or p.stat().st_size != part['size'] or digest(p) != part['sha256']:
        raise SystemExit('Missing or damaged part: '+part['name'])
output=ROOT/DATA['output']
if output.exists():
    if output.stat().st_size==DATA['size'] and digest(output)==DATA['sha256']:
        print('Already restored:',output.name);raise SystemExit(0)
    raise SystemExit('Output already exists; move it aside before restoring.')
with output.open('xb') as target:
    for part in DATA['parts']:
        with (ROOT/part['name']).open('rb') as source:
            for chunk in iter(lambda:source.read(4*1024*1024),b''):target.write(chunk)
if output.stat().st_size != DATA['size'] or digest(output) != DATA['sha256']:
    raise SystemExit('Final checksum mismatch')
print('Restored and verified:',output.name)
