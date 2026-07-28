"""Canonical zone map.

Single source of truth. List index == firmware channel index in POUCH_ESP_GEN4/config.h.

NOTE: FOLLI_CONSOLE/FOLLI_COMSOLE_OVERVIEW.md disagrees -- it specifies
Forehead / L-Temple / R-Temple / Back. That document is the outlier and is the one
that changes. Until it does, console byte 0x03 means R-Temple while firmware
channel 2 is EAR, which inflates the wrong pad.
"""

ZONES = ("FRONT", "TEMPLE", "EAR", "BACK")

ZONE_INDEX = {zone: i for i, zone in enumerate(ZONES)}


def zone_at(index: int) -> str:
    return ZONES[index]


def index_of(zone: str) -> int:
    try:
        return ZONE_INDEX[zone.upper()]
    except KeyError as exc:
        raise ValueError(
            f"unknown zone {zone!r}; expected one of {', '.join(ZONES)}"
        ) from exc
