"""Exercise the frozen application over its real HTTP API."""
import json
import os
from pathlib import Path
import subprocess
import sys
import time
import urllib.request

root = Path(sys.argv[1]).resolve()
log = root.parent / 'windows-smoke-test.log'
env = os.environ.copy()
env['GYRO_NO_BROWSER'] = '1'
# The frozen application must not depend on build-machine Python or compilers.
env['PATH'] = os.environ.get('SystemRoot', r'C:\Windows') + r'\System32'
for key in ('PYTHONHOME', 'PYTHONPATH', 'STONKFLY_DATA', 'GYRO_WEB_ROOT'):
    env.pop(key, None)
with log.open('w', encoding='utf-8') as output:
    proc = subprocess.Popen([str(root / '啟動果蠅腦.exe')], cwd=root.parent, env=env, stdout=output, stderr=subprocess.STDOUT)
    try:
        deadline = time.monotonic() + 180
        while True:
            if proc.poll() is not None:
                raise RuntimeError('Application exited: ' + log.read_text(encoding='utf-8'))
            try:
                with urllib.request.urlopen('http://127.0.0.1:8765/gyro-fly-lab.html', timeout=3) as response:
                    assert '果蠅' in response.read().decode('utf-8')
                break
            except OSError:
                if time.monotonic() > deadline:
                    raise
                time.sleep(1)
        def post(path, payload):
            req = urllib.request.Request('http://127.0.0.1:8766' + path, data=json.dumps(payload).encode(), headers={'Content-Type': 'application/json', 'Origin': 'http://127.0.0.1:8765'})
            with urllib.request.urlopen(req, timeout=180) as response:
                assert response.headers['Access-Control-Allow-Origin'] == 'http://127.0.0.1:8765'
                return json.load(response)
        state = dict(power=.8, energy=.5, distance=.5, danger=.1)
        decision = post('/decide', state)
        assert decision['activity']['total_spikes'] > 0
        assert decision['action'] in ('RELEASE', 'WAIT', 'SKILL')
        saved = post('/memory/save', {})
        assert saved['ok']
        reward = post('/reward/draw', state)
        assert reward['event'] == 'top_draw_reward'
        restored = post('/memory/load', {})
        assert restored['ok'] and restored['brain_ms'] == saved['brain_ms']
        report = {'platform': sys.platform, 'decision': decision, 'save_load': 'passed', 'reward': 'passed', 'http': 'passed', 'without_python_on_path': True}
        (root / 'windows-test-report.json').write_text(json.dumps(report, indent=2), encoding='utf-8')
        print(json.dumps(report, indent=2))
    finally:
        proc.terminate()
        proc.wait(timeout=30)
        # Do not ship the temporary test memory.
        memory = root / 'runs/gyro-fly-lab/brain-memory.npz'
        if memory.exists():
            memory.unlink()
