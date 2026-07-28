"""Shared fixtures.

Every test gets a throwaway database and a fresh registry, so tests never depend on
each other's state and never touch the developer's real folli.db.
"""

from __future__ import annotations

import os
import tempfile
from collections.abc import Iterator
from pathlib import Path

import pytest

# Must be set before app.config is imported anywhere.
_TMP_DB = Path(tempfile.mkdtemp(prefix="folli-test-")) / "test.db"
os.environ["FOLLI_DB_PATH"] = str(_TMP_DB)

from fastapi.testclient import TestClient  # noqa: E402

from app.main import create_app  # noqa: E402
from app.transport.registry import registry  # noqa: E402


@pytest.fixture()
def client() -> Iterator[TestClient]:
    """App with lifespan run, backed by a clean database."""
    if _TMP_DB.exists():
        _TMP_DB.unlink()

    registry._devices.clear()  # noqa: SLF001 — test isolation

    with TestClient(create_app()) as test_client:
        yield test_client

    registry.disconnect_all()


@pytest.fixture()
def mock_device(client: TestClient) -> str:
    """The always-present mock pouch, connected."""
    device_id = "POUCH-MOCK"
    client.post(f"/api/devices/{device_id}/connect").raise_for_status()
    return device_id


@pytest.fixture()
def edna(client: TestClient) -> dict:
    """A patient with a representative prescription."""
    response = client.post(
        "/api/patients",
        json={
            "full_name": "EDNA BERMINGTON",
            "national_id": "123456782",
            "prescriptions": [
                {"zone": "FRONT", "prescribed_mmhg": 40, "massage_level": 1,
                 "massage_seconds": 30},
                {"zone": "TEMPLE", "prescribed_mmhg": 40, "massage_level": 2,
                 "massage_seconds": 30},
                {"zone": "EAR", "prescribed_mmhg": 0, "massage_level": 0,
                 "massage_seconds": 30},
                {"zone": "BACK", "prescribed_mmhg": 35, "massage_level": 1,
                 "massage_seconds": 30},
            ],
        },
    )
    assert response.status_code == 201, response.text
    return response.json()
