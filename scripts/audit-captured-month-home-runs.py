import argparse,json,re,hashlib,collections
from urllib.parse import urlparse
from html.parser import HTMLParser
from pathlib import Path
class Page(HTMLParser):
 def __init__(self):
  super().__init__();self.hrdepth=0;self.capture=None;self.buf=[];self.home_runs=[];self.scores=[];self.status=[];self.teams=[]
 def handle_starttag(self,tag,attrs):
  a=dict(attrs)
  if tag=='div':
   if a.get('id')=='gmdivhr':self.hrdepth=1
   elif self.hrdepth:self.hrdepth+=1
  if tag=='td' and (a.get('class') in ['gmboxrun','gmout','contentshdname'] or (self.hrdepth and a.get('class')=='gmresults')):self.capture=a['class'];self.buf=[]
 def handle_data(self,d):
  if self.capture:self.buf.append(d)
 def handle_endtag(self,tag):
  if tag=='td' and self.capture:
   text=' '.join(''.join(self.buf).split())
   if self.capture=='gmresults':self.home_runs.append(text)
   elif self.capture=='gmboxrun':self.scores.append(text)
   elif self.capture=='contentshdname':self.teams.append(text)
   else:self.status.append(text)
   self.capture=None
  if tag=='div' and self.hrdepth:self.hrdepth-=1
parser=argparse.ArgumentParser(description='Independently reconcile a calendar month against captured NPB English HR summaries; does not read application output.')
parser.add_argument('--capture-dir',required=True)
parser.add_argument('--year',type=int,required=True)
parser.add_argument('--month',type=int,choices=range(1,13),required=True)
parser.add_argument('--output',required=True)
parser.add_argument('--subject-team')
parser.add_argument('--opponent-team')
args=parser.parse_args()
assert bool(args.subject_team)==bool(args.opponent_team), 'Both team codes are required'
root=Path(args.capture_dir)
prefix=f'{args.year:04d}-{args.month:02d}'
d=json.loads((root/'discovery.json').read_text());m=json.loads((root/'source-manifest.json').read_text());by={x['url']:x for x in m if x['status']==200}
counts=collections.Counter();games=[];seen=set();canceled=[];observations=[];decisions={'wins':0,'losses':0,'draws':0};matchup_evidence=[]
for g in d['games']:
 if not g['date'].startswith(prefix) or g['competition']!='regular':continue
 if args.subject_team and {g['homeTeam']['code'],g['awayTeam']['code']}!={args.subject_team,args.opponent_team}:continue
 url=g['source']['dailyPageUrl'];assert urlparse(url).hostname=='npb.jp' and g['date'].replace('-','') in url;assert url not in seen;seen.add(url);source=by[url];raw=Path(source['rawFile']).read_bytes();assert hashlib.sha256(raw).hexdigest()==source['sha256'];p=Page();p.feed(raw.decode())
 if any(re.search('rained out|cancel|postpon',s,re.I) for s in p.status):canceled.append(url);continue
 assert len(p.scores)==2 and all(re.fullmatch(r'\d+',s) for s in p.scores),(url,p.scores,p.status)
 games.append(url)
 if args.subject_team:
  assert len(p.teams)==2,(url,p.teams)
  home_indexes=[i for i,name in enumerate(p.teams) if g['homeTeam']['label'].casefold() in name.casefold()];away_indexes=[i for i,name in enumerate(p.teams) if g['awayTeam']['label'].casefold() in name.casefold()]
  assert len(home_indexes)==len(away_indexes)==1 and home_indexes!=away_indexes,(url,p.teams,g['homeTeam'],g['awayTeam'])
  home=int(p.scores[home_indexes[0]]);away=int(p.scores[away_indexes[0]]);subject,opponent=(home,away) if g['homeTeam']['code']==args.subject_team else (away,home)
  result='wins' if subject>opponent else 'losses' if subject<opponent else 'draws';decisions[result]+=1
  matchup_evidence.append({'sourceUrl':url,'fetchedAt':source['fetchedAt'],'sha256':source['sha256'],'date':g['date'],'homeTeam':g['homeTeam']['code'],'awayTeam':g['awayTeam']['code'],'homeRuns':home,'awayRuns':away,'subjectResult':result})
 for entry in p.home_runs:
  match=re.fullmatch(r'\[([^]]+)\]\s+(.+?)\s*(?:\((.+)\))',entry);assert match,(url,entry)
  club,name,detail=match.groups();n=len(re.findall(r'\b\d+(?:st|nd|rd|th) inn\.',detail));assert n>0,(url,entry)
  multi=re.fullmatch(r'(.+?) (\d+)',name)
  if multi:name=multi[1];assert n==int(multi[2]),(url,entry,n)
  else:assert n==1,(url,entry,n)
  counts[(club,name)]+=n;observations.append({'sourceUrl':url,'fetchedAt':source['fetchedAt'],'sha256':source['sha256'],'club':club,'officialName':name,'count':n,'literal':entry})
result={'environment':'independent_python_html_audit','production':False,'humanReviewed':False,'scope':{'year':args.year,'month':args.month,'level':'first','competition':'unspecified'},'discoveredGames':len(seen),'completedGames':len(games),'cancelledGames':len(canceled),'leaderboard':[{'club':club,'officialName':name,'homeRuns':n} for (club,name),n in counts.most_common()],'observations':observations,'note':'Names remain official English labels plus club, not resolved player IDs. No aliases are merged. This is source reconciliation, not a human-reviewed evaluation oracle.'}
if args.subject_team:result['headToHead']={'subjectTeam':args.subject_team,'opponentTeam':args.opponent_team,**decisions,'evidence':matchup_evidence}
Path(args.output).write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n');print(json.dumps({k:result[k] for k in ['discoveredGames','completedGames','cancelledGames']}));print(result['leaderboard'][:12])
