"""Rebuild the exact retained graph from checksum-locked public source data."""
import hashlib
import json
from pathlib import Path
import urllib.request
import numpy as np

root = Path('data')
root.mkdir(exist_ok=True)
expected = json.loads(Path('graph-arrays.json').read_text())
if not all((root / name).exists() for name in ('graph.npz', 'annotations.feather', 'normalized/neurons.feather')):
    locked = json.loads((root / 'source.lock.json').read_text())
    for name, meta in locked.items():
        target = root / name
        if not target.exists():
            print('Downloading', name, flush=True)
            urllib.request.urlretrieve(meta['url'], target)
        if hashlib.sha256(target.read_bytes()).hexdigest() != meta['sha256']:
            raise RuntimeError('Source checksum mismatch: ' + name)
    from stonkfly.neural.connectome import import_graph
    from stonkfly.neural.prepare import prepare
    import_graph()
    prepare()
with np.load(root / 'graph.npz', allow_pickle=False) as graph:
    actual = {name: hashlib.sha256(graph[name].tobytes()).hexdigest() for name in graph.files}
if actual != expected:
    raise RuntimeError('Rebuilt graph differs from the Mac baseline')
print('All graph arrays match the Mac baseline.', flush=True)
