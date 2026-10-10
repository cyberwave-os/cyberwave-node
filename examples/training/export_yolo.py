"""Materialize reviewed Cyberwave photo collections as a reproducible YOLO snapshot.

A training worker can call export_dataset() after an existing HTTP Request /
Run Workflow step dispatches its job. It owns compute and model registration.
Credentials come from the worker environment, never workflow inputs or a browser.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import math
import os
from pathlib import Path
from urllib.parse import urlencode, urlsplit
from urllib.request import HTTPRedirectHandler, Request, build_opener
from uuid import UUID


class NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


def checked_url(url: str) -> str:
    parsed = urlsplit(url)
    if parsed.username or parsed.password or parsed.scheme != "https" and not (parsed.scheme == "http" and parsed.hostname in {"localhost", "127.0.0.1", "::1"}):
        raise ValueError("Use HTTPS, or HTTP on localhost")
    return url


def download(url: str, *, token: str | None = None, limit: int = 20 * 1024 * 1024) -> bytes:
    headers = {"Authorization": f"Bearer {token}"} if token else {}
    with build_opener(NoRedirect).open(Request(checked_url(url), headers=headers), timeout=30) as response:
        content = response.read(limit + 1)
    if len(content) > limit:
        raise ValueError("Response exceeds the size limit")
    return content


def reviewed_samples(origin: str, token: str, dataset_uuid: str) -> list[dict]:
    dataset_uuid = str(UUID(dataset_uuid))
    origin = checked_url(origin).rstrip("/")
    if urlsplit(origin).path or urlsplit(origin).query or urlsplit(origin).fragment:
        raise ValueError("Provide an API origin without path, query or fragment")
    samples, after = [], 0
    while True:
        query = urlencode({"approved_only": "true", "limit": 100, "after": after})
        page = json.loads(download(f"{origin}/api/v1/datasets/{dataset_uuid}/samples?{query}", token=token))
        for sample in page["items"]:
            if sample["review_status"] != "approved" or sample["source_changed"] or not sample["reviewed_by_uuid"]:
                raise ValueError("Every training sample must have an explicit, current human review")
            samples.append(sample)
        cursor = page.get("next_after")
        if cursor is None:
            return samples
        if not isinstance(cursor, int) or cursor <= after:
            raise ValueError("Pagination did not advance")
        after = cursor


def yolo_labels(annotations: list[dict], classes: list[str], task: str = "detect") -> str:
    if task not in {"detect", "segment"}:
        raise ValueError("Choose detect or segment")
    rows = []
    for annotation in annotations:
        if task == "segment":
            points = annotation.get("polygon")
            if not isinstance(points, list) or not 3 <= len(points) <= 128 or any(len(p) != 2 or any(not math.isfinite(v) or not 0 <= v <= 1 for v in p) for p in points):
                raise ValueError("Segmentation export requires a reviewed polygon for every object")
            area = abs(sum(a[0]*b[1]-b[0]*a[1] for a,b in zip(points, points[1:]+points[:1]))) / 2
            if area <= 1e-12:
                raise ValueError("Polygon must enclose a non-zero area")
            coordinates = " ".join(f"{v:.8f}" for point in points for v in point)
            rows.append(f"{classes.index(annotation['label'])} {coordinates}")
            continue
        left, top, right, bottom = annotation["bbox"]
        if not all(0 <= value <= 1 for value in [left, top, right, bottom]) or not left < right or not top < bottom:
            raise ValueError("Invalid normalized box")
        rows.append(f"{classes.index(annotation['label'])} {(left+right)/2:.8f} {(top+bottom)/2:.8f} {right-left:.8f} {bottom-top:.8f}")
    return "\n".join(rows) + ("\n" if rows else "")


def export_dataset(origin: str, token: str, train_uuid: str, validation_uuid: str, output: Path, *, task: str = "detect") -> Path:
    from io import BytesIO
    from PIL import Image
    if train_uuid == validation_uuid:
        raise ValueError("Use separate training and validation collections")
    splits = {"train": reviewed_samples(origin, token, train_uuid), "val": reviewed_samples(origin, token, validation_uuid)}
    if not all(splits.values()):
        raise ValueError("Both collections need approved samples")
    train_hashes = {s["source_sha256"] for s in splits["train"]}
    if train_hashes & {s["source_sha256"] for s in splits["val"]}:
        raise ValueError("The same image appears in training and validation")
    classes = sorted({a["label"] for s in splits["train"] for a in s["annotations"]})
    if not classes:
        raise ValueError("Training needs at least one labeled class, not only negative images")
    if any(a["label"] not in classes for s in splits["val"] for a in s["annotations"]):
        raise ValueError("Validation contains a class absent from training")
    labels = {sample["uuid"]: yolo_labels(sample["annotations"], classes, task) for samples in splits.values() for sample in samples}
    output.mkdir(parents=True, exist_ok=False)  # Never mix a snapshot with an older export.
    provenance = {"task": task, "train_dataset_uuid": train_uuid, "validation_dataset_uuid": validation_uuid, "classes": classes, "samples": []}
    for split, samples in splits.items():
        for kind in ("images", "labels"):
            (output / kind / split).mkdir(parents=True)
        for sample in samples:
            content = download(sample["file_url"])  # Never send the API token to storage.
            if hashlib.sha256(content).hexdigest() != sample["source_sha256"]:
                raise ValueError("Media changed during export; discard this incomplete snapshot")
            with Image.open(BytesIO(content)) as image:
                extension = {"PNG": "png", "JPEG": "jpg", "WEBP": "webp"}[image.format]
                image.verify()
            identifier = str(UUID(sample["uuid"]))
            (output / "images" / split / f"{identifier}.{extension}").write_bytes(content)
            (output / "labels" / split / f"{identifier}.txt").write_text(labels[sample["uuid"]])
            provenance["samples"].append({key: value for key, value in {**sample, "split": split}.items() if key != "file_url"})
    # JSON is valid YAML. No string interpolation into a YAML document.
    (output / "data.yaml").write_text(json.dumps({"path": str(output.resolve()), "train": "images/train", "val": "images/val", "names": dict(enumerate(classes))}, indent=2))
    (output / "provenance.json").write_text(json.dumps(provenance, indent=2))
    # Written last: consumers reject an incomplete export lacking these files.
    return output / "data.yaml"


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--train-dataset", required=True)
    parser.add_argument("--validation-dataset", required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--model", help="Optional local YOLO checkpoint; enables training")
    parser.add_argument("--task", choices=["detect", "segment"], default="detect")
    parser.add_argument("--epochs", type=int, default=20)
    args = parser.parse_args()
    yaml = export_dataset(os.environ.get("CYBERWAVE_API_URL", "https://api.cyberwave.com"), os.environ["CYBERWAVE_API_TOKEN"], args.train_dataset, args.validation_dataset, args.output, task=args.task)
    print(f"Reviewed snapshot ready: {yaml}")
    if args.model:
        from ultralytics import YOLO
        YOLO(args.model, task=args.task).train(data=str(yaml), epochs=args.epochs)
