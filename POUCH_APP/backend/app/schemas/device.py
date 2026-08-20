from typing import Literal

from pydantic import BaseModel, Field


class DeviceIn(BaseModel):
    id: str = Field(min_length=1)
    label: str = Field(min_length=1)
    transport: Literal["serial", "mock", "ble"] = "serial"
    port: str | None = None


class StartSessionIn(BaseModel):
    """patient_id None starts a service-mode session."""

    patient_id: int | None = None


class SetpointIn(BaseModel):
    """Service-mode direct entry. Still clamped to the configured ceiling."""

    zone: str
    mmhg: int = Field(ge=0)


class ZoneRxIn(BaseModel):
    """Clinician editing the prescription straight from the device screen."""

    mmhg: int = Field(ge=0)


class TrimIn(BaseModel):
    """Normally arrives from the console via the pouch; exposed for testing."""

    zone: str
    trim_pct: int


class VibrationIn(BaseModel):
    zone: str
    massage_level: int = Field(ge=0, le=3)
    massage_seconds: int | None = Field(default=None, ge=0, le=600)


class CommandResult(BaseModel):
    sent: str
    note: str | None = None
