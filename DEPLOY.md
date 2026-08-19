# 🚀 Đưa app lên mạng (Render)

> **Vì sao không dùng Netlify?** App này có **server** (upload file, lưu thư viện, proxy ChatGPT, đọc transcript/PDF).
> Netlify chỉ chạy web tĩnh + serverless nên **không chạy nguyên bản** app này. **Render** chạy thẳng server Node như đang có.

## Bước 1 — Đưa code lên GitHub

Trong thư mục dự án (đã có sẵn git, xem cuối file), tạo một repo trên GitHub rồi:

```bash
git remote add origin https://github.com/<tài-khoản>/<tên-repo>.git
git branch -M main
git push -u origin main
```

> `settings.json` (chứa OpenAI API key) **đã được .gitignore** — không bị đẩy lên. An toàn.

## Bước 2 — Tạo Web Service trên Render

1. Vào https://render.com → đăng nhập (dùng GitHub cho nhanh).
2. **New ▸ Blueprint** → chọn repo vừa push. Render tự đọc `render.yaml`.
   *(Hoặc **New ▸ Web Service** → chọn repo → Build: `npm install`, Start: `npm start`.)*
3. Chọn **Plan: Free** → **Apply / Create**.

## Bước 3 — Cắm OpenAI API key

Trong service trên Render → **Environment** → thêm biến:

| Key | Value |
|---|---|
| `OPENAI_API_KEY` | `sk-...` (key của bạn) |
| `OPENAI_MODEL` | `gpt-4o-mini` (tùy chọn) |

→ **Save**, Render tự deploy lại. Xong: bạn có link dạng `https://hoc-xuat-khau.onrender.com`.

## Bước 4 (TÙY CHỌN) — Lưu bền file upload & insight

**Gói Free của Render dùng đĩa tạm:** giáo án và thư viện seed (đi kèm repo) luôn hiện,
nhưng **file bạn upload / insight tạo lúc chạy sẽ mất khi service restart** (free tier ngủ sau 15 phút không dùng).

Muốn giữ vĩnh viễn → gắn **Persistent Disk** (cần gói trả phí, từ ~7$/tháng):
1. Trong `render.yaml`, bỏ ghi chú khối `disk:` và cặp biến `DATA_DIR = /var/data`.
2. Deploy lại. App tự chép dữ liệu seed sang đĩa ở lần chạy đầu, sau đó lưu bền.

---

## Lưu ý free tier
- Lần đầu vào sau khi "ngủ" sẽ chờ ~30–50 giây khởi động lại — bình thường.
- Transcript YouTube đôi khi bị YouTube chặn theo IP máy chủ; nếu lỗi, app tự chuyển sang web_search.

## Chạy lại ở máy (local)
```bash
npm install
npm start   # → http://localhost:3000
```

---
### Git đã khởi tạo sẵn
Repo đã được `git init` + commit lần đầu ở máy bạn. Chỉ cần thêm `remote` và `push` như Bước 1.
