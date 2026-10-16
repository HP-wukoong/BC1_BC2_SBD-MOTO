"""Kiểm tra bản dựng: chạy web app qua http (như GitHub Pages) + bản file, chạy “Tự kiểm tra tool”,
   kiểm tra cài service worker và mở được khi mất mạng. Thoát mã 1 nếu có mục sai.
   Cần: pip install playwright && python -m playwright install chromium"""
import asyncio, os, sys, threading, http.server, functools, socketserver
from playwright.async_api import async_playwright
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FAIL = []
def ok(lab, cond, extra=''):
    print(('  ĐẠT  ' if cond else '  SAI  ') + lab + (f' — {extra}' if extra else ''))
    if not cond: FAIL.append(lab)
def serve():
    class Q(http.server.SimpleHTTPRequestHandler):
        def log_message(self, *a): pass
    h = functools.partial(Q, directory=os.path.join(ROOT, 'docs'))
    s = socketserver.TCPServer(('127.0.0.1', 0), h); threading.Thread(target=s.serve_forever, daemon=True).start()
    return s.server_address[1]
SKIP_USER = "()=>{ try{ localStorage.setItem('soSatHachA1_v1_nguoi','-'); }catch(e){} }"
async def selftest(pg, lab):
    await pg.evaluate("()=>{ const d=document.querySelector('#dlg'); d&&d.open&&d.close(); }")
    R = await pg.evaluate("async()=>(await selfTest()).map(x=>[x.ok,x.name,x.d])")
    bad = [r for r in R if not r[0]]
    ok(f'{lab}: tự kiểm tra {len(R)-len(bad)}/{len(R)} mục', not bad, '; '.join(f'{r[1]}: {r[2]}' for r in bad))
async def main():
    port = serve(); url = f'http://127.0.0.1:{port}/'
    async with async_playwright() as p:
        b = await p.chromium.launch(); ctx = await b.new_context(); await ctx.add_init_script(SKIP_USER)
        pg = await ctx.new_page(); errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
        print('Web app:', url)
        r = await pg.goto(url); ok('Mở trang web app', r.ok)
        ver = await pg.evaluate('APP_VER'); ok('Đúng phiên bản', bool(ver), 'v' + ver)
        man = await pg.evaluate("async()=>{ const l=document.querySelector('link[rel=manifest]'); const r=await fetch(l.href); const j=await r.json(); return [r.ok,j.display,j.icons.length]; }")
        ok('Manifest cài app (standalone, biểu tượng)', man[0] and man[1] == 'standalone' and man[2] >= 2, man)
        await pg.wait_for_function("()=>navigator.serviceWorker&&navigator.serviceWorker.ready.then(()=>true)", timeout=20000)
        await pg.reload(); await pg.wait_for_timeout(800)
        ok('Service worker đang điều khiển trang', await pg.evaluate("()=>!!navigator.serviceWorker.controller"))
        await selftest(pg, 'Web app')
        await ctx.set_offline(True); r = await pg.reload(); await pg.wait_for_timeout(800)
        ok('Mất mạng vẫn mở được app', await pg.evaluate("()=>typeof APP_VER==='string'&&!!document.querySelector('#tabs')"))
        await ctx.set_offline(False)
        ok('Không có lỗi JavaScript (web app)', not errs, errs[:3])
        # bản file
        pg2 = await ctx.new_page(); e2 = []; pg2.on('pageerror', lambda e: e2.append(str(e)))
        await pg2.goto('file://' + os.path.join(ROOT, 'dist', 'TOOLS BC1+BC2+SBD.html')); await pg2.wait_for_timeout(800)
        ok('Bản file không gắn manifest / service worker', await pg2.evaluate("()=>!document.querySelector('link[rel=manifest]')"))
        await selftest(pg2, 'Bản file')
        ok('Không có lỗi JavaScript (bản file)', not e2, e2[:3])
        await b.close()
    print('KẾT QUẢ:', 'TẤT CẢ ĐẠT' if not FAIL else f'{len(FAIL)} mục SAI')
    sys.exit(1 if FAIL else 0)
asyncio.run(main())
