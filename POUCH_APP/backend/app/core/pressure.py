"""The clinical arithmetic. Kept in one place, and unit tested.

Mirrors frontend/src/domain/pressure.ts -- if you change one, change both.
"""

from dataclasses import dataclass

# Firmware PRESSURE_TOLERANCE_MMHG. Below roughly (tolerance / trim_range) mmHg the
# trim band is narrower than the controller's own deadband, so a patient nudging the
# slider produces no measurable change.
CONTROLLER_TOLERANCE_MMHG = 3

FSR_RAIL = 4095          # 12-bit ADC full scale == open circuit, not a reading
FLATLINE_FAULT_SECONDS = 30


OUT_OF_BAND_DEBOUNCE_SECONDS = 5


@dataclass(frozen=True)
class ZoneStatus:
    OK = "OK"
    SETTLING = "SETTLING"          # out of band, but not yet long enough to alarm
    OUT_OF_BAND = "OUT_OF_BAND"
    SENSOR_FAULT = "SENSOR_FAULT"
    NO_DATA = "NO_DATA"


def clamp(value: float, low: float, high: float) -> float:
    return max(low, min(high, value))


def effective_mmhg(prescribed: int, trim_pct: int, ceiling: int, trim_range: int = 10) -> int:
    """Prescription with the patient's trim applied, bounded twice.

    Two independent limits: the trim can never exceed +/-trim_range of the
    prescription, and the result can never exceed the configured ceiling.

    A zone prescribed 0 stays 0 -- a pad the clinician turned off cannot be
    trimmed back on.
    """
    if prescribed <= 0:
        return 0

    trim = clamp(trim_pct, -trim_range, trim_range)
    value = prescribed * (1 + trim / 100.0)

    lo = prescribed * (1 - trim_range / 100.0)
    hi = prescribed * (1 + trim_range / 100.0)
    value = clamp(value, lo, hi)

    return int(round(clamp(value, 0, ceiling)))


def trim_is_meaningful(prescribed: int, trim_range: int = 10) -> bool:
    """False when the trim band is inside the controller deadband.

    At Rx 20 with +/-10%, the band is +/-2 mmHg against a +/-3 mmHg tolerance: the
    patient moves the control and nothing measurable happens. The UI greys it out
    rather than presenting a control that does nothing.
    """
    if prescribed <= 0:
        return False
    return prescribed * (trim_range / 100.0) >= CONTROLLER_TOLERANCE_MMHG


def zone_status(actual: int, effective: int, out_of_band_since: float | None,
                now: float, flat_since: float | None) -> str:
    """OK / SETTLING / OUT_OF_BAND / SENSOR_FAULT for one zone.

    The debounce exists so a normal pressurisation ramp does not alarm. It must NOT
    report OK during that window -- a zone 42 mmHg off target is not OK, it is
    SETTLING, and the UI colours it differently. Claiming OK while the number on
    screen plainly disagrees is how the mock rendered a leak as ordinary text.
    """
    # A vented, idle zone legitimately reads a hard 0 for as long as it stays idle
    # (firmware clamps negative gauge readings to 0), so a flatline only means "dead
    # sensor" when the zone is actually commanded to hold pressure.
    if effective > 0 and flat_since is not None and \
            (now - flat_since) > FLATLINE_FAULT_SECONDS:
        return ZoneStatus.SENSOR_FAULT
    if abs(actual - effective) <= CONTROLLER_TOLERANCE_MMHG:
        return ZoneStatus.OK
    if out_of_band_since is not None and \
            (now - out_of_band_since) > OUT_OF_BAND_DEBOUNCE_SECONDS:
        return ZoneStatus.OUT_OF_BAND
    return ZoneStatus.SETTLING


def manifold_fault(any_zone_commanded: bool, flat_since: float | None,
                   now: float) -> bool:
    """One predicate for the manifold flatline, shared by snapshot and alerts.

    A vented, idle manifold legitimately reads a hard 0; a flatline only means
    "dead sensor" while some zone is commanded — that's when the pump charges the
    manifold and a stuck 0 would make it run forever.
    """
    return (
        any_zone_commanded
        and flat_since is not None
        and (now - flat_since) > FLATLINE_FAULT_SECONDS
    )


def fsr_reading(raw: int) -> dict:
    """An FSR value plus whether it can be trusted.

    A railed 4095 is an open circuit. It must never reach the UI as a number or a
    computed Newton value -- that reads as data when it is the absence of data.
    (Gen4 reads all 8 channels; the Gen3 'not implemented' EAR stub is gone.)
    """
    if raw >= FSR_RAIL:
        return {"raw": None, "state": "FAULT"}
    return {"raw": raw, "state": "OK"}
