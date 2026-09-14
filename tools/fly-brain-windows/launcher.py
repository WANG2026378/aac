"""Portable local launcher; keep its console open while using the lab."""
import os
import sys
from pathlib import Path
import threading
import webbrowser
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer


def main():
    root = Path(sys.executable).parent if getattr(sys, 'frozen', False) else Path(__file__).resolve().parent
    os.chdir(root)
    os.environ['STONKFLY_DATA'] = str(root / 'data')
    os.environ['GYRO_WEB_ROOT'] = str(root / 'web')
    # Reserve both ports before allocating the full brain.
    web = ThreadingHTTPServer(('127.0.0.1', 8765), partial(SimpleHTTPRequestHandler, directory=str(root / 'web')))
    api = ThreadingHTTPServer(('127.0.0.1', 8766), SimpleHTTPRequestHandler)
    try:
        print('Loading full fly brain. Please keep this window open.', flush=True)
        import gyro_brain_bridge as bridge
        api.RequestHandlerClass = bridge.Handler
        if '--self-test' in sys.argv:
            result = bridge.decide({'power': 0.8, 'energy': 0.5, 'distance': 0.5, 'danger': 0.1})
            assert result['action'] in ('WAIT', 'RELEASE', 'SKILL')
            print('SELF-TEST PASSED', result, flush=True)
            return
        threading.Thread(target=web.serve_forever, daemon=True).start()
        if os.environ.get('GYRO_NO_BROWSER') != '1':
            webbrowser.open('http://127.0.0.1:8765/gyro-fly-lab.html')
        print('Ready. Close this window to stop. Save memory in the lab before closing.', flush=True)
        api.serve_forever()
    finally:
        api.server_close()
        web.server_close()


if __name__ == '__main__':
    try:
        main()
    except KeyboardInterrupt:
        pass
    except Exception:
        import traceback
        traceback.print_exc()
        if '--self-test' in sys.argv:
            raise
        input('Startup failed. Copy the error above; press Enter to close.')
        sys.exit(1)
