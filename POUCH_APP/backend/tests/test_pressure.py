"""The clinical arithmetic. These are the tests that matter most."""

import pytest

from app.core.pressure import (
    ZoneStatus,
    effective_mmhg,
    fsr_reading,
    trim_is_meaningful,
    zone_status,
)


class TestEffectivePressure:
    def test_applies_trim(self):
        assert effective_mmhg(40, 10, 70) == 44
        assert effective_mmhg(40, -10, 70) == 36

    def test_trim_clamps_to_range(self):
        assert effective_mmhg(40, 50, 70) == 44
        assert effective_mmhg(40, -90, 70) == 36

    def test_zone_prescribed_zero_stays_off(self):
        """A pad the clinician turned off cannot be trimmed back on."""
        assert effective_mmhg(0, 10, 70) == 0

    def test_ceiling_wins_over_trim(self):
        assert effective_mmhg(68, 10, 70) == 70

    def test_ceiling_holds_under_compounding(self):
        """The ratchet the separate-columns schema exists to prevent."""
        value = 40
        for _ in range(7):
            value = effective_mmhg(value, 10, 70)
        assert value == 70


class TestTrimMeaningfulness:
    @pytest.mark.parametrize("prescribed", [0, 10, 20, 29])
    def test_below_deadband(self, prescribed):
        """At Rx 20 the ±10% band is ±2 mmHg against a ±3 mmHg tolerance."""
        assert trim_is_meaningful(prescribed) is False

    @pytest.mark.parametrize("prescribed", [30, 40, 70])
    def test_above_deadband(self, prescribed):
        assert trim_is_meaningful(prescribed) is True


class TestFsrReading:
    def test_railed_is_a_fault_not_a_number(self):
        reading = fsr_reading(4095)
        assert reading["state"] == "FAULT"
        assert reading["raw"] is None, "absence of data must never surface as data"

    def test_live_value_passes_through(self):
        assert fsr_reading(3305) == {"raw": 3305, "state": "OK"}

    def test_ear_channels_are_not_implemented_not_faulty(self):
        assert fsr_reading(0, implemented=False)["state"] == "NOT_IMPLEMENTED"


class TestZoneStatus:
    def test_in_band_is_ok(self):
        assert zone_status(40, 40, None, 100.0, None) == ZoneStatus.OK

    def test_off_target_is_never_ok(self):
        """A zone 42 mmHg off target is not OK, even inside the alarm debounce."""
        status = zone_status(82, 40, 100.0, 101.0, None)
        assert status == ZoneStatus.SETTLING
        assert status != ZoneStatus.OK

    def test_off_target_past_debounce_alarms(self):
        assert zone_status(82, 40, 100.0, 120.0, None) == ZoneStatus.OUT_OF_BAND

    def test_flatlined_sensor_is_a_fault(self):
        assert zone_status(0, 40, None, 200.0, 100.0) == ZoneStatus.SENSOR_FAULT
