"""Fetch Overture Maps places for a Noren region's bbox into a local snapshot.

Reads the public Overture release on S3 with DuckDB (no key, no account) and writes
  <out>/<release>/places-<region>.jsonl     one place per line, sorted by id
  <out>/<release>/places-<region>.manifest.json   release, bbox, counts, sha256, retrieval time

Overture keeps only its latest two monthly releases, so the snapshot is the copy to import from.
The importer (scripts/import-overture-places.ts) reads this file and never touches S3.

Kept per place: GERS id, point, names (primary and per-language common names), taxonomy and basic
category, confidence, operating status, brand, websites, socials, address, and every source with its
licence. Emails and phone numbers are not kept: Noren shows neither.

Setup (once, from the repo root):
  python3 -m venv .scratch/venv
  .scratch/venv/bin/python -I -m pip install -r scripts/requirements-overture.txt
Run:
  .scratch/venv/bin/python -I scripts/fetch-overture-places.py --region nagasaki [--release 2026-10-21.0]

Overture Places data is licensed per source (CDLA-Permissive-2.0, Apache-2.0, CC0-1.0).
Attribution: https://docs.overturemaps.org/attribution/
"""

import argparse
import hashlib
import json
import os
import sys
import urllib.request
from datetime import datetime, timezone

STAC_CATALOG = "https://stac.overturemaps.org/catalog.json"
S3_ROOT = "s3://overturemaps-us-west-2/release"
REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def latest_release() -> str:
    request = urllib.request.Request(STAC_CATALOG, headers={"User-Agent": "Noren/0.1 (+https://noren.yooi.me)"})
    with urllib.request.urlopen(request, timeout=60) as response:
        latest = json.load(response).get("latest")
    if not isinstance(latest, str) or not latest:
        raise SystemExit("The Overture STAC catalog names no latest release")
    return latest


def region_bbox(region: str) -> list[float]:
    path = os.path.join(REPO_ROOT, "regions", f"{region}.json")
    try:
        with open(path, encoding="utf8") as handle:
            bbox = json.load(handle)["bbox"]
    except (OSError, KeyError, ValueError) as error:
        raise SystemExit(f"Cannot read the bbox of region {region!r} from {path}: {error}")
    return [float(value) for value in bbox]


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--region", required=True, help="region id in regions/<id>.json")
    parser.add_argument("--release", help="Overture release such as 2026-10-21.0 (default: the latest)")
    parser.add_argument(
        "--bbox",
        help="west,south,east,north; narrows the region bbox (default: the whole region bbox)",
    )
    parser.add_argument("--out", default=os.path.join(REPO_ROOT, ".scratch", "overture"))
    args = parser.parse_args()

    release = args.release or latest_release()
    if not release.replace("-", "").replace(".", "").isdigit():
        raise SystemExit(f"Unexpected release name {release!r}")
    bbox = region_bbox(args.region)
    if args.bbox:
        bbox = [float(part) for part in args.bbox.split(",")]
    if len(bbox) != 4:
        raise SystemExit("bbox needs four numbers: west,south,east,north")
    west, south, east, north = bbox
    if not (-180 <= west < east <= 180 and -90 <= south < north <= 90):
        raise SystemExit(f"Invalid bbox {bbox}")

    import duckdb  # imported late so --help works without the dependency

    connection = duckdb.connect()
    connection.execute("INSTALL spatial; INSTALL httpfs; LOAD spatial; LOAD httpfs; SET s3_region='us-west-2';")
    source = f"{S3_ROOT}/{release}/theme=places/type=place/*"
    # The bbox columns let DuckDB skip parquet row groups outside the region.
    query = f"""
        SELECT id,
               ST_Y(geometry) AS lat,
               ST_X(geometry) AS lng,
               confidence,
               operating_status,
               basic_category,
               taxonomy,
               names,
               brand,
               websites,
               socials,
               addresses,
               sources
        FROM read_parquet('{source}', hive_partitioning=1)
        WHERE bbox.xmin >= ? AND bbox.xmax <= ? AND bbox.ymin >= ? AND bbox.ymax <= ?
        ORDER BY id
    """
    cursor = connection.execute(query, [west, east, south, north])
    columns = [column[0] for column in cursor.description]

    output = os.path.join(args.out, release)
    os.makedirs(output, exist_ok=True)
    data_path = os.path.join(output, f"places-{args.region}.jsonl")
    digest = hashlib.sha256()
    count = 0
    partial = f"{data_path}.partial"
    with open(partial, "wb") as handle:
        while True:
            rows = cursor.fetchmany(5000)
            if not rows:
                break
            for row in rows:
                record = shape(dict(zip(columns, row)))
                line = (json.dumps(record, ensure_ascii=False, sort_keys=True) + "\n").encode("utf8")
                handle.write(line)
                digest.update(line)
                count += 1
    os.replace(partial, data_path)

    manifest = {
        "release": release,
        "region": args.region,
        "bbox": bbox,
        "count": count,
        "sha256": digest.hexdigest(),
        "retrievedAt": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "source": source,
        "duckdb": duckdb.__version__,
        "attribution": "Overture Maps Foundation, overturemaps.org; places data licensed per source (https://docs.overturemaps.org/attribution/)",
    }
    with open(os.path.join(output, f"places-{args.region}.manifest.json"), "w", encoding="utf8") as handle:
        json.dump(manifest, handle, indent=2, ensure_ascii=False)
        handle.write("\n")
    print(json.dumps({k: manifest[k] for k in ("release", "bbox", "count", "sha256")}), file=sys.stderr)
    print(data_path)


def shape(row: dict) -> dict:
    """One place as plain JSON, with the common names as {language: value}."""
    names = row.get("names") or {}
    common = names.get("common") or {}
    # Overture fills an empty brand struct on most places; a brand exists only with a name or a wikidata id.
    raw_brand = row.get("brand") or {}
    brand_wikidata = raw_brand.get("wikidata")
    brand_name = (raw_brand.get("names") or {}).get("primary")
    brand = {"wikidata": brand_wikidata, "name": brand_name} if (brand_wikidata or brand_name) else None
    record = {
        "id": row["id"],
        "lat": row["lat"],
        "lng": row["lng"],
        "confidence": row.get("confidence"),
        "operatingStatus": row.get("operating_status"),
        "basicCategory": row.get("basic_category"),
        "taxonomy": row.get("taxonomy"),
        "names": {"primary": names.get("primary"), "common": dict(common)},
        "brand": brand,
        "websites": row.get("websites") or [],
        "socials": row.get("socials") or [],
        "addresses": row.get("addresses") or [],
        "sources": [
            {
                "property": source.get("property"),
                "dataset": source.get("dataset"),
                "license": source.get("license"),
                "recordId": source.get("record_id"),
                "updateTime": source.get("update_time"),
                "confidence": source.get("confidence"),
            }
            for source in (row.get("sources") or [])
        ],
    }
    return record


if __name__ == "__main__":
    main()
