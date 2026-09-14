"""Local-only bridge from Gyro Fly Lab to the retained fly-connectome model.

It never imports the Coinbase broker or reads credentials.  Start it from the
Stonkfly checkout after `python -m stonkfly prepare`:

  .venv/bin/python gyro_brain_bridge.py
"""

from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
import json
import os
from pathlib import Path
import threading

import numpy as np

from stonkfly.config import Settings
from stonkfly.neural.controller import FlyController


LOCK = threading.Lock()
CONTROLLER = FlyController(Settings(neural_ms=250, pulse_ms=200))
MEMORY_DIR = Path("runs/gyro-fly-lab")
MEMORY_FILE = MEMORY_DIR / "brain-memory.npz"
AFFECT = {"joy": 18.0, "hunger": 55.0, "spirit": 45.0, "frustration": 8.0}


def bounded(value, default=0.0):
    try:
        return float(np.clip(float(value), 0.0, 1.0))
    except (TypeError, ValueError):
        return default


def game_frame(state):
    """Turn four public game signals into a 320x180 RGB sensory image."""
    power = bounded(state.get("power"))
    distance = bounded(state.get("distance"))
    energy = bounded(state.get("energy"))
    danger = bounded(state.get("danger"))
    image = np.full((180, 320, 3), (18, 25, 42), dtype=np.uint8)
    signals = [(power, (82, 255, 176)), (distance, (80, 178, 255)),
               (energy, (255, 225, 76)), (danger, (255, 83, 105))]
    for index, (value, color) in enumerate(signals):
        y = 18 + index * 39
        width = max(1, int(value * 270))
        image[y:y + 23, 24:24 + width] = color
        image[y:y + 23, 24 + width:294] = (31, 42, 68)
    # A bright target line makes release timing visible to the model.
    image[:, 24 + int(270 * 0.90):27 + int(270 * 0.90)] = (255, 248, 160)
    return image


def decide(state):
    frame = game_frame(state)
    reinforcement = state.get("reinforcement", "none")
    if reinforcement not in ("none", "reward", "aversive"):
        reinforcement = "none"
    with LOCK:
        neural = CONTROLLER.observe(frame, reinforcement)
    # Engineered dashboard values, not claims about subjective animal emotions.
    AFFECT["hunger"] = min(100.0, AFFECT["hunger"] + 0.8)
    AFFECT["joy"] = max(0.0, AFFECT["joy"] * 0.985)
    AFFECT["frustration"] = max(0.0, AFFECT["frustration"] * 0.99)
    AFFECT["spirit"] = float(np.clip(18 + neural["gate_spikes"] * 2.2 + state.get("energy", 0) * 30, 0, 100))
    if reinforcement == "reward":
        AFFECT["joy"] = min(100.0, AFFECT["joy"] + 28 + neural["reward_spikes"] * 0.3)
        AFFECT["hunger"] = max(0.0, AFFECT["hunger"] - 22)
        AFFECT["frustration"] = max(0.0, AFFECT["frustration"] - 12)
    elif reinforcement == "aversive":
        AFFECT["frustration"] = min(100.0, AFFECT["frustration"] + 24 + neural["aversive_spikes"] * 0.4)
    power = bounded(state.get("power"))
    energy = bounded(state.get("energy"))
    # Fixed, documented interface.  Neural output does not become a trade.
    if neural["side"] == "BUY" and power >= 0.72:
        action = "RELEASE"
    elif neural["side"] == "SELL" and energy >= 0.35:
        action = "SKILL"
    else:
        action = "WAIT"
    return {
        "action": action,
        "decoder": {key: neural[key] for key in ("side", "left_hz", "right_hz", "difference_hz", "gate_spikes")},
        "activity": {key: neural[key] for key in ("total_spikes", "KC_spikes", "reward_spikes", "aversive_spikes", "brain_ms", "compute_seconds")},
        "affect": {key: round(value, 1) for key, value in AFFECT.items()},
        "interface": "Fixed game mapping: BUY + sufficient charge → RELEASE; SELL + sufficient energy → SKILL; otherwise WAIT.",
    }


def top_reward(state):
    state = dict(state)
    state["reinforcement"] = "reward"
    result = decide(state)
    result["event"] = "top_draw_reward"
    return result


def memory(action):
    MEMORY_DIR.mkdir(parents=True, exist_ok=True)
    with LOCK:
        if action == "save":
            CONTROLLER.save(MEMORY_FILE)
            return {"ok": True, "action": "save", "path": str(MEMORY_FILE), "brain_ms": CONTROLLER.brain.sim_ms}
        if action == "load":
            if not MEMORY_FILE.exists():
                return {"ok": False, "action": "load", "error": "還沒有已儲存的果蠅記憶"}
            CONTROLLER.restore(MEMORY_FILE)
            return {"ok": True, "action": "load", "path": str(MEMORY_FILE), "brain_ms": CONTROLLER.brain.sim_ms}
    return {"ok": False, "error": "未知的記憶操作"}


WEB_ROOT = os.environ.get("GYRO_WEB_ROOT", ".")
PORT = int(os.environ.get("GYRO_BRIDGE_PORT", "8766"))


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=WEB_ROOT, **kwargs)

    def log_message(self, *_):
        return

    def do_OPTIONS(self):
        self.send_response(204)
        self.send_header("Access-Control-Allow-Origin", "http://127.0.0.1:8765")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()

    def do_POST(self):
        if self.path not in ("/decide", "/reward/draw", "/memory/save", "/memory/load"):
            self.send_error(404)
            return
        try:
            size = int(self.headers.get("Content-Length", "0"))
            if size < 2 or size > 4096:
                raise ValueError("invalid payload size")
            payload = json.loads(self.rfile.read(size))
            if self.path == "/decide":
                result = decide(payload)
            elif self.path == "/reward/draw":
                result = top_reward(payload)
            else:
                result = memory("save" if self.path.endswith("/save") else "load")
            body = json.dumps(result).encode()
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Access-Control-Allow-Origin", "http://127.0.0.1:8765")
            self.send_header("Cache-Control", "no-store")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
        except Exception as error:
            body = json.dumps({"error": str(error)}).encode()
            self.send_response(400)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)


if __name__ == "__main__":
    print(f"Gyro fly-brain bridge: http://127.0.0.1:{PORT}/decide", flush=True)
    ThreadingHTTPServer(("127.0.0.1", PORT), Handler).serve_forever()
