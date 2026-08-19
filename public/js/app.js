// ===== Học Vận hành Xuất khẩu End-to-End — frontend =====
import { renderSlide } from './slides.js';

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const el = (t, c, html) => { const e = document.createElement(t); if (c) e.className = c; if (html != null) e.innerHTML = html; return e; };
const esc = s => (s ?? '').replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));

const state = {
  curriculum: null,
  sessions: [],
  byId: {},
  current: null,
  tab: 'lesson',
  progress: JSON.parse(localStorage.getItem('exp_progress') || '{}'),
  resCounts: {},
};

// ---------- Boot ----------
init();
async function fetchRetry(url, opts, tries = 4, delay = 1500) {
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetch(url, opts);
      if (r.ok) return r;
      throw new Error('HTTP ' + r.status);
    } catch (e) {
      if (i === tries - 1) throw e;
      await new Promise(s => setTimeout(s, delay));
    }
  }
}
async function init() {
  bindGlobalUI();
  applyTheme(localStorage.getItem('exp_theme') || 'light');
  try {
    const c = await fetchRetry('/api/curriculum').then(r => r.json());
    state.curriculum = c;
    state.sessions = c.sessions;
    c.sessions.forEach(s => state.byId[s.id] = s);
  } catch (e) {
    $('#main').innerHTML = `<div class="empty-state">Máy chủ đang khởi động (Render free tier ngủ sau 15 phút không dùng).<br>Vui lòng chờ ~30 giây rồi <a href="javascript:location.reload()">tải lại trang</a>.</div>`;
    return;
  }
  window.__appReady = true;
  try { sessionStorage.removeItem('coldReload'); } catch {}
  await refreshResourceCounts();
  renderNav();
  const startId = location.hash.replace('#', '');
  if (startId === 'home' || !startId) openHome();
  else if (state.byId[startId]) openSession(startId);
  else openHome();
  updateProgress();
}

// ---------- Sidebar nav ----------
function renderNav(filter = '') {
  const nav = $('#sessionNav');
  nav.innerHTML = '';
  // Home item
  const home = el('div', 'nav-item nav-home' + (state.current === 'home' ? ' active' : ''));
  home.innerHTML = `<span class="nav-dot">🏠</span><span>Trang chủ</span>`;
  home.onclick = () => { openHome(); if (window.innerWidth < 860) $('#sidebar').classList.remove('open'); };
  nav.append(home);
  const groups = {};
  for (const s of state.sessions) (groups[s.module] ||= []).push(s);
  const f = filter.trim().toLowerCase();
  for (const [mod, list] of Object.entries(groups)) {
    const shown = list.filter(s => !f || (s.title_vi + s.title_en + s.subtitle).toLowerCase().includes(f));
    if (!shown.length) continue;
    const g = el('div', 'nav-module');
    g.append(el('div', 'nav-module-title', esc(mod)));
    for (const s of shown) {
      const done = !!state.progress[s.id];
      const item = el('div', 'nav-item' + (done ? ' done' : '') + (s.id === state.current ? ' active' : ''));
      item.dataset.id = s.id;
      const cnt = state.resCounts[s.id] || 0;
      item.innerHTML = `<span class="nav-dot">${done ? '✓' : ''}</span>
        <span>${esc(s.title_vi)}</span>
        ${cnt ? `<span class="nav-count">📎${cnt}</span>` : ''}`;
      item.onclick = () => { openSession(s.id); if (window.innerWidth < 860) $('#sidebar').classList.remove('open'); };
      g.append(item);
    }
    nav.append(g);
  }
}

// ---------- Home / trang chủ ----------
function openHome() {
  state.current = 'home';
  location.hash = 'home';
  renderNav($('#sessionSearch').value);
  renderHome();
}

