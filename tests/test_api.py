import asyncio
import json

import pytest
from fastapi.testclient import TestClient

from app import main as appmain
from app.main import AppState, create_app
from conftest import FakeDetector


@pytest.fixture
def client(tmp_path, monkeypatch, request):
    media = tmp_path / "media"
    media.mkdir()
    (media / "clip.webm").write_bytes(b"x" * 100)
    (media / "notes.txt").write_text("secret")
    (tmp_path / "secret.mp4").write_bytes(b"nope")
    monkeypatch.setattr(appmain.config, "MEDIA_DIR", media)
    monkeypatch.setattr(appmain, "LOOPBACK", {"127.0.0.1", "::1", "localhost", "testclient"})
    state = AppState(tmp_path / "data", detector_factory=lambda cfg, c: FakeDetector())
    with TestClient(create_app(state), client=("testclient", 5000)) as c:
        c.state = state
        yield c


def test_settings_roundtrip_and_persist(client, tmp_path):
    r = client.put("/api/settings", json={"game": {"butterflies": 12}})
    assert r.status_code == 200 and r.json()["game"]["butterflies"] == 12
    assert json.loads((tmp_path / "data" / "settings.json").read_text())["game"]["butterflies"] == 12
    assert client.get("/api/settings").json()["game"]["speed"] == 1.0  # untouched defaults kept


@pytest.mark.parametrize("body", [{"tracking": {"maxHands": 99}}, {"tracking": {"minCutoff": "fast"}}, {"output": {"mode": "weird"}},
                                  {"output": {"width": 5}}, {"game": {"difficulty": "nightmare"}}])
def test_settings_validation(client, body):
    assert client.put("/api/settings", json=body).status_code == 422


def test_calibration_solve_save_reset(client):
    pts = [[0.2, 0.2], [0.8, 0.25], [0.85, 0.8], [0.15, 0.75]]
    r = client.post("/api/calibration/solve", json={"camera_points": pts, "mirror": False, "rotation": 0})
    assert r.status_code == 200 and r.json()["calibrated"]
    assert client.get("/api/stats").json()["calibrated"] is True
    assert (client.state.cal_store.path).exists()
    assert client.post("/api/calibration/solve", json={"camera_points": pts[:3]}).status_code == 422
    assert client.post("/api/calibration/solve", json={"camera_points": [[0, 0]] * 4}).status_code == 422
    assert client.delete("/api/calibration").json()["calibrated"] is False


def test_calibration_base_change_clears_homography(client):
    pts = [[0.2, 0.2], [0.8, 0.2], [0.8, 0.8], [0.2, 0.8]]
    client.post("/api/calibration/solve", json={"camera_points": pts})
    r = client.put("/api/calibration/base", json={"mirror": True, "rotation": 90})
    assert r.json()["calibrated"] is False and r.json()["mirror"] is True
    assert client.put("/api/calibration/base", json={"rotation": 33}).status_code == 422


def test_scene_validation_and_persist(client):
    scene = {"surfaces": [{"id": "a", "name": "A", "content": {"type": "video", "src": "/media/clip.webm"}, "quad": [[0, 0], [1, 0], [1, 1], [0, 1]]}]}
    assert client.put("/api/scene", json=scene).status_code == 200
    assert client.get("/api/scene").json()["surfaces"][0]["content"]["src"] == "/media/clip.webm"
    bad = {"surfaces": [{"id": "a", "content": {"type": "video", "src": "/etc/passwd"}, "quad": [[0, 0], [1, 0], [1, 1], [0, 1]]}]}
    assert client.put("/api/scene", json=bad).status_code == 422


def test_media_listing_only_video_and_picture_files(client):
    files = client.get("/api/media").json()["files"]
    assert [f["name"] for f in files] == ["clip.webm"] and files[0]["kind"] == "video"


