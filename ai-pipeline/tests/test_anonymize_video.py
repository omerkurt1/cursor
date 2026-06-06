from __future__ import annotations

import sys
import unittest
from pathlib import Path
from unittest.mock import patch


SCRIPTS_DIR = Path(__file__).resolve().parents[1] / "scripts"
sys.path.insert(0, str(SCRIPTS_DIR))

from anonymize_video import require_anonymizers


class RequireAnonymizersTests(unittest.TestCase):
    @patch("anonymize_video.load_cascade")
    def test_fails_closed_without_face_detector(self, load_cascade):
        load_cascade.side_effect = [None, object(), object()]

        with self.assertRaisesRegex(RuntimeError, "face anonymizer"):
            require_anonymizers()

    @patch("anonymize_video.load_cascade")
    def test_fails_closed_without_plate_detector(self, load_cascade):
        load_cascade.side_effect = [object(), None, None]

        with self.assertRaisesRegex(RuntimeError, "plate anonymizer"):
            require_anonymizers()

    @patch("anonymize_video.load_cascade")
    def test_returns_available_anonymizers(self, load_cascade):
        face = object()
        plate = object()
        load_cascade.side_effect = [face, plate, None]

        self.assertEqual(require_anonymizers(), (face, [plate]))


if __name__ == "__main__":
    unittest.main()
