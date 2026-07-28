from pydantic import BaseModel, Field


class SettingsOut(BaseModel):
    max_pressure_mmhg: int
    trim_range_pct: int
    default_massage_seconds: int


class SettingsIn(BaseModel):
    max_pressure_mmhg: int = Field(ge=1, le=300)
    trim_range_pct: int = Field(ge=0, le=50)
    default_massage_seconds: int = Field(ge=0, le=600)


class SerialPortOut(BaseModel):
    port: str
    description: str
    hwid: str
