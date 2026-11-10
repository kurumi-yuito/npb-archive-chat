"""Archive official series pages reached through real links; never write the DB."""
import argparse
import hashlib
import json
import re
import time
from datetime import datetime, timezone
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import urljoin, urlparse
from urllib.request import Request, urlopen


class Links(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.links = []

    def handle_starttag(self, tag, attrs):
        if tag == "a":
            href = dict(attrs).get("href")
            if href:
                self.links.append(href)


parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("--output-dir", required=True)
parser.add_argument("--detail-years", default="2024,2025,2026")
args = parser.parse_args()
years = set(map(int, args.detail_years.split(",")))
directory = Path(args.output_dir).resolve()
directory.mkdir(parents=True, exist_ok=True)
entry = "https://npb.jp/bis/scores/nipponseries/yearlyresults2020.html"
pending, seen, observations = [(entry, None)], set(), []
manifest_file = directory / "source-manifest.json"
if manifest_file.exists():
    previous = json.loads(manifest_file.read_text())
    if previous.get("entryUrl") != entry:
        raise ValueError("Existing archive uses a different discovery entry")
    for observation in previous["observations"]:
        raw_path = Path(observation["rawFile"])
        if raw_path != directory / (observation["sha256"] + ".html") or hashlib.sha256(raw_path.read_bytes()).hexdigest() != observation["sha256"]:
            raise ValueError("Existing archived observation failed hash verification")
        datetime.fromisoformat(observation["fetchedAt"])
        observations.append(observation)
while pending:
    url, discovered_from = pending.pop(0)
    if url in seen:
        continue
    seen.add(url)
    parsed = urlparse(url)
    if parsed.scheme != "https" or parsed.netloc != "npb.jp" or not re.fullmatch(
        r"/bis/scores/nipponseries/(?:yearlyresults|linescore)\d{4}\.html", parsed.path
    ):
        raise ValueError("Discovery left the official series archive")
    with urlopen(Request(url, headers={"User-Agent": "npb-archive-source-capture/1"}), timeout=30) as response:
        if response.status != 200 or response.url != url:
            raise ValueError("Official series page failed or redirected")
        raw = response.read()
        fetched_at = datetime.now(timezone.utc).isoformat()
        charset = response.headers.get_content_charset()
        server_date, modified = response.headers.get("Date"), response.headers.get("Last-Modified")
    if not charset:
        match = re.search(rb"charset\s*=\s*[\"']?([\w-]+)", raw, re.I)
        charset = match.group(1).decode("ascii") if match else "utf-8"
    html = raw.decode(charset)
    digest = hashlib.sha256(raw).hexdigest()
    raw_path = directory / (digest + ".html")
    if raw_path.exists() and raw_path.read_bytes() != raw:
        raise ValueError("Immutable source hash collision")
    raw_path.write_bytes(raw)
    links = Links()
    links.feed(html)
    observations.append({"url": url, "discoveredFrom": discovered_from, "fetchedAt": fetched_at,
                         "serverDate": server_date, "lastModified": modified, "charset": charset,
                         "sha256": digest, "bytes": len(raw), "rawFile": str(raw_path)})
    for href in links.links:
        target = urljoin(url, href).split("#", 1)[0]
        part = urlparse(target)
        if part.scheme != "https" or part.netloc != "npb.jp":
            continue
        history = re.fullmatch(r"/bis/scores/nipponseries/yearlyresults\d{4}\.html", part.path)
        detail = re.fullmatch(r"/bis/scores/nipponseries/linescore(\d{4})\.html", part.path)
        if history or (detail and int(detail.group(1)) in years):
            pending.append((target, url))
    manifest_file.write_text(json.dumps({"entryUrl": entry, "production": False,
        "databaseWritten": False, "observations": observations}, ensure_ascii=False, indent=2) + "\n")
    time.sleep(0.15)
print(json.dumps({"capturedPages": len(seen), "totalObservations": len(observations), "databaseWritten": False, "outputDir": str(directory)}))
