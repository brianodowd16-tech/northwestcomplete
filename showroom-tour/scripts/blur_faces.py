#!/usr/bin/env python3
"""Find and blur faces in equirectangular 360 photos.

Faces are detected in ordinary perspective views cut from the panorama (the
equirectangular stretch confuses detectors), mapped back to yaw/pitch, and
blurred on the panorama with a feathered ellipse.

  python scripts/blur_faces.py detect PANO.jpg --model yunet.onnx --out faces.json [--sheet sheet.jpg]
  python scripts/blur_faces.py blur PANO.jpg faces.json --out PANO-blurred.jpg

faces.json lists every detection with an id; set "keep": true on any you do
not want blurred (e.g. staff), or add {"yaw", "pitch", "radius"} entries for
faces the detector missed. Needs opencv-python-headless and numpy.
"""

import argparse
import json
import math

import cv2
import numpy as np

VIEW = 1280  # perspective view size in pixels
FOV = 60.0  # degrees
YAWS = range(-180, 180, 30)
PITCHES = (-35, -10, 15)


def view_maps(w, h, yaw, pitch):
    """Pixel maps from a perspective view (yaw/pitch centre, FOV) into the equirect image."""
    f = (VIEW / 2) / math.tan(math.radians(FOV / 2))
    xs, ys = np.meshgrid(np.arange(VIEW) - VIEW / 2 + 0.5, np.arange(VIEW) - VIEW / 2 + 0.5)
    # camera rays: x right, y down, z forward
    d = np.stack([xs, ys, np.full_like(xs, f)], axis=-1)
    d /= np.linalg.norm(d, axis=-1, keepdims=True)
    p, yw = math.radians(pitch), math.radians(yaw)
    # tilt by pitch (around x), then turn by yaw (around y)
    rx = np.array([[1, 0, 0], [0, math.cos(p), -math.sin(p)], [0, math.sin(p), math.cos(p)]])
    ry = np.array([[math.cos(yw), 0, math.sin(yw)], [0, 1, 0], [-math.sin(yw), 0, math.cos(yw)]])
    d = d @ rx.T @ ry.T
    lon = np.arctan2(d[..., 0], d[..., 2])
    lat = -np.arcsin(np.clip(d[..., 1], -1, 1))
    mx = ((lon / (2 * math.pi) + 0.5) * w) % w
    my = (0.5 - lat / math.pi) * h
    return mx.astype(np.float32), my.astype(np.float32), lon, lat


def detect(img, model_path, score=0.6):
    h, w = img.shape[:2]
    det = cv2.FaceDetectorYN.create(model_path, "", (VIEW, VIEW), score, 0.3, 5000)
    found = []
    for pitch in PITCHES:
        for yaw in YAWS:
            mx, my, lon, lat = view_maps(w, h, yaw, pitch)
            view = cv2.remap(img, mx, my, cv2.INTER_LINEAR, borderMode=cv2.BORDER_WRAP)
            _, faces = det.detect(view)
            for f in faces if faces is not None else []:
                x, y, fw, fh, s = f[0], f[1], f[2], f[3], f[-1]
                cx, cy = int(min(VIEW - 1, max(0, x + fw / 2))), int(min(VIEW - 1, max(0, y + fh / 2)))
                fyaw, fpitch = math.degrees(lon[cy, cx]), math.degrees(lat[cy, cx])
                radius = max(fw, fh) / VIEW * FOV * 0.75  # angular radius, a little beyond the box
                found.append({"yaw": round(float(fyaw), 2), "pitch": round(float(fpitch), 2), "radius": round(float(radius), 2), "score": round(float(s), 3)})
    # The views overlap, so merge detections of the same face.
    merged = []
    for f in sorted(found, key=lambda f: -f["score"]):
        dup = next((m for m in merged if angular(m, f) < max(m["radius"], f["radius"])), None)
        if dup:
            dup["radius"] = max(dup["radius"], f["radius"])
        else:
            merged.append(dict(f))
    for i, m in enumerate(sorted(merged, key=lambda m: m["yaw"])):
        m["id"] = i
    return sorted(merged, key=lambda m: m["id"])


