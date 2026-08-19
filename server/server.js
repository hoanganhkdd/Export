// Vận hành Xuất khẩu End-to-End — máy chủ ứng dụng học tập
// Express server: giáo án theo session, thư viện tài liệu mở rộng, proxy ChatGPT.
import express from 'express';
import multer from 'multer';
import dotenv from 'dotenv';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { YoutubeTranscript } from 'youtube-transcript';
import { PDFParse } from 'pdf-parse';

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const APP_DATA = path.join(__dirname, 'data');            // nội dung đóng gói (giáo án + seed)
const DATA_DIR = process.env.DATA_DIR || APP_DATA;        // thư mục GHI (đặt DATA_DIR để dùng ổ đĩa bền trên Render)
const UPLOAD_DIR = path.join(DATA_DIR, 'uploads');
const LIB_FILE = path.join(DATA_DIR, 'library.json');
const SETTINGS_FILE = path.join(DATA_DIR, 'settings.json');
const CURRICULUM_FILE = path.join(APP_DATA, 'curriculum.json'); // luôn đọc từ bản đóng gói

fs.mkdirSync(UPLOAD_DIR, { recursive: true });

// Nếu dùng ổ đĩa bền riêng (DATA_DIR khác bản đóng gói) → seed lần đầu từ dữ liệu kèm repo
if (DATA_DIR !== APP_DATA) {
  const seedLib = path.join(APP_DATA, 'library.json');
  if (!fs.existsSync(LIB_FILE) && fs.existsSync(seedLib)) fs.copyFileSync(seedLib, LIB_FILE);
  const seedUp = path.join(APP_DATA, 'uploads');
  if (fs.existsSync(seedUp)) {
    for (const f of fs.readdirSync(seedUp)) {
      if (f === '.gitkeep') continue;
      const dst = path.join(UPLOAD_DIR, f);
      if (!fs.existsSync(dst)) fs.copyFileSync(path.join(seedUp, f), dst);
    }
  }
}

// ---------- JSON store nhỏ gọn ----------
function readJSON(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, 'utf-8')); }
  catch { return fallback; }
}
function writeJSON(file, obj) {
  fs.writeFileSync(file, JSON.stringify(obj, null, 1));
}
function loadLibrary() { return readJSON(LIB_FILE, { resources: [] }); }
function saveLibrary(lib) { writeJSON(LIB_FILE, lib); }
function loadSettings() { return readJSON(SETTINGS_FILE, {}); }
function saveSettings(s) { writeJSON(SETTINGS_FILE, s); }

if (!fs.existsSync(LIB_FILE)) saveLibrary({ resources: [] });

// ---------- Upload ----------
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
  filename: (_req, file, cb) => {
    const id = crypto.randomBytes(8).toString('hex');
    const safe = file.originalname.replace(/[^\w.\-]+/g, '_').slice(-60);
    cb(null, `${id}__${safe}`);
  }
});
const upload = multer({ storage, limits: { fileSize: 50 * 1024 * 1024 } }); // 50MB

const app = express();
app.use(express.json({ limit: '2mb' }));

// ---------- Giáo án ----------
app.get('/api/curriculum', (_req, res) => {
  res.sendFile(CURRICULUM_FILE);
});

// ---------- Thư viện tài liệu ----------
// GET tất cả (hỗ trợ ?session=s1, ?type=youtube, ?q=từ khóa)
app.get('/api/resources', (req, res) => {
  const { session, type, q } = req.query;
  let items = loadLibrary().resources;
  if (session) items = items.filter(r => r.sessionId === session);
  if (type) items = items.filter(r => r.type === type);
  if (q) {
    const s = String(q).toLowerCase();
    items = items.filter(r =>
      (r.title || '').toLowerCase().includes(s) ||
      (r.note || '').toLowerCase().includes(s) ||
      (r.url || '').toLowerCase().includes(s) ||
      (r.tags || []).join(' ').toLowerCase().includes(s));
  }
  items = items.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  res.json({ resources: items });
});

// Thêm tài liệu dạng link/text (JSON)
app.post('/api/resources', (req, res) => {
  const { sessionId, type, title, url, note, tags } = req.body || {};
  const allowed = ['text', 'youtube', 'facebook', 'link', 'pdf', 'image'];
  if (!allowed.includes(type)) return res.status(400).json({ error: 'type không hợp lệ' });
  if ((type === 'youtube' || type === 'facebook' || type === 'link') && !url)
    return res.status(400).json({ error: 'Thiếu URL' });
  if (type === 'text' && !note)
    return res.status(400).json({ error: 'Thiếu nội dung text' });

  const lib = loadLibrary();
  const item = {
    id: crypto.randomBytes(8).toString('hex'),
    sessionId: sessionId || 'general',
    type,
    title: (title || '').trim() || defaultTitle(type, url),
    url: url || '',
    note: note || '',
    tags: Array.isArray(tags) ? tags : (tags ? String(tags).split(',').map(t => t.trim()).filter(Boolean) : []),
    file: null,
    createdAt: Date.now()
  };
  lib.resources.push(item);
  saveLibrary(lib);
  res.json({ resource: item });
});

