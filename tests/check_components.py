"""Run from project root: python tests/check_components.py."""
from pathlib import Path
from html.parser import HTMLParser
import hashlib
import json
import re
import sys
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from components import header, footer
from site_config import NAV

ROOT = Path(__file__).resolve().parents[1]


class Links(HTMLParser):
    def __init__(self):
        super().__init__()
        self.urls = []

    def handle_starttag(self, tag, attrs):
        if tag == 'a':
            self.urls.append(dict(attrs).get('href', ''))


baseline = json.loads((ROOT/'tests/protected-content.json').read_text(encoding='utf-8'))
pages = sorted(ROOT / path.replace('\\', '/') for path in baseline)
assert len(pages) == 15
for file in pages:
    source = file.read_text(encoding='utf-8')
    relative = file.parent.relative_to(ROOT).as_posix()
    path = '/' if relative == '.' else '/' + relative + '/'
    assert source.count(header(path)) == 1, file
    assert source.count(footer()) == 1, file
    assert not re.search(r'\{name\}|\bundefined\b|>null<', source), file
    assert source.count('/assets/navigation.js') == 1, file
    key = str(file.relative_to(ROOT))
    for region, pattern in [('head', r'<head>.*?</head>'), ('main', r'<main.*?</main>')]:
        value = re.search(pattern, source, re.S)[0]
        assert hashlib.sha256(value.encode()).hexdigest() == baseline[key][region], (file, region)
    links = Links()
    links.feed(header(path) + footer())
    for url in links.urls:
        assert (ROOT/url.lstrip('/')/'index.html').exists(), (file, url)
    for name, url in NAV:
        assert name in header(path), (file, name)
print('PASS: 15 pages, common header/footer, menu labels, local link targets, scripts, protected head/main hashes')