def angular(a, b):
    y1, p1, y2, p2 = map(math.radians, (a["yaw"], a["pitch"], b["yaw"], b["pitch"]))
    c = math.sin(p1) * math.sin(p2) + math.cos(p1) * math.cos(p2) * math.cos(y1 - y2)
    return math.degrees(math.acos(max(-1, min(1, c))))


def blur(img, faces):
    h, w = img.shape[:2]
    out = img.copy()
    for f in faces:
        if f.get("keep"):
            continue
        cx = (f["yaw"] / 360 + 0.5) * w
        cy = (0.5 - f["pitch"] / 180) * h
        ry = f["radius"] / 180 * h * 1.15
        rx = f["radius"] / 360 * w / max(0.2, math.cos(math.radians(f["pitch"])))
        pad = int(max(rx, ry) * 1.6)
        for shift in (-w, 0, w):  # a face on the seam continues on the other side
            x0, x1 = int(cx + shift - pad), int(cx + shift + pad)
            y0, y1 = max(0, int(cy - pad)), min(h, int(cy + pad))
            if x1 < 0 or x0 >= w:
                continue
            cx0, cx1 = max(0, x0), min(w, x1)
            patch = out[y0:y1, cx0:cx1]
            k = int(max(rx, ry) * 0.9) | 1
            blurred = cv2.GaussianBlur(cv2.resize(patch, None, fx=0.25, fy=0.25), (k // 4 | 1, k // 4 | 1), 0)
            blurred = cv2.resize(blurred, (patch.shape[1], patch.shape[0]))
            mask = np.zeros(patch.shape[:2], np.float32)
            cv2.ellipse(mask, (int(cx + shift - cx0), int(cy - y0)), (int(rx), int(ry)), 0, 0, 360, 1.0, -1)
            mask = cv2.GaussianBlur(mask, (0, 0), max(2, min(rx, ry) * 0.25))[..., None]
            out[y0:y1, cx0:cx1] = (patch * (1 - mask) + blurred * mask).astype(np.uint8)
    return out


def contact_sheet(img, faces, path):
    """One labelled thumbnail per detection, to choose which to keep."""
    h, w = img.shape[:2]
    tiles = []
    for f in faces:
        mx, my, _, _ = view_maps(w, h, f["yaw"], f["pitch"])
        view = cv2.remap(img, mx, my, cv2.INTER_LINEAR, borderMode=cv2.BORDER_WRAP)
        half = int(max(60, f["radius"] / FOV * VIEW * 1.6))
        c = VIEW // 2
        crop = cv2.resize(view[c - half:c + half, c - half:c + half], (200, 200))
        cv2.putText(crop, f"#{f['id']}", (6, 24), cv2.FONT_HERSHEY_SIMPLEX, 0.8, (0, 255, 255), 2)
        tiles.append(crop)
    if not tiles:
        return
    cols = 6
    rows = math.ceil(len(tiles) / cols)
    sheet = np.zeros((rows * 200, cols * 200, 3), np.uint8)
    for i, t in enumerate(tiles):
        sheet[(i // cols) * 200:(i // cols + 1) * 200, (i % cols) * 200:(i % cols + 1) * 200] = t
    cv2.imwrite(path, sheet)


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest="cmd", required=True)
    d = sub.add_parser("detect")
    d.add_argument("pano")
    d.add_argument("--model", required=True)
    d.add_argument("--out", required=True)
    d.add_argument("--sheet")
    d.add_argument("--score", type=float, default=0.6)
    b = sub.add_parser("blur")
    b.add_argument("pano")
    b.add_argument("faces")
    b.add_argument("--out", required=True)
    a = ap.parse_args()

    img = cv2.imread(a.pano, cv2.IMREAD_COLOR)
    if img is None:
        raise SystemExit(f"cannot read {a.pano}")
    if a.cmd == "detect":
        faces = detect(img, a.model, a.score)
        with open(a.out, "w") as fh:
            json.dump(faces, fh, indent=2)
        if a.sheet:
            contact_sheet(img, faces, a.sheet)
        print(f"{len(faces)} face(s) -> {a.out}")
    else:
        with open(a.faces) as fh:
            faces = json.load(fh)
        cv2.imwrite(a.out, blur(img, faces), [cv2.IMWRITE_JPEG_QUALITY, 90])
        print(f"blurred {sum(1 for f in faces if not f.get('keep'))} of {len(faces)} -> {a.out}")


if __name__ == "__main__":
    main()
