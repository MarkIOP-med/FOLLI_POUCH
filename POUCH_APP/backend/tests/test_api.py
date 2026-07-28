"""End-to-end API behaviour against the mock pouch."""

import time

from fastapi.testclient import TestClient


def zone_of(snapshot: dict, name: str) -> dict:
    return next(z for z in snapshot["zones"] if z["zone"] == name)


class TestPatients:
    def test_created_with_prescriptions(self, edna: dict):
        assert edna["mrn"] == f"{edna['id']:06d}", "MRN must track the row id"
        assert zone_of({"zones": edna["prescriptions"]}, "FRONT")["prescribed_mmhg"] == 40

    def test_rejects_invalid_national_id(self, client: TestClient):
        response = client.post(
            "/api/patients", json={"full_name": "BAD ID", "national_id": "123456789"}
        )
        assert response.status_code == 400

    def test_mrn_is_not_reused_after_delete(self, client: TestClient, edna: dict):
        """MAX(id)+1 would retire and then re-issue an MRN to a different person."""
        client.delete(f"/api/patients/{edna['id']}").raise_for_status()
        created = client.post("/api/patients", json={"full_name": "SOMEONE ELSE"}).json()
        assert created["mrn"] != edna["mrn"]


class TestSessionAndZones:
    def test_snapshot_reports_prescription(
        self, client: TestClient, mock_device: str, edna: dict
    ):
        client.post(
            f"/api/devices/{mock_device}/session", json={"patient_id": edna["id"]}
        ).raise_for_status()

        snapshot = client.get(f"/api/devices/{mock_device}").json()
        assert snapshot["connected"]
        assert snapshot["ceiling_mmhg"] == 70
        assert snapshot["patient"]["national_id_masked"].endswith("6782")
        assert zone_of(snapshot, "FRONT")["effective_mmhg"] == 40

    def test_fsr_faults_never_surface_as_numbers(
        self, client: TestClient, mock_device: str, edna: dict
    ):
        client.post(
            f"/api/devices/{mock_device}/session", json={"patient_id": edna["id"]}
        ).raise_for_status()
        time.sleep(1.5)

        snapshot = client.get(f"/api/devices/{mock_device}").json()
        assert zone_of(snapshot, "FRONT")["fsr_l"]["raw"] is None
        assert zone_of(snapshot, "EAR")["fsr_l"]["state"] == "NOT_IMPLEMENTED"

    def test_hardware_state_reported_as_absent(
        self, client: TestClient, mock_device: str
    ):
        """Pump/valve state is not in the telemetry CSV; it must not be invented."""
        hardware = client.get(f"/api/devices/{mock_device}").json()["hardware"]
        assert hardware["reported"] is False
        assert hardware["pump"] is None
        assert all(v is None for v in hardware["valves"].values())


class TestTrim:
    def test_trim_never_touches_the_prescription(
        self, client: TestClient, mock_device: str, edna: dict
    ):
        client.post(
            f"/api/devices/{mock_device}/session", json={"patient_id": edna["id"]}
        ).raise_for_status()
        client.put(
            f"/api/devices/{mock_device}/trim", json={"zone": "FRONT", "trim_pct": 10}
        ).raise_for_status()

        front = zone_of(client.get(f"/api/devices/{mock_device}").json(), "FRONT")
        assert front["prescribed_mmhg"] == 40
        assert front["trim_pct"] == 10
        assert front["effective_mmhg"] == 44

    def test_over_range_trim_clamps(
        self, client: TestClient, mock_device: str, edna: dict
    ):
        client.post(
            f"/api/devices/{mock_device}/session", json={"patient_id": edna["id"]}
        ).raise_for_status()
        client.put(
            f"/api/devices/{mock_device}/trim", json={"zone": "FRONT", "trim_pct": 90}
        ).raise_for_status()

        front = zone_of(client.get(f"/api/devices/{mock_device}").json(), "FRONT")
        assert front["trim_pct"] == 10


class TestDeviceScreenEditing:
    def test_target_box_writes_rx_and_leaves_trim(
        self, client: TestClient, mock_device: str, edna: dict
    ):
        client.post(
            f"/api/devices/{mock_device}/session", json={"patient_id": edna["id"]}
        ).raise_for_status()
        client.put(
            f"/api/devices/{mock_device}/trim", json={"zone": "FRONT", "trim_pct": 10}
        ).raise_for_status()

        client.put(
            f"/api/devices/{mock_device}/zones/BACK", json={"mmhg": 45}
        ).raise_for_status()

        snapshot = client.get(f"/api/devices/{mock_device}").json()
        assert zone_of(snapshot, "BACK")["prescribed_mmhg"] == 45
        assert zone_of(snapshot, "FRONT")["trim_pct"] == 10

    def test_over_ceiling_rx_clamps(
        self, client: TestClient, mock_device: str, edna: dict
    ):
        client.post(
            f"/api/devices/{mock_device}/session", json={"patient_id": edna["id"]}
        ).raise_for_status()
        client.put(
            f"/api/devices/{mock_device}/zones/BACK", json={"mmhg": 999}
        ).raise_for_status()

        snapshot = client.get(f"/api/devices/{mock_device}").json()
        assert zone_of(snapshot, "BACK")["prescribed_mmhg"] == 70

    def test_unknown_zone_rejected(
        self, client: TestClient, mock_device: str, edna: dict
    ):
        client.post(
            f"/api/devices/{mock_device}/session", json={"patient_id": edna["id"]}
        ).raise_for_status()
        response = client.put(f"/api/devices/{mock_device}/zones/NOSE", json={"mmhg": 10})
        assert response.status_code == 400


