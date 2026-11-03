"""仅同步已有页面公共区域，不重建正文、head、sitemap 或 robots。"""
from pathlib import Path
import re
import json
from components import header, footer

ROOT = Path(__file__).resolve().parent


def update(root=ROOT):
    changes = []
    # Scope legacy synchronization to legacy pages, never node_modules/Next output.
    baseline = json.loads((root/'tests/protected-content.json').read_text(encoding='utf-8'))
    for file in sorted(root / path.replace('\\', '/') for path in baseline):
        relative = file.parent.relative_to(root).as_posix()
        path = '/' if relative == '.' else '/' + relative + '/'
        old = file.read_text(encoding='utf-8')
        new, headers = re.subn(r'<header class="site-header">.*?</header>', lambda _: header(path), old, flags=re.S)
        new, footers = re.subn(r'<footer class="site-footer">.*?</footer>', lambda _: footer(), new, flags=re.S)
        if headers != 1 or footers != 1:
            raise ValueError(f'{file}: expected exactly one header/footer')
        if '/assets/navigation.js' not in new:
            new = new.replace('<script defer src="/assets/site.js">', '<script defer src="/assets/navigation.js"></script><script defer src="/assets/site.js">')
        # Keep the original head byte-for-byte; the component stylesheet is imported by style.css.
        if new != old:
            changes.append((file, new))
    for file, content in changes:
        with file.open('w', encoding='utf-8', newline='') as output:
            output.write(content)
    return len(changes)


if __name__ == '__main__':
    print('Updated components in', update(), 'pages')
