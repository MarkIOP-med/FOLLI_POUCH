from pydantic import BaseModel, Field


class SettingsOut(BaseModel):
    max_pressure_mmhg: int
    trim_range_pct: int
    default_massage_seconds: int
    pressure_tolerance_mmhg: int
    actuation_threshold_mmhg: int
    telemetry_interval_ms: int
    vib_pwm_1: int
    vib_pwm_2: int
    vib_pwm_3: int


class SettingsIn(BaseModel):
    max_pressure_mmhg: int = Field(ge=1, le=300)
    trim_range_pct: int = Field(ge=0, le=50)
    default_massage_seconds: int = Field(ge=0, le=600)
    pressure_tolerance_mmhg: int = Field(ge=1, le=20)
    actuation_threshold_mmhg: int = Field(ge=0, le=50)
    telemetry_interval_ms: int = Field(ge=50, le=2000)
    vib_pwm_1: int = Field(ge=0, le=255)
    vib_pwm_2: int = Field(ge=0, le=255)
    vib_pwm_3: int = Field(ge=0, le=255)


class SerialPortOut(BaseModel):
    port: str
    description: str
    hwid: str
    # CP2102 bridge (10C4:EA60) == almost certainly the pouch — the one field
    # that tells an operator which COM port to pick.
    likely_pouch: bool = False