def test_media_serving_and_traversal_blocked(client):
    assert client.get("/media/clip.webm").status_code == 200
    assert client.get("/media/clip.webm", headers={"Range": "bytes=0-9"}).status_code == 206
    assert client.get("/media/notes.txt").status_code == 404
    assert client.get("/media/../secret.mp4").status_code == 404
    assert client.get("/media/%2e%2e/secret.mp4").status_code == 404


def test_camera_offer_requires_token(client):
    r = client.post("/api/camera/offer", json={"sdp": "v=0", "type": "offer", "token": "wrong"})
    assert r.status_code == 403
    r = client.post("/api/camera/offer", json={"sdp": "", "type": "offer", "token": client.state.token})
    assert r.status_code == 400


def test_lan_clients_cannot_reach_private_endpoints(tmp_path, monkeypatch):
    monkeypatch.setattr(appmain.config, "MEDIA_DIR", tmp_path)
    state = AppState(tmp_path / "d", detector_factory=lambda c, k: FakeDetector())
    with TestClient(create_app(state), client=("192.168.1.50", 1234)) as c:
        for path in ("/api/settings", "/api/scene", "/api/calibration", "/api/preview.jpg", "/api/stats", "/api/info", "/api/media", "/media/x.mp4"):
            assert c.get(path).status_code == 403, path
        assert c.put("/api/settings", json={}).status_code == 403
        with pytest.raises(Exception):
            with c.websocket_connect("/ws"):
                pass
        assert c.post("/api/camera/stop", json={}).status_code == 403  # needs the token from off-laptop
        assert c.post("/api/camera/stop", json={"token": state.token}).status_code == 200
        assert c.get("/camera.html").status_code == 200  # the phone page itself is public on the LAN


def test_websocket_replays_state_and_relays_commands(client):
    with client.websocket_connect("/ws") as a, client.websocket_connect("/ws") as b:
        got = {json.loads(a.receive_text())["type"] for _ in range(4)}
        assert {"settings", "scene", "calibration"} <= got
        for _ in range(4):
            b.receive_text()
        a.send_text(json.dumps({"type": "command", "cmd": "restart"}))
        while True:
            m = json.loads(b.receive_text())
            if m["type"] == "command":
                break
        assert m["cmd"] == "restart"


def test_hands_reach_websocket_clients(client):
    client.state.hub.state.clear()
    with client.websocket_connect("/ws") as ws:
        client.portal.call(client.state.hub.broadcast, {"type": "hands", "hands": [{"id": 1}]})
        while True:
            m = json.loads(ws.receive_text())
            if m["type"] == "hands":
                break
        assert m["hands"][0]["id"] == 1


def test_frontend_is_served(client):
    assert client.get("/play.html").status_code == 200
    assert client.get("/", follow_redirects=False).status_code in (302, 307)


def test_latency_endpoints_validate_and_report(client):
    assert client.post("/api/latency/analyze", json={"flashes": []}).status_code == 422
    assert client.post("/api/latency/analyze", json={"flashes": ["x"]}).status_code == 422
    assert client.post("/api/latency/arm", json={"seconds": "soon"}).status_code == 422
    assert client.post("/api/latency/arm", json={"seconds": 10}).json()["ok"] is True
    r = client.post("/api/latency/analyze", json={"flashes": [1.0, 2.0]})
    assert r.status_code == 200 and r.json()["valid"] == 0 and r.json()["total"] == 2


def test_health_events_metrics_endpoints(client):
    h = client.get("/api/health").json()
    assert h["status"] in ("ok", "degraded", "down") and any(c["id"] == "camera" for c in h["checks"])
    ev = client.get("/api/events").json()["events"]
    assert any(e["message"] == "Server started" for e in ev)
    m = client.get("/api/metrics")
    assert m.status_code == 200 and "playground_tracking_thread_alive 1" in m.text and "playground_camera_connected 0" in m.text