// Thêm tài liệu dạng file (PDF/ảnh) — multipart
app.post('/api/resources/upload', upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Thiếu file' });
  const { sessionId, title, note, tags } = req.body || {};
  const isImg = /^image\//.test(req.file.mimetype);
  const lib = loadLibrary();
  const item = {
    id: crypto.randomBytes(8).toString('hex'),
    sessionId: sessionId || 'general',
    type: isImg ? 'image' : 'pdf',
    title: (title || '').trim() || req.file.originalname,
    url: `/uploads/${req.file.filename}`,
    note: note || '',
    tags: tags ? String(tags).split(',').map(t => t.trim()).filter(Boolean) : [],
    file: { name: req.file.originalname, size: req.file.size, mime: req.file.mimetype },
    createdAt: Date.now()
  };
  lib.resources.push(item);
  saveLibrary(lib);
  res.json({ resource: item });
});

// Xóa tài liệu
app.delete('/api/resources/:id', (req, res) => {
  const lib = loadLibrary();
  const idx = lib.resources.findIndex(r => r.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Không tìm thấy' });
  const [removed] = lib.resources.splice(idx, 1);
  if (removed.file && removed.url?.startsWith('/uploads/')) {
    const p = path.join(UPLOAD_DIR, path.basename(removed.url));
    fs.rm(p, () => {});
  }
  saveLibrary(lib);
  res.json({ ok: true });
});

function defaultTitle(type, url) {
  if (type === 'youtube') return 'Video YouTube';
  if (type === 'facebook') return 'Facebook Reel';
  if (type === 'link') { try { return new URL(url).hostname; } catch { return 'Liên kết'; } }
  if (type === 'text') return 'Ghi chú';
  return 'Tài liệu';
}

// ---------- Cấu hình (API key) ----------
app.get('/api/settings', (_req, res) => {
  const s = loadSettings();
  res.json({
    hasKey: !!(s.openaiKey || process.env.OPENAI_API_KEY),
    model: s.model || process.env.OPENAI_MODEL || 'gpt-4o-mini',
    keySource: s.openaiKey ? 'settings' : (process.env.OPENAI_API_KEY ? 'env' : 'none')
  });
});
app.post('/api/settings', (req, res) => {
  const s = loadSettings();
  if (typeof req.body.openaiKey === 'string') {
    const k = req.body.openaiKey.trim();
    if (k) s.openaiKey = k; else delete s.openaiKey; // gửi rỗng = xóa key trong settings
  }
  if (req.body.model) s.model = req.body.model;
  saveSettings(s);
  res.json({ ok: true, hasKey: !!(s.openaiKey || process.env.OPENAI_API_KEY) });
});

// ---------- Trợ lý ChatGPT (proxy an toàn) ----------
app.post('/api/chat', async (req, res) => {
  const s = loadSettings();
  const apiKey = s.openaiKey || process.env.OPENAI_API_KEY;
  if (!apiKey) return res.status(400).json({ error: 'Chưa cấu hình OpenAI API key. Vào phần Cài đặt để thêm.' });

  const { question, context, webSearch } = req.body || {};
  if (!question || !question.trim()) return res.status(400).json({ error: 'Thiếu câu hỏi' });
  const model = s.model || process.env.OPENAI_MODEL || 'gpt-4o-mini';

  const system = `Bạn là trợ lý chuyên gia xuất nhập khẩu, hỗ trợ một nhà xuất khẩu Việt Nam đang tự học theo giáo án "Vận hành Xuất khẩu End-to-End". Trả lời bằng tiếng Việt, ngắn gọn, thực chiến, đúng thuật ngữ song ngữ (kèm tiếng Anh khi cần cho buyer/forwarder/ngân hàng). Khi có số liệu/quy định thay đổi theo thời gian, nhắc người dùng xác minh với hải quan/forwarder nước đích.`;

  const userContent = context
    ? `Bối cảnh bài học hiện tại:\n${context}\n\nCâu hỏi: ${question}`
    : question;

  try {
    // Ưu tiên Responses API (hỗ trợ web_search). Nếu model không hỗ trợ, fallback chat.completions.
    let answer = '', citations = [];
    if (webSearch) {
      const r = await fetch('https://api.openai.com/v1/responses', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model,
          tools: [{ type: 'web_search' }],
          input: [
            { role: 'system', content: system },
            { role: 'user', content: userContent }
          ]
        })
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error?.message || 'Lỗi OpenAI Responses API');
      answer = extractResponsesText(data);
      citations = extractCitations(data);
    } else {
      const r = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model,
          messages: [
            { role: 'system', content: system },
            { role: 'user', content: userContent }
          ],
          temperature: 0.3
        })
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error?.message || 'Lỗi OpenAI Chat API');
      answer = data.choices?.[0]?.message?.content || '';
    }
    res.json({ answer, citations });
  } catch (e) {
    res.status(502).json({ error: String(e.message || e) });
  }
});

