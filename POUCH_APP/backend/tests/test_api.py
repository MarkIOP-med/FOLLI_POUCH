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
        assert snapshot["ceiling_mmhg"] == 130
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
        # railed 4095 = open circuit — must surface as FAULT, never a number
        assert zone_of(snapshot, "FRONT")["fsr_l"]["state"] == "FAULT"
        assert zone_of(snapshot, "FRONT")["fsr_l"]["raw"] is None
        # Gen4 reads all 8 FSR channels — the Gen3 EAR stub is gone, so EAR's live
        # channel reports a real number like any other
        assert zone_of(snapshot, "EAR")["fsr_l"]["state"] == "OK"
        assert isinstance(zone_of(snapshot, "EAR")["fsr_l"]["raw"], int)

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
        assert zone_of(snapshot, "BACK")["prescribed_mmhg"] == 130

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
    def test_stop_sends_the_stop_command(self, client: TestClient, mock_device: str):
        """Gen4 firmware's `stop` vents everything (bench-verified 2026-08-20)."""
        response = client.post(f"/api/devices/{mock_device}/stop")
        assert response.json()["sent"] == "stop"

    def test_pause_vents_and_keeps_the_session(
        self, client: TestClient, mock_device: str, edna: dict
    ):
        client.post(
            f"/api/devices/{mock_device}/session", json={"patient_id": edna["id"]}
        ).raise_for_status()
        client.post(f"/api/devices/{mock_device}/pause").raise_for_status()

        assert client.get(f"/api/devices/{mock_device}").json()["session_id"] is not None

    def test_commands_rejected_when_disconnected(
        self, client: TestClient, mock_device: str
    ):
        client.delete(f"/api/devices/{mock_device}/connect").raise_for_status()
        assert client.post(f"/api/devices/{mock_device}/stop").status_code == 409


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
        assert zone_of(snapshot, "BACK")["effective_mmhg"] == 130

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


class TestConsoleStartedSessionMirroring:
    """A session started at the patient console (over BLE) must show up in the
    operator app: adopted as a session record, tied to the checked-out patient,
    with the DEVICE's own clock and targets — not app-side zeros."""

    @staticmethod
    def _running_frame(elapsed: int, targets: dict[str, int]) -> str:
        # A real 20-field enriched telemetry line in MAINTENANCE.
        from app.core.zones import ZONES
        cols = {"time": 1000, "MAN": 80, "STATE": "M", "ELAPSED": elapsed}
        for z in ZONES:
            cols[f"{z[:3].upper() if z != 'FRONT' else 'FRN'}_T"] = targets[z]
        # Build in the documented field order via the parser's own names.
        from app.transport import protocol as p
        vals = []
        tmap = {"FRONT": "FRN", "TEMPLE": "TMP", "EAR": "EAR", "BACK": "BCK"}
        for name in p.TELEMETRY_FIELDS:
            if name == "time":
                vals.append("1000")
            elif name == "MAN":
                vals.append("80")
            elif name == "STATE":
                vals.append("M")
            elif name == "ELAPSED":
                vals.append(str(elapsed))
            elif name.endswith("_T"):
                zone = next(z for z, ab in tmap.items() if name.startswith(ab))
                vals.append(str(targets[zone]))
            elif name.endswith("_A"):
                zone = next(z for z, ab in tmap.items() if name.startswith(ab))
                vals.append(str(targets[zone]))  # actual == target (settled)
            else:  # FSR channels
                vals.append("0")
        return "T:" + ",".join(vals)

    def _inject(self, mock_device: str, line: str) -> None:
        from app.transport import protocol as p
        from app.transport.registry import registry
        rt = registry.get(mock_device)
        rt.last_frame = p.parse_telemetry(line)

    def test_console_start_is_adopted_and_recorded(
        self, client: TestClient, mock_device: str, edna: dict
    ):
        # The operator selected the patient (checkout), but did NOT press START.
        client.put(
            f"/api/devices/{mock_device}/patient", json={"patient_id": edna["id"]}
        ).raise_for_status()

        # The pouch is now running — the console started it.
        self._inject(
            mock_device,
            self._running_frame(37, {"FRONT": 40, "TEMPLE": 40, "EAR": 0, "BACK": 0}),
        )
        snap = client.get(f"/api/devices/{mock_device}").json()

        # Adopted: a session record exists, marked as console-driven, on the
        # checked-out patient — with the device's clock, not zero.
        assert snap["session_id"] is not None
        assert snap["session_source"] == "console"
        assert snap["patient"]["id"] == edna["id"]
        assert snap["session_elapsed_s"] == 37
        assert zone_of(snap, "FRONT")["effective_mmhg"] == 40

        # The session is recorded against the patient (a treatment must leave a trace).
        sessions = client.get(f"/api/patients/{edna['id']}/sessions").json()
        assert any(s["id"] == snap["session_id"] for s in sessions)

    def test_adopted_session_closes_when_the_pouch_goes_idle(
        self, client: TestClient, mock_device: str, edna: dict
    ):
        client.put(
            f"/api/devices/{mock_device}/patient", json={"patient_id": edna["id"]}
        ).raise_for_status()
        self._inject(
            mock_device,
            self._running_frame(10, {"FRONT": 40, "TEMPLE": 40, "EAR": 0, "BACK": 0}),
        )
        opened = client.get(f"/api/devices/{mock_device}").json()
        assert opened["session_id"] is not None

        # The console stopped it; the pouch vents to idle.
        self._inject(
            mock_device,
            self._running_frame(0, {"FRONT": 0, "TEMPLE": 0, "EAR": 0, "BACK": 0}).replace(
                ",M,", ",I,"
            ),
        )
        closed = client.get(f"/api/devices/{mock_device}").json()
        assert closed["session_id"] is None
        assert closed["session_source"] is None


