"""Patient records and their prescriptions."""

from __future__ import annotations

import sqlite3

from fastapi import APIRouter, Depends, HTTPException, status

from ..core.israeli_id import is_valid_israeli_id
from ..core.zones import ZONES
from ..db import get_db
from ..repositories import app_settings, audit
from ..repositories import devices as devices_repo
from ..repositories import patients as repo
from ..schemas.patient import PatientIn

router = APIRouter(prefix="/patients", tags=["patients"])


def _load(db: sqlite3.Connection, patient_id: int) -> dict:
    patient = repo.get(db, patient_id)
    if patient is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, f"no such patient: {patient_id}")
    return patient


def _validate(body: PatientIn) -> None:
    # Random 9-digit strings fail the check digit ~90% of the time, which is why the
    # national ID is optional and validated, and the MRN is the key.
    if body.national_id and not is_valid_israeli_id(body.national_id):
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST, "national ID check digit is invalid"
        )
    for item in body.prescriptions:
        if item.zone not in ZONES:
            raise HTTPException(
                status.HTTP_400_BAD_REQUEST, f"unknown zone {item.zone}"
            )


@router.get("")
def list_patients(q: str = "", db: sqlite3.Connection = Depends(get_db)) -> list[dict]:
    return [_load(db, pid) for pid in repo.search(db, q)]


@router.get("/{patient_id}")
def get_patient(patient_id: int, db: sqlite3.Connection = Depends(get_db)) -> dict:
    return _load(db, patient_id)


@router.post("", status_code=status.HTTP_201_CREATED)
def create_patient(
    body: PatientIn, db: sqlite3.Connection = Depends(get_db)
) -> dict:
    _validate(body)
    ceiling = app_settings.get(db).max_pressure_mmhg

    patient_id = repo.create(db, body.full_name, body.national_id)
    repo.write_prescriptions(db, patient_id, body.prescriptions, ceiling)
    audit.record(db, "create", f"patient:{patient_id}", None, body.model_dump())
    db.commit()

    return _load(db, patient_id)


@router.put("/{patient_id}")
def update_patient(
    patient_id: int, body: PatientIn, db: sqlite3.Connection = Depends(get_db)
) -> dict:
    _validate(body)
    before = _load(db, patient_id)
    ceiling = app_settings.get(db).max_pressure_mmhg

    repo.update_identity(db, patient_id, body.full_name, body.national_id)
    repo.write_prescriptions(db, patient_id, body.prescriptions, ceiling)

    after = _load(db, patient_id)
    audit.record(db, "update", f"patient:{patient_id}", before, after)
    db.commit()
    return after


@router.delete("/{patient_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_patient(patient_id: int, db: sqlite3.Connection = Depends(get_db)) -> None:
    before = _load(db, patient_id)
    repo.delete(db, patient_id)
    audit.record(db, "delete", f"patient:{patient_id}", before, None)
    db.commit()


@router.get("/{patient_id}/sessions")
def patient_sessions(
    patient_id: int, db: sqlite3.Connection = Depends(get_db)
) -> list[dict]:
    return devices_repo.sessions_for_patient(db, patient_id)
