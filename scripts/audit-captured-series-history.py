"""Independent HTML audit of archived official series headers and game scores."""
import argparse
import hashlib
import json
import re
import unicodedata
from html.parser import HTMLParser
from pathlib import Path


class SeriesReader(HTMLParser):
    fields = {"seriesYear", "seriesWinner", "seriesLoser", "seriesWin", "seriesScore"}
    void = {"area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "param", "source", "track", "wbr"}

    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.stack, self.records = [], []

    def handle_starttag(self, tag, attrs):
        if tag not in self.void:
            classes = set(dict(attrs).get("class", "").split())
            self.stack.append({"tag": tag, "field": next(iter(classes & self.fields), None), "parts": []})

    def handle_data(self, data):
        for frame in self.stack:
            if frame["field"]:
                frame["parts"].append(data)

    def handle_endtag(self, tag):
        if tag in self.void:
            return
        indexes = [i for i, frame in enumerate(self.stack) if frame["tag"] == tag]
        if not indexes:
            return
        index = indexes[-1]
        for frame in reversed(self.stack[index:]):
            field, text = frame["field"], "".join(frame["parts"]).strip()
            if field == "seriesYear":
                match = re.fullmatch(r"【\s*(\d{4})\s*】", text)
                if not match:
                    raise ValueError("Unrecognized series year")
                self.records.append({"year": int(match.group(1)), "winCounts": [], "scores": []})
            elif field:
                if not self.records:
                    raise ValueError("Series data precedes its year")
                record = self.records[-1]
                if field in {"seriesWinner", "seriesLoser"}:
                    key = "winner" if field == "seriesWinner" else "loser"
                    if not text or key in record:
                        raise ValueError("Missing or duplicate official team label")
                    record[key] = text
                elif field == "seriesWin":
                    match = re.fullmatch(r"\((\d+)勝\)", unicodedata.normalize("NFKC", text).replace(" ", ""))
                    if not match:
                        raise ValueError("Unrecognized series win count")
                    record["winCounts"].append(int(match.group(1)))
                elif field == "seriesScore":
                    normalized = re.sub(r"\s+", "", unicodedata.normalize("NFKC", text))
                    match = re.fullmatch(r"(\d+)[xX]?-(\d+)[xX]?", normalized)
                    if not match:
                        raise ValueError(f"Unrecognized official series score in {record['year']}: {text}")
                    record["scores"].append({"raw": text, "winnerSide": int(match.group(1)), "loserSide": int(match.group(2))})
        del self.stack[index:]


parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("--manifest", required=True)
parser.add_argument("--output", required=True)
args = parser.parse_args()
manifest = json.loads(Path(args.manifest).read_text())
latest = {}
for observation in manifest["observations"]:
    raw = Path(observation["rawFile"]).read_bytes()
    if hashlib.sha256(raw).hexdigest() != observation["sha256"]:
        raise ValueError("Archived official source hash mismatch")
    previous = latest.get(observation["url"])
    if previous is None or previous["fetchedAt"] < observation["fetchedAt"]:
        latest[observation["url"]] = observation
records = []
for url, observation in latest.items():
    if not re.fullmatch(r"https://npb\.jp/bis/scores/nipponseries/yearlyresults\d{4}\.html", url):
        continue
    reader = SeriesReader()
    reader.feed(Path(observation["rawFile"]).read_bytes().decode(observation["charset"]))
    if not reader.records:
        raise ValueError("Official history page contains no seasons")
    for row in reader.records:
        wins = sum(score["winnerSide"] > score["loserSide"] for score in row["scores"])
        losses = sum(score["winnerSide"] < score["loserSide"] for score in row["scores"])
        if "winner" not in row or "loser" not in row or row["winCounts"] != [wins, losses] or wins <= losses:
            raise ValueError(f"Official header does not reconcile to game scores: {row['year']}")
        records.append({**row, "draws": len(row["scores"]) - wins - losses, "sourceUrl": url,
                        "sha256": observation["sha256"], "fetchedAt": observation["fetchedAt"]})
records.sort(key=lambda row: row["year"])
years = [row["year"] for row in records]
if not years or years != list(range(years[0], years[-1] + 1)):
    raise ValueError("Official history has a duplicated or missing season")
report = {"environment": "independent_python_html_audit", "production": False, "humanReviewed": False,
          "sourceObservationsVerified": len(manifest["observations"]), "seasons": records,
          "note": "Reads only archived official HTML and capture metadata; no application parser, DB or chat output is used."}
output = Path(args.output)
output.parent.mkdir(parents=True, exist_ok=True)
output.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n")
print(json.dumps({"seasons": len(records), "firstYear": years[0], "lastYear": years[-1], "headersReconciled": True}))
