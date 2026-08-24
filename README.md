# Math12 Learning Hub

Web học Toán 12 được dựng từ Google Sheet **TOÁN THẦY CHÍ 12**: chương → bài → tiết → video → tài liệu/đề → BTVN → đáp án → video chữa.

## MVP hiện có

- Seed dữ liệu thật từ Google Sheet, bao gồm rich hyperlink YouTube/Google Drive của 6 chương.
- Điều hướng Chương / Bài / Tiết, tìm kiếm tức thì và mục Đã lưu.
- YouTube player nhúng trực tiếp và Google Drive preview.
- Đánh dấu hoàn thành, % tiến độ, yêu thích; dữ liệu lưu bằng `localStorage`.
- Ghi chú theo timestamp và click timestamp để tua lại video.
- Import dữ liệu dạng C/B/L từ paste hoặc file CSV/TXT.
- Google Apps Script adapter để đồng bộ **rich hyperlink** từ Google Sheets (không phụ thuộc CSV làm mất link).
- Gemini AI Tutor server-side; API key không nằm trong frontend.
- Gemini có thể nhận trực tiếp public YouTube URL của bài đang học để tóm tắt / tạo quiz / giải thích.

## Chạy local

Đây là static web, nên chỉ cần một HTTP server:

```bash
python -m http.server 8080
```

Mở `http://localhost:8080`.

> Không nên mở `index.html` bằng `file://` vì ES modules và iframe/API có thể bị trình duyệt hạn chế.

## Deploy

### Vercel — khuyên dùng

Vercel phục vụ cả static frontend và `/api/gemini`.

1. Import repository vào Vercel.
2. Framework Preset: `Other`.
3. Không cần build command.
4. Thêm Environment Variable:
   - `GEMINI_API_KEY=<key của bạn>`
   - `GEMINI_MODEL=gemini-3.7-flash` (tùy chọn)
5. Deploy.

### GitHub Pages

Frontend chạy được trên GitHub Pages, nhưng `/api/gemini` sẽ không tồn tại. Player, tài liệu, progress, favorites và notes vẫn dùng bình thường.

## Đồng bộ Google Sheets giữ nguyên hyperlink

CSV public chỉ giữ giá trị hiển thị như `Video`, `ĐỀ`; rich hyperlink gắn vào chữ có thể bị mất. Vì vậy repo có adapter tại:

`apps-script/Code.gs`

Cách dùng:

1. Tạo Google Apps Script project.
2. Dán nội dung `apps-script/Code.gs`.
3. Deploy → New deployment → Web app.
4. Authorize quyền đọc Sheet.
5. Copy Web App URL.
6. Trong Learning Hub → **Đồng bộ / Nhập dữ liệu** → dán endpoint → **Đồng bộ ngay**.

Endpoint trả `rawCourse` đã chuẩn hóa từ Sheet và lấy URL bằng `RichTextValue.getLinkUrl()`.

## Format import C/B/L

```text
C|Chương 1|Tên chủ đề
B|Bài 1: Tính đơn điệu
L|Tiết 1|V=https://youtube...|D=https://drive...|H=https://drive...|S=https://youtube...
```

Resource keys:

- `V`: video bài giảng
- `D`: tài liệu / đề
- `H`: BTVN
- `A`: đáp án
- `S`: video chữa

## Gemini

Frontend gọi `/api/gemini`. Endpoint đọc `GEMINI_API_KEY` từ biến môi trường và mặc định dùng `gemini-3.7-flash`. Khi bài có public YouTube URL, endpoint gửi URL đó dưới dạng video input để Gemini bám nội dung bài giảng thật thay vì chỉ dựa vào tiêu đề.

Không commit API key vào repo.

## Nhánh triển khai

MVP được phát triển trên `feat/learning-hub-mvp` trước khi merge vào `main`.
