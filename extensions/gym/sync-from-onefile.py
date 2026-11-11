"""Rebuild app.html from the Gym Tracker sources in github.com/b-niamin/onefile-apps, in the assistant's look.

    git clone https://github.com/b-niamin/onefile-apps
    python3 sync-from-onefile.py onefile-apps/apps/gym-tracker/muscle-map/src

It does what the onefile build.py does, plus the restyle: the shell's tokens (taken from the current
app.html), its radii, no Barlow fonts, and Beni in the header and empty states. Every replacement must
match exactly, so a change upstream that breaks one stops the script instead of shipping half a look.
Check new upstream CSS for white-on-dark colours by hand (the script lists them).
"""
import base64, json, pathlib, re, sys
src = pathlib.Path(sys.argv[1])
out = pathlib.Path(sys.argv[2]) if len(sys.argv) > 2 else pathlib.Path(__file__).with_name('app.html')
ref = out.read_text(encoding='utf-8')
rd = lambda n: (src / n).read_text(encoding='utf-8')

def must(s, a, b, count=1):
    n = s.count(a)
    if n != count: raise SystemExit(f'expected {count}x, found {n}x: {a[:90]!r}')
    return s.replace(a, b)

# ---- CSS
css = rd('style.css')
hdr_old = css[:css.index(':root{')]
hdr_new = ref[ref.index('/* Layout:'):ref.index(':root{')]
css = hdr_new + css[len(hdr_old):]
def block(s, start, end):
    i = s.index(start); j = s.index(end, i) + len(end); return i, j
# light tokens: everything from :root{ up to --ease:
i, j = block(css, ':root{', '  --ease:'); ri, rj = block(ref, ':root{', '  --ease:')
css = css[:i] + ref[ri:rj] + css[j:]
for start, end in (('@media (prefers-color-scheme:dark){', 'color-scheme:dark}}'), (':root[data-theme="dark"]{', 'color-scheme:dark}')):
    i, j = block(css, start, end); ri, rj = block(ref, start, end)
    css = css[:i] + ref[ri:rj] + css[j:]
tokens_end = j
body, toks = css[tokens_end:], css[:tokens_end]
body = body.replace('var(--surface)', 'var(--g-surface)').replace('var(--ink)', 'var(--g-ink)')
body = body.replace('border-radius:28px 28px 0 0', 'border-radius:var(--radius,8px) var(--radius,8px) 0 0')
body = re.sub(r'border-radius:(999px|12px)(?=[;}])', 'border-radius:var(--radius-sm,6px)', body)
body = re.sub(r'border-radius:(14|16|18|20|22|24|28)px(?=[;}])', 'border-radius:var(--radius,8px)', body)
body = body.replace('font-weight:800', 'font-weight:700')
for a, b in [
    ('.empty{color:var(--muted);padding:20px 4px;font-size:15px;max-width:44ch}',
     '.empty{color:var(--muted);padding:20px 4px;font-size:15px;max-width:44ch;display:flex;align-items:center;gap:12px}\n'
     '.empty assistant-beni{flex:0 0 auto}\n.top .brand{display:flex;align-items:center;gap:10px;min-width:0}'),
    ('nav.tabs button.on{color:#fff;background:rgba(255,255,255,.13)}', 'nav.tabs button.on{color:var(--on);background:var(--blue-soft)}'),
    ('background:radial-gradient(120% 90% at 100% 0%,var(--hero1) 0%,var(--hero2) 55%);color:var(--hero-fg);border-radius:var(--radius,8px);padding:14px 14px 12px;margin-bottom:12px;box-shadow:0 14px 30px rgba(var(--sh-c),.2)}',
     'background:var(--hero1);color:var(--hero-fg);border-radius:var(--radius,8px);padding:14px 14px 12px;margin-bottom:12px;box-shadow:var(--shadow)}'),
    ('-webkit-backdrop-filter:blur(16px);box-shadow:0 12px 30px rgba(var(--sh-c),.3)', '-webkit-backdrop-filter:blur(16px);box-shadow:0 0 0 1px var(--g-ring),0 8px 24px rgba(var(--sh-c),.12)'),
    ('.hd.has{background:#fff;color:#1B2130}', '.hd.has{background:var(--blue-soft);color:var(--on)}'),
    ('.hd.has span{color:#5F6878}', '.hd.has span{color:var(--on)}'),
    ('.hd.today{box-shadow:inset 0 0 0 1.5px rgba(255,255,255,.7)}', '.hd.today{box-shadow:inset 0 0 0 1.5px var(--blue)}'),
    ('.hero .stepper{background:rgba(255,255,255,.1);color:#fff}', '.hero .stepper{background:var(--sunk);color:var(--g-ink)}'),
    ('.qa-b.pri .qa-i{background:var(--red);color:#fff;box-shadow:0 8px 18px rgba(210,58,46,.35)}', '.qa-b.pri .qa-i{background:var(--blue);color:#fff;box-shadow:none}'),
    ('.sum-hero{background:radial-gradient(120% 90% at 100% 0%,var(--hero1) 0%,var(--hero2) 55%);color:var(--hero-fg);',
     '.sum-hero{background:var(--hero1);box-shadow:var(--shadow);color:var(--hero-fg);'),
]:
    body = must(body, a, b)
