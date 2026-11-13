"""Kiểm tra tool Sửa NDSH XML (docs/sua-ndsh/ và dist/Sua_NDSH_XML.html) bằng DỮ LIỆU GIẢ LẬP — không dùng dữ liệu thật.
   Thoát mã 1 nếu có mục sai.  Cần: pip install playwright && python -m playwright install chromium
   Cần thêm: pip install pillow (tạo ảnh JPEG 2000 giả lập, giải mã độc lập để đối chiếu).
   Tuỳ chọn: python3 tests/kiemtra_ndsh.py <file_xml_that> <file_excel_that> <file_xml_ket_qua_mong_doi>  (chạy thêm với dữ liệu thật, không lưu vào kho)"""
import asyncio, os, sys, threading, http.server, functools, socketserver, base64, hashlib, random, re, json, io, struct
import xml.etree.ElementTree as ET
from PIL import Image, ImageDraw
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
# Ảnh giả lập: mỗi người 1 hình khác hẳn nhau; JPEG 2000 cùng thông số file PC-08 (wavelet 5/3, tỷ lệ 10:1, 5 mức, khối 64, không MCT)
def pic(seed, w=353, h=471):
    r = random.Random(seed); im = Image.new('RGB', (w, h), (r.randint(150, 255), r.randint(150, 255), r.randint(150, 255))); d = ImageDraw.Draw(im)
    for _ in range(14):
        x0, y0 = r.randint(-40, w), r.randint(-40, h); d.ellipse([x0, y0, x0 + r.randint(40, 220), y0 + r.randint(40, 260)], fill=(r.randint(0, 255), r.randint(0, 255), r.randint(0, 255)))
    # vân nhiễu như ảnh chụp thật (để nén JPEG 2000 dùng hết mức tỷ lệ 10:1 giống ảnh PC-08)
    rr = random.Random(seed * 7 + 1); noise = Image.frombytes('RGB', (w, h), bytes(rr.randrange(256) for _ in range(w * h * 3)))
    return Image.blend(im, noise, 0.18)
def jp2(im):
    b = io.BytesIO(); im.save(b, 'JPEG2000', irreversible=False, quality_mode='rates', quality_layers=[10], num_resolutions=6, codeblock_size=(64, 64), progression='LRCP', mct=0); return b.getvalue()
def jpg(im, q=92):
    b = io.BytesIO(); im.save(b, 'JPEG', quality=q); return b.getvalue()
PHOTOS = {}
def photo_of(i):
    if i not in PHOTOS:
        if i == 6: PHOTOS[i] = photo_of(5)                                   # trùng hệt ảnh người 5
        elif i == 8: PHOTOS[i] = jp2(Image.open(io.BytesIO(jpg(pic(7), 80))).convert('RGB'))   # cùng ảnh người 7, nén lại
        elif i == 9: PHOTOS[i] = jp2(pic(9, 178, 237))                        # ảnh nhỏ
        else: PHOTOS[i] = jp2(pic(i))
    return PHOTOS[i]
def make_xml():
    recs = []
    for i, p in enumerate(P_):
        photo = base64.b64encode(photo_of(i)).decode()
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
    pg = await ctx.new_page(); errs = []; pg.on('pageerror', lambda e: errs.append(str(e))); pg.on('crash', lambda *_: print('  !!! TRANG BỊ SẬP (renderer crash)'))
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
    ok(f'{lab}: biên bản A4 đủ mục', all(s in bb for s in ['BIÊN BẢN HIỆU CHỈNH NỘI DUNG SÁT HẠCH', 'II. KẾT QUẢ KIỂM ĐỊNH', 'IV. DANH SÁCH HỒ SƠ ĐỔI MÃ NỘI DUNG SÁT HẠCH', 'NGƯỜI LẬP']) and bb.count('\n') > 20)
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
        # bỏ liên kết thư mục giả lập trước khi tải lại trang (Chromium sập khi hỏi quyền trên thư mục OPFS lưu trong IndexedDB — chỉ xảy ra với thư mục giả lập)
        await pg.click('#hSet'); await pg.click('#bLogOff'); await pg.wait_for_timeout(200)
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

