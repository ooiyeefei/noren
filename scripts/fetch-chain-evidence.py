"""Count, across Japan, the places that share each base name the chain rules looked at.

The chain rules (src/lib/chains) call a base name a chain when three or more places share it and one
carries a branch suffix. The Overture snapshot of Nagasaki shows only Nagasaki, so a chain with two
branches here and forty in Fukuoka looks local. This script reads the same Overture release for the
whole of Japan, outside the snapshot's box and outside Nagasaki prefecture, and counts, for each base
name, the places whose name is that base followed by a branch suffix ("outside"), and separately the
places whose name is the bare base ("outsideNamesakes": a namesake or a head office, not counted as a
branch).

Input: the request that `scripts/hide-chains.ts --dry-run` writes (.scratch/chains-evidence-request.json).
Output: scripts/data/chain-evidence-japan.json, which the dry run and the real run read.

A place counts as a branch of a base when its normalised name (NFKC, lower case, spaces, punctuation and
symbols removed) starts with the base and the rest is a branch suffix:
  - a space, then up to 12 characters ending in 店 that are not a kind of shop (書店, 酒店);
  - with no space, an area then 店 where the area is one that at least five places across Japan write
    after a space before 店 ("那覇小禄店"), a bare 支店 or 本店, or a number then 号店 (this keeps
    "大和屋クリーニング店" and "大阪屋石油店" from counting as branches of 大和屋 and 大阪屋);
  - "branch" or "store" as the last word.

Setup and run, from the repo root (see fetch-overture-places.py for the venv):
  .scratch/venv/bin/python -I scripts/fetch-chain-evidence.py --request .scratch/chains-evidence-request.json

Overture Places data is licensed per source (CDLA-Permissive-2.0, Apache-2.0, CC0-1.0).
Attribution: https://docs.overturemaps.org/attribution/
"""

import argparse
import json
import os
import re
import sys
import unicodedata
from datetime import datetime, timezone

S3_ROOT = "s3://overturemaps-us-west-2/release"
REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
# Japan, with the islands (Okinotorishima to Etorofu).
JAPAN = (122.9, 20.3, 154.1, 45.7)
# Nagasaki prefecture's reach, used only for a place that gives neither a region nor a postcode.
NAGASAKI_BOX = (128.5, 32.5, 130.5, 34.8)
JAPANESE = re.compile(r"[぀-ヿ㐀-鿿]")


def word_key(word: str) -> str:
    folded = unicodedata.normalize("NFKC", word).lower()
    if JAPANESE.search(folded):
        return folded
    decomposed = unicodedata.normalize("NFKD", folded)
    return "".join(ch for ch in decomposed if not unicodedata.category(ch).startswith("M"))


def name_key(name: str) -> str:
    """The key of a name, as src/lib/chains/names.ts builds it: each word normalised, then joined."""
    key = ""
    buffer = ""
    for ch in unicodedata.normalize("NFKC", name):
        category = unicodedata.category(ch)
        if ch.isspace() or category.startswith("P") or category.startswith("S"):
            key += word_key(buffer)
            buffer = ""
        else:
            buffer += ch
    return key + word_key(buffer)


def prefecture(region, postcode) -> str:
    area = unicodedata.normalize("NFKC", region or "").strip().lower()
    if area:
        return "nagasaki" if re.search(r"長崎|nagasaki|^42$", area) else "other"
    digits = re.sub(r"\D", "", unicodedata.normalize("NFKC", postcode or ""))
    if len(digits) >= 3:
        return "nagasaki" if digits.startswith("85") else "other"
    return "unknown"


