"""Cross-language protocol conformance: run every shared vector against protocol.py.

The vectors file (shared/protocol-vectors.json, repo root) is the single source of
truth for the FOLLI grammar across the C++ firmware, this Python implementation and
the console's TypeScript mirror. The console's jest suite runs the SAME file — if
one implementation drifts, its suite fails, never the bench.
"""

import json
from pathlib import Path

import pytest

from app.transport import protocol

VECTORS = json.loads(
    (Path(__file__).resolve().parents[3] / "shared" / "protocol-vectors.json")
    .read_text(encoding="utf-8")
)

#: vector `fn` name → the Python encoder call
ENCODERS = {
    "start": lambda a: protocol.encode_start(),
    "stop": lambda a: protocol.encode_stop(),
    "reset_all": lambda a: protocol.encode_reset_all(),
    "restart": lambda a: protocol.encode_restart(),
    "assign": lambda a: protocol.encode_assign(),
    "save_as_default": lambda a: protocol.encode_save_as_default(),
    "set_pressure": lambda a: protocol.encode_set_pressure(a["targets"]),
    "set_vibration": lambda a: protocol.encode_set_vibration(a["levels"]),
    "load_user": lambda a: protocol.encode_load_user(
        a["user_id"], a["pressures"], a.get("name")
    ),
    "set_user_default_pressure": lambda a: protocol.encode_set_user_default_pressure(
        a["pressures"]
    ),
    "set_variable": lambda a: protocol.encode_set_variable(a["variable"], a["value"]),
    "read": lambda a: protocol.encode_read(a["what"]),
}


@pytest.mark.parametrize(
    "vector", VECTORS["encode"], ids=[v["name"] for v in VECTORS["encode"]]
)
def test_encode_vector(vector):
    assert ENCODERS[vector["fn"]](vector["args"]) == vector["wire"]


@pytest.mark.parametrize(
    "vector",
    VECTORS["decode_serial"],
    ids=[v["name"] for v in VECTORS["decode_serial"]],
)
def test_decode_serial_vector(vector):
    kind, payload = protocol.decode_line(vector["line"])
    expect = vector["expect"]
    assert kind == expect["kind"]

    if expect["kind"] == "telemetry":
        assert payload["device_ms"] == expect["device_ms"]
        assert payload["manifold"] == expect["manifold"]
        assert payload["device_state"] == expect["device_state"]
        assert payload["device_elapsed_s"] == expect["device_elapsed_s"]
        for zone, want in expect["zones"].items():
            assert payload["zones"][zone]["target"] == want["target"]
            assert payload["zones"][zone]["actual"] == want["actual"]
    elif expect["kind"] == "response":
        tag, rest = payload
        assert (tag, rest) == (expect["tag"], expect["payload"])
    else:  # log
        assert payload == vector["line"]


def test_python_never_sees_ble_vectors():
    """decode_ble vectors are the console's; Python's serial parser must treat a
    BLE-format line as log noise, not misparse it as a serial frame."""
    for vector in VECTORS["decode_ble"]:
        kind, _ = protocol.decode_line(vector["line"])
        assert kind in ("log", "response")


def test_shared_constants_match_clinical_code():
    from app.core import pressure

    consts = VECTORS["constants"]
    assert consts["controller_tolerance_mmhg"] == pressure.CONTROLLER_TOLERANCE_MMHG


@pytest.mark.parametrize(
    "vector", VECTORS["decode_user"], ids=[v["name"] for v in VECTORS["decode_user"]]
)
def test_decode_user_vector(vector):
    assert protocol.parse_user_payload(vector["payload"]) == vector["expect"]
