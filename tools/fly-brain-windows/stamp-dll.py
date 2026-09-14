import hashlib
import json
from pathlib import Path
source = Path('stonkfly/neural/kernel.cpp')
dll = Path('data/cache/physiology-v6/memory.dll')
dll.with_suffix('.dll.json').write_text(json.dumps({
    'model': 'stonkfly-dual-compartment-v1',
    'source_sha256': hashlib.sha256(source.read_bytes()).hexdigest(),
    'binary_sha256': hashlib.sha256(dll.read_bytes()).hexdigest(),
    'flags': ['/O2', '/std:c++17', '/MT', '/LD'],
}))