if '.rest-panel' in body:  # 1.1.0+: floating timer, big timer, photos, desktop layout on the shell's light surfaces
    body = re.sub(r'border-radius:26px(?=[;}])', 'border-radius:var(--radius,8px)', body)
    for a, b in [
        ('.rest-panel{display:flex;gap:6px;padding:6px;border-radius:var(--radius-sm,6px);background:var(--nav);backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px);box-shadow:0 10px 24px rgba(var(--sh-c),.3);',
         '.rest-panel{display:flex;gap:6px;padding:6px;border-radius:var(--radius-sm,6px);background:var(--nav);backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px);box-shadow:0 0 0 1px var(--g-ring),0 8px 24px rgba(var(--sh-c),.12);'),
        ('background:rgba(255,255,255,.12);color:#fff;font-family:var(--cond);font-weight:700;font-size:17px;',
         'background:var(--sunk);color:var(--g-ink);font-family:var(--cond);font-weight:700;font-size:17px;'),
        ('.rest-panel .r.go{background:#2F9A57;', '.rest-panel .r.go{background:var(--green);color:#fff;'),
        ('background:radial-gradient(120% 70% at 50% 0%,var(--hero1) 0%,var(--hero2) 60%);color:var(--hero-fg);',
         'background:var(--g-surface);box-shadow:0 0 0 1px var(--g-ring);color:var(--hero-fg);'),
        ('.rbig .grab{background:rgba(255,255,255,.25)}', '.rbig .grab{background:var(--line)}'),
        ('.rbig-top .btn{background:rgba(255,255,255,.12);color:#fff;box-shadow:none}', '.rbig-top .btn{background:var(--sunk);color:var(--g-ink);box-shadow:none}'),
        ('.rbig-ring .bgc{stroke:rgba(255,255,255,.1)}', '.rbig-ring .bgc{stroke:var(--sunk)}'),
        ('background:rgba(255,255,255,.12);color:#fff;font-family:var(--cond);font-weight:700;font-size:22px;',
         'background:var(--sunk);color:var(--g-ink);font-family:var(--cond);font-weight:700;font-size:22px;'),
        ('background:#fff;color:#1B2130;font-family:var(--cond);font-weight:700;font-size:22px;',
         'background:var(--pri);color:var(--on-pri);font-family:var(--cond);font-weight:700;font-size:22px;'),
        ('nav.tabs button:hover{color:#fff;background:rgba(255,255,255,.07)}', 'nav.tabs button:hover{color:var(--g-ink);background:var(--sunk)}'),
        ('  nav.tabs button.on{background:rgba(255,255,255,.14)}', '  nav.tabs button.on,nav.tabs button.on:hover{color:var(--on);background:var(--blue-soft)}'),
    ]:
        body = must(body, a, b)
    left = re.findall(r'[^\n]*(?:rgba\(255,255,255|#fff\b|#1B2130)[^\n]*', body)
    print('check by hand:', *[l[:140] for l in left], sep='\n  ')
css = toks + body

# ---- shell
shell = rd('shell.html')
shell = must(shell, '/* Barlow, Barlow Condensed: Copyright 2017 The Barlow Project Authors, SIL Open Font License 1.1 */\n/*@FONTS@*/\n', '')
shell = must(shell, '<header class="top"><h1 id="title">Gym Tracker</h1>',
             '<header class="top"><span class="brand"><assistant-beni id="pip" mood="steady" size="36"></assistant-beni><h1 id="title">Gym Tracker</h1></span>')

# ---- JS
i18n = rd('i18n.js')
i18n = must(i18n, 'about2:["Fonts: Barlow (OFL 1.1). Muscle outlines', 'about2:["Muscle outlines')
i18n = must(i18n, '"Fonty: Barlow (OFL 1.1). Kontury', '"Kontury')
app = rd('app.js')
app = app.replace('var(--ink)', 'var(--g-ink)').replace('var(--surface)', 'var(--g-surface)')
EMPTY = '<assistant-beni mood="idle" size="36"></assistant-beni>'
app = re.sub(r'(<(?:p|div) class="empty">)(\$\{esc\(t\("(?:progEmpty|libEmpty)"\)\)\})', r'\1' + EMPTY + r'\2', app)
app = must(app, '<section class="hero" aria-label="${esc(t("thisWeek"))}">',
           '${pipMood(wc>=g?"charged":wc?"steady":"idle")}<section class="hero" aria-label="${esc(t("thisWeek"))}">')
PIP = ('/* Beni in the header: charged when the weekly goal is met, steady while on it, idle before the first workout. */\n'
       'function pipMood(m){const p=document.getElementById("pip");if(p)p.setAttribute("mood",m);return "";}\n')
# insert pipMood right before the function that renders the hero
k = app.index('${pipMood(')
fn = app.rfind('\nfunction ', 0, k)
app = app[:fn+1] + PIP + app[fn+1:]

body_json = json.dumps(json.loads(rd('body.json')), separators=(',', ':'))
js = app.replace('/*@LIB@*/', rd('lib.js')).replace('/*@I18N@*/', i18n).replace('/*@BODY@*/null', body_json)
if '/*@IMG@*/null' in js:
    imgs = {}
    for f in sorted((src / 'img').glob('*_[01].webp')):
        ex_id, frame = f.stem.rsplit('_', 1)
        imgs.setdefault(ex_id, ['', ''])[int(frame)] = 'data:image/webp;base64,' + base64.b64encode(f.read_bytes()).decode()
    js = js.replace('/*@IMG@*/null', json.dumps(imgs, separators=(',', ':')))
html = shell.replace('/*@CSS@*/', css).replace('/*@JS@*/', js)
page = ('<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n'
        '<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">\n'
        + html.replace('<div class="wrap">', '</head>\n<body>\n<div class="wrap">', 1) + '\n</body>\n</html>\n')
out.write_text(page, encoding='utf-8')
print(f'{out.name}: {len(page):,} bytes')
