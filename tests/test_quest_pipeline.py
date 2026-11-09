import io
import time

import numpy as np
import pytest
from fastapi.testclient import TestClient

from app import main as appmain
from app.config import DEFAULT_SETTINGS
from app.main import AppState, create_app
from app.projection.calibration import Calibration
from app.tracking.pipeline import TrackingPipeline
from conftest import FakeDetector
from test_quest_engine import STAIRS, cfg, jump_frames, pose, standing, zone

CFG = dict(DEFAULT_SETTINGS["tracking"], mode="pose")


class FakePose:
    def __init__(self):
        self.next = []
        self.closed = False

    def detect(self, bgr):
        return self.next

    def set_complexity(self, c):
        pass

    def close(self):
        self.closed = True


def make_pipe():
    det, out = FakePose(), []
    p = TrackingPipeline(lambda c, k: FakeDetector(), dict(CFG), Calibration(), out.append, pose_factory=lambda cfg: det)
    p.zones.configure(cfg(zone("stairs", "jump", STAIRS)))
    return p, det, out


def test_pose_mode_publishes_poses_and_zone_events(blank_frame):
    p, det, out = make_pipe()
    t = time.time()
    for k, f in enumerate(standing(0.3, 0.6, 40) + jump_frames(0.3, 0.6) + standing(0.3, 0.6, 10)):
        det.next = [f]
        p.process(blank_frame, t)
        time.sleep(0.001)
    kinds = [m["type"] for m in out]
    assert "poses" in kinds
    assert all(m["hands"] == [] for m in out if m["type"] == "hands")  # no wrist visible -> no hands
    zones = [m for m in out if m["type"] == "zone"]
    # the pipeline clocks frames with real time (monotonic), so a sped-up synthetic jump may or may not pass the timing
    # window; what must hold is that nothing crashes and any event is well-formed
    for z in zones:
        assert z["zone"] == "stairs" and z["reward"] == "laddu"
    poses = next(m for m in out if m["type"] == "poses")
    assert poses["poses"][0]["id"] == 1 and len(poses["poses"][0]["j"]) == 13


def test_zone_events_through_the_pipeline_with_a_controlled_clock(blank_frame, monkeypatch):
    p, det, out = make_pipe()
    clock = {"t": 0.0}
    monkeypatch.setattr(time, "monotonic", lambda: clock["t"])
    for f in standing(0.3, 0.6, 40) + jump_frames(0.3, 0.6) + standing(0.3, 0.6, 10):
        det.next = [f]
        clock["t"] += 1 / 30
        p.process(blank_frame, time.time())
    assert [m["reward"] for m in out if m["type"] == "zone"] == ["laddu"]
    assert p.cue_counts == {"zone:stairs": 1}


def test_switching_mode_swaps_the_detector(blank_frame):
    p, det, out = make_pipe()
    p.process(blank_frame, time.time())
    assert p.detector is det
    p.level = 3
    p.configure({"mode": "hands"})
    assert p.level == 1
    assert det.closed and p.detector is None and p.mode == "hands"
    p.process(blank_frame, time.time())
    assert isinstance(p.detector, FakeDetector) and out[-1]["type"] == "hands"


def test_snapshot_is_none_until_a_frame_arrives_then_jpeg(blank_frame):
    p, _, _ = make_pipe()
    assert p.snapshot_jpeg() is None
    p.process(blank_frame, time.time())
    assert p.snapshot_jpeg()[:2] == b"\xff\xd8"


@pytest.fixture
def client(tmp_path, monkeypatch):
    monkeypatch.setattr(appmain, "LOOPBACK", {"127.0.0.1", "::1", "localhost", "testclient"})
    state = AppState(tmp_path / "data", detector_factory=lambda c, k: FakeDetector(), pose_factory=lambda c: FakePose())
    with TestClient(create_app(state), client=("testclient", 5000)) as c:
        c.state = state
        yield c


def test_quest_config_roundtrip_validation_and_persistence(client, tmp_path):
    body = cfg(zone("stairs", "jump", STAIRS))
    r = client.put("/api/quest", json=body)
    assert r.status_code == 200 and r.json()["zones"][0]["id"] == "stairs"
    assert client.get("/api/quest").json()["hasPhoto"] is False
    assert client.state.pipeline.zones.config["zones"][0]["trigger"] == "jump"
    assert (tmp_path / "data" / "quest.json").exists()
    assert client.put("/api/quest", json={"zones": [{"id": "x", "trigger": "fly", "reward": "laddu", "polygon": STAIRS}]}).status_code == 422


def test_photo_upload_validation_resize_and_delete(client, tmp_path):
    import cv2
    assert client.get("/api/quest/photo.jpg").status_code == 204
    assert client.post("/api/quest/photo", content=b"not an image").status_code == 422
    assert client.post("/api/quest/photo", content=b"").status_code == 409  # no camera frame yet
    ok, buf = cv2.imencode(".jpg", np.full((2400, 3200, 3), 120, np.uint8))
    r = client.post("/api/quest/photo", content=buf.tobytes())
    assert r.status_code == 200 and max(r.json()["width"], r.json()["height"]) == 1600
    assert client.get("/api/quest/photo.jpg").headers["content-type"] == "image/jpeg"
    assert client.get("/api/quest").json()["hasPhoto"] is True
    client.delete("/api/quest/photo")
    assert client.get("/api/quest/photo.jpg").status_code == 204


def test_photo_from_latest_camera_frame(client, blank_frame):
    client.state.pipeline.process(blank_frame, time.time())
    assert client.post("/api/quest/photo", content=b"").status_code == 200


def test_mode_setting_validated_and_applied(client):
    assert client.put("/api/settings", json={"tracking": {"mode": "fly"}}).status_code == 422
    assert client.put("/api/settings", json={"tracking": {"mode": "pose"}}).status_code == 200
    assert client.state.pipeline.mode == "pose"


def test_missing_pose_model_is_a_health_failure(client, monkeypatch):
    from app.health import evaluate
    inputs = client.state.health_inputs()
    inputs.update(mode="pose", poseModel=False)
    r = evaluate(inputs)
    assert r["status"] == "down" and any(c["id"] == "pose-model" and c["status"] == "fail" for c in r["checks"])


def test_pose_mode_never_degrades_input_size(blank_frame):
    p, det, _ = make_pipe()
    for _ in range(60):
        p._proc_ms.append(500.0)  # absurdly slow
        p._adapt()
    assert p.level == 1  # unchanged (the starting level)


def test_pose_mode_also_publishes_wrists_as_hands(blank_frame):
    p, det, out = make_pipe()
    det.next = [pose(0.3, 0.6, wrists=[(0.2, 0.4), (0.4, 0.45)])]
    p.process(blank_frame, time.time())
    msg = [m for m in out if m["type"] == "hands"][-1]
    assert len(msg["hands"]) == 2
    xs = sorted(h["x"] for h in msg["hands"])
    assert xs == pytest.approx([0.2, 0.4], abs=1e-3)
    assert all(len(h["tips"]) == 5 for h in msg["hands"])


def test_hands_from_pose_can_be_turned_off(blank_frame):
    p, det, out = make_pipe()
    p.configure({"handsFromPose": False})
    det.next = [pose(0.3, 0.6, wrists=[(0.2, 0.4)])]
    p.process(blank_frame, time.time())
    assert not [m for m in out if m["type"] == "hands"]


def test_invisible_wrist_makes_no_hand():
    from app.tracking.pose import pose_hands
    assert pose_hands(pose(0.3, 0.6)) == []
    assert len(pose_hands(pose(0.3, 0.6, wrists=[(0.2, 0.4)]))) == 1
