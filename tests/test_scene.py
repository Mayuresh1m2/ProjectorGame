import pytest

from app.config import DEFAULT_SCENE
from app.projection.scene import SceneError, validate_scene

Q = [[0.1, 0.1], [0.5, 0.1], [0.5, 0.5], [0.1, 0.5]]


def surf(**kw):
    return {"id": "a", "name": "A", "content": {"type": "color", "color": "#fff"}, "quad": Q, **kw}


def test_default_scene_is_valid():
    assert validate_scene(DEFAULT_SCENE)["surfaces"][0]["id"] == "main"


def test_adds_defaults_for_video():
    out = validate_scene({"surfaces": [surf(content={"type": "video", "src": "/media/a.mp4"})]})
    c = out["surfaces"][0]["content"]
    assert c["playing"] is True and c["loop"] is True and c["volume"] == 0.8 and c["fit"] == "cover"


def test_volume_clamped():
    out = validate_scene({"surfaces": [surf(content={"type": "video", "src": "/media/a.mp4", "volume": 5})]})
    assert out["surfaces"][0]["content"]["volume"] == 1.0


@pytest.mark.parametrize("src", ["/etc/passwd", "http://evil/x.mp4", "/media/../secret.mp4", ""])
def test_video_src_must_be_local_media(src):
    with pytest.raises(SceneError):
        validate_scene({"surfaces": [surf(content={"type": "video", "src": src})]})


def test_rejects_bad_quads():
    for q in ([[0, 0]] * 3, [[0, 0], [1, 0], [1, 1], [float("inf"), 1]], [[0, 0], [0, 0], [0, 0], [0, 0]], [[0, 0], [99, 0], [1, 1], [0, 1]]):
        with pytest.raises(SceneError):
            validate_scene({"surfaces": [surf(quad=q)]})


def test_duplicate_ids_and_limits():
    with pytest.raises(SceneError):
        validate_scene({"surfaces": [surf(), surf()]})
    with pytest.raises(SceneError):
        validate_scene({"surfaces": [surf(id=f"s{i}") for i in range(30)]})


def test_shape_and_polygon_validation():
    with pytest.raises(SceneError):
        validate_scene({"surfaces": [surf(shape="star")]})
    with pytest.raises(SceneError):
        validate_scene({"surfaces": [surf(shape="polygon", polygon=[[0, 0], [1, 1]])]})
    ok = validate_scene({"surfaces": [surf(shape="polygon", polygon=[[0, 0], [1, 0], [0.5, 1]])]})
    assert ok["surfaces"][0]["shape"] == "polygon"


def test_unknown_content_type():
    with pytest.raises(SceneError):
        validate_scene({"surfaces": [surf(content={"type": "script"})]})


def test_every_preset_is_a_valid_scene_and_uses_known_games():
    from app.projection.presets import PRESETS
    from app.projection.scene import validate_scene
    known = {"menu", "butterfly", "fish", "balloons", "diyas", "sweets", "rangoli", "sky", "quest"}
    assert "diwali-wall" in PRESETS and "diwali-corner" in PRESETS
    for name, p in PRESETS.items():
        scene = validate_scene(p["scene"])
        assert scene["surfaces"], name
        for s in scene["surfaces"]:
            if s["content"]["type"] == "game":
                assert s["content"]["game"] in known, (name, s["id"])


def test_image_and_slideshow_content_are_validated():
    out = validate_scene({"surfaces": [
        surf(id="a", content={"type": "image", "src": "/media/decor/diya.svg"}),
        surf(id="b", content={"type": "slideshow", "srcs": ["/media/a.png", "/media/b.jpg"], "seconds": 0.1, "fadeSeconds": 99, "shuffle": 1})]})
    assert out["surfaces"][0]["content"]["fit"] == "cover"
    show = out["surfaces"][1]["content"]
    assert show["seconds"] == 2.0 and show["fadeSeconds"] == 5.0 and show["shuffle"] is True


@pytest.mark.parametrize("content", [
    {"type": "image", "src": "/etc/passwd"}, {"type": "image", "src": "/media/../x.png"}, {"type": "image"},
    {"type": "slideshow", "srcs": []}, {"type": "slideshow", "srcs": ["http://evil/x.png"]}, {"type": "slideshow", "srcs": "/media/a.png"}])
def test_bad_picture_content_is_rejected(content):
    with pytest.raises(SceneError):
        validate_scene({"surfaces": [surf(content=content)]})


# ---- reactions ----
def _surf(**extra):
    return {"id": "a", "content": {"type": "slideshow", "srcs": ["/media/x.png"]}, "quad": [[0, 0], [1, 0], [1, 1], [0, 1]], **extra}


def test_reaction_defaults_and_clamping():
    s = validate_scene({"surfaces": [_surf(), _surf(id="b", reaction={"wake": True, "dim": 5, "hold": 0, "next": "wave"})]})["surfaces"]
    assert s[0]["reaction"] == {"wake": False, "dim": 0.15, "hold": 4.0, "next": "off"}
    assert s[1]["reaction"] == {"wake": True, "dim": 0.9, "hold": 1.0, "next": "wave"}


@pytest.mark.parametrize("bad", [{"next": "shout"}, "wake", {"dim": "x"}])
def test_bad_reaction_rejected(bad):
    with pytest.raises(SceneError):
        validate_scene({"surfaces": [_surf(reaction=bad)]})


def test_video_playlist_validated():
    vid = lambda pl: {"id": "v", "content": {"type": "video", "src": "/media/a.mp4", "playlist": pl}, "quad": [[0, 0], [1, 0], [1, 1], [0, 1]]}  # noqa: E731
    assert validate_scene({"surfaces": [vid(["/media/b.mp4"])]})["surfaces"][0]["content"]["playlist"] == ["/media/b.mp4"]
    for bad in (["/etc/passwd"], ["/media/../x.mp4"], "no", ["/media/a.mp4"] * 21):
        with pytest.raises(SceneError):
            validate_scene({"surfaces": [vid(bad)]})


def test_border_defaults_and_clamping():
    s = validate_scene({"surfaces": [_surf(), _surf(id="b", border={"width": 999, "color": "#fff", "glow": False}), _surf(id="c", border={"width": -3})]})["surfaces"]
    assert s[0]["border"]["width"] == 0 and s[0]["border"]["glow"] is True
    assert s[1]["border"] == {"width": 60.0, "color": "#fff", "glow": False}
    assert s[2]["border"]["width"] == 0
    with pytest.raises(SceneError):
        validate_scene({"surfaces": [_surf(border="gold")]})


def test_focus_defaults_and_clamping():
    v = lambda **c: _surf(content={"type": "video", "src": "/media/a.mp4", **c})
    out = validate_scene({"surfaces": [v(), _surf(id="b", content={"type": "video", "src": "/media/a.mp4", "focus": [2, -1]})]})["surfaces"]
    assert out[0]["content"]["focus"] == [0.5, 0.5] and out[1]["content"]["focus"] == [1.0, 0.0]
    with pytest.raises(SceneError):
        validate_scene({"surfaces": [_surf(content={"type": "video", "src": "/media/a.mp4", "focus": 3})]})
