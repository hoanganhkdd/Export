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
const KNOW_FILE = path.join(DATA_DIR, 'knowledge.json');
const STATE_FILE = path.join(DATA_DIR, 'state.json');
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
function loadKnowledge() { return readJSON(KNOW_FILE, { items: [] }); }
function saveKnowledge(k) { writeJSON(KNOW_FILE, k); }

if (!fs.existsSync(LIB_FILE)) saveLibrary({ resources: [] });
if (!fs.existsSync(KNOW_FILE)) saveKnowledge({ items: [] });

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
  const { session, type, q, kind } = req.query;
  let items = loadLibrary().resources;
  if (session) items = items.filter(r => r.sessionId === session);
  if (type) items = items.filter(r => r.type === type);
  if (kind === 'none') items = items.filter(r => !r.kind);
  else if (kind) items = items.filter(r => r.kind === kind);
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
  const { sessionId, type, title, url, note, tags, kind, question } = req.body || {};
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
    kind: kind || null,               // null=tài liệu thường; example|tool|qa|quiz=nội dung đào sâu/kiểm tra
    question: question || '',
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

// ---------- Kho kiến thức song song (3 bảng: ví dụ thực tế · công cụ · hỏi AI) ----------
app.get('/api/knowledge', (req, res) => {
  const { session, kind } = req.query;
  let items = loadKnowledge().items;
  if (session) items = items.filter(k => k.sessionId === session);
  if (kind) items = items.filter(k => k.kind === kind);
  items = items.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  res.json({ items });
});
app.post('/api/knowledge', (req, res) => {
  const { sessionId, kind, title, content, source, question } = req.body || {};
  if (!['example', 'tool', 'qa'].includes(kind)) return res.status(400).json({ error: 'kind không hợp lệ' });
  if (!content && !title) return res.status(400).json({ error: 'Thiếu nội dung' });
  const k = loadKnowledge();
  const item = {
    id: crypto.randomBytes(8).toString('hex'),
    sessionId: sessionId || 'general', kind,
    title: (title || '').trim(), content: (content || '').trim(),
    source: source || '', question: question || '', createdAt: Date.now()
  };
  k.items.push(item);
  saveKnowledge(k);
  res.json({ item });
});
app.delete('/api/knowledge/:id', (req, res) => {
  const k = loadKnowledge();
  const i = k.items.findIndex(x => x.id === req.params.id);
  if (i === -1) return res.status(404).json({ error: 'Không tìm thấy' });
  k.items.splice(i, 1);
  saveKnowledge(k);
  res.json({ ok: true });
});

function parseJsonArray(text) {
  if (!text) return null;
  let t = text.trim().replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
  const a = t.indexOf('['), b = t.lastIndexOf(']');
  if (a !== -1 && b !== -1) t = t.slice(a, b + 1);
  try { const arr = JSON.parse(t); return Array.isArray(arr) ? arr : null; } catch { return null; }
}

// Sinh ứng viên ví dụ thực tế / công cụ (có nguồn) — CHƯA lưu, người dùng xác nhận sau
app.post('/api/knowledge/generate', async (req, res) => {
  const s = loadSettings();
  const apiKey = s.openaiKey || process.env.OPENAI_API_KEY;
  if (!apiKey) return res.status(400).json({ error: 'Chưa cấu hình OpenAI API key. Vào ⚙️ Cài đặt để thêm.' });
  const { sessionId, kind } = req.body || {};
  if (!['example', 'tool'].includes(kind)) return res.status(400).json({ error: 'kind phải là example hoặc tool' });
  const model = s.model || process.env.OPENAI_MODEL || 'gpt-4o-mini';
  const ctx = sessionContext(sessionId);

  const ask = kind === 'example'
    ? `Với chủ đề đang học: "${ctx}", hãy tìm 4 VÍ DỤ THỰC TẾ / tình huống / case thật liên quan (doanh nghiệp, thị trường, quy định, số liệu thật). Mỗi ví dụ ngắn gọn 2-3 câu tiếng Việt, KÈM nguồn URL thật.`
    : `Với chủ đề đang học: "${ctx}", hãy liệt kê 5 CÔNG CỤ / THƯ VIỆN / WEBSITE thực tế hữu ích để làm phần này. Mỗi mục: tên công cụ, công dụng 1 câu tiếng Việt, và URL chính thức.`;
  const prompt = `${ask}\nTrả về DUY NHẤT một mảng JSON hợp lệ, không thêm chữ nào khác, dạng:\n[{"title":"...","content":"...","source":"https://..."}]`;

  try {
    const r = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST', headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model, tools: [{ type: 'web_search' }],
        input: [
          { role: 'system', content: 'Bạn là chuyên gia xuất nhập khẩu. Luôn ưu tiên nguồn thật, URL thật. Trả lời đúng định dạng JSON được yêu cầu.' },
          { role: 'user', content: prompt }
        ]
      })
    });
    const data = await r.json();
    if (!r.ok) throw new Error(data.error?.message || 'Lỗi OpenAI');
    const text = extractResponsesText(data);
    let candidates = parseJsonArray(text);
    if (!candidates) {
      // fallback: trả nguyên văn thành 1 ứng viên
      candidates = [{ title: kind === 'example' ? 'Ví dụ' : 'Công cụ', content: text, source: '' }];
    }
    // đính kèm citations nếu thiếu source
    const cites = extractCitations(data);
    candidates = candidates.map((c, i) => ({
      title: String(c.title || '').slice(0, 200),
      content: String(c.content || c.detail || '').slice(0, 1200),
      source: c.source || c.url || cites[i]?.url || ''
    })).filter(c => c.content || c.title);
    res.json({ candidates, kind });
  } catch (e) {
    res.status(502).json({ error: String(e.message || e) });
  }
});