class TestNoUserAndFactoryReset:
    def test_no_user_is_seeded_and_protected(self, client: TestClient):
        # NO_USER exists with the factory regime and cannot be deleted.
        patients = client.get("/api/patients").json()
        no_user = [p for p in patients if p["full_name"] == "NO_USER"]
        assert len(no_user) == 1, "NO_USER must be seeded exactly once"
        nid = no_user[0]["id"]
        rx = {p["zone"]: p["prescribed_mmhg"] for p in no_user[0]["prescriptions"]}
        assert rx == {"FRONT": 25, "TEMPLE": 120, "EAR": 85, "BACK": 130}

        r = client.delete(f"/api/patients/{nid}")
        assert r.status_code == 400
        assert client.get(f"/api/patients/{nid}").status_code == 200  # still there

    def test_connect_defaults_the_pouch_to_no_user(
        self, client: TestClient, mock_device: str
    ):
        snap = client.get(f"/api/devices/{mock_device}").json()
        assert snap["checked_out_patient"] is not None
        assert snap["checked_out_patient"]["full_name"] == "NO_USER"

    def test_restart_is_accepted(self, client: TestClient, mock_device: str):
        r = client.post(f"/api/devices/{mock_device}/restart")
        assert r.status_code == 200
        assert r.json()["sent"]

    def test_factory_reset_wipes_patients_except_no_user(
        self, client: TestClient, mock_device: str, edna: dict
    ):
        # Two real patients plus the seeded NO_USER.
        client.post("/api/patients", json={"full_name": "SECOND"}).raise_for_status()
        before = client.get("/api/patients").json()
        assert len(before) >= 3

        r = client.post(f"/api/devices/{mock_device}/factory-reset")
        assert r.status_code == 200

        after = client.get("/api/patients").json()
        assert len(after) == 1
        assert after[0]["full_name"] == "NO_USER"
        # The board is checked back out to NO_USER.
        snap = client.get(f"/api/devices/{mock_device}").json()
        assert snap["checked_out_patient"]["full_name"] == "NO_USER"
