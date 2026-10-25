"""Kiểm tra tool Sửa NDSH XML (docs/sua-ndsh/ và dist/Sua_NDSH_XML.html) bằng DỮ LIỆU GIẢ LẬP — không dùng dữ liệu thật.
   Thoát mã 1 nếu có mục sai.  Cần: pip install playwright && python -m playwright install chromium
   Tuỳ chọn: python3 tests/kiemtra_ndsh.py <file_xml_that> <file_excel_that> <file_xml_ket_qua_mong_doi>  (chạy thêm với dữ liệu thật, không lưu vào kho)"""
import asyncio, os, sys, threading, http.server, functools, socketserver, base64, hashlib, random, re, json
import xml.etree.ElementTree as ET
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

# ---------- dữ liệu giả lập ----------
HO = ['NGUYỄN', 'TRẦN', 'LÊ', 'PHẠM', 'HUỲNH', 'VÕ', 'ĐẶNG', 'BÙI']
TEN = ['AN', 'BÌNH', 'CHÂU', 'DŨNG', 'ĐỨC', 'GIANG', 'HÀ', 'HẢI', 'KHOA', 'LAN', 'LONG', 'MAI', 'NAM', 'NGỌC', 'PHÚC']
def person(i):
    return dict(cccd=f'0521{i:08d}', ho=HO[i % 8] + ' VĂN', ten=TEN[i % 15], code='3' if i < 10 else ('7' if i < 20 else '1'), sbd=f'{i+1:03d}',
                khoa='52003K26A1078' if i < 20 else '52003K26A1115')
N = 30
P_ = [person(i) for i in range(N)]
def make_xml():
    rnd = random.Random(7)
    recs = []
    for i, p in enumerate(P_):
        photo = ''.join(rnd.choice('ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/') for _ in range(3000)) + '=='
        recs.append(f'''      <NGUOI_LX>
        <SO_TT>{i+1}</SO_TT>
        <HO_TEN_DEM>{p['ho']}</HO_TEN_DEM>
        <TEN>{p['ten']}</TEN>
        <HO_VA_TEN>{p['ho']} {p['ten']}</HO_VA_TEN>
        <NGAY_SINH>1990010{i % 9 + 1}</NGAY_SINH>
        <SO_CMT>{p['cccd']}</SO_CMT>
        <HO_SO>
          <SO_BAO_DANH>{p['sbd']}</SO_BAO_DANH>
          <HANG_GPLX>A1m</HANG_GPLX>
          <SO_GPLX_DA_CO></SO_GPLX_DA_CO>
          <NOI_DUNG_SH>{p['code']}</NOI_DUNG_SH>
          <LY_DO_SH />
          <ANH_CHAN_DUNG>{photo}</ANH_CHAN_DUNG>
          <NGAY_TT_GPLX_DACO />
          <MA_KHOA_HOC>{p['khoa']}</MA_KHOA_HOC>
          <SO_QD_SH>999/QĐ-THU-NGHIEM</SO_QD_SH>
        </HO_SO>
      </NGUOI_LX>''')
    body = f'''<?xml version="1.0" encoding="utf-8"?>
<SAT_HACH>
  <HEADER>
    <MA_GIAO_DICH>00000000-thu-nghiem</MA_GIAO_DICH>
    <TEN_DV_GUI>Thử nghiệm</TEN_DV_GUI>
    <NGAY_GUI>2026-10-07 08:00:00</NGAY_GUI>
    <TONG_SO_BAN_GHI>{N}</TONG_SO_BAN_GHI>
  </HEADER>
  <DATA>
    <KY_SH>
      <MAKYSH>9999999999</MAKYSH>
      <NGAYSH>2026-10-12</NGAYSH>
      <SOQD>999/QĐ-THU-NGHIEM</SOQD>
      <NGAYQD>2026-10-07</NGAYQD>
    </KY_SH>
    <NGUOI_LXS>
{chr(10).join(recs)}
    </NGUOI_LXS>
  </DATA>
</SAT_HACH>'''
    # chữ ký số kiểu enveloped (giống file PC-08): mã băm SHA-1 của C14N đã bỏ khoảng trắng thừa
    dig = base64.b64encode(hashlib.sha1(ET.canonicalize(body.split('?>', 1)[1], strip_text=True).encode()).digest()).decode()
    sig = f'''  <Signature xmlns="http://www.w3.org/2000/09/xmldsig#">
    <SignedInfo>
      <CanonicalizationMethod Algorithm="http://www.w3.org/TR/2001/REC-xml-c14n-20010315" />
      <SignatureMethod Algorithm="http://www.w3.org/2000/09/xmldsig#rsa-sha1" />
      <Reference URI="">
        <Transforms>
          <Transform Algorithm="http://www.w3.org/2000/09/xmldsig#enveloped-signature" />
        </Transforms>
        <DigestMethod Algorithm="http://www.w3.org/2000/09/xmldsig#sha1" />
        <DigestValue>{dig}</DigestValue>
      </Reference>
    </SignedInfo>
    <SignatureValue>VGh1TmdoaWVt</SignatureValue>
  </Signature>
</SAT_HACH>'''
    body = body[:body.rindex('</SAT_HACH>')] + sig
    return b'\xef\xbb\xbf' + body.replace('\n', '\r\n').encode('utf-8')