# ---------- ẢNH CHÂN DUNG ----------
def anh_ranges(x): return [(m.start(1), m.end(1)) for m in re.finditer(rb'<ANH_CHAN_DUNG>([^<]*)</ANH_CHAN_DUNG>', x)]
def jp2_parts(b):
    """(các hộp trước jp2c, {mã khối: nội dung} SIZ/COD/QCD/COM…) — để kiểm phần đầu ảnh"""
    i = b.find(b'jp2c') - 4; cs = b[i + 8:]; p = 2; mk = {}
    while True:
        m = struct.unpack('>H', cs[p:p + 2])[0]
        if m == 0xFF90: break
        L = struct.unpack('>H', cs[p + 2:p + 4])[0]; mk[m] = cs[p + 4:p + 2 + L]; p += 2 + L
    return b[:i], mk
def jp2_ok(b, w, h):
    """Ảnh mới đúng cấu trúc PC-08: JP2 sRGB 3 kênh 8 bit, 1 ô, wavelet 5/3, 5 mức, 1 lớp, LRCP, khối 64×64, không MCT, không COM"""
    head, mk = jp2_parts(b)
    want = (b'\x00\x00\x00\x0cjP  \r\n\x87\n' + b'\x00\x00\x00\x14ftypjp2 \x00\x00\x00\x00jp2 ' + b'\x00\x00\x00\x2djp2h' +
            b'\x00\x00\x00\x16ihdr' + struct.pack('>IIHBBBB', h, w, 3, 7, 7, 0, 0) + b'\x00\x00\x00\x0fcolr\x01\x00\x00\x00\x00\x00\x10')
    siz, cod = mk.get(0xFF51, b''), mk.get(0xFF52, b'')
    X, Y, XO, YO, XT, YT = struct.unpack('>IIIIII', siz[2:26]); C = struct.unpack('>H', siz[34:36])[0]
    return (head == want and set(mk) == {0xFF51, 0xFF52, 0xFF5C} and (X - XO, Y - YO, XT, YT, C) == (w, h, w, h, 3) and siz[36:] == b'\x07\x01\x01' * 3
            and cod[:10] == bytes([0, 0, 0, 1, 0, 5, 4, 4, 0, 1]))
