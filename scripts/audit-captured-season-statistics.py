"""Read source HTML with Python only; never read app answers or stored metrics."""
import argparse
import hashlib
import json
import re
import sqlite3
import unicodedata
from html.parser import HTMLParser
from pathlib import Path


class Rows(HTMLParser):
    def __init__(self):
        super().__init__()
        self.rows = []
        self.active = []
        self.cells = []

    def handle_starttag(self, tag, attrs):
        if tag == 'tr':
            self.active.append([])
        if tag in ('td', 'th') and self.active:
            self.cells.append((self.active[-1], []))

    def handle_data(self, value):
        for _, parts in self.cells:
            parts.append(value)

    def handle_endtag(self, tag):
        if tag in ('td', 'th') and self.cells:
            row, parts = self.cells.pop()
            row.append(' '.join(''.join(parts).split()))
        if tag == 'tr' and self.active:
            self.rows.append(self.active.pop())


def name_key(value):
    return ''.join(unicodedata.normalize('NFKC', value).split()).lstrip('*+')


parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--sqlite', required=True, help='Use source snapshot metadata only')
parser.add_argument('--workspace-root', default='.')
parser.add_argument('--year', type=int, required=True)
parser.add_argument('--team-id', required=True)
parser.add_argument('--kind', choices=['batting', 'pitching', 'fielding'], required=True)
parser.add_argument('--level', choices=['first', 'farm'], required=True)
parser.add_argument('--name', required=True)
parser.add_argument('--metric', required=True)
parser.add_argument('--output', required=True)
args = parser.parse_args()
database = sqlite3.connect(f'file:{Path(args.sqlite).resolve()}?mode=ro', uri=True)
database.row_factory = sqlite3.Row
sources = database.execute('''SELECT source_url,fetched_at,content_hash,raw_key FROM official_statistic_snapshots
    WHERE target_year=? AND team_id=? AND statistic_kind=? AND level=? ORDER BY fetched_at DESC''',
    (args.year, args.team_id, args.kind, args.level)).fetchall()
assert sources, 'No actual captured source'
source = dict(sources[0])
kind_code = {'batting': 'b', 'pitching': 'p', 'fielding': 'f'}[args.kind]
level_code = 1 if args.level == 'first' else 2
assert source['source_url'] == f'https://npb.jp/bis/{args.year}/stats/id{kind_code}{level_code}_{args.team_id}.html', 'Source scope/URL disagreement'
root = (Path(args.workspace_root) / 'data' / 'raw' / 'bis-statistics').resolve()
file = (Path(args.workspace_root) / 'data' / source['raw_key']).resolve()
assert file.is_relative_to(root), 'Untrusted original source path'
raw = file.read_bytes()
assert hashlib.sha256(raw).hexdigest() == source['content_hash'], 'Changed original source'
title = re.search(r'<title\b[^>]*>(.*?)</title>', raw.decode('utf-8'), re.I | re.S)
assert title and f'{args.year}年度' in title[1], 'Original source year disagreement'
page = Rows()
page.feed(raw.decode('utf-8'))
headers = [row for row in page.rows if '選手' in row and args.metric in row]
assert headers and all(row == headers[0] for row in headers), 'Missing or conflicting source headers'
header = headers[0]
matches = [row for row in page.rows if len(row) == len(header) and name_key(row[header.index('選手')]) == name_key(args.name)]
assert len(matches) == 1, 'Name is absent or ambiguous in the original table'
value = matches[0][header.index(args.metric)]
result = {'environment': 'independent_python_html_audit', 'humanReviewed': False, 'production': False,
          'scope': {'year': args.year, 'teamId': args.team_id, 'kind': args.kind, 'level': args.level},
          'literalPlayerName': matches[0][header.index('選手')], 'metric': args.metric, 'value': value,
          'source': source, 'literalCells': dict(zip(header, matches[0])),
          'note': 'Source metric reconciliation only. Does not resolve a name to an ID or certify a semantic oracle.'}
Path(args.output).write_text(json.dumps(result, ensure_ascii=False, indent=2) + '\n')
print(json.dumps({'metric': args.metric, 'value': value, 'sourceUrl': source['source_url']}, ensure_ascii=False))
