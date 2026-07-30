"""Shared route dependencies."""

from __future__ import annotations

from fastapi import Depends, HTTPException, Path, status

from ..core.zones import ZONES
from ..transport.registry import DeviceRuntime, registry


def get_runtime(device_id: str = Path(...)) -> DeviceRuntime:
    runtime = registry.get(device_id)
    if runtime is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, f"no such device: {device_id}")
    return runtime


def get_connected_runtime(
    runtime: DeviceRuntime = Depends(get_runtime),
) -> DeviceRuntime:
    if not runtime.connected:
        raise HTTPException(
            status.HTTP_409_CONFLICT, f"{runtime.device_id} is not connected"
        )
    return runtime


def validate_zone(zone: str) -> str:
    if zone not in ZONES:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, f"unknown zone {zone}")
    return zone