async def b64file(pg, sel, name, data, mime): await pg.set_input_files(sel, files=[{'name': name, 'mimeType': mime, 'buffer': data}])
async def wait_info(pg): await pg.wait_for_function("document.querySelector('#phdInfo') && /px/.test(document.querySelector('#phdInfo').textContent)", timeout=30000)
async def photo_suite(ctx, url, lab, full):
    pg = await ctx.new_page(); errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.on('console', lambda m: errs.append(m.text) if m.type == 'error' else None)
    await pg.goto(url); await pg.wait_for_function('window.__ndshReady===true')
    X = make_xml(); await load(pg, '#fX', '52_THU_NGHIEM.xml', X, 'text/xml'); await pg.wait_for_timeout(300)
    await pg.click('nav.tabs button[data-tab=photo]')
    await pg.wait_for_function("document.querySelector('#phAudit').textContent.includes('Soát xong')", timeout=120000)
    prof = await pg.inner_text('#phProf')
    ok(f'{lab} ảnh: thông số ảnh mới theo số đông (JP2, 5/3, 10:1, 5 mức, 353×471)', all(k in prof for k in ['JPEG 2000', 'wavelet 5/3', 'tỷ lệ nén 10:1', '5 mức', '353×471']), prof)
    iss = await pg.evaluate("(()=>{const o={};PH.issues.forEach((v,k)=>o[k]=v.join(' | '));return o})()")
    exp_ok = set(iss.keys()) == {'5', '6', '7', '8', '9'} and 'Trùng hệt' in iss['5'] and 'Trùng hệt' in iss['6'] and 'cùng ảnh' in iss['7'] and 'cùng ảnh' in iss['8'] and 'Ảnh nhỏ 178×237' in iss['9']
    ok(f'{lab} ảnh: soát ảnh bắt đúng trùng hệt, cùng ảnh nén lại, ảnh nhỏ — không báo sai người khác', exp_ok, iss)
    # 1) thay 1 người qua hộp thoại (chọn file)
    newp = {k: jpg(pic(500 + k, 354, 472), 95) for k in range(6)}
    await pg.click('#phGrid .pcard[data-i="0"]'); await pg.wait_for_selector('#phdFile', state='attached')
    await b64file(pg, '#phdFile', P_[0]['cccd'] + '.jpg', newp[0], 'image/jpeg'); await wait_info(pg)
    info = await pg.inner_text('#phdInfo')
    ok(f'{lab} ảnh: hộp thay ảnh — cắt giữa 353×471 không co giãn, nhận đúng CCCD trong tên file', 'cắt giữa còn 353×471, không co giãn' in info and 'Tên file đúng CCCD' in info, info.replace('\n', ' '))
    await pg.click('#dlgOk'); await pg.wait_for_function('PH.pending.size===1', timeout=30000)
    # 2) Ctrl+V dán ảnh vào người thứ 2
    await pg.click('#phGrid .pcard[data-i="1"]'); await pg.wait_for_selector('#phdDrop')
    await pg.evaluate("""(b)=>{const s=atob(b),u=new Uint8Array(s.length);for(let i=0;i<s.length;i++)u[i]=s.charCodeAt(i);const dt=new DataTransfer();dt.items.add(new File([u],'dan.jpg',{type:'image/jpeg'}));document.dispatchEvent(new ClipboardEvent('paste',{clipboardData:dt,bubbles:true,cancelable:true}));}""", base64.b64encode(newp[1]).decode())
    await wait_info(pg); await pg.click('#dlgOk'); await pg.wait_for_function('PH.pending.size===2', timeout=30000)
    ok(f'{lab} ảnh: dán ảnh bằng Ctrl+V vào đúng người', True)
    # 3) hàng loạt: 2 ảnh có CCCD trong tên + 1 ảnh không ghép được → khay
    await pg.set_input_files('#phFiles', files=[{'name': P_[2]['cccd'] + '.jpg', 'mimeType': 'image/jpeg', 'buffer': newp[2]},
        {'name': 'AnhThe_' + P_[3]['cccd'] + '_xong.png', 'mimeType': 'image/png', 'buffer': (lambda b: (pic(503, 354, 472).save(b, 'PNG'), b.getvalue())[1])(io.BytesIO())},
        {'name': 'khong_ro_ai.jpg', 'mimeType': 'image/jpeg', 'buffer': newp[4]}])
    await pg.wait_for_selector('.pbChk'); txt = await pg.inner_text('#dlgB')
    ok(f'{lab} ảnh: nạp hàng loạt ghép 2 ảnh theo CCCD trong tên file, 1 ảnh chưa ghép', '2 ghép được' in txt and '1 chưa ghép được' in txt, txt[:140].replace('\n', ' '))
    await pg.click('#dlgOk'); await pg.wait_for_function('PH.pending.size===4 && PH.tray.length===1', timeout=60000)
    # 4) kéo ảnh trong khay thả vào người thứ 5
    await pg.evaluate("""()=>{const id=PH.tray[0].id,c=document.querySelector('#phGrid .pcard[data-i="4"]');c.scrollIntoView();const dt=new DataTransfer();dt.setData('text/x-ndsh-tray',id);c.dispatchEvent(new DragEvent('drop',{dataTransfer:dt,bubbles:true,cancelable:true}));}""")
    await wait_info(pg); await pg.click('#dlgOk'); await pg.wait_for_function('PH.pending.size===5 && PH.tray.length===0', timeout=30000)
    ok(f'{lab} ảnh: kéo ảnh từ khay vào đúng người, khay trống', True)
    # 5) tạo file cùng lúc với đổi mã NDSH (Excel A)
    await pg.click('nav.tabs button[data-tab=fix]')
    await load(pg, '#fE', 'A1m-99-TL.xlsx', await xlsx(pg, rows_a()), 'application/octet-stream'); await pg.wait_for_selector('#cardRes:not(.hide)')
    out, fname = await run_and_get(pg); checks = await pg.inner_text('#checks')
    A0, A1 = anh_ranges(X), anh_ranges(out)
    changed = [i for i in range(N) if X[A0[i][0]:A0[i][1]] != out[A1[i][0]:A1[i][1]]]
    back = out
    for i in sorted(changed, reverse=True): back = back[:A1[i][0]] + X[A0[i][0]:A0[i][1]] + back[A1[i][1]:]
    ok(f'{lab} ảnh: file mới chỉ đổi ảnh 5 người đã chọn + mã NDSH; trả ảnh cũ vào thì giống hệt file mong đợi từng byte', changed == [0, 1, 2, 3, 4] and back == expected(X, CH_A), changed)
    good = True; why = []
    for i in changed:
        nb = base64.b64decode(out[A1[i][0]:A1[i][1]]); ob = photo_of(i); im = Image.open(io.BytesIO(nb)); im.load(); oi = Image.open(io.BytesIO(ob))
        if not (im.format == 'JPEG2000' and im.size == oi.size == (353, 471) and im.mode == 'RGB' and jp2_ok(nb, 353, 471) and 0.9 < (353 * 471 * 3 / len(nb)) / 10 < 1.1): good = False; why.append(i)
    ok(f'{lab} ảnh: Pillow (bộ giải mã độc lập) đọc được ảnh mới; cấu trúc JP2 đúng chuẩn file PC-08 (sRGB, 5/3, 5 mức, 1 lớp, khối 64, không MCT/COM, tỷ lệ 10:1)', good, why)
    ok(f'{lab} ảnh: kiểm định trong tool báo đạt cho ảnh', '5 ảnh mới: đọc lại từ file mới giống hệt ảnh đã chuẩn bị' in checks and 'ANH_CHAN_DUNG: 30' in checks, checks[:200].replace('\n', ' '))
    await pg.evaluate("window.print=()=>{}"); await pg.click('#bPrint'); await pg.wait_for_timeout(300)
    bb = await pg.inner_text('#bb'); nimg = await pg.evaluate("document.querySelectorAll('#bb img.th').length")
    ok(f'{lab} ảnh: biên bản có mục thay ảnh kèm ảnh cũ / ảnh mới', 'V. DANH SÁCH HỒ SƠ ĐÃ THAY ẢNH CHÂN DUNG (5 hồ sơ)' in bb and nimg == 10, nimg)
    # 6) tab kiểm tra: nhận ra 5 ảnh bị thay
    await pg.click('nav.tabs button[data-tab=cmp]')
    await load(pg, '#fA', 'goc.xml', X, 'text/xml'); await load(pg, '#fB', 'sua.xml', out, 'text/xml')
    await pg.click('#bCmp'); await pg.wait_for_selector('#cmpRes:not(.hide)', timeout=60000)
    v = await pg.inner_text('#cmpVerdict'); rows = await pg.evaluate("document.querySelectorAll('#cmpAnh tbody tr').length")
    ok(f'{lab} ảnh: tab kiểm tra → ĐẠT, liệt kê 5 hồ sơ bị thay ảnh', 'ĐẠT' in v and 'KHÔNG' not in v and 'ảnh chân dung của 5 hồ sơ' in v and rows == 5, v)
    if full:
        # 7) xuất ảnh ra thư mục (giả lập bằng OPFS) — tên CCCD_SBD_HoTen.jpg
        await pg.click('nav.tabs button[data-tab=photo]')
        await pg.evaluate("window.showDirectoryPicker=async()=>navigator.storage.getDirectory()")
        await pg.click('#phExp'); await pg.click('#dlgOk'); await pg.wait_for_function("!document.querySelector('#dlg').open", timeout=120000)
        names = await pg.evaluate("async()=>{const d=await (await navigator.storage.getDirectory()).getDirectoryHandle('AnhXML_9999999999');const o=[];for await (const [n] of d.entries()) o.push(n);return o.sort()}")
        ok(f'{lab} ảnh: xuất {N} ảnh, tên bắt đầu bằng CCCD', len(names) == N and all(re.match(r'^0521\d{8}_\d{3}_[A-Z_]+\.jpg$', n) for n in names), names[:2])
        # 8) liên kết thư mục ảnh + quét: ảnh tên CCCD được ghép tự động
        await pg.evaluate("""async(b)=>{const r=await navigator.storage.getDirectory();const d=await r.getDirectoryHandle('AnhThePro',{create:true});const s=atob(b),u=new Uint8Array(s.length);for(let i=0;i<s.length;i++)u[i]=s.charCodeAt(i);const w=await (await d.getFileHandle('"""+P_[10]['cccd']+""".jpg',{create:true})).createWritable();await w.write(u);await w.close();window.showDirectoryPicker=async()=>d;}""", base64.b64encode(newp[5]).decode())
        await pg.click('#phDirPick'); await pg.wait_for_function("!!PH.dir"); await pg.click('#phDirScan'); await pg.wait_for_selector('.pbChk')
        t2 = await pg.inner_text('#dlgB'); await pg.click('#dlgX')
        ok(f'{lab} ảnh: quét thư mục ảnh liên kết → ghép theo CCCD', '1 ghép được' in t2 and P_[10]['cccd'] in t2, t2[:120].replace('\n', ' '))
        await pg.evaluate("async()=>{ await IDB.put('photoDir', null); PH.dir=null; }")   # bỏ thư mục giả lập (xem ghi chú OPFS ở trên)
    ok(f'{lab} ảnh: không có lỗi JavaScript', not errs, errs[:3])
    await pg.close()