function renderHome() {
  const main = $('#main');
  const meta = state.curriculum.meta;
  const total = state.sessions.length;
  const done = Object.keys(state.progress).filter(k => state.byId[k]).length;
  const pct = total ? Math.round(done / total * 100) : 0;
  const totalRes = Object.values(state.resCounts).reduce((a, b) => a + b, 0);
  const next = state.sessions.find(s => !state.progress[s.id]) || state.sessions[0];

  const groups = {};
  for (const s of state.sessions) (groups[s.module] ||= []).push(s);

  main.innerHTML = `
    <section class="home-hero">
      <div class="home-hero-text">
        <span class="session-badge">Giáo án tự học · Self-study</span>
        <h1 class="home-title">${esc(meta.title)}</h1>
        <p class="home-sub">${esc(meta.subtitle)}</p>
        <p class="home-desc">Mô hình doanh nghiệp xuất khẩu một người — <b>${meta.stages} giai đoạn</b>, <b>${meta.steps} bước</b> vận hành, 5 cổng kiểm soát. Học theo session, mỗi session mở rộng được thư viện tài liệu riêng và có trợ lý AI.</p>
        <div class="home-cta">
          <button class="btn primary" id="homeContinue">${done ? '▶ Học tiếp' : '▶ Bắt đầu học'}: ${esc(next.title_vi)}</button>
          <button class="btn" id="homeLibrary">📚 Thư viện chung</button>
        </div>
      </div>
      <div class="home-stats">
        ${statCard(pct + '%', 'Hoàn thành', `${done}/${total} session`)}
        ${statCard(meta.stages, 'Giai đoạn', `${meta.total_slides} slide`)}
        ${statCard(totalRes, 'Tài liệu', 'trong thư viện')}
      </div>
    </section>
    <div class="home-modules" id="homeModules"></div>`;

  $('#homeContinue').onclick = () => openSession(next.id);
  $('#homeLibrary').onclick = openLibrary;

  const wrap = $('#homeModules');
  for (const [mod, list] of Object.entries(groups)) {
    const mDone = list.filter(s => state.progress[s.id]).length;
    const card = el('div', 'home-module');
    card.innerHTML = `<div class="home-module-head">
        <h2>${esc(mod)}</h2>
        <span class="muted small">${mDone}/${list.length} xong</span>
      </div>
      <div class="home-session-list"></div>`;
    const listEl = $('.home-session-list', card);
    for (const s of list) {
      const done = !!state.progress[s.id];
      const cnt = state.resCounts[s.id] || 0;
      const chip = el('button', 'home-session' + (done ? ' done' : ''));
      chip.innerHTML = `<span class="hs-dot">${done ? '✓' : ''}</span>
        <span class="hs-title">${esc(s.title_vi)}</span>
        ${cnt ? `<span class="hs-cnt">📎${cnt}</span>` : ''}`;
      chip.onclick = () => openSession(s.id);
      listEl.append(chip);
    }
    wrap.append(card);
  }
}
function statCard(big, label, sub) {
  return `<div class="stat-card"><div class="stat-big">${esc(String(big))}</div>
    <div class="stat-label">${esc(label)}</div><div class="stat-sub muted small">${esc(sub)}</div></div>`;
}

// ---------- Open a session ----------
function openSession(id) {
  state.current = id;
  state.tab = 'lesson';
  location.hash = id;
  renderNav($('#sessionSearch').value);
  renderSession();
}

