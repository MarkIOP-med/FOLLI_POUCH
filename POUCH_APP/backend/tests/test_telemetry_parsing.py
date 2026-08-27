"""Telemetry parsing against lines actually captured from the pouch.

REAL_LINE is a frame captured from the Gen4 ESP32 on COM6 during the 2026-08-20
bench session ("T:" prefix, 200ms cadence). Everything that is not a well-formed
"T:" frame must be rejected by parse_telemetry — tagged responses are classified
separately by decode_line (see test_protocol.py).
"""

import pytest

from app.transport.base import parse_telemetry

REAL_LINE = "T:14287,0,0,80,76,80,78,0,0,138,0,0,0,0,12,7,9,4,M,37,0,0,12,0,0"


def test_parses_a_real_frame():
    frame = parse_telemetry(REAL_LINE)

    assert frame is not None
    assert frame["device_ms"] == 14287
    assert frame["manifold"] == 138
    assert frame["zones"]["TEMPLE"]["target"] == 80
    assert frame["zones"]["TEMPLE"]["actual"] == 76
    assert frame["zones"]["EAR"]["actual"] == 78
    assert frame["zones"]["FRONT"]["fsr_l"] == 0
    assert frame["zones"]["EAR"]["fsr_l"] == 12
    assert frame["device_state"] == "MAINTENANCE"
    assert frame["device_elapsed_s"] == 37
    assert frame["vibration_remaining_s"] == 12
    # Per-zone: EAR is the one buzzing (12s), the others idle at 0.
    assert frame["zones"]["EAR"]["vibration_remaining_s"] == 12
    assert frame["zones"]["FRONT"]["vibration_remaining_s"] == 0
    assert frame["actuators"] == 0


@pytest.mark.parametrize(
    "line",
    [
        # the CSV header carries the T: prefix but is not a frame
        "T:time,FRN_T,FRN_A,TMP_T,TMP_A,EAR_T,EAR_A,BCK_T,BCK_A,MAN,"
        "FSR0,FSR1,FSR2,FSR3,FSR4,FSR5,FSR6,FSR7,STATE,ELAPSED,"
        "VIB_R0,VIB_R1,VIB_R2,VIB_R3,ACT",
        # a pre-2026-08-21 18-field frame must fail on field count, loudly
        "T:14287,0,0,80,76,80,78,0,0,138,0,0,0,0,12,7,9,4",
        # unknown state char (full 25-field frame, so it's the state that fails)
        "T:100,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,X,0,0,0,0,0,0",
        # boot banners / state prints
        "Venting system to atmosphere...",
        "Ready. No pressure applied.",
        "All channels at target → MAINTENANCE",
        "BLE GATT server started — advertising as FOLLISAVE-POUCH",
        # tagged responses are not telemetry
        "OK:START",
        "ERR:UNKNOWN:bogus",
        "R:STATE:IDLE",
        # malformed
        "",
        "T:1,2,3",
        "T:notanumber,0,15,0,44,0,0,0,0,0,0,0,0,0,0,0,0,0",
        # a Gen3-era un-prefixed frame must no longer parse
        "11566,0,15,0,44,0,0,0,0,0,4095,4095,4095,3294,0,0,4095,4095",
    ],
)
def test_rejects_non_telemetry(line):
    assert parse_telemetry(line) is None