// ---------- AI: Rút insight bài học từ tài liệu / video ----------
function sessionContext(sessionId) {
  try {
    const c = JSON.parse(fs.readFileSync(CURRICULUM_FILE, 'utf-8'));
    const s = c.sessions.find(x => x.id === sessionId);
    return s ? `${s.title_vi} (${s.title_en}) — ${s.subtitle}` : 'Vận hành xuất khẩu';
  } catch { return 'Vận hành xuất khẩu'; }
}
function ytIdFromUrl(url) {
  const m = String(url).match(/(?:youtu\.be\/|v=|\/embed\/|\/shorts\/)([\w-]{11})/);
  return m ? m[1] : null;
}
function stripHtml(html) {
  return html.replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
}
const MAX_CONTENT = 12000;

// Trả về { kind, content, imageDataUrl } — ném lỗi nếu không lấy được nội dung
async function getResourceContent(r) {
  if (r.type === 'text') return { kind: 'text', content: (r.note || '').slice(0, MAX_CONTENT) };

  if (r.type === 'youtube') {
    const id = ytIdFromUrl(r.url);
    if (!id) throw new Error('Không đọc được video ID từ URL');
    const tr = await YoutubeTranscript.fetchTranscript(id, { lang: 'vi' })
      .catch(() => YoutubeTranscript.fetchTranscript(id));
    const text = tr.map(t => t.text).join(' ').replace(/\s+/g, ' ').trim();
    if (!text) throw new Error('Video không có phụ đề');
    return { kind: 'transcript', content: text.slice(0, MAX_CONTENT) };
  }

  if (r.type === 'pdf') {
    const p = path.join(UPLOAD_DIR, path.basename(r.url));
    if (!fs.existsSync(p)) throw new Error('Không tìm thấy file PDF');
    const buf = fs.readFileSync(p);
    const parser = new PDFParse({ data: new Uint8Array(buf) });
    const out = await parser.getText();
    await parser.destroy?.();
    const text = (out.text || '').replace(/\s+\n/g, '\n').trim();
    if (!text) throw new Error('PDF không có text (có thể là bản scan ảnh)');
    return { kind: 'pdf', content: text.slice(0, MAX_CONTENT) };
  }

  if (r.type === 'image') {
    const p = path.join(UPLOAD_DIR, path.basename(r.url));
    if (!fs.existsSync(p)) throw new Error('Không tìm thấy file ảnh');
    const buf = fs.readFileSync(p);
    const mime = r.file?.mime || 'image/png';
    return { kind: 'image', content: '', imageDataUrl: `data:${mime};base64,${buf.toString('base64')}` };
  }

  if (r.type === 'link') {
    const resp = await fetch(r.url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
    const html = await resp.text();
    const text = stripHtml(html);
    if (text.length < 40) throw new Error('Trang không có nội dung text đọc được');
    return { kind: 'webpage', content: text.slice(0, MAX_CONTENT) };
  }

  // facebook reel — không lấy được transcript trực tiếp
  throw new Error('NO_CONTENT');
}

const INSIGHT_STRUCTURE = `Trả lời bằng Markdown theo đúng cấu trúc:
**📌 Tóm tắt** — 2–3 câu.
**💡 Điểm chính** — 5–7 gạch đầu dòng, mỗi dòng một ý cô đọng.
**✅ Áp dụng vào lô hàng thật** — 2–3 hành động cụ thể cho nhà xuất khẩu.
**🔤 Thuật ngữ Anh–Việt** — liệt kê nếu tài liệu có thuật ngữ chuyên ngành (bỏ qua nếu không có).`;

app.post('/api/insight', async (req, res) => {
  const s = loadSettings();
  const apiKey = s.openaiKey || process.env.OPENAI_API_KEY;
  if (!apiKey) return res.status(400).json({ error: 'Chưa cấu hình OpenAI API key. Vào ⚙️ Cài đặt để thêm.' });

  const { resourceId, regenerate } = req.body || {};
  const lib = loadLibrary();
  const r = lib.resources.find(x => x.id === resourceId);
  if (!r) return res.status(404).json({ error: 'Không tìm thấy tài liệu' });
  if (r.insight && !regenerate)
    return res.json({ insight: r.insight.text, source: r.insight.source, cached: true, createdAt: r.insight.createdAt });

  const model = s.model || process.env.OPENAI_MODEL || 'gpt-4o-mini';
  const ctx = sessionContext(r.sessionId);
  const system = `Bạn là chuyên gia xuất nhập khẩu kiêm trợ giảng. Đọc nội dung tài liệu/video rồi rút ra insight bài học ứng dụng cho một nhà xuất khẩu Việt Nam đang học phần: ${ctx}. Viết tiếng Việt, thực chiến, súc tích. Nếu nội dung mỏng, nêu rõ điều đó thay vì bịa.`;

  try {
    let content, source;
    let ci;
    try { ci = await getResourceContent(r); } catch (e) { ci = { kind: 'none', error: String(e.message || e) }; }

    if (ci.kind === 'image') {
      // Vision
      const rr = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST', headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model, temperature: 0.3,
          messages: [
            { role: 'system', content: system },
            { role: 'user', content: [
              { type: 'text', text: `Đây là hình ảnh tài liệu "${r.title}". Rút insight bài học.\n${INSIGHT_STRUCTURE}` },
              { type: 'image_url', image_url: { url: ci.imageDataUrl } }
            ] }
          ]
        })
      });
      const d = await rr.json();
      if (!rr.ok) throw new Error(d.error?.message || 'Lỗi vision');
      content = d.choices?.[0]?.message?.content || '';
      source = 'ảnh (vision)';
    } else if (ci.kind === 'none') {
      // Không có nội dung trực tiếp → tìm kiếm web theo URL
      if (!r.url) throw new Error(ci.error || 'Không có nội dung để phân tích');
      const rr = await fetch('https://api.openai.com/v1/responses', {
        method: 'POST', headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model, tools: [{ type: 'web_search' }],
          input: [
            { role: 'system', content: system },
            { role: 'user', content: `Tìm hiểu nội dung tại URL: ${r.url} (tiêu đề: "${r.title}"). Dựa trên thông tin tra được, rút insight bài học.\n${INSIGHT_STRUCTURE}` }
          ]
        })
      });
      const d = await rr.json();
      if (!rr.ok) throw new Error(d.error?.message || 'Lỗi web search');
      content = extractResponsesText(d);
      source = 'web search (không có transcript)';
    } else {
      const kindLabel = { transcript: 'transcript video', pdf: 'tài liệu PDF', text: 'ghi chú', webpage: 'trang web' }[ci.kind] || ci.kind;
      const rr = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST', headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model, temperature: 0.3,
          messages: [
            { role: 'system', content: system },
            { role: 'user', content: `Nội dung ${kindLabel} — tiêu đề "${r.title}":\n\n"""${ci.content}"""\n\n${INSIGHT_STRUCTURE}` }
          ]
        })
      });
      const d = await rr.json();
      if (!rr.ok) throw new Error(d.error?.message || 'Lỗi OpenAI');
      content = d.choices?.[0]?.message?.content || '';
      source = kindLabel;
    }

    if (!content) throw new Error('AI không trả về nội dung');
    r.insight = { text: content, source, createdAt: Date.now() };
    saveLibrary(lib);
    res.json({ insight: content, source, cached: false, createdAt: r.insight.createdAt });
  } catch (e) {
    res.status(502).json({ error: String(e.message || e) });
  }
});

