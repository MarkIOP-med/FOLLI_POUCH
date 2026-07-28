"""CSV parsing against lines actually captured from the Due on COM5."""

import pytest

from app.transport.base import parse_telemetry

REAL_LINE = "11566,0,15,0,44,0,0,0,0,0,4095,4095,4095,3294,0,0,4095,4095"


def test_parses_a_real_frame():
    frame = parse_telemetry(REAL_LINE)

    assert frame is not None
    assert frame["device_ms"] == 11566
    assert frame["manifold"] == 0
    assert frame["zones"]["TEMPLE"]["actual"] == 44
    assert frame["zones"]["FRONT"]["fsr_l"] == 4095
    assert frame["zones"]["EAR"]["fsr_l"] == 0


@pytest.mark.parametrize(
    "line",
    [
        "=== FOLLI_CNTRL_Gen3 - FOLLISAVE Controller ===",
        "time,FRN_T,FRN_A",
        "Ready. No pressure applied.",
        "",
        "1,2,3",
        "notanumber,0,15,0,44,0,0,0,0,0,4095,4095,4095,3294,0,0,4095,4095",
    ],
)
def test_rejects_non_telemetry(line):
    assert parse_telemetry(line) is None
