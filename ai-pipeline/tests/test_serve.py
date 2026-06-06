from __future__ import annotations

import sys
import unittest
from pathlib import Path


SCRIPTS_DIR = Path(__file__).resolve().parents[1] / "scripts"
sys.path.insert(0, str(SCRIPTS_DIR))

from serve import app


class ApiCorsTests(unittest.TestCase):
    def setUp(self):
        self.client = app.test_client()

    def test_allows_local_dashboard_origin(self):
        response = self.client.get(
            "/health",
            headers={"Origin": "http://127.0.0.1:5173"},
        )

        self.assertEqual(
            response.headers.get("Access-Control-Allow-Origin"),
            "http://127.0.0.1:5173",
        )

    def test_rejects_remote_dashboard_origin(self):
        response = self.client.get(
            "/health",
            headers={"Origin": "https://example.com"},
        )

        self.assertIsNone(response.headers.get("Access-Control-Allow-Origin"))


if __name__ == "__main__":
    unittest.main()