function extractResponsesText(data) {
  if (typeof data.output_text === 'string' && data.output_text) return data.output_text;
  const out = [];
  for (const item of data.output || []) {
    if (item.type === 'message') {
      for (const c of item.content || []) {
        if (c.type === 'output_text' && c.text) out.push(c.text);
      }
    }
  }
  return out.join('\n').trim();
}
function extractCitations(data) {
  const cites = [];
  for (const item of data.output || []) {
    if (item.type !== 'message') continue;
    for (const c of item.content || []) {
      for (const ann of c.annotations || []) {
        if (ann.type === 'url_citation' && ann.url)
          cites.push({ title: ann.title || ann.url, url: ann.url });
      }
    }
  }
  // khử trùng URL
  const seen = new Set();
  return cites.filter(c => (seen.has(c.url) ? false : (seen.add(c.url), true)));
}

// ---------- Static ----------
app.use('/uploads', express.static(UPLOAD_DIR));
// Không cache asset (app local, luôn lấy bản mới nhất sau khi cập nhật)
app.use(express.static(path.join(ROOT, 'public'), {
  etag: false, lastModified: false,
  setHeaders: res => res.setHeader('Cache-Control', 'no-store')
}));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`\n  📦 Học Xuất khẩu End-to-End`);
  console.log(`  → http://localhost:${PORT}\n`);
});
