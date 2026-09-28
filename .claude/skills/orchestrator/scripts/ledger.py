#!/usr/bin/env python3
"""The shared PR ledger (see ../protocol/LEDGER.md).

  ledger.py show                         print the ledger
  ledger.py set <pr> key=value ...       create or update a row (keys: holder head base state owner note)
  ledger.py drop <pr>                    remove a row
  ledger.py decide "<rule>"              append a standing owner decision, dated
  ledger.py path                         print the ledger's path

Run from anywhere inside the repo. Writes take a lock, so concurrent sessions don't interleave.
"""
import datetime
import os
import subprocess
import sys
import time

COLUMNS = ["pr", "holder", "head", "base", "state", "owner", "note"]


def ledger_path() -> str:
    common = subprocess.check_output(["git", "rev-parse", "--path-format=absolute", "--git-common-dir"], text=True).strip()
    directory = os.path.join(common, "orchestration")
    os.makedirs(directory, exist_ok=True)
    return os.path.join(directory, "ledger.md")


def read(path: str) -> tuple[list[dict], list[str]]:
    rows: list[dict] = []
    decisions: list[str] = []
    if not os.path.exists(path):
        return rows, decisions
    section = "rows"
    for line in open(path):
        line = line.rstrip("\n")
        if line.startswith("## Decisions"):
            section = "decisions"
            continue
        if section == "decisions":
            if line.startswith("- "):
                decisions.append(line)
            continue
        if line.startswith("|") and not line.startswith("|---") and not line.startswith("| pr "):
            cells = [cell.strip() for cell in line.strip("|").split("|")]
            rows.append(dict(zip(COLUMNS, cells + [""] * (len(COLUMNS) - len(cells)))))
    return rows, decisions


def write(path: str, rows: list[dict], decisions: list[str]) -> None:
    rows.sort(key=lambda row: row["pr"])
    lines = ["# PR ledger", "", "| " + " | ".join(COLUMNS) + " |", "|" + "---|" * len(COLUMNS)]
    lines += ["| " + " | ".join(row.get(column, "").replace("|", "/") for column in COLUMNS) + " |" for row in rows]
    lines += ["", "## Decisions", ""] + decisions
    temporary = path + ".tmp"
    open(temporary, "w").write("\n".join(lines) + "\n")
    os.replace(temporary, path)


class Lock:
    def __init__(self, path: str):
        self.directory = path + ".lock"

    def __enter__(self):
        for _ in range(100):
            try:
                os.mkdir(self.directory)
                return self
            except FileExistsError:
                time.sleep(0.1)
        sys.exit(f"ledger locked: remove {self.directory} if no session is writing")

    def __exit__(self, *_):
        os.rmdir(self.directory)


def main(argv: list[str]) -> None:
    if not argv:
        sys.exit(__doc__)
    path = ledger_path()
    command, arguments = argv[0], argv[1:]
    if command == "path":
        print(path)
        return
    if command == "show":
        print(open(path).read() if os.path.exists(path) else "(empty ledger)")
        return
    with Lock(path):
        rows, decisions = read(path)
        if command == "set":
            pr, pairs = arguments[0].lstrip("#"), arguments[1:]
            row = next((row for row in rows if row["pr"] == pr), None)
            if row is None:
                row = {column: "" for column in COLUMNS} | {"pr": pr}
                rows.append(row)
            for pair in pairs:
                key, _, value = pair.partition("=")
                if key not in COLUMNS[1:]:
                    sys.exit(f"unknown key {key!r}; use one of {COLUMNS[1:]}")
                row[key] = value
        elif command == "drop":
            rows = [row for row in rows if row["pr"] != arguments[0].lstrip("#")]
        elif command == "decide":
            decisions.append(f"- {datetime.date.today().isoformat()}: {' '.join(arguments)}")
        else:
            sys.exit(__doc__)
        write(path, rows, decisions)
    print(open(path).read())


if __name__ == "__main__":
    main(sys.argv[1:])