// ---------- Đồng bộ tiến độ/mục tiêu giữa các thiết bị ----------
app.get('/api/state', (_req, res) => res.json(readJSON(STATE_FILE, { progress: {}, plan: null, studylog: {} })));
app.post('/api/state', (req, res) => {
  const cur = readJSON(STATE_FILE, { progress: {}, plan: null, studylog: {} });
  const b = req.body || {};
  const next = {
    progress: b.progress && typeof b.progress === 'object' ? b.progress : cur.progress,
    plan: b.plan !== undefined ? b.plan : cur.plan,
    studylog: b.studylog && typeof b.studylog === 'object' ? b.studylog : cur.studylog,
    updatedAt: Date.now()
  };
  writeJSON(STATE_FILE, next);
  res.json({ ok: true, updatedAt: next.updatedAt });
});

// ---------- Kiểm tra / Thu hoạch (AI ra đề + chấm) ----------
app.post('/api/quiz/generate', async (req, res) => {
  const s = loadSettings();
  const apiKey = s.openaiKey || process.env.OPENAI_API_KEY;
  if (!apiKey) return res.status(400).json({ error: 'Chưa cấu hình OpenAI API key. Vào ⚙️ Cài đặt để thêm.' });
  const { sessionId, numMC = 5, numEssay = 2 } = req.body || {};
  const model = s.model || process.env.OPENAI_MODEL || 'gpt-4o-mini';
  const ctx = sessionContext(sessionId);
  const prompt = `Dựa trên nội dung bài học phần: "${ctx}", hãy soạn một bài KIỂM TRA THU HOẠCH bằng tiếng Việt gồm:
- ${numMC} câu TRẮC NGHIỆM (mỗi câu 4 lựa chọn, chỉ 1 đúng).
- ${numEssay} câu TỰ LUẬN (câu hỏi mở, yêu cầu vận dụng).
Trả về DUY NHẤT một JSON hợp lệ, không thêm chữ nào khác, dạng:
{"mc":[{"q":"...","options":["A","B","C","D"],"answer":0,"explain":"giải thích ngắn"}],"essay":[{"q":"...","guide":"gợi ý ý chính cần có"}]}`;
  try {
    const r = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST', headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model, temperature: 0.4,
        messages: [
          { role: 'system', content: 'Bạn là giáo viên ra đề kiểm tra. Chỉ trả về JSON đúng định dạng yêu cầu.' },
          { role: 'user', content: prompt }
        ]
      })
    });
    const d = await r.json();
    if (!r.ok) throw new Error(d.error?.message || 'Lỗi OpenAI');
    let txt = (d.choices?.[0]?.message?.content || '').trim().replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
    const a = txt.indexOf('{'), b = txt.lastIndexOf('}');
    if (a !== -1 && b !== -1) txt = txt.slice(a, b + 1);
    const quiz = JSON.parse(txt);
    res.json({ quiz });
  } catch (e) { res.status(502).json({ error: String(e.message || e) }); }
});

app.post('/api/quiz/grade', async (req, res) => {
  const s = loadSettings();
  const apiKey = s.openaiKey || process.env.OPENAI_API_KEY;
  if (!apiKey) return res.status(400).json({ error: 'Chưa cấu hình OpenAI API key.' });
  const { sessionId, essays } = req.body || {}; // essays: [{q, guide, answer}]
  if (!Array.isArray(essays) || !essays.length) return res.json({ results: [] });
  const model = s.model || process.env.OPENAI_MODEL || 'gpt-4o-mini';
  const ctx = sessionContext(sessionId);
  const prompt = `Chấm các câu TỰ LUẬN sau (phần học: "${ctx}"). Với mỗi câu, cho điểm 0-10 và nhận xét ngắn gọn, chỉ ra điều còn thiếu.
Dữ liệu: ${JSON.stringify(essays)}
Trả về DUY NHẤT JSON: {"results":[{"score":8,"feedback":"..."}]} theo đúng thứ tự.`;
  try {
    const r = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST', headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model, temperature: 0.2,
        messages: [
          { role: 'system', content: 'Bạn là giám khảo công tâm. Chỉ trả JSON đúng định dạng.' },
          { role: 'user', content: prompt }
        ]
      })
    });
    const d = await r.json();
    if (!r.ok) throw new Error(d.error?.message || 'Lỗi OpenAI');
    let txt = (d.choices?.[0]?.message?.content || '').trim().replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
    const a = txt.indexOf('{'), b = txt.lastIndexOf('}');
    if (a !== -1 && b !== -1) txt = txt.slice(a, b + 1);
    res.json(JSON.parse(txt));
  } catch (e) { res.status(502).json({ error: String(e.message || e) }); }
});

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
