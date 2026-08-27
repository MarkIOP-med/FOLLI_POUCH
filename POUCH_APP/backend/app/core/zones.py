"""Canonical zone map.

Single source of truth. List index == firmware channel index in POUCH_ESP_GEN4/config.h.

NOTE: FOLLI_CONSOLE/FOLLI_COMSOLE_OVERVIEW.md disagrees -- it specifies
Forehead / L-Temple / R-Temple / Back. That document is the outlier and is the one
that changes. Until it does, console byte 0x03 means R-Temple while firmware
channel 2 is EAR, which inflates the wrong pad.
"""

ZONES = ("FRONT", "TEMPLE", "EAR", "BACK")

ZONE_INDEX = {zone: i for i, zone in enumerate(ZONES)}

# The factory regime every user starts from before the app edits it, and the
# profile the pouch is checked out to as NO_USER. Mirrors the firmware's
# systemDefaultPressure[] in POUCH_ESP_GEN4/config.h — change one, change both.
DEFAULT_REGIME = {"FRONT": 25, "TEMPLE": 120, "EAR": 85, "BACK": 130}

# The reserved, undeletable default patient. Its id matches the firmware's
# NO_USER_ID so the app and the board agree on who NO_USER is.
NO_USER_ID = 1
NO_USER_NAME = "NO_USER"


def zone_at(index: int) -> str:
    return ZONES[index]


def index_of(zone: str) -> int:
    try:
        return ZONE_INDEX[zone.upper()]
    except KeyError as exc:
        raise ValueError(
            f"unknown zone {zone!r}; expected one of {', '.join(ZONES)}"
        ) from exc
