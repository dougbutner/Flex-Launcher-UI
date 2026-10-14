#!/usr/bin/env python3
"""Scaffold a press folder. Diagrams are rendered by diagram.py.

  python3 press/package.py my-slug
"""

import argparse
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("slug")
    parser.add_argument("--caption", default="")
    args = parser.parse_args()
    folder = ROOT / "releases" / args.slug
    (folder / "images").mkdir(parents=True, exist_ok=True)
    (folder / "screenshots").mkdir(parents=True, exist_ok=True)
    out = folder / "images" / "angel-numbers.png"
    cmd = [sys.executable, str(ROOT / "diagram.py"), "angel", "--out", str(out)]
    if args.caption:
        cmd.extend(["--caption", args.caption])
    subprocess.check_call(cmd)
    print(folder)


if __name__ == "__main__":
    main()