class TestAdminActions:
    def test_promote_consumes_the_trim(
        self, client: TestClient, mock_device: str, edna: dict
    ):
        """Rx 40 + 10% becomes Rx 44 / trim 0 — not Rx 44 with the trim re-applying."""
        client.post(
            f"/api/devices/{mock_device}/session", json={"patient_id": edna["id"]}
        ).raise_for_status()
        client.put(
            f"/api/devices/{mock_device}/trim", json={"zone": "FRONT", "trim_pct": 10}
        ).raise_for_status()

        client.post(
            f"/api/devices/{mock_device}/admin/set-current-default"
        ).raise_for_status()

        front = zone_of(client.get(f"/api/devices/{mock_device}").json(), "FRONT")
        assert front["prescribed_mmhg"] == 44
        assert front["trim_pct"] == 0
        assert front["effective_mmhg"] == 44

    def test_reset_clears_everything(
        self, client: TestClient, mock_device: str, edna: dict
    ):
        client.post(
            f"/api/devices/{mock_device}/session", json={"patient_id": edna["id"]}
        ).raise_for_status()
        client.post(
            f"/api/devices/{mock_device}/admin/reset-defaults"
        ).raise_for_status()

        snapshot = client.get(f"/api/devices/{mock_device}").json()
        assert all(
            z["prescribed_mmhg"] == 0 and z["trim_pct"] == 0 for z in snapshot["zones"]
        )


class TestSafetyCommands:
    def test_stop_sends_r_not_s(self, client: TestClient, mock_device: str):
        """'s' sets STOPPED but never writes PUMP_PIN LOW — the pump keeps running."""
        response = client.post(f"/api/devices/{mock_device}/stop")
        assert response.json()["sent"] == "r"

    def test_pause_vents_and_keeps_the_session(
        self, client: TestClient, mock_device: str, edna: dict
    ):
        client.post(
            f"/api/devices/{mock_device}/session", json={"patient_id": edna["id"]}
        ).raise_for_status()
        client.post(f"/api/devices/{mock_device}/pause").raise_for_status()

        assert client.get(f"/api/devices/{mock_device}").json()["session_id"] is not None

    def test_commands_rejected_when_disconnected(self, client: TestClient):
        client.post("/api/devices/POUCH-MOCK/connect").raise_for_status()
        client.delete("/api/devices/POUCH-MOCK/connect").raise_for_status()
        assert client.post("/api/devices/POUCH-MOCK/stop").status_code == 409


class TestServiceMode:
    def test_setpoint_clamps_to_ceiling(self, client: TestClient, mock_device: str):
        client.post(
            f"/api/devices/{mock_device}/session", json={"patient_id": None}
        ).raise_for_status()
        client.put(
            f"/api/devices/{mock_device}/setpoint", json={"zone": "BACK", "mmhg": 250}
        ).raise_for_status()

        snapshot = client.get(f"/api/devices/{mock_device}").json()
        assert snapshot["service_mode"] is True
        assert zone_of(snapshot, "BACK")["effective_mmhg"] == 70

    def test_rx_editing_rejected_without_a_patient(
        self, client: TestClient, mock_device: str
    ):
        client.post(
            f"/api/devices/{mock_device}/session", json={"patient_id": None}
        ).raise_for_status()
        assert (
            client.put(f"/api/devices/{mock_device}/zones/BACK", json={"mmhg": 40}).status_code
            == 409
        )


class TestSystem:
    def test_health_exposes_canonical_zone_map(self, client: TestClient):
        body = client.get("/api/health").json()
        assert body["zones"] == ["FRONT", "TEMPLE", "EAR", "BACK"]

    def test_settings_round_trip(self, client: TestClient):
        client.put(
            "/api/settings",
            json={
                "max_pressure_mmhg": 60,
                "trim_range_pct": 5,
                "default_massage_seconds": 20,
            },
        ).raise_for_status()
        assert client.get("/api/settings").json()["max_pressure_mmhg"] == 60

    def test_unknown_device_is_404(self, client: TestClient):
        assert client.get("/api/devices/NOPE").status_code == 404