function renderSession() {
  const s = state.byId[state.current];
  const main = $('#main');
  const done = !!state.progress[s.id];
  const cnt = state.resCounts[s.id] || 0;
  main.innerHTML = '';

  const head = el('div', 'session-head');
  head.innerHTML = `
    <span class="session-badge">${esc(s.module)}</span>
    <h1 class="session-title">${esc(s.title_vi)}<span class="en">${esc(s.title_en)}</span></h1>
    <p class="session-sub">${esc(s.subtitle)}</p>
    <div class="session-toolbar">
      <button class="btn ${done ? '' : 'primary'}" id="btnDone">${done ? '✓ Đã hoàn thành' : 'Đánh dấu hoàn thành'}</button>
      <span class="muted small">Slide ${s.slide_from}–${s.slide_to} · ${s.slides.length} slide</span>
    </div>`;
  main.append(head);

  const tabs = el('div', 'tabs');
  tabs.innerHTML = `
    <button class="tab ${state.tab === 'lesson' ? 'active' : ''}" data-tab="lesson">📖 Bài học</button>
    <button class="tab ${state.tab === 'library' ? 'active' : ''}" data-tab="library">📚 Thư viện<span class="tab-badge" id="libTabCount">${cnt}</span></button>
    <button class="tab ${state.tab === 'ai' ? 'active' : ''}" data-tab="ai">🤖 Hỏi AI</button>`;
  main.append(tabs);
  $$('.tab', tabs).forEach(t => t.onclick = () => { state.tab = t.dataset.tab; renderSession(); });

  const body = el('div', 'tab-body');
  main.append(body);

  $('#btnDone').onclick = () => {
    if (state.progress[s.id]) delete state.progress[s.id]; else state.progress[s.id] = Date.now();
    localStorage.setItem('exp_progress', JSON.stringify(state.progress));
    updateProgress(); renderSession();
  };

  if (state.tab === 'lesson') renderLesson(body, s);
  else if (state.tab === 'library') renderLibraryTab(body, s);
  else renderAITab(body, s);
}

// ---------- Lesson ----------
function renderLesson(body, s) {
  for (const sl of s.slides) {
    const card = renderSlide(sl);
    if (card) body.append(card);
  }
}

// ---------- Library tab ----------
async function renderLibraryTab(body, s) {
  const headRow = el('div', 'lib-head');
  headRow.innerHTML = `<div class="muted small">Tài liệu bổ sung cho <b>${esc(s.title_vi)}</b> — thêm text, ảnh, PDF, link YouTube/Facebook.</div>`;
  const btnGroup = el('div', 'lib-head-actions');
  btnGroup.style.cssText = 'display:flex;gap:8px';
  const addBtn = el('button', 'btn primary', '➕ Thêm tài liệu');
  addBtn.onclick = () => openAddModal(s.id, s.title_vi);
  const expBtn = el('button', 'btn', '⬇️ Xuất .md');
  expBtn.title = 'Xuất tài liệu & ghi chú của session này ra Markdown';
  btnGroup.append(addBtn, expBtn);
  headRow.append(btnGroup);
  body.append(headRow);

  const grid = el('div', 'resource-grid');
  body.append(grid);
  const items = await fetchResources({ session: s.id });
  expBtn.onclick = () => exportMarkdown(items, `thu-vien_${s.id}.md`, s.title_vi);
  renderResourceCards(grid, items, { showSession: false });
}

