from __future__ import annotations

import os
from typing import Any

import httpx

from .models import Guest

CLICKUP_BASE = "https://api.clickup.com/api/v2"


class ClickUpError(RuntimeError):
    pass


def _headers() -> dict[str, str]:
    token = os.environ.get("CLICKUP_API_KEY", "").strip()
    if not token:
        raise ClickUpError(
            "CLICKUP_API_KEY is not set — add it to /workspace/.env or export it",
        )
    return {"Authorization": token}


def _field_value(field: dict[str, Any]) -> str | None:
    value = field.get("value")
    if value is None:
        return None
    if isinstance(value, str):
        return value.strip() or None
    if isinstance(value, dict):
        for key in ("email", "value", "name"):
            inner = value.get(key)
            if isinstance(inner, str) and inner.strip():
                return inner.strip()
    if isinstance(value, list) and value:
        first = value[0]
        if isinstance(first, dict):
            return _field_value(first)
        if isinstance(first, str) and first.strip():
            return first.strip()
    return str(value).strip() or None


def _find_field(fields: list[dict[str, Any]], *names: str) -> str | None:
    lowered = {n.lower() for n in names}
    for field in fields:
        label = (field.get("name") or "").lower()
        if label in lowered:
            return _field_value(field)
    return None


def fetch_guests(
    list_id: str,
    *,
    email_field: str = "Email",
    instagram_field: str = "Instagram",
    include_closed: bool = False,
) -> list[Guest]:
    guests: list[Guest] = []
    page = 0

    with httpx.Client(base_url=CLICKUP_BASE, headers=_headers(), timeout=60) as client:
        while True:
            params: dict[str, str | int] = {"page": page}
            if not include_closed:
                params["include_closed"] = "false"
            response = client.get(f"/list/{list_id}/task", params=params)
            if response.status_code != 200:
                raise ClickUpError(
                    f"ClickUp list/{list_id}/task failed ({response.status_code}): "
                    f"{response.text[:300]}",
                )
            payload = response.json()
            tasks = payload.get("tasks") or []
            for task in tasks:
                fields = task.get("custom_fields") or []
                guests.append(
                    Guest(
                        task_id=task["id"],
                        name=(task.get("name") or "").strip(),
                        email=_find_field(fields, email_field, "email"),
                        instagram=_find_field(
                            fields,
                            instagram_field,
                            "instagram",
                            "ig",
                        ),
                        status=(task.get("status") or {}).get("status"),
                    ),
                )
            if not payload.get("last_page", True):
                page += 1
                continue
            break

    return guests