def expected(xml, changes):
    out = xml
    for cccd, new in changes.items():
        i = out.index(f'<SO_CMT>{cccd}</SO_CMT>'.encode()); j = out.index(b'<NOI_DUNG_SH>', i); k = out.index(b'</NOI_DUNG_SH>', j)
        out = out[:j + 13] + new.encode() + out[k:]
    return out
LAB = {0: ('SH lại L', 2), 1: ('SH lại L+H', 3), 2: ('SH lại H', 7)}
SHORT = {0: 'L', 1: 'L+H', 2: 'V-H'}
# Excel A: có cột STT, CCCD dạng SỐ (mất số 0 đầu), Họ tên, Nội dung, Số. Dòng MM sai tên → không đổi. 1 dòng không có trong XML.
MM = 13
def rows_a():
    r = [['DANH SÁCH THÍ SINH THI LẠI (THỬ NGHIỆM)', '', '', '', ''], ['STT', 'Họ và tên', 'Số định danh', 'Ghi chú', 'Số']]
    for i in range(15):
        p = P_[i]; lab, num = LAB[i % 3]
        r.append([i + 1, (p['ho'] + ' ' + p['ten']) if i != MM else 'TÊN SAI KHÁC', int(p['cccd']), lab, num])
    r.append([16, 'NGƯỜI NGOÀI', '052199999999', 'SH lại L', 2]); return r
# Excel B: KHÔNG có cột Số, nội dung viết tắt (L, L+H, V-H, có đuôi ngày)
def rows_b():
    r = [['STT', 'Họ tên', 'CCCD', 'Nội dung']]
    for i in range(15):
        p = P_[i]; s = SHORT[i % 3] if i != 5 else 'H-28/10/2023'
        r.append([i + 1, p['ho'] + ' ' + p['ten'], p['cccd'], s])
    return r
CH_A = {P_[i]['cccd']: str(LAB[i % 3][1]) for i in range(15) if i != MM and str(LAB[i % 3][1]) != P_[i]['code']}
CH_B = {P_[i]['cccd']: str(LAB[i % 3][1]) for i in range(15) if str(LAB[i % 3][1]) != P_[i]['code']}

async def xlsx(pg, rows, sheet='A1m-99-TL'):
    b64 = await pg.evaluate("([rows,sh])=>{const wb=XLSX.utils.book_new();XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet([['bìa']]),'Bia');XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet(rows),sh);return XLSX.write(wb,{type:'base64',bookType:'xlsx'});}", [rows, sheet])
    return base64.b64decode(b64)
async def load(pg, sel, name, data, mime):
    await pg.set_input_files(sel, files=[{'name': name, 'mimeType': mime, 'buffer': data}])
async def run_and_get(pg, ack=True):
    await pg.click('#bRun'); await pg.wait_for_selector('#cardStat:not(.hide)', timeout=120000)
    if ack and await pg.is_visible('#ack'): await pg.check('#ack')
    async with pg.expect_download() as d: await pg.click('#bDl')
    dl = await d.value; p = await dl.path(); return open(p, 'rb').read(), dl.suggested_filename

