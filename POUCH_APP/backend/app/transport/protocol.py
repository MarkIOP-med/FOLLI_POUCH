"""The FOLLI wire protocol — one place, used identically by every transport.

Mirrors the firmware's shared parser (POUCH_ESP_GEN4/commandParser.ino); the full
grammar, response format and data model live in POUCH_ESP_GEN4/POUCH_ESP.md, which is
the source of truth. Serial and BLE carry the exact same text lines in both
directions, so nothing in this module may know which transport it is on.

Encoders return the wire string without the trailing newline and do no I/O.
decode_line() classifies one inbound line; Link._read_loop routes on the result.
"""

from __future__ import annotations

from ..core.zones import ZONES, index_of

# ── telemetry ────────────────────────────────────────────────────────────────

TELEMETRY_PREFIX = "T:"

# Field order of the periodic serial telemetry CSV (after the "T:" prefix),
# emitted by POUCH_ESP_GEN4/serial.ino every SERIAL_LOG_INTERVAL_MS (200ms).
# STATE (one char, I/P/M/E/S) and ELAPSED (session seconds) are the two FINAL
# fields, appended so pre-2026-08-21 parsers fail loudly on field count instead
# of silently misreading shifted columns.
TELEMETRY_FIELDS = [
    "time",
    "FRN_T", "FRN_A", "TMP_T", "TMP_A", "EAR_T", "EAR_A", "BCK_T", "BCK_A",
    "MAN",
    "FSR_FRN_L", "FSR_FRN_R", "FSR_TMP_L", "FSR_TMP_R",
    "FSR_EAR_L", "FSR_EAR_R", "FSR_BCK_L", "FSR_BCK_R",
    "STATE", "ELAPSED", "VIB_REMAIN", "ACT",
]

#: telemetry STATE char → the state-machine name used across the app
DEVICE_STATES = {
    "I": "IDLE",
    "P": "PRESSURIZING",
    "M": "MAINTENANCE",
    "E": "EMERGENCY_RELIEF",
    "S": "STOPPED",
}

# FSR channel→connector/side mapping is NOT confirmed against the physical harness
# (config.h TODO stands). Bench 2026-08-20: raw channels 4-7 respond, 0-3 are on the
# dead FLOW_LINK side. These column names keep the frame shape stable; treat the L/R
# assignment as provisional until the harness is repaired and mapped.
FSR_COLUMNS = {
    "FRONT": ("FSR_FRN_L", "FSR_FRN_R"),
    "TEMPLE": ("FSR_TMP_L", "FSR_TMP_R"),
    "EAR": ("FSR_EAR_L", "FSR_EAR_R"),
    "BACK": ("FSR_BCK_L", "FSR_BCK_R"),
}
TARGET_COLUMNS = {"FRONT": "FRN_T", "TEMPLE": "TMP_T", "EAR": "EAR_T", "BACK": "BCK_T"}
ACTUAL_COLUMNS = {"FRONT": "FRN_A", "TEMPLE": "TMP_A", "EAR": "EAR_A", "BACK": "BCK_A"}


def parse_telemetry(line: str) -> dict | None:
    """Parse one "T:"-prefixed CSV line. Returns None for anything else.

    The header line ("T:time,FRN_T,...") carries the prefix but fails the
    isdigit() check on its first field, so it falls through to the log path.
    """
    if not line.startswith(TELEMETRY_PREFIX):
        return None
    parts = [p.strip() for p in line[len(TELEMETRY_PREFIX):].split(",")]
    if len(parts) != len(TELEMETRY_FIELDS) or not parts[0].isdigit():
        return None
    try:
        raw = {
            name: parts[i] if name == "STATE" else int(parts[i])
            for i, name in enumerate(TELEMETRY_FIELDS)
        }
    except ValueError:
        return None
    state = DEVICE_STATES.get(raw["STATE"])
    if state is None:
        return None

    zones = {}
    for zone in ZONES:
        left, right = FSR_COLUMNS[zone]
        zones[zone] = {
            "target": raw[TARGET_COLUMNS[zone]],
            "actual": raw[ACTUAL_COLUMNS[zone]],
            "fsr_l": raw[left],
            "fsr_r": raw[right],
        }
    return {
        "device_ms": raw["time"],
        "manifold": raw["MAN"],
        "zones": zones,
        "device_state": state,
        "device_elapsed_s": raw["ELAPSED"],
        "vibration_remaining_s": raw["VIB_REMAIN"],
        # Actuator bitmask: bit0 pump, bit1 relief, bit2-5 valves FRONT/TEMPLE/EAR/BACK.
        "actuators": raw["ACT"],
    }


# ── inbound classification ───────────────────────────────────────────────────

#: kinds a decoded line can be
TELEMETRY, RESPONSE, LOG = "telemetry", "response", "log"

_RESPONSE_PREFIXES = ("OK:", "ERR:", "R:")


