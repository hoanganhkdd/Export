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
  knowCounts: {},
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
  await refreshKnowledgeCounts();
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
      const kcnt = state.knowCounts[s.id] || 0;
      item.innerHTML = `<span class="nav-dot">${done ? '✓' : ''}</span>
        <span>${esc(s.title_vi)}</span>
        ${cnt || kcnt ? `<span class="nav-count">${cnt ? '📎' + cnt : ''}${kcnt ? ' 🧠' + kcnt : ''}</span>` : ''}`;
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
    <div id="planMount"></div>
    <div class="home-modules" id="homeModules"></div>`;

  $('#homeContinue').onclick = () => openSession(next.id);
  $('#homeLibrary').onclick = openLibrary;
  renderPlanCard($('#planMount'), done, total);

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

// ---------- Kế hoạch học tập + phiên đào sâu (localStorage) ----------
const timer = { running: false, startTs: 0, iv: null };
function getPlan() { return Object.assign({ perWeek: 1, dailyMin: 60 }, JSON.parse(localStorage.getItem('exp_plan') || '{}')); }
function savePlan(p) { localStorage.setItem('exp_plan', JSON.stringify(p)); }
function getLog() { return JSON.parse(localStorage.getItem('exp_studylog') || '{}'); }
function saveLog(l) { localStorage.setItem('exp_studylog', JSON.stringify(l)); }
function todayKey() { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; }
function addStudyMinutes(min) { const l = getLog(); l[todayKey()] = (l[todayKey()] || 0) + min; saveLog(l); }
function computeStreak() {
  const l = getLog(); let n = 0; const d = new Date();
  for (;;) {
    const k = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    if ((l[k] || 0) > 0) { n++; d.setDate(d.getDate() - 1); } else break;
  }
  return n;
}
function renderPlanCard(mount, done, total) {
  clearInterval(timer.iv); timer.running = false; timer.startTs = 0;
  const plan = getPlan();
  const remaining = total - done;
  const weeksLeft = plan.perWeek > 0 ? Math.ceil(remaining / plan.perWeek) : '—';
  const finish = new Date(); finish.setDate(finish.getDate() + (typeof weeksLeft === 'number' ? weeksLeft * 7 : 0));
  const weekStages = state.sessions.filter(s => !state.progress[s.id]).slice(0, plan.perWeek);
  const todayMin = Math.round(getLog()[todayKey()] || 0);
  const streak = computeStreak();

  mount.innerHTML = `
  <section class="plan-card">
    <div class="plan-col plan-goal">
      <div class="deep-h">🎯 Mục tiêu học tập</div>
      <label class="plan-field">Mỗi tuần học
        <input type="number" min="1" max="23" id="planPerWeek" value="${plan.perWeek}"> giai đoạn</label>
      <label class="plan-field">Đào sâu mỗi ngày
        <input type="number" min="10" max="480" step="5" id="planDaily" value="${plan.dailyMin}"> phút</label>
      <div class="plan-est muted small">Còn <b>${remaining}</b> giai đoạn · ~<b>${weeksLeft}</b> tuần · dự kiến xong <b>${finish.toLocaleDateString('vi-VN')}</b></div>
      <div class="plan-week">
        <div class="muted small">📌 Tuần này nên học:</div>
        <div class="plan-chips" id="planChips">${weekStages.length ? weekStages.map(s => `<button class="home-session" data-go="${s.id}"><span class="hs-title">${esc(s.title_vi)}</span></button>`).join('') : '<span class="muted small">Đã hoàn thành tất cả 🎉</span>'}</div>
      </div>
    </div>
    <div class="plan-col plan-focus">
      <div class="deep-h">⏱️ Phiên đào sâu hôm nay</div>
      <div class="timer-display" id="timerDisplay">00:00</div>
      <div class="timer-actions">
        <button class="btn primary" id="timerToggle">▶ Bắt đầu</button>
        <button class="btn" id="timerReset" title="Lưu & kết thúc phiên">■ Kết thúc</button>
      </div>
      <div class="plan-today">
        <div class="today-bar"><span id="todayFill" style="width:${Math.min(100, todayMin / plan.dailyMin * 100)}%"></span></div>
        <div class="muted small">Hôm nay: <b id="todayMin">${todayMin}</b>/${plan.dailyMin} phút · 🔥 chuỗi <b>${streak}</b> ngày</div>
      </div>
    </div>
  </section>`;

  const perWeek = $('#planPerWeek', mount), daily = $('#planDaily', mount);
  const persist = () => { const p = getPlan(); p.perWeek = Math.max(1, +perWeek.value || 1); p.dailyMin = Math.max(10, +daily.value || 60); savePlan(p); renderPlanCard(mount, done, total); };
  perWeek.onchange = persist; daily.onchange = persist;
  $$('#planChips [data-go]', mount).forEach(b => b.onclick = () => openSession(b.dataset.go));

  const disp = $('#timerDisplay', mount), toggle = $('#timerToggle', mount);
  const tick = () => {
    const sec = Math.floor((Date.now() - timer.startTs) / 1000);
    disp.textContent = `${String(Math.floor(sec / 60)).padStart(2, '0')}:${String(sec % 60).padStart(2, '0')}`;
  };
  const flush = () => {
    if (!timer.running) return 0;
    const min = (Date.now() - timer.startTs) / 60000;
    addStudyMinutes(min); timer.running = false; clearInterval(timer.iv); return min;
  };
  toggle.onclick = () => {
    if (!timer.running) { timer.running = true; timer.startTs = Date.now(); timer.iv = setInterval(tick, 1000); tick(); toggle.textContent = '⏸ Tạm dừng'; toggle.classList.remove('primary'); }
    else { flush(); toggle.textContent = '▶ Tiếp tục'; toggle.classList.add('primary'); refreshToday(mount, plan); }
  };
  $('#timerReset', mount).onclick = () => { flush(); disp.textContent = '00:00'; toggle.textContent = '▶ Bắt đầu'; toggle.classList.add('primary'); refreshToday(mount, plan); };
}
function refreshToday(mount, plan) {
  const todayMin = Math.round(getLog()[todayKey()] || 0);
  const tm = $('#todayMin', mount); if (tm) tm.textContent = todayMin;
  const tf = $('#todayFill', mount); if (tf) tf.style.width = Math.min(100, todayMin / plan.dailyMin * 100) + '%';
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
    <button class="tab ${state.tab === 'deep' ? 'active' : ''}" data-tab="deep">🧠 Đào sâu<span class="tab-badge" id="deepTabCount">${state.knowCounts[s.id] || 0}</span></button>
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
  else if (state.tab === 'deep') renderDeepTab(body, s);
  else if (state.tab === 'library') renderLibraryTab(body, s);
  else renderAITab(body, s);
}

// ---------- Lesson ----------
function renderLesson(body, s) {
  const bar = el('div', 'listen-bar');
  bar.innerHTML = `<button class="btn primary" id="btnListen">🎧 Nghe bài (chế độ ngồi xe)</button>
    <span class="muted small">Đọc to nội dung bài học — rảnh tay khi đi đường.</span>`;
  body.append(bar);
  $('#btnListen', bar).onclick = () => startListen(s);

  // Cập nhật tư liệu nhanh ngay tại giai đoạn: YouTube / Reel / PDF / Ảnh / Text
  const quick = el('div', 'quick-add');
  quick.innerHTML = `<span class="qa-label">➕ Cập nhật tư liệu cho giai đoạn này:</span>
    <button class="chip-add" data-t="youtube">▶️ YouTube</button>
    <button class="chip-add" data-t="facebook">🎬 Reel</button>
    <button class="chip-add" data-t="pdf">📄 PDF</button>
    <button class="chip-add" data-t="image">🖼️ Ảnh</button>
    <button class="chip-add" data-t="text">📝 Text</button>
    <button class="chip-add" data-t="link">🔗 Link</button>`;
  body.append(quick);
  $$('.chip-add', quick).forEach(b => b.onclick = () => openAddModal(s.id, s.title_vi, b.dataset.t));

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
  expBtn.onclick = async () => exportMarkdown(items, await fetchKnowledge(s.id), `hoc-tap_${s.id}.md`, s.title_vi);
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
function openAddModal(sessionId, sessionTitle, type = 'text') {
  addSessionId = sessionId;
  $('#addTarget').innerHTML = `Sẽ lưu vào session: <b>${esc(sessionTitle || 'Chung')}</b>`;
  $('#addResError').textContent = '';
  $('#addResForm').reset();
  setResType(type);
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

// ================= ĐÀO SÂU: 3 bảng kiến thức song song =================
async function fetchKnowledge(session) {
  const d = await fetch('/api/knowledge?session=' + encodeURIComponent(session)).then(r => r.json()).catch(() => ({ items: [] }));
  return d.items || [];
}
async function refreshKnowledgeCounts() {
  const all = await fetch('/api/knowledge').then(r => r.json()).catch(() => ({ items: [] }));
  const c = {};
  for (const k of all.items || []) c[k.sessionId] = (c[k.sessionId] || 0) + 1;
  state.knowCounts = c;
}
function bumpKnowCount(sid, delta) {
  state.knowCounts[sid] = Math.max(0, (state.knowCounts[sid] || 0) + delta);
  const badge = $('#deepTabCount');
  if (badge) badge.textContent = state.knowCounts[sid] || 0;
  renderNav($('#sessionSearch').value);
}
async function saveKnowledgeItem(payload) {
  const r = await fetch('/api/knowledge', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
  const d = await r.json(); if (!r.ok) throw new Error(d.error || 'Lỗi lưu'); return d.item;
}

async function renderDeepTab(body, s) {
  body.innerHTML = `<div class="muted small deep-intro">Ba bảng song song để đào sâu <b>${esc(s.title_vi)}</b>. Kết quả AI có nguồn — bạn <b>💾 Lưu</b> vào kho kiến thức hoặc <b>✕ Bỏ</b>.</div>`;
  const grid = el('div', 'deep-grid');
  body.append(grid);
  const all = await fetchKnowledge(s.id);
  grid.append(lessonPanel(s));
  grid.append(genPanel(s, 'example', '🌍 Ví dụ thực tế', 'Case/tình huống thật, trích nguồn web', all.filter(k => k.kind === 'example')));
  grid.append(genPanel(s, 'tool', '🧰 Công cụ / Thư viện', 'Công cụ, website nên dùng cho phần này', all.filter(k => k.kind === 'tool')));
  grid.append(qaPanel(s, all.filter(k => k.kind === 'qa')));
}

function lessonPanel(s) {
  const panel = el('div', 'deep-panel lesson-panel');
  panel.innerHTML = `<div class="deep-h">📖 Nội dung bài học<span class="muted small">Đối chiếu kiến thức ngay khi đào sâu</span></div>`;
  const scroll = el('div', 'lesson-scroll');
  for (const sl of s.slides) { const c = renderSlide(sl); if (c) scroll.append(c); }
  panel.append(scroll);
  return panel;
}

function savedRow(item, savedBox) {
  const row = el('div', 'know-row');
  row.innerHTML = `
    ${item.kind === 'qa' && item.question ? `<div class="know-q">❓ ${esc(item.question)}</div>` : ''}
    ${item.title ? `<div class="know-title">${esc(item.title)}</div>` : ''}
    <div class="know-content">${formatMarkdown(item.content)}</div>
    <div class="know-foot">
      ${item.source ? `<a href="${esc(item.source)}" target="_blank" rel="noopener" class="res-src">🔗 Nguồn</a>` : '<span></span>'}
      <button class="btn danger-text" title="Xóa khỏi kho">🗑</button>
    </div>`;
  $('.danger-text', row).onclick = async () => {
    if (!confirm('Xóa mục kiến thức này?')) return;
    await fetch('/api/knowledge/' + item.id, { method: 'DELETE' });
    bumpKnowCount(item.sessionId, -1);
    row.remove();
  };
  return row;
}

function candidateCard(cand, kind, s, savedBox, extra = {}) {
  const card = el('div', 'cand-card');
  card.innerHTML = `
    ${extra.question ? `<div class="know-q">❓ ${esc(extra.question)}</div>` : ''}
    ${cand.title ? `<div class="know-title">${esc(cand.title)}</div>` : ''}
    <div class="know-content">${formatMarkdown(cand.content || '')}</div>
    <div class="know-foot">
      ${cand.source ? `<a href="${esc(cand.source)}" target="_blank" rel="noopener" class="res-src">🔗 Nguồn</a>` : '<span class="muted small">không có nguồn</span>'}
      <span class="cand-actions">
        <button class="btn sm primary act-save">💾 Lưu</button>
        <button class="btn sm act-drop">✕ Bỏ</button>
      </span>
    </div>`;
  $('.act-drop', card).onclick = () => card.remove();
  $('.act-save', card).onclick = async () => {
    $('.act-save', card).disabled = true;
    try {
      const item = await saveKnowledgeItem({ sessionId: s.id, kind, title: cand.title || '', content: cand.content || '', source: cand.source || '', question: extra.question || '' });
      savedBox.prepend(savedRow(item, savedBox));
      bumpKnowCount(s.id, +1);
      card.remove();
    } catch (e) { alert(e.message); $('.act-save', card).disabled = false; }
  };
  return card;
}

function genPanel(s, kind, title, sub, saved) {
  const panel = el('div', 'deep-panel');
  panel.innerHTML = `<div class="deep-h">${title}<span class="muted small">${sub}</span></div>
    <button class="btn sm gen-btn">✨ Gợi ý bằng AI (có nguồn)</button>
    <div class="cand-area"></div>
    <div class="saved-area"></div>`;
  const savedBox = $('.saved-area', panel), candBox = $('.cand-area', panel);
  saved.forEach(it => savedBox.append(savedRow(it, savedBox)));
  $('.gen-btn', panel).onclick = async () => {
    candBox.innerHTML = `<div class="insight-loading">⏳ AI đang tìm ${kind === 'example' ? 'ví dụ thực tế' : 'công cụ'} có nguồn…</div>`;
    try {
      const r = await fetch('/api/knowledge/generate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sessionId: s.id, kind }) });
      const d = await r.json();
      candBox.innerHTML = '';
      if (!r.ok) { candBox.innerHTML = `<div class="insight-error">⚠️ ${esc(d.error)}</div>`; return; }
      if (!d.candidates?.length) { candBox.innerHTML = `<div class="muted small">Không có gợi ý.</div>`; return; }
      d.candidates.forEach(c => candBox.append(candidateCard(c, kind, s, savedBox)));
    } catch { candBox.innerHTML = `<div class="insight-error">⚠️ Không kết nối được máy chủ.</div>`; }
  };
  return panel;
}

function qaPanel(s, saved) {
  const panel = el('div', 'deep-panel');
  panel.innerHTML = `<div class="deep-h">🤔 Hỏi AI tra cứu<span class="muted small">Tra cứu theo đúng ngữ cảnh bài học</span></div>
    <textarea class="qa-input" rows="2" placeholder="Nhập câu hỏi tra cứu…"></textarea>
    <label class="switch small"><input type="checkbox" class="qa-web"> 🔎 Tìm web (kèm nguồn)</label>
    <button class="btn sm qa-ask">🔎 Tra cứu</button>
    <div class="cand-area"></div>
    <div class="saved-area"></div>`;
  const savedBox = $('.saved-area', panel), candBox = $('.cand-area', panel);
  saved.forEach(it => savedBox.append(savedRow(it, savedBox)));
  const ask = async () => {
    const q = $('.qa-input', panel).value.trim();
    if (!q) return;
    candBox.innerHTML = `<div class="insight-loading">⏳ Đang tra cứu…</div>`;
    try {
      const r = await fetch('/api/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: q, context: `${s.title_vi} (${s.title_en}). ${s.subtitle}`, webSearch: $('.qa-web', panel).checked }) });
      const d = await r.json();
      candBox.innerHTML = '';
      if (!r.ok) { candBox.innerHTML = `<div class="insight-error">⚠️ ${esc(d.error)}</div>`; return; }
      const src = d.citations?.[0]?.url || '';
      candBox.append(candidateCard({ title: '', content: d.answer || '', source: src }, 'qa', s, savedBox, { question: q }));
    } catch { candBox.innerHTML = `<div class="insight-error">⚠️ Không kết nối được máy chủ.</div>`; }
  };
  $('.qa-ask', panel).onclick = ask;
  $('.qa-input', panel).addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); ask(); } });
  return panel;
}

// ================= NGHE BÀI (Text-to-Speech, chế độ ngồi xe) =================
const player = { chunks: [], idx: 0, playing: false, session: null, rate: 1, voice: null, autoNext: true, keepAlive: null };
const _viRe = /[àáảãạăắằẳẵặâấầẩẫậèéẻẽẹêếềểễệìíỉĩịòóỏõọôốồổỗộơớờởỡợùúủũụưứừửữựỳýỷỹỵđ]/i;
function buildSpeechChunks(s) {
  const enSub = new Set(['What exactly you produce', 'The ordered steps — do not skip', 'Practical technique', 'Free / low-cost tools']);
  const out = [`${s.title_vi}. ${s.subtitle}`];
  for (const sl of s.slides) {
    for (let ln of (sl.lines || [])) {
      ln = ln.trim();
      if (!ln || /^\d{1,2}$/.test(ln) || enSub.has(ln)) continue;
      if (ln.includes(' | ')) ln = ln.replace(/\s*\|\s*/g, ', ');
      if (!_viRe.test(ln) && ln.length < 60) continue; // bỏ gloss tiếng Anh ngắn
      ln.split(/(?<=[.!?…])\s+/).forEach(x => { const t = x.trim(); if (t.length > 1) out.push(t); });
    }
  }
  return out;
}
function nextSessionId(id) {
  const i = state.sessions.findIndex(x => x.id === id);
  return i >= 0 && i < state.sessions.length - 1 ? state.sessions[i + 1].id : null;
}
function startListen(s) {
  if (!('speechSynthesis' in window)) { alert('Trình duyệt không hỗ trợ đọc giọng nói. Hãy dùng Chrome/Edge.'); return; }
  player.session = s; player.chunks = buildSpeechChunks(s); player.idx = 0;
  ensurePlayerUI(); $('#miniPlayer').classList.add('show');
  playSpeech();
}
function speakCurrent() {
  window.speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(player.chunks[player.idx]);
  u.lang = 'vi-VN'; u.rate = player.rate;
  if (player.voice) u.voice = player.voice;
  u.onend = () => { if (player.playing) nextSpeech(true); };
  window.speechSynthesis.speak(u);
  updatePlayerUI();
}
function playSpeech() {
  player.playing = true;
  if (window.speechSynthesis.paused) window.speechSynthesis.resume(); else speakCurrent();
  clearInterval(player.keepAlive);
  player.keepAlive = setInterval(() => { if (player.playing && !window.speechSynthesis.speaking) return; if (player.playing) window.speechSynthesis.resume(); }, 8000);
  setPlayIcon();
}
function pauseSpeech() { player.playing = false; window.speechSynthesis.pause(); clearInterval(player.keepAlive); setPlayIcon(); }
function stopSpeech() { player.playing = false; window.speechSynthesis.cancel(); clearInterval(player.keepAlive); $('#miniPlayer')?.classList.remove('show'); }
function nextSpeech(auto) {
  if (player.idx < player.chunks.length - 1) { player.idx++; if (player.playing) speakCurrent(); else updatePlayerUI(); }
  else {
    const ni = player.autoNext ? nextSessionId(player.session.id) : null;
    if (ni) { const ns = state.byId[ni]; player.session = ns; player.chunks = buildSpeechChunks(ns); player.idx = 0; if (player.playing) speakCurrent(); else updatePlayerUI(); }
    else { player.playing = false; window.speechSynthesis.cancel(); clearInterval(player.keepAlive); setPlayIcon(); }
  }
}
function prevSpeech() { if (player.idx > 0) { player.idx--; if (player.playing) speakCurrent(); else updatePlayerUI(); } }
function setPlayIcon() { const b = $('#pp'); if (b) b.textContent = player.playing ? '⏸' : '▶️'; }
function updatePlayerUI() {
  const t = $('#playerText'); if (t) t.textContent = player.chunks[player.idx] || '';
  const meta = $('#playerMeta'); if (meta) meta.textContent = `${player.session.title_vi} · ${player.idx + 1}/${player.chunks.length}`;
}
function loadVoices() {
  const sel = $('#voiceSel'); if (!sel) return;
  const voices = window.speechSynthesis.getVoices();
  const vi = voices.filter(v => /vi/i.test(v.lang));
  const list = (vi.length ? vi : voices);
  sel.innerHTML = list.map((v, i) => `<option value="${voices.indexOf(v)}">${esc(v.name)} (${v.lang})</option>`).join('') || '<option>Mặc định</option>';
  if (vi.length && !player.voice) player.voice = vi[0];
}
function ensurePlayerUI() {
  if ($('#miniPlayer')) return;
  const p = el('div', 'mini-player'); p.id = 'miniPlayer';
  p.innerHTML = `
    <div class="mp-main">
      <div class="mp-meta" id="playerMeta"></div>
      <div class="mp-text" id="playerText"></div>
    </div>
    <div class="mp-ctrl">
      <button class="mp-btn" id="mpPrev" title="Câu trước">⏮</button>
      <button class="mp-btn big" id="pp" title="Phát/Dừng">▶️</button>
      <button class="mp-btn" id="mpNext" title="Câu sau">⏭</button>
      <select class="mp-sel" id="rateSel" title="Tốc độ">
        <option value="0.8">0.8×</option><option value="1" selected>1×</option>
        <option value="1.2">1.2×</option><option value="1.5">1.5×</option>
      </select>
      <select class="mp-sel" id="voiceSel" title="Giọng đọc"></select>
      <label class="switch small" title="Tự đọc tiếp session sau"><input type="checkbox" id="autoNext" checked> tiếp</label>
      <button class="mp-btn" id="mpClose" title="Đóng">✕</button>
    </div>`;
  document.body.append(p);
  $('#pp', p).onclick = () => player.playing ? pauseSpeech() : playSpeech();
  $('#mpPrev', p).onclick = prevSpeech;
  $('#mpNext', p).onclick = () => nextSpeech(false);
  $('#mpClose', p).onclick = stopSpeech;
  $('#rateSel', p).onchange = e => { player.rate = +e.target.value; if (player.playing) speakCurrent(); };
  $('#autoNext', p).onchange = e => player.autoNext = e.target.checked;
  $('#voiceSel', p).onchange = e => { const vs = window.speechSynthesis.getVoices(); player.voice = vs[+e.target.value] || null; if (player.playing) speakCurrent(); };
  loadVoices();
  if (window.speechSynthesis.onvoiceschanged !== undefined) window.speechSynthesis.onvoiceschanged = loadVoices;
}

// ---------- Export Markdown ----------
let libGridItems = [];
function exportMarkdown(items, knowledge, filename, scopeLabel) {
  const origin = location.origin;
  const typeLabel = { text: 'Ghi chú', image: 'Ảnh', pdf: 'PDF', youtube: 'YouTube', facebook: 'Facebook Reel', link: 'Liên kết' };
  const kindLabel = { example: '🌍 Ví dụ thực tế', tool: '🧰 Công cụ', qa: '🤔 Hỏi AI' };
  let md = `# Học Vận hành Xuất khẩu — ${scopeLabel || 'Toàn bộ'}\n\n`;
  md += `> Xuất từ app *Học Vận hành Xuất khẩu End-to-End* · ${new Date().toLocaleString('vi-VN')} · ${items.length} tài liệu · ${(knowledge || []).length} mục kiến thức\n\n`;

  if (items.length) {
    md += `# 📚 Thư viện tài liệu\n`;
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
        if (r.insight?.text) md += `\n> ✨ **Insight:** ${r.insight.text.replace(/\n/g, '\n> ')}\n`;
        md += `\n`;
      }
    }
  }

  if (knowledge && knowledge.length) {
    md += `\n# 🧠 Kho kiến thức đào sâu\n`;
    const kg = {};
    for (const k of knowledge) (kg[k.sessionId] ||= []).push(k);
    for (const [sid, list] of Object.entries(kg)) {
      const sess = state.byId[sid];
      md += `\n## ${sess ? sess.title_vi : sid}\n\n`;
      for (const k of list) {
        md += `### ${kindLabel[k.kind] || ''} ${k.title || (k.question ? 'Hỏi AI' : '')}\n`;
        if (k.question) md += `- **Câu hỏi:** ${k.question}\n`;
        if (k.source) md += `- **Nguồn:** ${k.source}\n`;
        if (k.content) md += `\n${k.content}\n`;
        md += `\n`;
      }
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
  // Định tuyến theo hash (hỗ trợ nút back/forward của trình duyệt)
  window.addEventListener('hashchange', () => {
    const id = location.hash.replace('#', '') || 'home';
    if (id === state.current) return;
    if (id === 'home') openHome();
    else if (state.byId[id]) openSession(id);
  });
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

  // export markdown (thư viện chung — theo bộ lọc hiện tại, kèm kho kiến thức)
  $('#btnExportMd').onclick = async () => {
    const sf = $('#libSessionFilter');
    const label = sf.value ? sf.options[sf.selectedIndex].text : 'Toàn bộ thư viện';
    const kn = sf.value
      ? await fetchKnowledge(sf.value)
      : await fetch('/api/knowledge').then(r => r.json()).then(d => d.items || []).catch(() => []);
    if (!libGridItems.length && !kn.length) { alert('Không có nội dung nào để xuất.'); return; }
    exportMarkdown(libGridItems, kn, 'hoc-tap-xuat-khau.md', label);
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
