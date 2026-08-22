# 🧩 PROMPT TÁI SỬ DỤNG — Tạo app tự học cho môn bất kỳ

> **Cách dùng:** Sao chép TOÀN BỘ phần trong khung `====` bên dưới, dán vào Claude Code
> (hoặc trợ lý lập trình), và **chỉ sửa 2 dòng ở mục `# BIẾN CẦN ĐỔI`**. Mọi phần còn lại giữ nguyên.

---

```
========================= BẮT ĐẦU PROMPT =========================

# BIẾN CẦN ĐỔI (chỉ sửa ở đây)
- TÊN_MÔN_HỌC: "«Đổi tên môn học của bạn vào đây»"        # ví dụ: "Kỹ năng Lãnh đạo", "Marketing căn bản", "Kế toán thuế"
- NGUỒN_NỘI_DUNG: "«đường dẫn file .pptx/.pdf/.docx/.txt hoặc để trống»"
  # Nếu có file giáo án → parse nội dung thật từ đó.
  # Nếu để trống → hãy TỰ soạn giáo án đầy đủ cho môn này (chia giai đoạn/bài hợp lý, song ngữ Việt–Anh khi phù hợp).

# NHIỆM VỤ
Xây một ứng dụng web tự học cho môn TÊN_MÔN_HỌC, chạy được ngay bằng `npm install && npm start`.
Kiến trúc: Node.js + Express (backend) + SPA HTML/CSS/JS thuần (không cần build). Giao diện tiếng Việt,
hỗ trợ sáng/tối, responsive (mobile ok).

# NỘI DUNG GIÁO ÁN
- Parse NGUỒN_NỘI_DUNG (nếu có) thành `server/data/curriculum.json` có cấu trúc:
  { meta:{title, subtitle, ...}, sessions:[ {id, module, title_vi, title_en, subtitle, slide_from, slide_to, slides:[{n, lines:[...]}]} ] }
- Chia môn học thành các "session" (bài/giai đoạn) cụ thể để đào sâu, nhóm theo module.
- Nếu không có nguồn: tự sinh 15–25 session chất lượng, mỗi session vài "slide" nội dung thực chất.

# TÍNH NĂNG BẮT BUỘC
1) TRANG CHỦ (mặc định, hash `#home`):
   - Hero: tên môn, thống kê (%, số giai đoạn, số tài liệu).
   - 🎯 Mục tiêu học: đặt "số giai đoạn mỗi tuần" + "số phút đào sâu mỗi ngày"; tính số tuần còn lại & ngày dự kiến xong;
     gợi ý "tuần này nên học".
   - ⏱️ Phiên đào sâu: timer Bắt đầu/Tạm dừng/Kết thúc, cộng phút vào hôm nay, tính 🔥 streak ngày học liên tiếp.
     (Lưu localStorage: exp_plan, exp_studylog.)
   - Lưới module → session (đánh dấu ✓ hoàn thành, badge số tài liệu/kiến thức).

2) MỖI SESSION có các tab:
   a) 📖 Bài học: render slide (heuristic: kicker, tiêu đề song ngữ, bước đánh số, callout "✔ Xong khi"/"Lưu ý", bảng).
      - Thanh 🎧 "Nghe bài (chế độ ngồi xe)": đọc to nội dung bằng Web Speech API (SpeechSynthesis), có mini-player
        cố định đáy màn hình: play/pause, câu trước/sau, chỉnh tốc độ, chọn giọng (ưu tiên vi-VN), tự chuyển session.
      - Thanh ➕ cập nhật tư liệu nhanh: chip YouTube / Reel Facebook / PDF / Ảnh / Text / Link → mở form đúng loại,
        lưu vào đúng session.
   b) 🧠 Đào sâu: 4 bảng song song + nút 🎧 "Nghe toàn bộ" (TTS đọc nối: nội dung bài học + ví dụ + công cụ + hỏi-đáp đã lưu):
      - 📖 Nội dung bài học (render slide của session, cuộn được — để đối chiếu).
      - 🌍 Ví dụ thực tế: nút "Gợi ý bằng AI (có nguồn)" → gọi AI web_search, trả JSON các ví dụ thật kèm URL nguồn.
      - 🧰 Công cụ / Thư viện: tương tự, liệt kê công cụ/website thật kèm URL.
      - 🤔 Hỏi AI tra cứu: ô nhập câu hỏi (tùy chọn "Tìm web kèm nguồn") → trả lời theo ngữ cảnh session.
      - Mỗi kết quả AI có nút 💾 Lưu hoặc ✕ Bỏ. QUAN TRỌNG: khi Lưu → lưu THẲNG thành tài liệu Thư viện
        (resource type 'text' + field `kind`=example|tool|qa), để mọi nội dung đào sâu đều nằm trong Thư viện
        (đồng bộ, xuất Markdown, rút insight được). Mục đã lưu hiện bên dưới, có nút 🗑 xóa.
   b2) 📝 Kiểm tra / Thu hoạch: nút "Tạo đề" → AI ra đề TRẮC NGHIỆM (4 lựa chọn) + TỰ LUẬN theo nội dung giai đoạn
      (`/api/quiz/generate` trả JSON {mc:[{q,options,answer,explain}], essay:[{q,guide}]}). Người dùng làm bài → Nộp:
      tự chấm trắc nghiệm, AI chấm tự luận (`/api/quiz/grade`), hiện điểm + phản hồi. Nút 💾 Lưu kết quả vào Thư viện
      (resource kind='quiz', tag 'kiểm-tra'). Hiện lịch sử kết quả đã lưu.
   c) 📚 Thư viện: thêm/xóa tài liệu (text/ảnh upload/PDF upload/YouTube nhúng/Facebook reel nhúng/link),
      lưu kèm source link + tag; nút ✨ "Rút insight bài học" cho từng tài liệu (AI đọc transcript video / text PDF /
      nội dung link → tóm tắt insight có cấu trúc, cache lại); nút ⬇️ Xuất .md.
   d) 🤖 Hỏi AI: chat theo ngữ cảnh session, tùy chọn tìm web kèm trích dẫn nguồn.

