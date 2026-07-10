from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class Guest:
    task_id: str
    name: str
    email: str | None
    instagram: str | None
    status: str | None

    @property
    def instagram_handle(self) -> str | None:
        if not self.instagram:
            return None
        handle = self.instagram.strip().lstrip("@")
        handle = handle.removeprefix("https://www.instagram.com/").rstrip("/")
        return handle or None
