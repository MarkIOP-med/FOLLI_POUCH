from typing import Literal

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

    # Displayed by the redesigned User Info / User Regime panels. All optional so
    # a patient can be created before the clinical details are known.
    gender: Literal["male", "female"] | None = None
    birth_year: int | None = Field(default=None, ge=1900, le=2100)
    protocol: str | None = None
    treatment_start_date: float | None = None
    treatment_number: int | None = Field(default=None, ge=0)

    def demographics(self) -> dict:
        return {
            "gender": self.gender,
            "birth_year": self.birth_year,
            "protocol": self.protocol,
            "treatment_start_date": self.treatment_start_date,
            "treatment_number": self.treatment_number,
        }
