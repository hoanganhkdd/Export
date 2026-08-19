# 📦 Học Vận hành Xuất khẩu End-to-End

Ứng dụng web tự học **vận hành xuất khẩu cho nhà xuất khẩu một người (solo exporter)**, dựng từ giáo án
*"Giáo Án Vận Hành Xuất Khẩu End-to-End.pptx"* (156 slide → **23 session**, 4 module, 15 giai đoạn, 16 bước).

## ✨ Tính năng

1. **Học theo session** — Giáo án được tách thành các session cụ thể để đào sâu:
   - **Nền tảng** — Bộ khung vận hành, vai trò Export Owner, bản đồ 16 bước.
   - **Module 1–4** — 15 giai đoạn (GĐ1→GĐ15) từ chọn sản phẩm đến quyết toán & tái đặt hàng.
   - **Phụ lục tham khảo** — Trạng thái đơn hàng, 5 cổng kiểm soát, KPI, công cụ, 12 nguyên tắc rủi ro, từ điển thuật ngữ.
   - Nội dung song ngữ Việt–Anh, đánh dấu hoàn thành, thanh tiến độ.

2. **Thư viện tài liệu mở rộng cho từng session** — Mỗi session có thể bổ sung:
   - 📝 Đoạn text / ghi chú
   - 🖼️ Hình ảnh (upload)
   - 📄 File PDF (upload)
   - ▶️ Link YouTube (nhúng xem trực tiếp)
   - 🎬 Link Facebook Reel (nhúng)
   - 🔗 Liên kết web bất kỳ
   - Tất cả lưu vào **thư viện chung** kèm **source link**, có tìm kiếm + lọc theo loại/session + tag.

3. **Trợ lý AI ChatGPT** — Hỏi đáp trong bối cảnh từng session, kèm tùy chọn **Tìm kiếm web** để lấy
   thông tin/quy định mới nhất **kèm trích dẫn nguồn** (dùng OpenAI Responses API + web_search).

## 🚀 Chạy ứng dụng

```bash
npm install
npm start
```

Mở trình duyệt: **http://localhost:3000**

## 🔑 Bật trợ lý AI

Cách 1 — trong app: bấm **⚙️** (góc trên phải) → dán **OpenAI API key** → Lưu.
Cách 2 — bằng file: sao chép `.env.example` → `.env`, điền `OPENAI_API_KEY`.

Lấy key tại: https://platform.openai.com/api-keys

> Key chỉ lưu ở máy local của bạn (`server/data/settings.json`) và chỉ gửi tới OpenAI khi bạn hỏi.

## 🗂️ Cấu trúc

```
├─ server/
│  ├─ server.js              ← Express: giáo án, thư viện, proxy ChatGPT
│  └─ data/
│     ├─ curriculum.json     ← 23 session parse từ giáo án PPTX
│     ├─ library.json        ← tài liệu bạn thêm (tự sinh)
│     ├─ settings.json       ← API key + model (tự sinh)
│     └─ uploads/            ← ảnh & PDF đã upload
├─ public/
│  ├─ index.html
│  ├─ css/style.css
│  └─ js/ app.js · slides.js
└─ package.json
```

## 🔧 Cập nhật giáo án

Nếu chỉnh sửa file PPTX, chạy lại script parse để tạo `server/data/curriculum.json`
(xem bước parse trong lịch sử dựng app — dùng `python-pptx`).

---
Nguồn nội dung: SOP Vận Hành Xuất Khẩu End-to-End · Build cho HOANG.
