# BC1_BC2_SBD-MOTO

**TOOLS BC1+BC2+SBD** — báo cáo đào tạo và danh sách sát hạch mô tô hạng A1.

## Mở app

**https://hp-wukoong.github.io/BC1_BC2_SBD-MOTO/**

Mở bằng **Google Chrome** (hoặc Edge). Để cài thành ứng dụng trên máy: bấm biểu tượng **Cài đặt** (màn hình có mũi tên) ở cuối thanh địa chỉ → **Cài đặt**. App có biểu tượng riêng ngoài màn hình, mở trong cửa sổ riêng, **dùng được cả khi mất mạng**, có mạng thì tự lấy bản mới.

Không muốn dùng bản web: tải bản file chạy trực tiếp trên máy — [`dist/TOOLS BC1+BC2+SBD.html`](dist/TOOLS%20BC1%2BBC2%2BSBD.html) (bấm **Download raw file**).

## Tool làm được gì

| Mục | Xuất ra |
|---|---|
| 1. Nạp dữ liệu | Nạp hồ sơ, thi lại (_TL, _LOCTL), GPLX, XML Báo cáo 2 (hỏi gán thi mới / thi lại), file GLĐ phòng thi |
| 2. Báo cáo 1 | BC1 nộp Sở (sắp theo bảng chữ cái tiếng Việt, người bị loại bôi vàng) |
| 3. Báo cáo 2 | BC2, 2 file cho PC-08, DS thí sinh dự sát hạch, **BC đề nghị tổ chức sát hạch (Word)**, **DS tra cứu vi phạm** |
| 4. Số báo danh | DS SBD theo mẫu Hội đồng, DS thí sinh có GPLX (lọc thi mới / sát hạch lại), thông báo Zalo |
| Theo dõi | Tổng quan các khóa, lịch nộp + thẻ nhắc trên Windows, kiểm tra dữ liệu, kho hồ sơ (lưu nguyên bản mọi file + mã SHA-256) |
| Dữ liệu & bảo mật | Tự sao lưu vào thư mục Google Drive, khôi phục có xem trước, mã PIN + mã hóa sao lưu, nhật ký thay đổi, tự kiểm tra tool |

Mọi file xuất ra đều được tool **đọc lại và đối chiếu từng ô** trước khi cho tải về.

## Dữ liệu nằm ở đâu?

- Dữ liệu học viên **chỉ nằm trong trình duyệt trên máy của bạn** (và thư mục Google Drive nếu bạn liên kết). **Không có dữ liệu nào được gửi lên GitHub** — kho này chỉ chứa mã của tool.
- Mỗi trình duyệt / mỗi cách mở giữ dữ liệu riêng. Bản web app và bản file `.html` **không dùng chung dữ liệu**.
- **Chuyển từ bản file sang web app:** mở file `.html` cũ → *Dữ liệu & bảo mật* → **Tải file sao lưu** (hoặc liên kết Google Drive) → mở web app → **Khôi phục từ file** (hoặc *Lấy dữ liệu từ Google Drive*).
- Nên liên kết **Google Drive** (mục *Dữ liệu & bảo mật*) để tool tự sao lưu sau mỗi thay đổi.

## Cập nhật tool (dành cho người sửa mã)

```bash
npm ci                     # thư viện: SheetJS 0.18.5, ExcelJS 4.4.0, phông Be Vietnam Pro
python3 build.py           # dựng dist/ (bản file) và docs/ (web app)
pip install playwright && python -m playwright install chromium
python3 tests/kiemtra.py   # chạy web app + bản file, tự kiểm tra 11 mục, thử mất mạng
```

- Mã nguồn: `src/app.html` (giao diện + xử lý), `src/installer.ps1` (bộ cài thẻ nhắc Windows), `src/thongbao_mau.xlsx`, `src/bcdn_mau.docx` (mẫu nhúng sẵn).
- Mỗi lần thay đổi, thêm 1 dòng vào `VERSIONS` đầu `src/app.html`; dựng lại rồi commit cả `src/`, `docs/`, `dist/`.
- GitHub Actions (*Kiểm tra bản dựng*) tự dựng lại và chạy bài kiểm tra sau mỗi lần đẩy lên.
- **Không bao giờ** commit file dữ liệu thật (file hồ sơ, GLĐ, XML, SAOLUU_*.json).
