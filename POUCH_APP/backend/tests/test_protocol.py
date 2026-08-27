"""The FOLLI wire grammar — every encoder's exact string, and inbound routing.

Wire strings are asserted verbatim against POUCH_ESP.md §7 (the firmware's
command reference). If one of these tests needs changing, the firmware grammar
changed — update POUCH_ESP.md in the same commit.
"""

import pytest

from app.transport import protocol
from app.transport.protocol import LOG, RESPONSE, TELEMETRY, decode_line


# ── encoders ─────────────────────────────────────────────────────────────────

def test_bare_word_commands():
    assert protocol.encode_start() == "start"
    assert protocol.encode_stop() == "stop"
    assert protocol.encode_reset_all() == "resetall"
    assert protocol.encode_restart() == "restart"
    assert protocol.encode_assign() == "assign"
    assert protocol.encode_save_as_default() == "saveasdefault"


def test_set_pressure_single_zone():
    assert protocol.encode_set_pressure({"TEMPLE": 95}) == "setpressure:1,95"


def test_set_pressure_batch_keeps_zone_indices():
    cmd = protocol.encode_set_pressure({"TEMPLE": 95, "EAR": 125})
    assert cmd == "setpressure:1,95;2,125"


def test_set_pressure_rejects_empty():
    with pytest.raises(ValueError):
        protocol.encode_set_pressure({})


def test_set_vibration_clamps_levels():
    # -1 passes through: it means "leave that channel unchanged" on the firmware.
    assert protocol.encode_set_vibration([0, 5, -1, 2]) == "setvibration:0,3,-1,2"
    assert protocol.encode_set_vibration([-9, 3]) == "setvibration:-1,3"


def test_set_vibration_rejects_bad_count():
    with pytest.raises(ValueError):
        protocol.encode_set_vibration([])
    with pytest.raises(ValueError):
        protocol.encode_set_vibration([1, 2, 3, 0, 1])


def test_set_variable():
    assert protocol.encode_set_variable("PRESSURE_TOLERANCE", 5) == \
        "setvariable:PRESSURE_TOLERANCE,5"
    assert protocol.encode_set_variable("TELEMETRY_INTERVAL", "default") == \
        "setvariable:TELEMETRY_INTERVAL,default"
    with pytest.raises(ValueError):
        protocol.encode_set_variable("X", "not-default")


def test_load_user():
    assert protocol.encode_load_user(42, [25, 120, 85, 130]) == \
        "user:42:25,120,85,130"
    with pytest.raises(ValueError):
        protocol.encode_load_user(1, [25, 120])


def test_load_user_carries_a_display_name():
    assert protocol.encode_load_user(7, [0, 40, 60, 0], "Edna Levi") == \
        "user:7:0,40,60,0:Edna Levi"
    # ':' is the segment delimiter and newlines would end the line — scrubbed.
    assert protocol.encode_load_user(7, [0, 40, 60, 0], "A:B\nC") == \
        "user:7:0,40,60,0:A B C"
    # Cut at the firmware's 31-byte limit on a character boundary (Hebrew is 2 bytes/char).
    long_name = "אבגדהוזחטיכלמנסעפצקרשת"  # 22 chars = 44 bytes
    wire = protocol.encode_load_user(7, [0, 40, 60, 0], long_name)
    assert wire.startswith("user:7:0,40,60,0:")
    assert len(wire.split(":", 3)[3].encode("utf-8")) <= 31
    assert wire.split(":", 3)[3] == long_name[:15]
    # An empty name falls back to the nameless form.
    assert protocol.encode_load_user(7, [0, 40, 60, 0], "  ") == "user:7:0,40,60,0"


def test_parse_user_payload():
    assert protocol.parse_user_payload("USER:7,true,0,40,60,0,Edna Levi") == {
        "user_id": 7, "assigned": True, "pressures": [0, 40, 60, 0], "name": "Edna Levi",
    }
    # Pre-name firmware (six fields) and an unassigned board both parse.
    assert protocol.parse_user_payload("USER:-1,false,0,95,125,0")["assigned"] is False
    assert protocol.parse_user_payload("USER:-1,false,0,95,125,0,")["name"] == ""
    assert protocol.parse_user_payload("STATE:IDLE") is None
    assert protocol.parse_user_payload("USER:x,true,0,0,0,0") is None


def test_set_user_default_pressure():
    assert protocol.encode_set_user_default_pressure([0, 95, 125, 0]) == \
        "setuserdefaultpressure:0,95,125,0"


def test_read_commands():
    assert protocol.encode_read("pressure") == "readpressure"
    assert protocol.encode_read("readall") == "readall"
    assert protocol.encode_read("STATE") == "readstate"
    with pytest.raises(ValueError):
        protocol.encode_read("bogus")


# ── inbound routing ──────────────────────────────────────────────────────────

def test_decode_telemetry_frame():
    kind, frame = decode_line("T:14287,0,0,80,76,80,78,0,0,138,0,0,0,0,12,7,9,4,P,5,0")
    assert kind == TELEMETRY
    assert frame["zones"]["TEMPLE"]["actual"] == 76
    assert frame["device_state"] == "PRESSURIZING"
    assert frame["device_elapsed_s"] == 5
    assert frame["vibration_remaining_s"] == 0


@pytest.mark.parametrize(
    ("line", "tag", "payload"),
    [
        ("OK:START", "OK", "START"),
        ("OK:SETPRESSURE:1,95", "OK", "SETPRESSURE:1,95"),
        ("ERR:SETPRESSURE:channel out of range (7)", "ERR",
         "SETPRESSURE:channel out of range (7)"),
        ("R:STATE:MAINTENANCE", "R", "STATE:MAINTENANCE"),
        ("R:PRESSURE:0,76,78,0,138,0,80,80,0", "R", "PRESSURE:0,76,78,0,138,0,80,80,0"),
    ],
)
def test_decode_responses(line, tag, payload):
    kind, (got_tag, got_payload) = decode_line(line)
    assert kind == RESPONSE
    assert (got_tag, got_payload) == (tag, payload)


@pytest.mark.parametrize(
    "line",
    [
        "Ready. No pressure applied.",
        "All PADs relieved to zero.",
        "T:time,FRN_T,FRN_A,TMP_T,TMP_A,EAR_T,EAR_A,BCK_T,BCK_A,MAN,"
        "FSR0,FSR1,FSR2,FSR3,FSR4,FSR5,FSR6,FSR7,STATE,ELAPSED",  # header → log
        "garbage",
    ],
)
def test_decode_logs(line):
    kind, payload = decode_line(line)
    assert kind == LOG
    assert payload == line
