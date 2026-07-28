from pydantic import BaseModel, Field


class PrescriptionIn(BaseModel):
    zone: str
    prescribed_mmhg: int = Field(ge=0)
    massage_level: int = Field(ge=0, le=3)
    massage_seconds: int = Field(ge=0, le=600)


class PatientIn(BaseModel):
    full_name: str = Field(min_length=1)
    national_id: str | None = None
    prescriptions: list[PrescriptionIn] = []
