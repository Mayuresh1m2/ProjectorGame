"""Real WebRTC loopback: an aiortc 'phone' sends synthetic frames to CameraReceiver."""
import asyncio
import fractions

import av
import numpy as np
from aiortc import RTCPeerConnection, VideoStreamTrack

from app.camera.receiver import CameraReceiver


class Synthetic(VideoStreamTrack):
    async def recv(self):
        pts, tb = await self.next_timestamp()
        img = np.full((240, 320, 3), 90, np.uint8)
        f = av.VideoFrame.from_ndarray(img, format="bgr24")
        f.pts, f.time_base = pts, tb
        return f


async def test_phone_to_receiver_roundtrip():
    got = []
    changes = []
    rx = CameraReceiver(lambda fr, t: got.append((fr.width, fr.height, t)), lambda: changes.append(rx.state))
    phone = RTCPeerConnection()
    phone.addTrack(Synthetic())
    await phone.setLocalDescription(await phone.createOffer())
    answer = await rx.handle_offer(phone.localDescription.sdp, phone.localDescription.type)
    await phone.setRemoteDescription(__import__("aiortc").RTCSessionDescription(**answer))
    for _ in range(100):
        if len(got) >= 5:
            break
        await asyncio.sleep(0.05)
    assert len(got) >= 5 and got[0][:2] == (320, 240)
    assert rx.state == "connected" and rx.stats()["fps"] > 1
    await rx.stop()
    assert rx.state == "idle" and rx.stats()["fps"] == 0
    await phone.close()


async def test_rejects_non_offer():
    rx = CameraReceiver(lambda *a: None)
    for bad in (("", "offer"), ("v=0", "answer")):
        try:
            await rx.handle_offer(*bad)
        except ValueError:
            continue
        raise AssertionError("should have raised")
    await rx.stop()