def test_display_report_over_websocket_is_tracked(client):
    with client.websocket_connect("/ws") as ws:
        ws.send_json({"type": "report", "role": "display", "fps": 58.5})
        import time
        for _ in range(50):
            if client.state.displays:
                break
            time.sleep(0.02)
        assert [d["fps"] for d in client.state.displays.values()] == [58.5]
    for _ in range(50):
        if not client.state.displays:
            break
        time.sleep(0.02)
    assert not client.state.displays  # forgotten on disconnect


def test_watchdog_restarts_a_dead_tracking_thread(client):
    p = client.state.pipeline
    p._running = True
    p._thread = None  # simulate a thread that died
    asyncio.run(client.state.watchdog())
    assert p.alive()
    assert any("restarted" in e["message"] for e in client.state.events.since(0))


def test_presets_list_and_apply(client):
    names = [p["id"] for p in client.get("/api/presets").json()["presets"]]
    assert "diwali-wall" in names
    r = client.post("/api/presets/diwali-wall/apply")
    assert r.status_code == 200 and len(r.json()["surfaces"]) == 4
    assert client.get("/api/scene").json()["surfaces"][0]["id"] == "diyas"
    assert client.post("/api/presets/nope/apply").status_code == 404


def test_cues_setting_validated_and_client_cue_is_counted(client):
    assert client.put("/api/settings", json={"cues": {"enabled": "yes"}}).status_code == 422
    assert client.put("/api/settings", json={"cues": {"enabled": False}}).json()["cues"]["enabled"] is False
    assert client.state.pipeline.cues_enabled is False
    with client.websocket_connect("/ws") as a, client.websocket_connect("/ws") as b:
        for _ in range(3):  # drain replayed state on b
            b.receive_json()
        a.send_json({"type": "cue", "name": "clap"})
        a.send_json({"type": "cue", "name": "not-a-cue"})
        got = []
        while True:
            m = b.receive_json()
            if m["type"] == "cue":
                got.append(m)
                break
        assert got[0]["name"] == "clap" and got[0]["source"] == "client"
    assert client.state.pipeline.cue_counts == {"clap": 1}


def test_shy_butterfly_settings_are_validated(client):
    ok = client.put("/api/settings", json={"game": {"shyCount": 20, "shySize": 1.5}})
    assert ok.status_code == 200 and ok.json()["game"]["shyCount"] == 20
    assert client.put("/api/settings", json={"game": {"shyCount": 0}}).status_code == 422
    assert client.put("/api/settings", json={"game": {"shySize": 9}}).status_code == 422
    client.put("/api/settings", json={"game": {"shyCount": 10, "shySize": 1.0}})


def test_auto_calibration_needs_a_game_window(client):
    r = client.post("/api/calibration/auto", json={"screen_points": [[.1, .1], [.9, .1], [.9, .9], [.1, .9]]})
    assert r.status_code == 409 and "game window" in r.json()["detail"]
    assert client.post("/api/calibration/auto", json={"screen_points": [[.1, .1]]}).status_code == 422


def test_extra_grids_lifecycle(client):
    sq = [[.1, .1], [.9, .1], [.9, .9], [.1, .9]]
    r = client.post("/api/calibration/grids/wall-2", json={"name": "Second wall", "camera_points": sq, "screen_points": sq})
    assert r.status_code == 200 and [g["id"] for g in r.json()["grids"]] == ["wall-2"]
    client.post("/api/calibration/solve", json={"camera_points": sq, "screen_points": sq})  # re-solving main keeps extras
    ids = [g["id"] for g in client.get("/api/calibration").json()["grids"]]
    assert ids == ["main", "wall-2"]
    assert client.post("/api/calibration/grids/main", json={}).status_code == 422
    assert client.post("/api/calibration/grids/BAD", json={"camera_points": sq, "screen_points": sq}).status_code == 422
    assert client.delete("/api/calibration/grids/wall-2").status_code == 200
    assert client.delete("/api/calibration/grids/wall-2").status_code == 404
    client.put("/api/calibration/base", json={})  # leave things clean
    client.delete("/api/calibration")


