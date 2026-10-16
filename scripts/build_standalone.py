"""Build a portable HTML with local styles, scripts and images embedded."""
from pathlib import Path
import base64
import json
import mimetypes
import re

ROOT = Path(__file__).resolve().parent.parent

def asset(path):
    mime = mimetypes.guess_type(path.name)[0] or 'application/octet-stream'
    return 'data:' + mime + ';base64,' + base64.b64encode(path.read_bytes()).decode()

def stylesheet(match):
    path = ROOT / match.group(1)
    def url(match):
        local = (path.parent / match.group(1).strip('\"\'')).resolve()
        return 'url("' + asset(local) + '")' if local.is_file() and local.is_relative_to(ROOT) else match.group()
    return '<style>' + re.sub(r'url\(([^)]+)\)', url, path.read_text()) + '</style>'

html = (ROOT / 'index.html').read_text()
html = re.sub(r'<link rel="stylesheet" href="([^"]+)">', stylesheet, html)
html = re.sub(r'(src|href)="(images/[^"]+)"', lambda m: m.group(1) + '="' + asset(ROOT / m.group(2)) + '"', html)
js = (ROOT / 'app.js').read_text()
files = ['aa61569f409afbc9.png', '125e1ba35c6bda6b.png', '28cf96b3bec5efca.png', 'caixa.svg', 'caixa-aberta.svg', 'envio.svg', 'bandeira-brasil.svg']
js = 'const embeddedImages = ' + json.dumps({f: asset(ROOT / 'images' / f) for f in files}) + ';\n' + js
js = js.replace('image.src = `images/${file}`;', 'image.src = embeddedImages[file];')
js = js.replace("icon.src = 'images/' + stage.icon;", 'icon.src = embeddedImages[stage.icon];')
html = html.replace('<script src="app.js" defer></script>', '')
html = html.replace('</body>', '<script>' + js.replace('</script', '<\\/script') + '</script></body>')
(ROOT / 'site-completo.html').write_text(html)
print('site-completo.html gerado')