def decode_line(line: str) -> tuple[str, object]:
    """Classify one inbound line.

    Returns one of:
      (TELEMETRY, frame_dict)      — periodic "T:" frame
      (RESPONSE, ("OK"|"ERR"|"R", payload_str)) — tagged command response
      (LOG, line)                  — boot banners, state-machine prints, headers
    """
    frame = parse_telemetry(line)
    if frame is not None:
        return (TELEMETRY, frame)
    for prefix in _RESPONSE_PREFIXES:
        if line.startswith(prefix):
            return (RESPONSE, (prefix[:-1], line[len(prefix):]))
    return (LOG, line)


# ── command encoders ─────────────────────────────────────────────────────────
# Names/syntax per POUCH_ESP.md §7. Bare words for no-payload commands,
# "word:payload" otherwise; ';' batches only setpressure.

def encode_start() -> str:
    """Vent, re-zero, load the checked-out user's regime, pressurize."""
    return "start"


def encode_stop() -> str:
    """Stop vibration and vent every channel to zero.

    The Gen3-era workaround (sending 'r' because 's' left the pump running) is
    obsolete: bench-verified 2026-08-20 that the rewritten firmware's `stop`
    responds OK:STOP and prints "All PADs relieved to zero."
    """
    return "stop"


def encode_reset_all() -> str:
    return "resetall"


def encode_restart() -> str:
    """Vent + re-capture the atmospheric reference; identity/regime untouched.

    This is the real re-zero command the Gen3 layer had to fake with a plain vent.
    """
    return "restart"


def encode_assign() -> str:
    return "assign"


def encode_save_as_default() -> str:
    return "saveasdefault"


def encode_set_pressure(targets: dict[str, int]) -> str:
    """targets maps zone name -> mmHg. Indexed-pair batch form: 'setpressure:1,60;2,80'."""
    if not targets:
        raise ValueError("no targets given")
    pairs = [f"{index_of(zone)},{int(mmhg)}" for zone, mmhg in targets.items()]
    return "setpressure:" + ";".join(pairs)


def encode_set_vibration(levels: list[int]) -> str:
    """Positional levels for channels 0..N-1 (max 4), each clamped to -1..3.

    The firmware applies the values positionally from channel 0. -1 means
    "leave that channel unchanged" — the way to (re)trigger one zone without
    stopping the others mid-run.
    """
    if not 1 <= len(levels) <= 4:
        raise ValueError("setvibration takes 1-4 levels")
    clamped = [max(-1, min(3, int(lv))) for lv in levels]
    return "setvibration:" + ",".join(str(lv) for lv in clamped)


def encode_set_variable(name: str, value: int | str) -> str:
    """value may be an int or the literal string 'default' (reset to compiled default)."""
    if isinstance(value, str) and value.lower() != "default":
        raise ValueError("string value must be 'default'")
    return f"setvariable:{name},{value}"


#: Longest display name the firmware stores (USER_NAME_MAX in config.h), in bytes.
USER_NAME_MAX_BYTES = 31


def _wire_name(name: str) -> str:
    """Fit a display name onto the wire: single line, no ':' (the segment
    delimiter), cut on a UTF-8 character boundary at the firmware's limit."""
    cleaned = " ".join(name.replace(":", " ").split())
    encoded = cleaned.encode("utf-8")[:USER_NAME_MAX_BYTES]
    return encoded.decode("utf-8", errors="ignore").strip()


def encode_load_user(
    user_id: int, pressures: list[int], name: str | None = None
) -> str:
    """user:<id>:<p0>,<p1>,<p2>,<p3>[:<name>] — the name is what the patient
    console displays; the id is what this app keys on."""
    if len(pressures) != 4:
        raise ValueError("user record needs exactly 4 pressures")
    line = f"user:{int(user_id)}:" + ",".join(str(int(p)) for p in pressures)
    wire_name = _wire_name(name) if name else ""
    return f"{line}:{wire_name}" if wire_name else line


def parse_user_payload(payload: str) -> dict | None:
    """The R:USER payload: "<id>,<assigned>,<p0>,<p1>,<p2>,<p3>[,<name>]".

    The name is the LAST field and free text, so everything after the sixth
    comma belongs to it. Pre-name firmware (six fields) still parses."""
    if not payload.startswith("USER:"):
        return None
    parts = payload[len("USER:"):].split(",")
    if len(parts) < 6:
        return None
    try:
        user_id = int(parts[0])
        pressures = [int(p) for p in parts[2:6]]
    except ValueError:
        return None
    return {
        "user_id": user_id,
        "assigned": parts[1] == "true",
        "pressures": pressures,
        "name": ",".join(parts[6:]).strip(),
    }


def encode_set_user_default_pressure(pressures: list[int]) -> str:
    if len(pressures) != 4:
        raise ValueError("needs exactly 4 pressures")
    return "setuserdefaultpressure:" + ",".join(str(int(p)) for p in pressures)


READ_COMMANDS = (
    "readpressure", "readfsr", "readvariables", "readuser",
    "readstate", "readvibration", "readall",
)


def encode_read(what: str) -> str:
    """what is one of READ_COMMANDS, with or without the 'read' prefix."""
    word = what.lower()
    if not word.startswith("read"):
        word = "read" + word
    if word not in READ_COMMANDS:
        raise ValueError(f"unknown read command {what!r}")
    return word