async def suite(ctx, url, lab, full):
    pg = await ctx.new_page(); errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.on('console', lambda m: errs.append(m.text) if m.type == 'error' else None)
    await pg.goto(url); await pg.wait_for_function('window.__ndshReady===true')
    ok(f'{lab}: mở tool', True, await pg.evaluate("document.querySelector('#ver').textContent"))
    X = make_xml()
    await load(pg, '#fX', '52_THU_NGHIEM.xml', X, 'text/xml')
    await load(pg, '#fE', 'A1m-99-TL.xlsx', await xlsx(pg, rows_a()), 'application/octet-stream')
    await pg.wait_for_selector('#cardRes:not(.hide)')
    det = await pg.evaluate("[sSheet.value,sCccd.value,sNum.value,sLabel.value,sName.value]")
    ok(f'{lab}: tự nhận diện sheet & cột (CCCD C, Số E, Nội dung D, Họ tên B)', det == ['A1m-99-TL', '2', '4', '3', '1'], det)
    chips = await pg.inner_text('#chips')
    ok(f'{lab}: đối chiếu (16 dòng, {len(CH_A)} sẽ đổi, 1 lệch tên, 1 không có trong XML)', 'Tất cả dòng Excel16' in chips and f'Sẽ đổi{len(CH_A) + 1}' in chips and 'Lệch tên1' in chips and 'Lỗi / không tìm thấy1' in chips, chips.replace('\n', ' '))
    out, fname = await run_and_get(pg)
    checks = await pg.inner_text('#checks')
    ok(f'{lab}: file tạo ra đúng từng byte như mong đợi ({len(CH_A)} hồ sơ đổi, lệch tên bị bỏ qua)', out == expected(X, CH_A))
    ok(f'{lab}: chữ ký số — file gốc hợp lệ, file mới không còn khớp', 'file GỐC hợp lệ — file MỚI KHÔNG còn khớp' in checks)
    ok(f'{lab}: tên file theo quy ước', re.fullmatch(r'52_THU_NGHIEM_DA_SUA_A1m-99-TL_\d{8}-\d{4}\.xml', fname) is not None, fname)
    st = await pg.inner_text('#tStat'); ok(f'{lab}: bảng thống kê có tổng {N}', f'TỔNG CỘNG\t{N}\t{N}' in st)
    # biên bản
    await pg.evaluate("window.print=()=>{}"); await pg.click('#bPrint'); await pg.wait_for_timeout(200)
    bb = await pg.inner_text('#bb')
    ok(f'{lab}: biên bản A4 đủ mục', all(s in bb for s in ['BIÊN BẢN HIỆU CHỈNH NỘI DUNG SÁT HẠCH', 'II. KẾT QUẢ KIỂM ĐỊNH', 'IV. DANH SÁCH HỒ SƠ ĐÃ HIỆU CHỈNH', 'NGƯỜI LẬP']) and bb.count('\n') > 20)
    # Excel B: không có cột Số, viết tắt
    await load(pg, '#fE', 'LOCTL.xlsx', await xlsx(pg, rows_b(), 'LOCTL'), 'application/octet-stream')
    await pg.wait_for_timeout(200)
    det = await pg.evaluate("[sNum.value,sLabel.value,document.querySelector('input[name=mode][value=map]').checked]")
    ok(f'{lab}: không có cột Số → không nhận nhầm cột STT, tự chuyển sang bảng mã', det == ['-1', '3', True], det)
    out, _ = await run_and_get(pg)
    ok(f'{lab}: tên gọi tắt (L, L+H, V-H, đuôi ngày) ra đúng mã, file đúng từng byte', out == expected(X, CH_B))
    # Tab kiểm tra file đã sửa
    await pg.click('nav.tabs button[data-tab=cmp]')
    await load(pg, '#fA', 'goc.xml', X, 'text/xml'); await load(pg, '#fB', 'sua.xml', out, 'text/xml')
    await pg.click('#bCmp'); await pg.wait_for_selector('#cmpRes:not(.hide)')
    v = await pg.inner_text('#cmpVerdict'); ok(f'{lab}: kiểm tra file do tool sửa → ĐẠT', 'ĐẠT' in v and 'KHÔNG' not in v and f'{len(CH_B)} hồ sơ' in v, v)
    bad = X.replace(b'\r\n', b'\n')
    await load(pg, '#fB', 'notepad.xml', bad, 'text/xml'); await pg.click('#bCmp'); await pg.wait_for_selector('#cmpRes:not(.hide)')
    v = await pg.inner_text('#cmpVerdict'); c = await pg.inner_text('#cmpChecks')
    ok(f'{lab}: phát hiện file bị đổi kiểu xuống dòng (Notepad)', 'KHÔNG ĐẠT' in v and 'xuống dòng' in c)
    nm = X.replace(f"<TEN>{P_[3]['ten']}</TEN>".encode(), b'<TEN>XYZ</TEN>', 1)
    await load(pg, '#fB', 'ten.xml', nm, 'text/xml'); await pg.click('#bCmp'); await pg.wait_for_selector('#cmpRes:not(.hide)')
    o = await pg.inner_text('#cmpOther'); ok(f'{lab}: phát hiện sửa tên ngoài NOI_DUNG_SH, chỉ đúng người & thẻ', 'trong thẻ <TEN>' in o and P_[3]['cccd'] in o, o[:160].replace('\n', ' '))
    await pg.click('nav.tabs button[data-tab=fix]')
    # Dấu ! giải thích
    await pg.click('#hSet')
    tips = await pg.evaluate("Array.from(document.querySelectorAll('.tip')).filter(t=>t.offsetParent!==null).map(t=>t.dataset.tip)")
    empty = []
    for t in tips:
        await pg.evaluate("t=>{const e=document.querySelector('.tip[data-tip='+t+']'); e.scrollIntoView({block:'center'});}", t)
        await pg.click(f'.tip[data-tip={t}]'); txt = await pg.inner_text('#pop'); await pg.keyboard.press('Escape')
        if len(txt.strip()) < 30: empty.append(t)
    ok(f'{lab}: {len(tips)} dấu ! đều có giải thích', not empty and len(tips) >= 14, empty)
    if full:
        # Bảng mã lưu lại sau khi mở lại tool
        await pg.click('#hSet'); txt = await pg.input_value('#mapTxt')
        await pg.fill('#mapTxt', txt.replace('7 = SH lại H', '7 = SH lại H (đã kiểm)')); await pg.click('#bMapSave')
        await pg.reload(); await pg.wait_for_function('window.__ndshReady===true')
        ok(f'{lab}: bảng mã đã lưu, mở lại tool vẫn còn', '7 = SH lại H (đã kiểm)' in await pg.input_value('#mapTxt'))
        await pg.click('#hSet'); await pg.click('#bMapDef')
        # Thư mục nhật ký (giả lập bằng thư mục riêng của trình duyệt — OPFS)
        await pg.evaluate("window.showDirectoryPicker=async()=>navigator.storage.getDirectory()")
        await pg.click('#bLogPick'); await pg.wait_for_timeout(200)
        await load(pg, '#fX', '52_THU_NGHIEM.xml', X, 'text/xml')
        await load(pg, '#fE', 'A1m-99-TL.xlsx', await xlsx(pg, rows_a()), 'application/octet-stream')
        await pg.wait_for_selector('#cardRes:not(.hide)'); out, fname = await run_and_get(pg); await pg.wait_for_timeout(300)
        files = await pg.evaluate("async()=>{const d=await (await navigator.storage.getDirectory()).getDirectoryHandle('SuaNDSH');const o=[];for await (const [n,h] of d.entries()){const f=await h.getFile();o.push([n,f.size,n.endsWith('.json')?await f.text():''])}return o}")
        names = [f[0] for f in files]; js = next((json.loads(f[2]) for f in files if f[0].endswith('_NHAT_KY.json')), {})
        ok(f'{lab}: tự ghi nhật ký vào thư mục (CSV + JSON đúng nội dung)', any(n.endswith('_BAO_CAO.csv') for n in names) and len(js.get('thayDoi', [])) == len(CH_A) and js['out']['sha256'] == hashlib.sha256(out).hexdigest(), names)
        await pg.click('#hHist'); h = await pg.inner_text('#dlg'); await pg.click('#dlgX')
        ok(f'{lab}: lịch sử ghi lại lần hiệu chỉnh', '9999999999' in h and fname in h)
        # Ảnh nền: chọn, lưu, mở lại vẫn còn, bỏ
        png = base64.b64decode(await pg.evaluate("()=>{const c=document.createElement('canvas');c.width=2400;c.height=1600;const g=c.getContext('2d');const gr=g.createLinearGradient(0,0,2400,1600);gr.addColorStop(0,'#2a6');gr.addColorStop(1,'#26a');g.fillStyle=gr;g.fillRect(0,0,2400,1600);return c.toDataURL('image/png').split(',')[1]}"))
        await pg.click('#hBg'); await load(pg, '#bgFile', 'nen.png', png, 'image/png'); await pg.wait_for_function("document.documentElement.classList.contains('hasbg')")
        info = await pg.inner_text('#bgInfo'); await pg.click('#dlgOk'); await pg.wait_for_timeout(300)
        await pg.reload(); await pg.wait_for_function('window.__ndshReady===true'); await pg.wait_for_timeout(600)
        ok(f'{lab}: ảnh nền thu nhỏ ≤1920px, lưu lại sau khi mở lại tool', await pg.evaluate("document.documentElement.classList.contains('hasbg')") and '1920×1280' in info, info)
        await pg.click('#hBg'); await pg.click('#bgSh'); await pg.click('#dlgX'); await pg.wait_for_timeout(300)
        ok(f'{lab}: Hủy hộp ảnh nền → giữ ảnh đã lưu', await pg.evaluate("document.documentElement.classList.contains('hasbg')"))
        await pg.click('#hBg'); await pg.click('#bgDel'); await pg.click('#dlgOk'); await pg.wait_for_timeout(300)
        await pg.reload(); await pg.wait_for_function('window.__ndshReady===true'); await pg.wait_for_timeout(400)
        ok(f'{lab}: bỏ ảnh nền', not await pg.evaluate("document.documentElement.classList.contains('hasbg')"))
    ok(f'{lab}: không có lỗi JavaScript', not errs, errs[:3])
    await pg.close()

