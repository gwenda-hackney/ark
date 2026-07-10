from __future__ import annotations

import argparse
import csv
import os
import sys
from pathlib import Path

from .clickup import ClickUpError, fetch_guests
from .email_sender import EmailConfigError, send_invite


def _load_dotenv() -> None:
    """Load workspace root .env when running locally (best-effort)."""
    candidates = [
        Path("/workspace/.env"),
        Path(__file__).resolve().parents[4] / ".env",
        Path.cwd() / ".env",
    ]
    for path in candidates:
        if not path.is_file():
            continue
        for line in path.read_text(encoding="utf-8").splitlines():
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, _, value = line.partition("=")
            key = key.strip()
            value = value.strip().strip('"').strip("'")
            os.environ.setdefault(key, value)
        break


def _env(name: str, default: str = "") -> str:
    return os.environ.get(name, default).strip()


def _default_template() -> str:
    return _env(
        "INVITE_EMAIL_BODY",
        """Dear {name},

You are invited to a special evening at Gwenda.

We would be delighted to welcome you to Schwartz Wharf, Hackney Wick.

With warm regards,
Dan
White Post Partners Ltd
""",
    )


def main(argv: list[str] | None = None) -> int:
    _load_dotenv()

    parser = argparse.ArgumentParser(
        description="Send event invites from a ClickUp guest list",
    )
    parser.add_argument(
        "--list-id",
        default=_env("CLICKUP_INVITE_LIST_ID"),
        help="ClickUp list ID (or CLICKUP_INVITE_LIST_ID in .env)",
    )
    parser.add_argument(
        "--email-field",
        default=_env("CLICKUP_INVITE_EMAIL_FIELD", "Email"),
        help="Custom field name for email",
    )
    parser.add_argument(
        "--instagram-field",
        default=_env("CLICKUP_INVITE_INSTAGRAM_FIELD", "Instagram"),
        help="Custom field name for Instagram handle",
    )
    parser.add_argument(
        "--subject",
        default=_env("INVITE_EMAIL_SUBJECT", "You are invited — Gwenda"),
        help="Email subject line",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Print actions without sending email",
    )
    parser.add_argument(
        "--send-email",
        action="store_true",
        help="Send emails to guests with an Email field",
    )
    parser.add_argument(
        "--export-instagram",
        metavar="CSV",
        help="Write Instagram handles to CSV for manual DM workflow",
    )
    parser.add_argument(
        "--limit",
        type=int,
        default=0,
        help="Process at most N guests (0 = all)",
    )
    args = parser.parse_args(argv)

    if not args.list_id:
        print(
            "Error: --list-id or CLICKUP_INVITE_LIST_ID is required",
            file=sys.stderr,
        )
        return 1

    if not args.dry_run and not args.send_email and not args.export_instagram:
        print(
            "Nothing to do — pass --dry-run, --send-email, and/or --export-instagram",
            file=sys.stderr,
        )
        return 1

    try:
        guests = fetch_guests(
            args.list_id,
            email_field=args.email_field,
            instagram_field=args.instagram_field,
        )
    except ClickUpError as exc:
        print(f"ClickUp error: {exc}", file=sys.stderr)
        return 1

    if args.limit > 0:
        guests = guests[: args.limit]

    print(f"Loaded {len(guests)} guest(s) from ClickUp list {args.list_id}")

    template = _default_template()
    emailed = 0
    instagram_rows: list[dict[str, str]] = []

    for guest in guests:
        ig = guest.instagram_handle
        if ig:
            instagram_rows.append(
                {
                    "name": guest.name,
                    "instagram": ig,
                    "task_id": guest.task_id,
                    "status": guest.status or "",
                },
            )

        if guest.email:
            body = template.format(name=guest.name or "there")
            if args.dry_run:
                print(f"[dry-run] email → {guest.email} ({guest.name})")
            elif args.send_email:
                try:
                    send_invite(guest.email, args.subject, body)
                    print(f"Sent → {guest.email} ({guest.name})")
                    emailed += 1
                except EmailConfigError as exc:
                    print(f"Email config error: {exc}", file=sys.stderr)
                    return 1
        elif args.send_email or args.dry_run:
            print(f"[skip] no email for {guest.name} (task {guest.task_id})")

    if args.export_instagram:
        out = Path(args.export_instagram)
        out.parent.mkdir(parents=True, exist_ok=True)
        with out.open("w", newline="", encoding="utf-8") as fh:
            writer = csv.DictWriter(
                fh,
                fieldnames=["name", "instagram", "task_id", "status"],
            )
            writer.writeheader()
            writer.writerows(instagram_rows)
        print(f"Wrote {len(instagram_rows)} Instagram row(s) to {out}")

    if args.dry_run:
        print(
            f"Summary: {sum(1 for g in guests if g.email)} with email, "
            f"{len(instagram_rows)} with Instagram",
        )
    elif args.send_email:
        print(f"Sent {emailed} email(s)")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
