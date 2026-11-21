#!/usr/bin/env python3
"""Static checks for the website: every local link and asset exists, every
indexable page has the basics (title, description, canonical, one h1), and the
sitemap only lists real pages. Run from anywhere: python3 tests/check-site.py"""
import re, sys
from pathlib import Path
from urllib.parse import urlparse, unquote

root = Path(__file__).resolve().parent.parent
pages = sorted(p for p in root.glob('**/*.html') if not any(x in p.parts for x in ('dist', 'marketing', 'node_modules')))
errors = []

def local_target(page, ref):
    ref = ref.strip()
    u = urlparse(ref)
    if u.scheme or ref.startswith(('mailto:', 'tel:', '#', 'data:', 'javascript:')) or ref.startswith('//'):
        return None
    path = unquote(u.path)
    if path == '':
        return None
    base = root if path.startswith('/') else page.parent
    t = (base / path.lstrip('/')).resolve()
    return t / 'index.html' if t.is_dir() else t

for page in pages:
    html = page.read_text(encoding='utf-8')
    rel = page.relative_to(root)
    for m in re.finditer(r'\b(?:href|src)="([^"]*)"', html):
        t = local_target(page, m.group(1))
        if t is not None and not t.exists():
            errors.append(f'{rel}: missing {m.group(1)}')
    for m in re.finditer(r'href="([^"#]*)#([^"]+)"', html):
        t = local_target(page, m.group(1)) if m.group(1) else page
        if t is not None and t.exists() and t.suffix == '.html':
            if f'id="{m.group(2)}"' not in t.read_text(encoding='utf-8'):
                errors.append(f'{rel}: anchor #{m.group(2)} not found in {t.name}')
    if 'noindex' in html or rel.parts[0] in ('ig', 'li'):
        continue
    if not re.search(r'<title>[^<]{5,}</title>', html): errors.append(f'{rel}: missing title')
    if not re.search(r'<meta name="description" content="[^"]{30,}', html): errors.append(f'{rel}: missing meta description')
    if rel.name != '404.html' and 'rel="canonical"' not in html: errors.append(f'{rel}: missing canonical')
    if len(re.findall(r'<h1[ >]', html)) != 1: errors.append(f'{rel}: needs exactly one h1')
    for img in re.findall(r'<img\b[^>]*>', html):
        if ' alt=' not in img: errors.append(f'{rel}: image without alt: {img[:80]}')

sm = (root / 'sitemap.xml').read_text()
for loc in re.findall(r'<loc>https://northwestcomplete\.com/([^<]*)</loc>', sm):
    if not (root / (loc or 'index.html')).exists():
        errors.append(f'sitemap.xml: {loc} does not exist')

for e in errors: print('ERROR', e)
print(f'{len(pages)} pages checked, {len(errors)} problems')
sys.exit(1 if errors else 0)