# ---------- Mục “Sửa XML PC-08” trong TOOLS BC1+BC2+SBD ----------
async def main_app_suite(ctx, url, lab):
    pg = await ctx.new_page(); errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
    await pg.goto(url); await pg.wait_for_function("typeof render==='function' && typeof DB!=='undefined' && !!DB && !!DB.courses", timeout=30000)
    async def close_dlg():
        for _ in range(10):
            await pg.wait_for_timeout(300); await pg.evaluate("()=>{ document.querySelectorAll('dialog[open]').forEach(d=>d.close()); document.querySelectorAll('.popcard').forEach(e=>e.style.display='none'); }")
    await close_dlg()
    await pg.evaluate("""(R)=>{ const c=C(); R.forEach(([ten,cc,gc],i)=>c.students.push({cccd:cc,ten,ns:'01/01/1990',dc:'Gia Lai',sk:'x',hangHS:'',hangG:'',soGPLX:'',maDK:'',soHS:'',srcs:['tay'],biLoai:false,lyDo:'',phuTrach:'',sbd:'',loai:gc?'tl':'moi',gcTL:gc,ord:c.seq++})); TAB='ndsh'; render(); }""",
        [[p['ho'] + ' ' + p['ten'], p['cccd'], ['L', 'L+H', 'H'][i % 3] if i < 9 else ''] for i, p in enumerate(P_[:12])])
    fr = None
    for _ in range(150):
        await pg.wait_for_timeout(200); fr = next((f for f in pg.frames if f != pg.main_frame), None)
        if fr:
            try:
                if await fr.evaluate("window.__ndshReady===true && !document.querySelector('#embBox').classList.contains('hide')"): break
            except Exception: pass
    ok(f'{lab}: mục “Sửa XML PC-08” mở tool trong khung, nhận danh sách khóa đang mở', bool(fr) and 'Thi lại · 9 người' in await fr.inner_text('#embBox'))
    X = make_xml(); await pg.evaluate("()=>{ document.querySelectorAll('dialog[open]').forEach(d=>d.close()); document.querySelectorAll('.popcard').forEach(e=>e.style.display='none'); }")
    await fr.set_input_files('#fX', files=[{'name': 'x.xml', 'mimeType': 'text/xml', 'buffer': X}]); await pg.wait_for_timeout(500)
    await pg.evaluate("()=>{ document.querySelectorAll('dialog[open]').forEach(d=>d.close()); document.querySelectorAll('.popcard').forEach(e=>e.style.display='none'); }")
    await pg.evaluate("()=>{ document.querySelectorAll('dialog[open]').forEach(d=>d.close()); document.querySelectorAll('.popcard').forEach(e=>e.style.display='none'); }")
    await fr.click('#embBox button[data-part=tl]'); await pg.wait_for_timeout(400)
    sel = await fr.evaluate("S.items.filter(i=>i.apply).map(i=>[i.cccd,i.newVal])")
    want = [[P_[i]['cccd'], str({'L': 2, 'L+H': 3, 'H': 7}[['L', 'L+H', 'H'][i % 3]])] for i in range(9) if str({'L': 2, 'L+H': 3, 'H': 7}[['L', 'L+H', 'H'][i % 3]]) != P_[i]['code']]
    ok(f'{lab}: dùng danh sách thi lại của tool → đúng người, đúng mã (SH lại L / L+H / H)', sorted(sel) == sorted(want), sel)
    await pg.evaluate("()=>{TAB='bc1';render();}"); await pg.wait_for_timeout(300); await pg.evaluate("()=>{TAB='ndsh';render();}"); await pg.wait_for_timeout(300)
    ok(f'{lab}: chuyển mục rồi quay lại — file XML đã nạp vẫn còn', await fr.evaluate("!!S.xml && S.recs.length") == N)
    ok(f'{lab}: không có lỗi JavaScript', not errs, errs[:3]); await pg.close()

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
    # thay 1 ảnh bằng ảnh từ Ảnh Thẻ Pro (354×472) → phần đầu JP2 giống hệt ảnh gốc từng byte
    X = open(xml_p, 'rb').read(); A = anh_ranges(X); r0 = base64.b64decode(X[A[0][0]:A[0][1]])
    await pg.click('nav.tabs button[data-tab=photo]'); await pg.wait_for_function('PH.built===true')
    await pg.click('#phGrid .pcard[data-i="0"]'); await pg.wait_for_selector('#phdFile', state='attached')
    await b64file(pg, '#phdFile', 'moi.jpg', jpg(pic(77, 354, 472), 95), 'image/jpeg'); await wait_info(pg); await pg.click('#dlgOk'); await pg.wait_for_function('PH.pending.size===1', timeout=30000)
    await pg.click('nav.tabs button[data-tab=fix]'); await pg.evaluate("()=>{ S.items.forEach(i=>i.apply=false); runBtn(); }")
    o2, _ = await run_and_get(pg); B = anh_ranges(o2); nb = base64.b64decode(o2[B[0][0]:B[0][1]])
    hn, mn = jp2_parts(nb); ho, mo = jp2_parts(r0)
    ok('Dữ liệu thật: ảnh mới — phần đầu JP2 (hộp + SIZ/COD/QCD) giống hệt ảnh gốc PC-08 từng byte, dung lượng trong khoảng ảnh gốc', hn == ho and mn == mo and 49000 <= len(nb) <= 50200, len(nb))
    ok('Dữ liệu thật: không lỗi JavaScript', not errs, errs[:3]); await pg.close()

