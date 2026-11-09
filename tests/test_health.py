import asyncio
import logging

import pytest

from app.health import EventLog, EventLogHandler, HealthMonitor, evaluate, prometheus


def base(**over):
    i = {"camera": {"state": "connected", "fps": 30.0, "width": 1280, "height": 720, "frameAge": 0.03, "stateAge": 60},
         "tracking": {"alive": True, "fps": 29.0, "procMs": 20.0, "latencyMs": 25.0, "level": 0, "doneAge": 0.03,
                      "recentErrors": 0, "lastError": "", "droppedPct": 2.0, "budgetMs": 33.3},
         "displays": [{"fps": 60.0, "age": 1.0}], "calibrated": True, "httpsEnabled": True, "ips": ["192.168.1.5"]}
    for k, v in over.items():
        i[k] = {**i[k], **v} if isinstance(v, dict) and isinstance(i[k], dict) else v
    return i


def status(report, cid):
    return next(c["status"] for c in report["checks"] if c["id"] == cid)


def test_all_good_is_ok():
    r = evaluate(base())
    assert r["status"] == "ok" and all(c["status"] == "ok" for c in r["checks"])


def test_no_camera_is_informational_not_a_failure():
    r = evaluate(base(camera={"state": "idle", "frameAge": None}))
    assert status(r, "camera") == "info" and r["status"] == "ok"


@pytest.mark.parametrize("state", ["disconnected", "failed"])
def test_lost_camera_is_down_with_a_hint(state):
    r = evaluate(base(camera={"state": state}))
    c = next(c for c in r["checks"] if c["id"] == "camera")
    assert r["status"] == "down" and c["hint"]


def test_silent_camera_is_detected_even_though_connected():
    assert status(evaluate(base(camera={"frameAge": 7.0})), "camera") == "fail"
    assert status(evaluate(base(camera={"frameAge": None})), "camera") == "fail"


def test_low_fps_warns():
    r = evaluate(base(camera={"fps": 9.0}))
    assert status(r, "camera") == "warn" and r["status"] == "degraded"


def test_dead_and_stalled_tracking():
    assert status(evaluate(base(tracking={"alive": False})), "tracking") == "fail"
    assert status(evaluate(base(tracking={"doneAge": 5.0})), "tracking") == "fail"


def test_slow_tracking_and_errors_warn():
    assert status(evaluate(base(tracking={"procMs": 60.0})), "tracking") == "warn"
    r = evaluate(base(tracking={"recentErrors": 3, "lastError": "boom"}))
    assert status(r, "tracking") == "warn" and "boom" in next(c["message"] for c in r["checks"] if c["id"] == "tracking")


def test_display_checks():
    assert status(evaluate(base(displays=[])), "display") == "info"
    assert status(evaluate(base(displays=[{"fps": 20.0, "age": 1}])), "display") == "warn"
    assert status(evaluate(base(displays=[{"fps": 60.0, "age": 20}])), "display") == "warn"


def test_network_and_calibration():
    assert status(evaluate(base(ips=[])), "network") == "warn"
    assert status(evaluate(base(httpsEnabled=False)), "network") == "warn"
    assert status(evaluate(base(calibrated=False)), "calibration") == "info"


def test_monitor_emits_events_only_after_confirmation_and_on_recovery():
    ev = EventLog()
    m = HealthMonitor(ev, confirm=2)
    m.update(base())
    assert ev.since(0) == []
    bad = base(camera={"state": "disconnected"})
    m.update(bad)                       # one bad tick: not announced yet (avoids flapping)
    assert ev.since(0) == []
    m.update(bad)
    assert [e["level"] for e in ev.since(0)] == ["error"]
    m.update(bad)                       # no repeat while unchanged
    assert len(ev.since(0)) == 1
    m.update(base()); m.update(base())
    last = ev.since(0)[-1]
    assert last["level"] == "info" and last["message"].startswith("Recovered")


def test_events_since_and_ring_buffer():
    ev = EventLog(size=3)
    for n in range(5):
        ev.add("info", "t", f"e{n}")
    assert [e["message"] for e in ev.since(0)] == ["e2", "e3", "e4"]
    assert [e["message"] for e in ev.since(ev.since(0)[1]["id"])] == ["e4"]


def test_warning_logs_become_events():
    ev = EventLog()
    lg = logging.getLogger("healthtest")
    h = EventLogHandler(ev)
    lg.addHandler(h)
    try:
        lg.info("ignored"); lg.warning("careful"); lg.error("broke")
    finally:
        lg.removeHandler(h)
    assert [(e["level"], e["message"]) for e in ev.since(0)] == [("warning", "careful"), ("error", "broke")]


def test_prometheus_format():
    txt = prometheus({"camera_fps": ("fps", 29.5)})
    assert "# TYPE playground_camera_fps gauge" in txt and "playground_camera_fps 29.5" in txt
