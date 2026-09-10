"""Conversion between Raspberry hourly brightness and HA change points."""

from collections.abc import Mapping
import re
from typing import Any


def _schedule_to_hourly(points: Any) -> list[dict[str, int]]:
    """Validate UI points and expand them to the API's 24 hourly values."""
    if not isinstance(points, list) or not points:
        raise ValueError("Le planning doit contenir au moins une heure.")
    parsed: dict[int, int] = {}
    for index, point in enumerate(points, start=1):
        if not isinstance(point, Mapping):
            raise ValueError(f"La ligne {index} du planning est invalide.")
        raw_time = point.get("time")
        if isinstance(raw_time, str):
            match = re.fullmatch(r"([01]\d|2[0-3]):([0-5]\d)", raw_time)
            if not match:
                raise ValueError(f"L'heure « {raw_time} » est invalide (format HH:00 attendu).")
            hour = int(match.group(1))
            if match.group(2) != "00":
                raise ValueError(f"L'heure « {raw_time} » est invalide : les minutes doivent être 00.")
        else:
            hour = point.get("hour")
            if isinstance(hour, bool) or not isinstance(hour, int) or not 0 <= hour <= 23:
                raise ValueError(f"L'heure de la ligne {index} doit être comprise entre 00:00 et 23:00.")
        value = point.get("value")
        if isinstance(value, bool) or not isinstance(value, int):
            raise ValueError(f"La luminosité de la ligne {index} doit être un entier.")
        if not 0 <= value <= 100:
            raise ValueError(f"La luminosité de la ligne {index} doit être comprise entre 0 et 100.")
        if value % 5:
            raise ValueError(f"La luminosité {value} % de la ligne {index} est invalide : utilisez un multiple de 5.")
        if hour in parsed:
            raise ValueError(f"Deux lignes utilisent la même heure : {hour:02d}:00.")
        parsed[hour] = value
    ordered = sorted(parsed.items())
    return [
        {"hour": hour, "value": next((value for point_hour, value in reversed(ordered) if point_hour <= hour), ordered[-1][1])}
        for hour in range(24)
    ]


def _validate_hourly(remote: Any, *, for_write: bool = False) -> list[dict[str, int]]:
    """Validate and sort a complete day without filling or compressing hours.

    Never fill missing hours with local values: an incomplete response is an
    error, not a confirmed schedule. Preserve all integer API percentages.
    """
    if isinstance(remote, Mapping):
        remote = remote.get("schedule", remote.get("points"))
    if not isinstance(remote, list) or not remote:
        raise ValueError("Le Raspberry a retourné un planning vide ou invalide.")
    hours = {}
    for row in remote:
        if not isinstance(row, Mapping):
            raise ValueError("Ligne horaire Raspberry invalide.")
        hour, value = row.get("hour"), row.get("value")
        if type(hour) is not int or not 0 <= hour <= 23 or hour in hours:
            raise ValueError("Heure Raspberry invalide ou dupliquée.")
        if type(value) is not int or not 0 <= value <= 100:
            raise ValueError("Luminosité Raspberry invalide.")
        if for_write and value % 5:
            raise ValueError("La luminosité doit être un multiple de 5.")
        hours[hour] = value
    if len(hours) != 24:
        raise ValueError("Le planning Raspberry doit contenir les 24 heures.")
    return [{"hour": hour, "value": hours[hour]} for hour in range(24)]


def _hourly_to_points(remote: Any) -> list[dict[str, Any]]:
    """Legacy change-point conversion; not used for the hourly UI."""
    if isinstance(remote, Mapping):
        remote = remote.get("schedule", remote.get("points"))
    if isinstance(remote, list) and remote and all(
        isinstance(row, Mapping) and "time" in row for row in remote
    ):
        remote = _schedule_to_hourly(remote)
    hourly = _validate_hourly(remote)
    return [
        {"time": f"{row['hour']:02d}:00", "value": row["value"]}
        for hour, row in enumerate(hourly)
        if hour == 0 or row["value"] != hourly[hour - 1]["value"]
    ]
