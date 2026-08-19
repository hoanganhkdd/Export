// ===== Render nội dung slide từ giáo án PPTX =====
const esc = s => (s ?? '').replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));

const BLOCK_LABELS = {
  'LÀM CÁI GÌ': 'What exactly you produce',
  'LÀM NHƯ THẾ NÀO': 'The ordered steps — do not skip',
  'LÀM BẰNG CÁCH NÀO': 'Practical technique',
  'CÔNG CỤ LÀ GÌ': 'Free / low-cost tools',
};
const BLOCK_EN = new Set(Object.values(BLOCK_LABELS));
const KICKER_RE = /^(HƯỚNG DẪN THỰC HÀNH|GIAI ĐOẠN|PHẦN \d|PHẦN 10|SECTION|Module \d|BẮT ĐẦU|Slide \d)/i;
const hasDiacritics = s => /[àáảãạăắằẳẵặâấầẩẫậèéẻẽẹêếềểễệìíỉĩịòóỏõọôốồổỗộơớờởỡợùúủũụưứừửữựỳýỷỹỵđ]/i.test(s);
const isStepNum = s => /^\d{1,2}$/.test(s.trim()) && +s <= 30;

export function renderSlide(sl) {
  const lines = (sl.lines || []).filter(l => l.trim());
  if (!lines.length) return null;
  const card = document.createElement('div');
  card.className = 'slide-card';

  let i = 0;
  const out = [];
  out.push(`<span class="slide-num">Slide ${sl.n}</span>`);

  // Kicker + title (first 1-3 lines)
  if (KICKER_RE.test(lines[0])) {
    out.push(`<div class="slide-kicker">${esc(lines[0])}</div>`);
    i = 1;
    // next line(s): VI title then optional EN
    if (lines[i] && !isStepNum(lines[i]) && !BLOCK_LABELS[lines[i]]) {
      const vi = lines[i]; i++;
      let en = '';
      if (lines[i] && !hasDiacritics(lines[i]) && !isStepNum(lines[i]) && !BLOCK_LABELS[lines[i]] && lines[i].length < 80 && !/[.:]$/.test(lines[i])) {
        en = lines[i]; i++;
      }
      out.push(`<div class="slide-h">${esc(vi)}${en ? `<span class="en">${esc(en)}</span>` : ''}</div>`);
    }
  }

  // Skip a standalone slide-number line if present near top
  while (lines[i] && lines[i].trim() === String(sl.n)) i++;

  // Body
  out.push('<div class="slide-body">');
  let tableBuf = [];
  const flushTable = () => {
    if (!tableBuf.length) return;
    const rows = tableBuf.map(r => `<tr>${r.split('|').map(c => `<td>${esc(c.trim())}</td>`).join('')}</tr>`).join('');
    out.push(`<table class="slide-table">${rows}</table>`);
    tableBuf = [];
  };

  for (; i < lines.length; i++) {
    const ln = lines[i].trim();
    if (!ln) continue;

    if (ln.includes(' | ')) { tableBuf.push(ln); continue; }
    flushTable();

    // Block label
    if (BLOCK_LABELS[ln]) {
      out.push(`<div class="block-label">${esc(ln)} · <span style="opacity:.7;font-weight:500">${esc(BLOCK_LABELS[ln])}</span></div>`);
      // skip following EN subtitle if it matches
      if (lines[i + 1] && BLOCK_EN.has(lines[i + 1].trim())) i++;
      continue;
    }
    if (BLOCK_EN.has(ln)) continue; // stray EN subtitle

    // Success / warning callouts
    if (/^✔\s*Xong khi/i.test(ln)) { out.push(`<div class="callout ok">${esc(ln)}</div>`); continue; }
    if (/^(Lưu ý|Note)\s*[::]/i.test(ln)) { out.push(`<div class="callout warn">${esc(ln)}</div>`); continue; }

    // Step number → collect the following content lines
    if (isStepNum(ln)) {
      const parts = [];
      let j = i + 1;
      while (j < lines.length) {
        const nx = lines[j].trim();
        if (isStepNum(nx) || BLOCK_LABELS[nx] || nx.includes(' | ') || /^✔\s*Xong khi/i.test(nx) || /^(Lưu ý|Note)\s*[::]/i.test(nx)) break;
        parts.push(nx); j++;
        if (parts.length >= 4) break; // an toàn
      }
      if (parts.length) {
        out.push(`<div class="step-row"><span class="step-num">${esc(ln)}</span><div>${parts.map(p => bilingual(p)).join('')}</div></div>`);
        i = j - 1;
      } else {
        out.push(`<div class="big-num">${esc(ln)}</div>`);
      }
      continue;
    }

    // Bilingual paragraph pairing (VI then EN)
    const cur = ln;
    const nxt = lines[i + 1]?.trim();
    if (nxt && hasDiacritics(cur) && !hasDiacritics(nxt) && nxt.length < 90 &&
        !isStepNum(nxt) && !BLOCK_LABELS[nxt] && !nxt.includes(' | ') && !/^✔/.test(nxt)) {
      out.push(`<p class="bi">${esc(cur)}<span class="en">${esc(nxt)}</span></p>`);
      i++;
    } else {
      out.push(`<p>${esc(cur)}</p>`);
    }
  }
  flushTable();
  out.push('</div>');
  card.innerHTML = out.join('');
  return card;
}

function bilingual(s) { return `<div>${esc(s)}</div>`; }