async def real(ctx, url, xml_p, xls_p, exp_p):
    pg = await ctx.new_page(); errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
    await pg.goto(url); await pg.wait_for_function('window.__ndshReady===true')
    await pg.set_input_files('#fX', xml_p); await pg.set_input_files('#fE', xls_p); await pg.wait_for_selector('#cardRes:not(.hide)')
    out, fname = await run_and_get(pg)
    ok('Dữ liệu thật: file tạo ra giống hệt bản đã kiểm định trước', out == open(exp_p, 'rb').read(), fname)
    ok('Dữ liệu thật: chữ ký file gốc hợp lệ', 'file GỐC hợp lệ' in await pg.inner_text('#checks'))
    await pg.click('nav.tabs button[data-tab=cmp]'); await pg.set_input_files('#fA', xml_p)
    await pg.set_input_files('#fB', files=[{'name': 'sua.xml', 'mimeType': 'text/xml', 'buffer': out}]); await pg.click('#bCmp'); await pg.wait_for_selector('#cmpRes:not(.hide)', timeout=120000)
    ok('Dữ liệu thật: tab kiểm tra → ĐẠT', 'ĐẠT' in (v := await pg.inner_text('#cmpVerdict')) and 'KHÔNG' not in v, v)
    ok('Dữ liệu thật: không lỗi JavaScript', not errs, errs[:3]); await pg.close()