// ---------- AI tab ----------
function renderAITab(body, s) {
  const wrap = el('div', 'chat-wrap');
  wrap.innerHTML = `
    <div class="muted small">Trợ lý ChatGPT giải đáp trong bối cảnh <b>${esc(s.title_vi)}</b>. Bật “Tìm kiếm web” để lấy thông tin/quy định mới nhất kèm nguồn.</div>
    <div class="chat-log" id="chatLog">
      <div class="chat-msg ai">Xin chào 👋 Bạn muốn hỏi gì về <b>${esc(s.title_vi)}</b>? Ví dụ: cách tra HS code, mẫu email chào giá, checklist chứng từ…</div>
    </div>
    <div class="chat-opts">
      <label class="switch"><input type="checkbox" id="webSearch"> 🔎 Tìm kiếm web (kèm nguồn)</label>
    </div>
    <div class="chat-input-row">
      <textarea id="chatInput" placeholder="Nhập câu hỏi… (Enter để gửi, Shift+Enter xuống dòng)"></textarea>
      <button class="btn primary" id="chatSend">Gửi</button>
    </div>
    <div class="chat-hint" id="chatHint"></div>`;
  body.append(wrap);

  const input = $('#chatInput', wrap), log = $('#chatLog', wrap), hint = $('#chatHint', wrap);
  checkKeyHint(hint);

  const send = async () => {
    const q = input.value.trim();
    if (!q) return;
    input.value = '';
    log.append(mkMsg('user', esc(q)));
    const thinking = el('div', 'chat-msg ai typing', '⏳ Đang suy nghĩ…');
    log.append(thinking); log.scrollTop = log.scrollHeight;
    try {
      const r = await fetch('/api/chat', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question: q,
          context: `${s.title_vi} (${s.title_en}). ${s.subtitle}`,
          webSearch: $('#webSearch', wrap).checked
        })
      });
      const data = await r.json();
      thinking.remove();
      if (!r.ok) { log.append(mkMsg('ai', `⚠️ ${esc(data.error || 'Lỗi')}`)); }
      else {
        const m = mkMsg('ai', formatAnswer(data.answer || '(không có nội dung)'));
        if (data.citations?.length) {
          const c = el('div', 'cites', '<b>Nguồn:</b>' + data.citations.map(x => `<a href="${esc(x.url)}" target="_blank" rel="noopener">${esc(x.title)}</a>`).join(''));
          m.append(c);
        }
        log.append(m);
      }
    } catch (e) { thinking.remove(); log.append(mkMsg('ai', '⚠️ Không kết nối được máy chủ.')); }
    log.scrollTop = log.scrollHeight;
  };
  $('#chatSend', wrap).onclick = send;
  input.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } });
}
function mkMsg(role, html) { return el('div', `chat-msg ${role}`, html); }
function formatAnswer(t) {
  return esc(t).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/\n/g, '<br>');
}
async function checkKeyHint(hint) {
  const s = await fetch('/api/settings').then(r => r.json()).catch(() => ({}));
  if (!s.hasKey) hint.innerHTML = '⚠️ Chưa có API key — vào <b>⚙️ Cài đặt</b> để bật trợ lý AI.';
  else hint.innerHTML = `Model: <code>${esc(s.model)}</code>`;
}

// ---------- Resources ----------
async function fetchResources(params = {}) {
  const q = new URLSearchParams(params).toString();
  const d = await fetch('/api/resources' + (q ? '?' + q : '')).then(r => r.json());
  return d.resources || [];
}
async function refreshResourceCounts() {
  const all = await fetchResources();
  const c = {};
  for (const r of all) c[r.sessionId] = (c[r.sessionId] || 0) + 1;
  state.resCounts = c;
}
function renderResourceCards(grid, items, { showSession }) {
  grid.innerHTML = '';
  if (!items.length) { grid.append(el('div', 'empty-state', 'Chưa có tài liệu nào. Bấm <b>➕ Thêm tài liệu</b> để bắt đầu xây thư viện.')); return; }
  for (const r of items) grid.append(resourceCard(r, showSession));
}
function resourceCard(r, showSession) {
  const card = el('div', 'res-card');
  let media = '';
  if (r.type === 'youtube') {
    const id = ytId(r.url);
    media = id ? `<div class="res-media"><iframe src="https://www.youtube.com/embed/${id}" allowfullscreen loading="lazy"></iframe></div>` : '';
  } else if (r.type === 'facebook') {
    const src = `https://www.facebook.com/plugins/video.php?href=${encodeURIComponent(r.url)}&show_text=false`;
    media = `<div class="res-media"><div class="fb-wrap"><iframe src="${src}" allowfullscreen loading="lazy" scrolling="no"></iframe></div></div>`;
  } else if (r.type === 'image') {
    media = `<div class="res-media"><a href="${esc(r.url)}" target="_blank"><img src="${esc(r.url)}" alt="" loading="lazy"></a></div>`;
  } else if (r.type === 'pdf') {
    media = `<div class="res-media doc">📄</div>`;
  } else if (r.type === 'link') {
    media = `<div class="res-media doc">🔗</div>`;
  }
  const typeLabel = { text: '📝 Ghi chú', image: '🖼️ Ảnh', pdf: '📄 PDF', youtube: '▶️ YouTube', facebook: '🎬 Facebook Reel', link: '🔗 Liên kết' }[r.type] || r.type;
  const sess = state.byId[r.sessionId];
  card.innerHTML = media + `
    <div class="res-body">
      <span class="res-type">${typeLabel}</span>
      <div class="res-title">${esc(r.title)}</div>
      ${r.note ? `<div class="res-note">${esc(r.note)}</div>` : ''}
      ${r.tags?.length ? `<div class="res-tags">${r.tags.map(t => `<span class="res-tag">#${esc(t)}</span>`).join('')}</div>` : ''}
      <div class="res-insight"></div>
      <div class="res-foot">
        ${r.url ? `<a class="res-src" href="${esc(r.url)}" target="_blank" rel="noopener">${r.type === 'pdf' ? '📂 Mở file' : '🔗 Nguồn'}</a>` : '<span></span>'}
        <button class="btn danger-text" title="Xóa">🗑</button>
      </div>
      ${showSession && sess ? `<div class="res-session">Session: ${esc(sess.title_vi)}</div>` : ''}
    </div>`;
  $('.danger-text', card).onclick = async () => {
    if (!confirm('Xóa tài liệu này?')) return;
    await fetch('/api/resources/' + r.id, { method: 'DELETE' });
    await refreshResourceCounts();
    card.remove(); renderNav($('#sessionSearch').value);
    const lc = $('#libTabCount'); if (lc) lc.textContent = state.resCounts[state.current] || 0;
  };
  renderInsight($('.res-insight', card), r);
  return card;
}

