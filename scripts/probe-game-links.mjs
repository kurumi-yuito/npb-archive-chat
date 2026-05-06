const targets = ['https://npb.jp/bis/2025/games/fs2025031401509.html']

const headers = {
  'user-agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36 npb-archive-chat',
  'accept-language': 'ja,en-US;q=0.9,en;q=0.8',
  referer: 'https://npb.jp/',
}

for (const url of targets) {
  const res = await fetch(url, { headers })
  const html = await res.text()
  const hrefs = [...html.matchAll(/href="([^"]+)"/g)].map((m) => m[1])
  const interesting = hrefs.filter(
    (h) =>
      /play|box|roster|score|bis\/2025\/games|scores\/2025\/0314|fgm20250314|fs2025031401509/i.test(
        h,
      ),
  )
  const hasPbpLike =
    /playbyplay|打席|経過|イニング|投打|gmplay|gmpbp|テキスト速報/i.test(html)
  console.log(
    JSON.stringify(
      { url, status: res.status, hasPbpLike, interesting: [...new Set(interesting)] },
      null,
      2,
    ),
  )
}
