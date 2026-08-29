"""First-run auto-provisioning of detected pouches."""

from __future__ import annotations

from fastapi.testclient import TestClient

from app.db.session import session_scope
from app.services import provisioning
from app.transport.registry import registry


def _ports(*specs: tuple[str, bool]) -> list[dict]:
    return [
        {"port": port, "description": port, "hwid": "", "likely_pouch": likely}
        for port, likely in specs
    ]


class TestProvisioning:
    def test_registers_only_likely_pouches_when_roster_empty(
        self, client: TestClient, monkeypatch
    ):
        monkeypatch.setattr(
            provisioning, "list_ports", lambda: _ports(("COM9", True), ("COM3", False))
        )

        with session_scope() as conn:
            added = provisioning.provision_detected_pouches(conn)

        assert added == ["COM9"], "only the CP2102 pouch, not every COM port"
        assert registry.get("COM9") is not None
        assert registry.get("COM3") is None

        # And it surfaces through the API the home screen reads.
        roster = client.get("/api/devices").json()
        assert [d["id"] for d in roster] == ["COM9"]
        assert roster[0]["transport"] == "serial"
        assert roster[0]["port"] == "COM9"
        assert roster[0]["connected"] is False, "connect stays an explicit action"

    def test_is_a_noop_once_any_device_exists(
        self, client: TestClient, monkeypatch
    ):
        # An operator already added (and could later remove) a device.
        client.post(
            "/api/devices",
            json={"id": "BENCH-1", "label": "BENCH-1", "transport": "mock", "port": None},
        ).raise_for_status()

        monkeypatch.setattr(provisioning, "list_ports", lambda: _ports(("COM9", True)))
        with session_scope() as conn:
            added = provisioning.provision_detected_pouches(conn)

        assert added == [], "never overrides a non-empty roster"
        assert registry.get("COM9") is None

    def test_registers_nothing_when_no_pouch_is_present(
        self, client: TestClient, monkeypatch
    ):
        monkeypatch.setattr(provisioning, "list_ports", lambda: _ports(("COM3", False)))
        with session_scope() as conn:
            added = provisioning.provision_detected_pouches(conn)

        assert added == []