// ---------- AI insight cho từng tài liệu / video ----------
const RES_LABEL = { text: 'ghi chú', image: 'ảnh', pdf: 'PDF', youtube: 'video', facebook: 'reel', link: 'trang web' };
function renderInsight(box, r) {
  box.innerHTML = '';
  if (r.insight) {
    const det = el('details', 'insight-box');
    det.innerHTML = `<summary>✨ Insight bài học <span class="muted small">· ${esc(r.insight.source || '')}</span></summary>
      <div class="insight-text">${formatMarkdown(r.insight.text)}</div>`;
    const regen = el('button', 'btn sm', '🔄 Tạo lại insight');
    regen.onclick = () => generateInsight(r, box, true);
    det.append(regen);
    box.append(det);
  } else {
    const btn = el('button', 'btn sm insight-btn', '✨ Rút insight bài học');
    btn.onclick = () => generateInsight(r, box, false);
    box.append(btn);
  }
}
async function generateInsight(r, box, regenerate) {
  box.innerHTML = `<div class="insight-loading">⏳ AI đang đọc ${RES_LABEL[r.type] || 'tài liệu'} và rút insight…</div>`;
  try {
    const resp = await fetch('/api/insight', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ resourceId: r.id, regenerate: !!regenerate })
    });
    const d = await resp.json();
    if (!resp.ok) {
      box.innerHTML = `<div class="insight-error">⚠️ ${esc(d.error || 'Lỗi')}</div>`;
      const retry = el('button', 'btn sm', 'Thử lại'); retry.onclick = () => generateInsight(r, box, regenerate);
      box.append(retry); return;
    }
    r.insight = { text: d.insight, source: d.source, createdAt: d.createdAt };
    renderInsight(box, r);
    const det = $('details', box); if (det) det.open = true;
  } catch { box.innerHTML = `<div class="insight-error">⚠️ Không kết nối được máy chủ.</div>`; }
}
function formatMarkdown(t) {
  const lines = esc(t).split('\n');
  let html = '', inList = false;
  for (let ln of lines) {
    ln = ln.replace(/\*\*(.+?)\*\*/g, '<b>$1</b>');
    if (/^\s*[-*]\s+/.test(ln)) {
      if (!inList) { html += '<ul>'; inList = true; }
      html += `<li>${ln.replace(/^\s*[-*]\s+/, '')}</li>`;
    } else {
      if (inList) { html += '</ul>'; inList = false; }
      if (ln.trim()) html += `<p>${ln}</p>`;
    }
  }
  if (inList) html += '</ul>';
  return html;
}
function ytId(url) {
  const m = String(url).match(/(?:youtu\.be\/|v=|\/embed\/|\/shorts\/)([\w-]{11})/);
  return m ? m[1] : null;
}