async def main():
    port = serve(); web = f'http://127.0.0.1:{port}/sua-ndsh/'
    async with async_playwright() as p:
        exe = os.environ.get('PW_CHROMIUM'); b = await (p.chromium.launch(executable_path=exe) if exe else p.chromium.launch()); ctx = await b.new_context(accept_downloads=True)
        await ctx.add_init_script("()=>{ try{ localStorage.setItem('soSatHachA1_v1_nguoi','-'); }catch(e){} }")
        print('Web app:', web); await suite(ctx, web, 'Web', True)
        print('Bản file'); await suite(ctx, 'file://' + os.path.join(ROOT, 'dist', 'Sua_NDSH_XML.html'), 'Bản file', False)
        print('Ảnh chân dung (web)'); await photo_suite(ctx, web, 'Web', True)
        print('Ảnh chân dung (bản file)'); await photo_suite(ctx, 'file://' + os.path.join(ROOT, 'dist', 'Sua_NDSH_XML.html'), 'Bản file', False)
        print('TOOLS BC1+BC2+SBD — mục Sửa XML PC-08'); await main_app_suite(ctx, f'http://127.0.0.1:{port}/', 'App chính (web)')
        await main_app_suite(ctx, 'file://' + os.path.join(ROOT, 'dist', 'TOOLS BC1+BC2+SBD.html'), 'App chính (bản file)')
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