def inside(box, lng, lat) -> bool:
    return box[0] <= lng <= box[2] and box[1] <= lat <= box[3]


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--request", required=True, help="the request JSON written by hide-chains.ts --dry-run")
    parser.add_argument("--snapshot-manifest", default=None, help="manifest of the Nagasaki snapshot (default: next to the request's release)")
    parser.add_argument("--out", default=os.path.join(REPO_ROOT, "scripts", "data", "chain-evidence-japan.json"))
    args = parser.parse_args()

    with open(args.request, encoding="utf8") as handle:
        request = json.load(handle)
    release = request["release"]
    generic = set(request.get("genericSuffixes", []))
    bases = {item["key"]: item["base"] for item in request["bases"]}
    manifest_path = args.snapshot_manifest or os.path.join(
        REPO_ROOT, ".scratch", "overture", release, "places-nagasaki.manifest.json"
    )
    with open(manifest_path, encoding="utf8") as handle:
        snapshot_box = tuple(json.load(handle)["bbox"])  # west, south, east, north

    by_start: dict[str, list[str]] = {}
    for key in bases:
        by_start.setdefault(key[:1], []).append(key)

    import duckdb  # imported late so --help works without the dependency

    connection = duckdb.connect()
    connection.execute("INSTALL spatial; INSTALL httpfs; LOAD spatial; LOAD httpfs; SET s3_region='us-west-2';")
    source = f"{S3_ROOT}/{release}/theme=places/type=place/*"
    west, south, east, north = JAPAN
    cursor = connection.execute(
        f"""
        SELECT names.primary AS name, addresses[1].region AS region, addresses[1].postcode AS postcode,
               bbox.xmin AS lng, bbox.ymin AS lat
        FROM read_parquet('{source}', hive_partitioning=1)
        WHERE bbox.xmin >= ? AND bbox.xmax <= ? AND bbox.ymin >= ? AND bbox.ymax <= ?
          AND names.primary IS NOT NULL
        """,
        [west, east, south, north],
    )
    # One pass over Japan: count the areas people write after a space before 店, and keep the places
    # whose name starts like a base, to judge their suffix once every area is counted.
    area_counts: dict[str, int] = {}
    pending: list[tuple[str, str, str, str, str]] = []
    scanned = 0
    while True:
        rows = cursor.fetchmany(20000)
        if not rows:
            break
        for name, region, postcode, lng, lat in rows:
            scanned += 1
            text = unicodedata.normalize("NFKC", name).strip()
            spaced = SPACED_BRANCH.search(text) if text.endswith("店") else None
            if spaced and spaced.group(1) not in generic:
                stem = area_stem(spaced.group(1)[:-1])
                if stem:
                    area_counts[stem] = area_counts.get(stem, 0) + 1
            if inside(snapshot_box, lng, lat):
                continue  # already in the snapshot
            where = prefecture(region, postcode)
            if where == "nagasaki" or (where == "unknown" and inside(NAGASAKI_BOX, lng, lat)):
                continue
            key = name_key(text)
            for base_key in by_start.get(key[:1], []):
                if key.startswith(base_key):
                    pending.append((base_key, key, text, region or "", postcode or ""))

    known_areas = {area for area, count in area_counts.items() if count >= KNOWN_AREA_MIN}
    counts: dict[str, int] = {}
    exact: dict[str, int] = {}
    examples: dict[str, list[str]] = {}
    for base_key, key, text, region, postcode in pending:
        if not is_branch_of(base_key, key, text, generic, known_areas):
            continue
        if key == base_key:
            exact[base_key] = exact.get(base_key, 0) + 1  # a namesake or the head office, not a branch
            continue
        counts[base_key] = counts.get(base_key, 0) + 1
        if len(examples.setdefault(base_key, [])) < 3:
            examples[base_key].append(f"{text} ({region or postcode or 'no address'})")

    result = {
        "release": release,
        "retrievedAt": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "source": f"{source}, Japan box {list(JAPAN)}, outside the Nagasaki snapshot box and Nagasaki prefecture; {scanned} places scanned",
        "bases": {
            key: {
                "base": base,
                "outside": counts.get(key, 0),
                "outsideNamesakes": exact.get(key, 0),
                "examples": examples.get(key, []),
            }
            for key, base in sorted(bases.items())
        },
    }
    os.makedirs(os.path.dirname(args.out), exist_ok=True)
    with open(args.out, "w", encoding="utf8") as handle:
        json.dump(result, handle, ensure_ascii=False, indent=1, sort_keys=True)
        handle.write("\n")
    print(f"{len(bases)} bases, {sum(1 for key in bases if counts.get(key))} found outside Nagasaki, {scanned} places scanned", file=sys.stderr)
    print(args.out)


SPACED_BRANCH = re.compile(r"\s(\S{1,12}店)$")
# An area is known when this many places across Japan write it after a space before 店.
KNOWN_AREA_MIN = 5


def area_stem(area: str) -> str:
    """The area without a trailing 支, 本, 駅前 or 駅, as src/lib/chains/branch.ts reads it."""
    area = re.sub(r"(支|本)$", "", name_key(area))
    return re.sub(r"(駅前|駅)$", "", area)


def is_branch_of(base_key: str, key: str, text: str, generic: set, known_areas: set) -> bool:
    """Whether a place whose key starts with base_key is that base or a branch of it (see the header)."""
    rest = key[len(base_key):]
    if not rest:
        return True
    if rest.endswith("branch") or rest.endswith("store"):
        return len(rest) <= 30
    if not rest.endswith("店") or len(rest) > 12 or rest in generic:
        return False
    spaced = SPACED_BRANCH.search(text)
    if spaced and name_key(text[: spaced.start()]) == base_key:
        return spaced.group(1) not in generic
    area = re.sub(r"(支店|本店|店)$", "", rest)
    if area == "" or re.fullmatch(r"\d+号?", area):
        return True
    return area_stem(area) in known_areas


if __name__ == "__main__":
    main()