// ---------- Add resource modal ----------
let addSessionId = 'general';
function openAddModal(sessionId, sessionTitle) {
  addSessionId = sessionId;
  $('#addTarget').innerHTML = `Sẽ lưu vào session: <b>${esc(sessionTitle || 'Chung')}</b>`;
  $('#addResError').textContent = '';
  $('#addResForm').reset();
  setResType('text');
  showModal('#addResModal');
}
function setResType(type) {
  $$('#typePicker button').forEach(b => b.classList.toggle('active', b.dataset.type === type));
  $('#addResForm [name=type]').value = type;
  $$('#addResForm .field[data-when]').forEach(f => {
    f.style.display = f.dataset.when.split(' ').includes(type) ? '' : 'none';
  });
}

// ---------- Progress ----------
function updateProgress() {
  const total = state.sessions.length;
  const done = Object.keys(state.progress).filter(k => state.byId[k]).length;
  const pct = total ? Math.round(done / total * 100) : 0;
  $('#progressFill').style.width = pct + '%';
  $('#progressText').textContent = pct + '%';
}

// ---------- Global library modal ----------
async function openLibrary() {
  const sel = $('#libSessionFilter');
  if (sel.options.length <= 1) {
    for (const s of state.sessions) { const o = el('option'); o.value = s.id; o.textContent = s.title_vi; sel.append(o); }
  }
  showModal('#libraryModal');
  await loadLibraryGrid();
}
async function loadLibraryGrid() {
  const params = {};
  const q = $('#libSearch').value.trim(); if (q) params.q = q;
  const t = $('#libTypeFilter').value; if (t) params.type = t;
  const s = $('#libSessionFilter').value; if (s) params.session = s;
  const items = await fetchResources(params);
  libGridItems = items;
  renderResourceCards($('#libGrid'), items, { showSession: true });
}