# ---- paired network displays (the projector's browser) ----
@pytest.fixture
def lan(client):
    """A browser on another machine on the Wi-Fi (not loopback)."""
    with TestClient(client.app, client=("192.168.1.50", 6000)) as c:
        yield c


def _pair(lan, client):
    r = lan.get("/pair", params={"d": client.state.display_token}, follow_redirects=False)
    assert r.status_code == 303 and r.headers["location"].startswith("/play.html")
    return r


def test_unpaired_network_device_gets_nothing(client, lan):
    assert lan.get("/api/settings").status_code == 403
    assert lan.get("/media/clip.webm").status_code == 403
    assert lan.get("/api/quest/photo.jpg").status_code == 403
    with pytest.raises(Exception):
        with lan.websocket_connect("/ws"):
            pass
    assert lan.get("/play.html").status_code == 200   # the page itself is static and public; it just cannot get any data


def test_wrong_pairing_token_refused_and_logged(client, lan):
    assert lan.get("/pair", params={"d": "nope"}, follow_redirects=False).status_code == 403
    assert any("pairing refused" in e["message"] for e in client.state.events.since(0))


def test_paired_display_can_read_media_and_connect(client, lan):
    r = _pair(lan, client)
    assert "pg_display=" in r.headers["set-cookie"] and "HttpOnly" in r.headers["set-cookie"]
    assert lan.get("/media/clip.webm").status_code == 200
    assert lan.get("/media/notes.txt").status_code == 404           # still only media file types
    assert lan.get("/api/settings").status_code == 403              # but no API access: it is read-only
    assert lan.put("/api/scene", json={"surfaces": []}).status_code == 403
    assert lan.get("/api/preview.jpg").status_code == 403           # never the camera picture
    with lan.websocket_connect("/ws") as ws:
        kinds = {json.loads(ws.receive_text())["type"] for _ in range(2)}
        assert kinds & {"settings", "scene", "calibration"}


def test_paired_display_only_receives_display_messages(client, lan):
    _pair(lan, client)
    with lan.websocket_connect("/ws") as ws:
        hub = client.state.hub
        client.portal.call(hub.broadcast, {"type": "poses", "poses": [[1, 2, 3]]})      # not for displays
        client.portal.call(hub.broadcast, {"type": "hands", "hands": [], "cam": [1, 1]})  # for displays
        seen = []
        for _ in range(12):
            m = json.loads(ws.receive_text())
            seen.append(m["type"])
            if m["type"] == "hands":
                break
        assert "poses" not in seen and seen[-1] == "hands"


def test_paired_display_cannot_send_control_commands(client, lan):
    _pair(lan, client)
    with client.websocket_connect("/ws") as local, lan.websocket_connect("/ws") as remote:
        remote.send_text(json.dumps({"type": "command", "cmd": "calib", "show": True}))
        remote.send_text(json.dumps({"type": "command", "cmd": "output-size", "w": 1920, "h": 1080}))
        seen = []
        for _ in range(30):
            m = json.loads(local.receive_text())
            if m["type"] == "command":
                seen.append(m["cmd"])
                if m["cmd"] == "output-size":
                    break
        assert seen == ["output-size"]   # 'calib' was dropped, the allowed command went through


def test_revoking_displays_invalidates_old_pairing(client, lan):
    _pair(lan, client)
    old = client.state.display_token
    assert client.post("/api/display/reset").status_code == 200
    assert client.state.display_token != old
    assert lan.get("/media/clip.webm").status_code == 403          # the old cookie no longer works
    assert lan.get("/pair", params={"d": old}, follow_redirects=False).status_code == 403
    assert lan.post("/api/display/reset").status_code == 403       # only the laptop can revoke


def test_info_includes_display_link(client):
    info = client.get("/api/info").json()
    assert "displayUrls" in info and "displayQrSvg" in info
    assert all("/pair?d=" in u for u in info["displayUrls"])