async def main():
    port = serve(); web = f'http://127.0.0.1:{port}/sua-ndsh/'
    async with async_playwright() as p:
        exe = os.environ.get('PW_CHROMIUM'); b = await (p.chromium.launch(executable_path=exe) if exe else p.chromium.launch()); ctx = await b.new_context(accept_downloads=True)
        await ctx.add_init_script("()=>{ try{ localStorage.setItem('soSatHachA1_v1_nguoi','-'); }catch(e){} }")
        print('Web app:', web); await suite(ctx, web, 'Web', True)
        print('Bản file'); await suite(ctx, 'file://' + os.path.join(ROOT, 'dist', 'Sua_NDSH_XML.html'), 'Bản file', False)
        # service worker: mở tool rồi mất mạng → trang chính vẫn là trang chính
        pg = await ctx.new_page(); await pg.goto(f'http://127.0.0.1:{port}/')
        await pg.wait_for_function("()=>navigator.serviceWorker&&navigator.serviceWorker.ready.then(()=>true)", timeout=20000)
        await pg.goto(web); await pg.wait_for_function('window.__ndshReady===true'); await pg.wait_for_timeout(500)
        await ctx.set_offline(True)
        await pg.goto(f'http://127.0.0.1:{port}/'); await pg.wait_for_timeout(800)
        ok('Mất mạng: trang chính vẫn mở đúng trang chính', await pg.evaluate("()=>typeof APP_VER==='string'&&!!document.querySelector('#tabs')&&!window.__ndshReady"))
        await pg.goto(web); await pg.wait_for_timeout(800)
        ok('Mất mạng: tool Sửa NDSH XML vẫn mở được', await pg.evaluate("()=>window.__ndshReady===true"))
        await ctx.set_offline(False); await pg.close()
        if len(sys.argv) == 4: print('Dữ liệu thật'); await real(ctx, web, *sys.argv[1:4])
        await b.close()
    print('KẾT QUẢ:', 'TẤT CẢ ĐẠT' if not FAIL else f'{len(FAIL)} mục SAI')
    sys.exit(1 if FAIL else 0)
asyncio.run(main())