// ---------- Export Markdown ----------
let libGridItems = [];
function exportMarkdown(items, filename, scopeLabel) {
  const origin = location.origin;
  const typeLabel = { text: 'Ghi chú', image: 'Ảnh', pdf: 'PDF', youtube: 'YouTube', facebook: 'Facebook Reel', link: 'Liên kết' };
  let md = `# Thư viện tài liệu — ${scopeLabel || 'Toàn bộ'}\n\n`;
  md += `> Xuất từ app *Học Vận hành Xuất khẩu End-to-End* · ${new Date().toLocaleString('vi-VN')} · ${items.length} tài liệu\n\n`;
  // nhóm theo session
  const groups = {};
  for (const r of items) (groups[r.sessionId] ||= []).push(r);
  for (const [sid, list] of Object.entries(groups)) {
    const sess = state.byId[sid];
    md += `\n## ${sess ? sess.title_vi : sid}\n\n`;
    for (const r of list) {
      md += `### ${r.title}\n`;
      md += `- **Loại:** ${typeLabel[r.type] || r.type}\n`;
      if (r.url) md += `- **Nguồn:** ${r.url.startsWith('/') ? origin + r.url : r.url}\n`;
      if (r.tags?.length) md += `- **Tags:** ${r.tags.map(t => '#' + t).join(' ')}\n`;
      if (r.note) md += `\n${r.note}\n`;
      md += `\n`;
    }
  }
  const blob = new Blob([md], { type: 'text/markdown;charset=utf-8' });
  const a = el('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

// ---------- Settings ----------
async function openSettings() {
  const s = await fetch('/api/settings').then(r => r.json());
  $('#modelSelect').value = s.model || 'gpt-4o-mini';
  $('#apiKeyInput').value = '';
  $('#apiKeyInput').placeholder = s.hasKey ? '•••••• (đã lưu, nhập để thay)' : 'sk-...';
  $('#settingsStatus').innerHTML = s.hasKey
    ? `✅ Đã có key (${s.keySource === 'env' ? 'từ file .env' : 'đã lưu'}).`
    : '⚠️ Chưa có key.';
  showModal('#settingsModal');
}

// ---------- Modal helpers & global UI ----------
function showModal(sel) { $(sel).hidden = false; }
function hideModal(sel) { $(sel).hidden = true; }
function bindGlobalUI() {
  const brand = $('.brand'); if (brand) { brand.style.cursor = 'pointer'; brand.onclick = openHome; }
  $('#btnLibrary').onclick = openLibrary;
  $('#btnSettings').onclick = openSettings;
  $('#btnTheme').onclick = () => applyTheme(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark');
  $$('[data-close]').forEach(b => b.onclick = e => e.target.closest('.modal-backdrop').hidden = true);
  $$('.modal-backdrop').forEach(m => m.addEventListener('click', e => { if (e.target === m) m.hidden = true; }));
  $('#sessionSearch').addEventListener('input', e => renderNav(e.target.value));

  // library filters
  ['#libSearch', '#libTypeFilter', '#libSessionFilter'].forEach(s =>
    $(s).addEventListener('input', debounce(loadLibraryGrid, 250)));

  // add-resource type picker
  $$('#typePicker button').forEach(b => b.onclick = () => setResType(b.dataset.type));

  // add-resource submit
  $('#addResForm').addEventListener('submit', submitAddResource);

  // settings save
  $('#saveSettings').onclick = saveSettings;

  // export markdown (thư viện chung — theo bộ lọc hiện tại)
  $('#btnExportMd').onclick = () => {
    if (!libGridItems.length) { alert('Không có tài liệu nào để xuất.'); return; }
    const sf = $('#libSessionFilter');
    const label = sf.value ? sf.options[sf.selectedIndex].text : 'Toàn bộ thư viện';
    exportMarkdown(libGridItems, 'thu-vien-xuat-khau.md', label);
  };
}

async function submitAddResource(e) {
  e.preventDefault();
  const form = e.target;
  const type = form.type.value;
  const errBox = $('#addResError'); errBox.textContent = '';
  const title = form.title.value.trim();
  const tags = form.tags.value.trim();
  try {
    let created;
    if (type === 'image' || type === 'pdf') {
      const file = form.file.files[0];
      if (!file) throw new Error('Hãy chọn một file.');
      const fd = new FormData();
      fd.append('file', file);
      fd.append('sessionId', addSessionId);
      fd.append('title', title);
      fd.append('note', form.noteExtra.value.trim());
      fd.append('tags', tags);
      const r = await fetch('/api/resources/upload', { method: 'POST', body: fd });
      created = await r.json();
      if (!r.ok) throw new Error(created.error || 'Lỗi upload');
    } else {
      const note = type === 'text' ? form.note.value.trim() : form.noteExtra.value.trim();
      const url = form.url.value.trim();
      const r = await fetch('/api/resources', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: addSessionId, type, title, url, note, tags })
      });
      created = await r.json();
      if (!r.ok) throw new Error(created.error || 'Lỗi lưu');
    }
    hideModal('#addResModal');
    await refreshResourceCounts();
    renderNav($('#sessionSearch').value);
    if (state.tab === 'library') renderSession();
  } catch (err) { errBox.textContent = err.message; }
}

async function saveSettings() {
  const key = $('#apiKeyInput').value.trim();
  const model = $('#modelSelect').value;
  const body = { model };
  if (key) body.openaiKey = key;
  const r = await fetch('/api/settings', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body)
  });
  const d = await r.json();
  $('#settingsStatus').innerHTML = d.hasKey ? '✅ Đã lưu.' : '⚠️ Chưa có key.';
  setTimeout(() => hideModal('#settingsModal'), 600);
}

function applyTheme(t) {
  document.documentElement.dataset.theme = t;
  localStorage.setItem('exp_theme', t);
  $('#btnTheme').textContent = t === 'dark' ? '☀️' : '🌙';
}
function debounce(fn, ms) { let h; return (...a) => { clearTimeout(h); h = setTimeout(() => fn(...a), ms); }; }
