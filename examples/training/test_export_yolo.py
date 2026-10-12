"""Exercise snapshot integrity without a network, GPU or model download."""
import hashlib
import tempfile
import unittest
from io import BytesIO
from pathlib import Path
from unittest.mock import patch
from uuid import uuid4

from PIL import Image
from export_yolo import export_dataset, yolo_labels


class ExportTests(unittest.TestCase):
    def sample(self, color):
        image = BytesIO()
        Image.new("RGB", (8, 8), color).save(image, format="PNG")
        content = image.getvalue()
        return {"uuid": str(uuid4()), "file_url": f"https://storage.example/{color}.png", "source_sha256": hashlib.sha256(content).hexdigest(), "annotations": [{"label": "part", "bbox": [0.1,0.2,0.7,0.8]}], "reviewed_by_uuid": str(uuid4()), "revision": 2}, content

    def test_coordinates_and_negative_examples(self):
        self.assertEqual(yolo_labels([], ["part"]), "")
        self.assertEqual(yolo_labels([{"label":"part","bbox":[0,0,1,1]}], ["part"]), "0 0.50000000 0.50000000 1.00000000 1.00000000\n")

    def test_segmentation_requires_real_polygon_and_preserves_vertices(self):
        polygon = [[0.1,0.2],[0.7,0.2],[0.4,0.8]]
        labels = [{"label":"part", "bbox":[0.1,0.2,0.7,0.8], "polygon":polygon}]
        self.assertEqual(yolo_labels(labels, ["part"], "segment"), "0 0.10000000 0.20000000 0.70000000 0.20000000 0.40000000 0.80000000\n")
        self.assertEqual(yolo_labels([], ["part"], "segment"), "")
        for points in (None, [[0,0],[1,1],[0.5,0.5]], [[0,0],[1,0],[2,1]]):
            with self.assertRaises(ValueError):
                yolo_labels([{**labels[0], "polygon":points}], ["part"], "segment")

    def test_export_keeps_provenance_and_never_sends_media_credentials(self):
        train, train_bytes = self.sample("red")
        val, val_bytes = self.sample("blue")
        with tempfile.TemporaryDirectory() as folder, patch("export_yolo.reviewed_samples", side_effect=[[train],[val]]), patch("export_yolo.download", side_effect=[train_bytes,val_bytes]) as download:
            result = export_dataset("https://api.example", "secret", "train", "val", Path(folder)/"snapshot")
            self.assertTrue(result.exists())
            manifest = (result.parent/"provenance.json").read_text()
            self.assertNotIn("file_url", manifest)
            self.assertIn(train["source_sha256"], manifest)
            self.assertTrue(all(not call.kwargs for call in download.call_args_list))

    def test_split_overlap_and_changed_media_fail_closed(self):
        sample, content = self.sample("red")
        with tempfile.TemporaryDirectory() as folder, patch("export_yolo.reviewed_samples", side_effect=[[sample],[sample]]):
            with self.assertRaisesRegex(ValueError,"same image"):
                export_dataset("https://api.example", "secret", "train", "val", Path(folder)/"snapshot")
        other, _ = self.sample("blue")
        with tempfile.TemporaryDirectory() as folder, patch("export_yolo.reviewed_samples", side_effect=[[sample],[other]]), patch("export_yolo.download", return_value=b"changed"):
            output = Path(folder)/"snapshot"
            with self.assertRaisesRegex(ValueError,"Media changed"):
                export_dataset("https://api.example", "secret", "train", "val", output)
            self.assertFalse((output/"data.yaml").exists())

if __name__ == "__main__":
    unittest.main()
