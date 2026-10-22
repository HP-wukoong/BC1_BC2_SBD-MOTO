"""Dựng TOOLS BC1+BC2+SBD thành 1 file HTML tự chứa (thư viện, phông chữ, mẫu Excel/Word nhúng sẵn).
   Kết quả:
     dist/TOOLS BC1+BC2+SBD.html  — bản file, mở trực tiếp trên máy (không cần mạng)
     docs/                        — bản web app (GitHub Pages): index.html + manifest + service worker + biểu tượng
   Cần: python3, node_modules (chạy `npm ci` trước)."""
import re, base64, os, shutil, json
ROOT = os.path.dirname(os.path.abspath(__file__))
P = lambda *a: os.path.join(ROOT, *a)
rd = lambda p, m='r': open(P(p), m, **({} if 'b' in m else {'encoding': 'utf-8'})).read()
b64 = lambda p: base64.b64encode(rd(p, 'rb')).decode()

src = rd('src/app.html')
x = rd('node_modules/xlsx/dist/xlsx.full.min.js')
e = rd('node_modules/exceljs/dist/exceljs.min.js')
x = re.sub(r'</script', r'<\\/script', x, flags=re.I); e = re.sub(r'</script', r'<\\/script', e, flags=re.I)
F = 'node_modules/@fontsource/be-vietnam-pro/files/be-vietnam-pro-%s-%d-normal.woff2'
UR = {'vietnamese': 'U+0102-0103,U+0110-0111,U+0128-0129,U+0168-0169,U+01A0-01A1,U+01AF-01B0,U+0300-0301,U+0303-0304,U+0308-0309,U+0323,U+0329,U+1EA0-1EF9,U+20AB',
      'latin': 'U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD'}
css = ''
for sub in ('vietnamese', 'latin'):
    for w, st in ((400, 'normal'), (500, 'normal'), (600, 'normal'), (700, 'normal'), (800, 'normal'), (900, 'normal'), (600, 'italic'), (800, 'italic')):
        css += f"@font-face{{font-family:'Be Vietnam Pro';font-style:{st};font-weight:{w};font-display:swap;src:url(data:font/woff2;base64,{b64((F % (sub, w)).replace('-normal.', '-' + st + '.'))}) format('woff2');unicode-range:{UR[sub]}}}\n"
ps = rd('src/installer.ps1'); assert '</script' not in ps.lower()
html = (src.replace('/*TB_TEMPLATE*/', b64('src/thongbao_mau.xlsx'), 1).replace('/*BCDN_TEMPLATE*/', b64('src/bcdn_mau.docx'), 1).replace('/*BCDT_TEMPLATE*/', b64('src/bcdt_mau.docx'), 1).replace('/*KHDT_TEMPLATE*/', b64('src/khdt_mau.docx'), 1).replace('/*KHDT_PARTS*/', b64('src/khdt_parts.json'), 1)
        .replace('/*PDF_FONT_R*/', b64('src/fonts/LS-Regular.ttf'), 1).replace('/*PDF_FONT_B*/', b64('src/fonts/LS-Bold.ttf'), 1)
        .replace('/*TBP_LOGO*/', b64('src/poster/logo.png'), 1).replace('/*TBP_HDR*/', b64('src/poster/hdr.jpg'), 1).replace('/*TBP_RIDER*/', b64('src/poster/rider.png'), 1)
        .replace('/*PS_INSTALLER*/', ps, 1).replace('/*FONTS*/', css, 1).replace('/*XLSX_LIB*/', x, 1).replace('/*EXCELJS_LIB*/', e, 1))
ver = re.search(r"const VERSIONS=\[\s*\['([^']+)'", src).group(1)
assert '/*PWA_HEAD*/' in html
for k in ('PDF_FONT_R', 'PDF_FONT_B', 'TBP_LOGO', 'TBP_HDR', 'TBP_RIDER', 'BCDT_TEMPLATE', 'KHDT_TEMPLATE', 'KHDT_PARTS'): assert '/*' + k + '*/' not in html, k

# 1) bản file
os.makedirs(P('dist'), exist_ok=True)
open(P('dist', 'TOOLS BC1+BC2+SBD.html'), 'w', encoding='utf-8').write(html.replace('/*PWA_HEAD*/', '', 1))
# 2) bản web app
head = ('<link rel="manifest" href="manifest.webmanifest">\n<meta name="theme-color" content="#14213d">\n'
        '<link rel="icon" type="image/png" href="icons/favicon-64.png">\n<link rel="apple-touch-icon" href="icons/apple-touch-icon.png">\n'
        '<meta name="mobile-web-app-capable" content="yes">\n<meta name="application-name" content="BC1 BC2 SBD">')
if os.path.isdir(P('docs')): shutil.rmtree(P('docs'))
os.makedirs(P('docs', 'icons'))
open(P('docs', 'index.html'), 'w', encoding='utf-8').write(html.replace('/*PWA_HEAD*/', head, 1))
open(P('docs', 'sw.js'), 'w', encoding='utf-8').write(rd('pwa/sw.js').replace('__VER__', ver))
shutil.copy(P('pwa', 'manifest.webmanifest'), P('docs', 'manifest.webmanifest'))
for f in os.listdir(P('pwa', 'icons')): shutil.copy(P('pwa', 'icons', f), P('docs', 'icons', f))
shutil.copy(P('dist', 'TOOLS BC1+BC2+SBD.html'), P('docs', 'TOOLS BC1+BC2+SBD.html'))   # tải bản file từ trang web
open(P('docs', '.nojekyll'), 'w').close()
print(f'v{ver}: dist {len(html)//1024} KB, docs/ xong')
