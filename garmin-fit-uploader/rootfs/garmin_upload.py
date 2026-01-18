#!/usr/bin/env python3
import json
import os
import sys

from garth import Client


def upload_fit(token_dir: str, fit_path: str) -> None:
    client = Client()
    client.load(token_dir)

    def do_upload() -> None:
        with open(fit_path, "rb") as handle:
            result = client.upload(handle)
        print("GARTH upload response:", json.dumps(result))

    try:
        do_upload()
    except Exception as exc:
        print(f"GARTH upload failed, attempting token refresh: {exc}")
        client.refresh_oauth2()
        client.dump(token_dir, oauth2_only=True)
        do_upload()


def main() -> int:
    if len(sys.argv) != 3:
        print("Usage: garmin_upload.py <token_dir> <fit_path>")
        return 2

    token_dir = sys.argv[1]
    fit_path = sys.argv[2]

    if not os.path.isdir(token_dir):
        print(f"Token directory not found: {token_dir}")
        return 2

    if not os.path.exists(fit_path):
        print(f"FIT file not found: {fit_path}")
        return 2

    upload_fit(token_dir, fit_path)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