3) THƯ VIỆN CHUNG (modal): tìm kiếm + lọc theo loại/session/tag; ⬇️ Xuất Markdown gồm cả thư viện tài liệu
   (kèm insight) và kho kiến thức đào sâu.

4) TRỢ LÝ AI (OpenAI/ChatGPT):
   - Proxy an toàn ở server (`/api/chat`, `/api/insight`, `/api/knowledge/generate`), key đọc từ
     `server/data/settings.json` hoặc biến môi trường `OPENAI_API_KEY` (KHÔNG hard-code, KHÔNG commit key).
   - Có phần ⚙️ Cài đặt trong app để nhập key + chọn model. Dùng web_search khi cần (Responses API).
   - Nguồn nội dung cho insight: YouTube→transcript (`youtube-transcript`), PDF→`pdf-parse` v2
     (`new PDFParse({data}).getText()`), link→fetch+strip HTML, ảnh→vision, không lấy được→web_search fallback.

5) ĐỒNG BỘ ĐA THIẾT BỊ (máy tính ↔ điện thoại): lưu tiến độ + mục tiêu + nhật ký học lên server
   (`GET/POST /api/state` → state.json). Client tải state khi mở app (hợp nhất với localStorage: progress union,
   studylog lấy max theo ngày, plan lấy server), và đẩy lên server (debounce) mỗi khi thay đổi. Nhờ dữ liệu Thư viện
   vốn ở server, hai thiết bị cùng vào một URL Render sẽ thấy chung mọi thứ. localStorage chỉ là cache offline.

# API BACKEND (Express)
- GET  /api/curriculum
- GET/POST /api/state ; POST /api/quiz/generate ; POST /api/quiz/grade
- GET/POST /api/resources ; POST /api/resources/upload (multer) ; DELETE /api/resources/:id
- GET/POST /api/knowledge ; DELETE /api/knowledge/:id ; POST /api/knowledge/generate
- GET/POST /api/settings ; POST /api/chat ; POST /api/insight
- Lưu JSON đơn giản: library.json, knowledge.json, settings.json + thư mục uploads/. Hỗ trợ biến DATA_DIR
  (ổ đĩa bền) và seed từ dữ liệu đóng gói khi disk trống.

# LƯU Ý KỸ THUẬT QUAN TRỌNG (đã rút kinh nghiệm — làm đúng ngay)
- CSS: `.modal-backdrop[hidden]{display:none}` — vì `display:flex` đè lên thuộc tính `hidden` khiến modal luôn hiện.
- Định tuyến: thêm listener `hashchange` để nút back/forward và link #session hoạt động.
- Static phục vụ header `Cache-Control: no-store` để trình duyệt không chạy module JS cũ sau khi cập nhật.
- Tự phục hồi cold-start: init() thử lại /api/curriculum vài lần; index.html tự reload 1 lần nếu app chưa
  sẵn sàng sau ~8s (đặt cờ `window.__appReady`).
- Không hard-code secret. `.gitignore`: node_modules, .env, server/data/settings.json, knowledge.json,
  .claude/settings.local.json.

# DEPLOY
- Server bind `process.env.PORT`. Kèm `render.yaml` (Render Blueprint: buildCommand npm install, startCommand npm start,
  env OPENAI_API_KEY sync:false) + file DEPLOY.md hướng dẫn push GitHub và tạo Web Service, đặt API key qua biến môi trường.
- Giải thích rõ: Netlify KHÔNG chạy được (cần server); dùng Render (hoặc Railway/Fly/VPS).

# BÀN GIAO
- Chạy thử, kiểm tra không lỗi console; README.md tiếng Việt (cách chạy + bật AI + cấu trúc thư mục).
- In ra URL local để mở ngay.

========================= KẾT THÚC PROMPT =========================
```

---

## Ghi chú nhanh
- **Chỉ đổi 1 dòng** `TÊN_MÔN_HỌC` là đủ để có app môn mới. Đổi thêm `NGUỒN_NỘI_DUNG` nếu bạn có sẵn giáo án.
- Muốn deploy: tạo repo GitHub mới cho môn đó (đừng dùng chung repo), push, rồi trỏ Render vào — làm theo `DEPLOY.md`.
- App này (môn *Vận hành Xuất khẩu*) là bản mẫu tham chiếu đầy đủ cho mọi tính năng ở trên.
