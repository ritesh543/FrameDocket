"""Check the release archive's file and deployment fingerprints."""
import hashlib
import json
from pathlib import Path

root = Path(__file__).resolve().parent.parent
manifest = root / 'verification' / 'MANIFEST.sha256'
for line in manifest.read_text(encoding='utf-8').splitlines():
    expected, name = line.split('  ', 1)
    file = (root / name).resolve()
    if not file.is_relative_to(root) or hashlib.sha256(file.read_bytes()).hexdigest() != expected:
        raise SystemExit('Checksum mismatch for ' + name)
evidence = json.loads((root / 'verification' / 'deployment.json').read_text(encoding='utf-8'))
contract = root / 'contracts' / 'frame_docket.py'
if hashlib.sha256(contract.read_bytes()).hexdigest() != evidence['source_sha256']:
    raise SystemExit('Contract source differs from deployed source')
if evidence['status'] != 'FINALIZED' or evidence['execution'] != 'SUCCESS':
    raise SystemExit('Deployment evidence is incomplete')
print('FrameDocket package checksums and deployed source fingerprint verified.')
