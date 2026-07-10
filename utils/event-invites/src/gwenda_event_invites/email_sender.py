from __future__ import annotations

import os
import smtplib
from email.message import EmailMessage


class EmailConfigError(RuntimeError):
    pass


def _smtp_config() -> dict[str, str | int]:
    host = os.environ.get("SMTP_HOST", "").strip()
    port = int(os.environ.get("SMTP_PORT", "587"))
    user = os.environ.get("SMTP_USER", "").strip()
    password = os.environ.get("SMTP_PASSWORD", "").strip()
    from_addr = os.environ.get("SMTP_FROM", user).strip()

    missing = [k for k, v in [("SMTP_HOST", host), ("SMTP_FROM", from_addr)] if not v]
    if missing:
        raise EmailConfigError(
            f"Missing email config: {', '.join(missing)} — set in .env or use --dry-run",
        )
    return {
        "host": host,
        "port": port,
        "user": user,
        "password": password,
        "from_addr": from_addr,
    }


def send_invite(
    to: str,
    subject: str,
    body_text: str,
    *,
    body_html: str | None = None,
) -> None:
    cfg = _smtp_config()
    message = EmailMessage()
    message["From"] = str(cfg["from_addr"])
    message["To"] = to
    message["Subject"] = subject
    message.set_content(body_text)
    if body_html:
        message.add_alternative(body_html, subtype="html")

    with smtplib.SMTP(str(cfg["host"]), int(cfg["port"])) as smtp:
        smtp.starttls()
        user = str(cfg["user"])
        password = str(cfg["password"])
        if user and password:
            smtp.login(user, password)
        smtp.send_message(message)
