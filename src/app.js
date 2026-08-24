import { RAW_COURSE, SOURCE_INFO } from './data.js';

const STORAGE = {
  progress: 'm12hub:progress',
  favorites: 'm12hub:favorites',
  notes: 'm12hub:notes',
  lastLesson: 'm12hub:last-lesson',
  rawOverride: 'm12hub:raw-course',
  syncEndpoint: 'm12hub:sync-endpoint',
  sourceUrl: 'm12hub:source-url'
};

const RESOURCE_META = {
  V: { label: 'Bài giảng', icon: '▶', type: 'video' },
  D: { label: 'Tài liệu / Đề', icon: '▤', type: 'document' },
  H: { label: 'BTVN', icon: '✎', type: 'homework' },
  A: { label: 'Đáp án', icon: '✓', type: 'answer' },
  S: { label: 'Chữa bài', icon: '↻', type: 'solution' }
};

const state = {
  raw: localStorage.getItem(STORAGE.rawOverride) || RAW_COURSE,
  course: null,
  lesson: null,
  resourceKey: null,
  navMode: 'course',
  query: '',
  progress: readJson(STORAGE.progress, {}),
  favorites: readJson(STORAGE.favorites, {}),
  notes: readJson(STORAGE.notes, {}),
  youtubePlayer: null,
  youtubeReadyPromise: null
};

const els = Object.fromEntries([
  'sidebar','closeSidebar','openSidebar','sourcePill','searchInput','courseNav','importBtn','breadcrumb','lessonTitle',
  'globalProgressText','globalProgressBar','favoriteBtn','resourceTabs','openExternal','viewer','lessonMetaCard','lessonGroupLabel',
  'lessonMetaTitle','completeBtn','resourceSummary','notesCard','captureTimeBtn','noteTime','noteText','noteTag','saveNoteBtn','notesList',
  'progressPercent','progressBar','doneCount','totalCount','favoriteCount','aiContext','aiQuestion','askAiBtn','aiOutput','importDialog',
  'sheetUrlInput','syncEndpointInput','syncSheetBtn','pasteImport','applyPasteBtn','fileImport','applyFileBtn','importStatus','toast'
].map(id => [id, document.getElementById(id)]));

boot();

function boot() {
  state.course = parseCourse(state.raw);
  const saved = localStorage.getItem(STORAGE.lastLesson);
  state.lesson = findLesson(saved) || state.course.lessons[0] || null;
  bindEvents();
  renderAll();
  if (state.lesson) selectLesson(state.lesson.id, false);
}

function parseCourse(raw) {
  const chapters = [];
  const lessons = [];
  let chapter = null;
  let group = null;
  let chapterCounter = 0;
  let groupCounter = 0;
  let lessonCounter = 0;

  for (const sourceLine of raw.split(/\r?\n/)) {
    const line = sourceLine.trim();
    if (!line || line.startsWith('#')) continue;
    const parts = line.split('|').map(s => s.trim());
    const kind = parts[0];

    if (kind === 'C') {
      chapterCounter += 1;
      group = null;
      chapter = {
        id: `chapter-${chapterCounter}`,
        title: parts[1] || `Chương ${chapterCounter}`,
        subtitle: parts.slice(2).join(' | '),
        groups: [],
        lessons: []
      };
      chapters.push(chapter);
      continue;
    }

    if (kind === 'B') {
      if (!chapter) continue;
      groupCounter += 1;
      group = {
        id: `group-${groupCounter}`,
        title: parts.slice(1).join(' | '),
        lessons: []
      };
      chapter.groups.push(group);
      continue;
    }

    if (kind === 'L') {
      if (!chapter) continue;
      if (!group) {
        groupCounter += 1;
        group = { id: `group-${groupCounter}`, title: 'Bài học', lessons: [] };
        chapter.groups.push(group);
      }

      const firstResource = parts.findIndex((p, i) => i > 0 && /^[VDHSA]=https?:\/\//.test(p));
      const titleEnd = firstResource === -1 ? parts.length : firstResource;
      const title = parts.slice(1, titleEnd).join(' | ');
      const resources = {};
      for (const token of parts.slice(titleEnd)) {
        const match = token.match(/^([VDHSA])=(https?:\/\/.+)$/);
        if (match) resources[match[1]] = match[2];
      }

      lessonCounter += 1;
      const lesson = {
        id: `lesson-${lessonCounter}`,
        title,
        chapterId: chapter.id,
        chapterTitle: chapter.title,
        chapterSubtitle: chapter.subtitle,
        groupId: group.id,
        groupTitle: group.title,
        resources
      };
      group.lessons.push(lesson);
      chapter.lessons.push(lesson);
      lessons.push(lesson);
    }
  }

  return { chapters, lessons };
}

function bindEvents() {
  els.searchInput.addEventListener('input', e => {
    state.query = e.target.value.trim().toLowerCase();
    renderNavigation();
  });

  document.querySelectorAll('[data-nav]').forEach(btn => btn.addEventListener('click', () => {
    state.navMode = btn.dataset.nav;
    document.querySelectorAll('[data-nav]').forEach(x => x.classList.toggle('active', x === btn));
    renderNavigation();
  }));

  els.openSidebar.addEventListener('click', () => els.sidebar.classList.add('open'));
  els.closeSidebar.addEventListener('click', () => els.sidebar.classList.remove('open'));
  els.favoriteBtn.addEventListener('click', toggleFavorite);
  els.completeBtn.addEventListener('click', toggleComplete);
  els.captureTimeBtn.addEventListener('click', captureVideoTime);
  els.saveNoteBtn.addEventListener('click', saveNote);
  els.importBtn.addEventListener('click', openImportDialog);

  document.querySelectorAll('[data-import-mode]').forEach(btn => btn.addEventListener('click', () => {
    document.querySelectorAll('[data-import-mode]').forEach(x => x.classList.toggle('active', x === btn));
    document.querySelectorAll('[data-pane]').forEach(p => p.hidden = p.dataset.pane !== btn.dataset.importMode);
  }));

  els.applyPasteBtn.addEventListener('click', () => applyImportedRaw(els.pasteImport.value));
  els.applyFileBtn.addEventListener('click', importFile);
  els.syncSheetBtn.addEventListener('click', syncFromEndpoint);

  document.querySelectorAll('[data-ai-action]').forEach(btn => btn.addEventListener('click', () => runAi(btn.dataset.aiAction)));
  els.askAiBtn.addEventListener('click', () => runAi('question'));
}

function renderAll() {
  els.sourcePill.textContent = `Nguồn: ${SOURCE_INFO.title}`;
  renderNavigation();
  renderProgress();
}

function renderNavigation() {
  els.courseNav.innerHTML = '';
  const query = state.query;
  const favoriteOnly = state.navMode === 'favorites';

  for (const chapter of state.course.chapters) {
    const visibleGroups = chapter.groups.map(group => ({
      ...group,
      lessons: group.lessons.filter(lesson => {
        const matchesQuery = !query || `${lesson.title} ${group.title} ${chapter.title} ${chapter.subtitle}`.toLowerCase().includes(query);
        const matchesFavorite = !favoriteOnly || Boolean(state.favorites[lesson.id]);
        return matchesQuery && matchesFavorite;
      })
    })).filter(group => group.lessons.length);

    if (!visibleGroups.length) continue;

    const block = document.createElement('section');
    block.className = 'chapter-block';
    const chapterDone = chapter.lessons.filter(l => state.progress[l.id]).length;
    block.innerHTML = `<button class="chapter-head" type="button"><span class="chapter-title"><span>${escapeHtml(chapter.title)}</span><small>${escapeHtml(chapter.subtitle || '')}</small></span><small>${chapterDone}/${chapter.lessons.length}</small></button>`;

    const content = document.createElement('div');
    for (const group of visibleGroups) {
      const g = document.createElement('div');
      g.className = 'group-block';
      const gt = document.createElement('div');
      gt.className = 'group-title';
      gt.textContent = group.title;
      g.appendChild(gt);

      for (const lesson of group.lessons) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = `lesson-link${state.lesson?.id === lesson.id ? ' active' : ''}${state.progress[lesson.id] ? ' done' : ''}`;
        btn.innerHTML = `<i class="lesson-dot"></i><span>${escapeHtml(lesson.title)}</span>`;
        btn.addEventListener('click', () => selectLesson(lesson.id));
        g.appendChild(btn);
      }
      content.appendChild(g);
    }
    block.appendChild(content);
    els.courseNav.appendChild(block);
  }

  if (!els.courseNav.children.length) {
    const empty = document.createElement('div');
    empty.style.cssText = 'padding:24px 8px;color:#94a3b8;font-size:13px;line-height:1.5';
    empty.textContent = favoriteOnly ? 'Chưa có bài nào được lưu.' : 'Không tìm thấy bài phù hợp.';
    els.courseNav.appendChild(empty);
  }
}

function selectLesson(id, closeMobile = true) {
  const lesson = findLesson(id);
  if (!lesson) return;
  state.lesson = lesson;
  localStorage.setItem(STORAGE.lastLesson, lesson.id);
  const keys = Object.keys(lesson.resources);
  state.resourceKey = keys.includes('V') ? 'V' : keys[0] || null;
  if (closeMobile) els.sidebar.classList.remove('open');
  renderNavigation();
  renderLesson();
}

function renderLesson() {
  const lesson = state.lesson;
  if (!lesson) return;

  els.breadcrumb.textContent = `${lesson.chapterTitle} / ${lesson.groupTitle}`;
  els.lessonTitle.textContent = lesson.title;
  els.lessonGroupLabel.textContent = lesson.groupTitle;
  els.lessonMetaTitle.textContent = lesson.title;
  els.lessonMetaCard.hidden = false;
  els.notesCard.hidden = false;
  els.favoriteBtn.textContent = state.favorites[lesson.id] ? '★' : '☆';
  els.favoriteBtn.setAttribute('aria-pressed', state.favorites[lesson.id] ? 'true' : 'false');
  els.completeBtn.textContent = state.progress[lesson.id] ? '↩ Đánh dấu chưa xong' : '✓ Đánh dấu hoàn thành';
  els.aiContext.textContent = `${lesson.chapterTitle} • ${lesson.groupTitle} • ${lesson.title}`;

  renderResourceTabs();
  renderResourceSummary();
  renderViewer();
  renderNotes();
  renderProgress();
}

function renderResourceTabs() {
  els.resourceTabs.innerHTML = '';
  const entries = Object.entries(state.lesson.resources);
  for (const [key] of entries) {
    const meta = RESOURCE_META[key];
    const btn = document.createElement('button');
    btn.className = `resource-tab${state.resourceKey === key ? ' active' : ''}`;
    btn.type = 'button';
    btn.textContent = `${meta.icon} ${meta.label}`;
    btn.addEventListener('click', () => {
      state.resourceKey = key;
      renderResourceTabs();
      renderViewer();
    });
    els.resourceTabs.appendChild(btn);
  }
}

function renderResourceSummary() {
  els.resourceSummary.innerHTML = '';
  for (const key of Object.keys(state.lesson.resources)) {
    const badge = document.createElement('span');
    badge.className = 'resource-badge';
    badge.textContent = `${RESOURCE_META[key].icon} ${RESOURCE_META[key].label}`;
    els.resourceSummary.appendChild(badge);
  }
}

async function renderViewer() {
  const url = state.lesson?.resources[state.resourceKey];
  els.viewer.innerHTML = '';
  state.youtubePlayer = null;
  if (!url) {
    els.openExternal.href = '#';
    els.viewer.innerHTML = '<div class="empty-viewer"><h2>Không có học liệu</h2><p>Tiết này chưa có tài nguyên tương ứng.</p></div>';
    return;
  }
  els.openExternal.href = url;

  if (isYouTube(url)) {
    const videoId = getYouTubeId(url);
    if (!videoId) return renderGenericLink(url);
    const mount = document.createElement('div');
    mount.id = 'youtube-player';
    mount.style.cssText = 'width:100%;height:100%';
    els.viewer.appendChild(mount);
    try {
      await ensureYouTubeApi();
      if (state.lesson?.resources[state.resourceKey] !== url) return;
      state.youtubePlayer = new window.YT.Player('youtube-player', {
        videoId,
        width: '100%',
        height: '100%',
        playerVars: { rel: 0, modestbranding: 1, playsinline: 1 }
      });
    } catch {
      const iframe = document.createElement('iframe');
      iframe.src = `https://www.youtube.com/embed/${encodeURIComponent(videoId)}`;
      iframe.allow = 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share';
      iframe.allowFullscreen = true;
      els.viewer.replaceChildren(iframe);
    }
    return;
  }

  if (isDriveFile(url)) {
    const iframe = document.createElement('iframe');
    iframe.src = drivePreviewUrl(url);
    iframe.allow = 'autoplay';
    els.viewer.appendChild(iframe);
    return;
  }

  renderGenericLink(url);
}

function renderGenericLink(url) {
  els.viewer.innerHTML = '';
  const box = document.createElement('div');
  box.className = 'empty-viewer';
  box.innerHTML = '<div class="empty-icon">↗</div><h2>Mở học liệu bên ngoài</h2><p>Tài nguyên này không hỗ trợ nhúng ổn định. Dùng nút “Mở tab mới” để xem.</p>';
  els.viewer.appendChild(box);
  els.openExternal.href = url;
}

function toggleComplete() {
  if (!state.lesson) return;
  if (state.progress[state.lesson.id]) delete state.progress[state.lesson.id];
  else state.progress[state.lesson.id] = { completedAt: new Date().toISOString() };
  writeJson(STORAGE.progress, state.progress);
  renderLesson();
  toast(state.progress[state.lesson.id] ? 'Đã đánh dấu hoàn thành.' : 'Đã chuyển về chưa hoàn thành.');
}

function toggleFavorite() {
  if (!state.lesson) return;
  if (state.favorites[state.lesson.id]) delete state.favorites[state.lesson.id];
  else state.favorites[state.lesson.id] = true;
  writeJson(STORAGE.favorites, state.favorites);
  renderLesson();
  toast(state.favorites[state.lesson.id] ? 'Đã lưu bài học.' : 'Đã bỏ lưu bài học.');
}

function renderProgress() {
  const total = state.course.lessons.length;
  const done = state.course.lessons.filter(l => state.progress[l.id]).length;
  const favorites = state.course.lessons.filter(l => state.favorites[l.id]).length;
  const percent = total ? Math.round(done / total * 100) : 0;
  els.progressPercent.textContent = `${percent}%`;
  els.globalProgressText.textContent = `${percent}%`;
  els.progressBar.style.width = `${percent}%`;
  els.globalProgressBar.style.width = `${percent}%`;
  els.doneCount.textContent = done;
  els.totalCount.textContent = total;
  els.favoriteCount.textContent = favorites;
}

function captureVideoTime() {
  let seconds = 0;
  try {
    seconds = Math.floor(state.youtubePlayer?.getCurrentTime?.() || 0);
  } catch {}
  els.noteTime.value = formatTime(seconds);
  els.noteText.focus();
  if (!state.youtubePlayer) toast('Mở video bài giảng để lấy thời gian tự động.');
}

function saveNote() {
  if (!state.lesson) return;
  const text = els.noteText.value.trim();
  if (!text) return toast('Nhập nội dung ghi chú trước.');
  const note = {
    id: crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`,
    time: normalizeTime(els.noteTime.value),
    text,
    tag: els.noteTag.value,
    createdAt: new Date().toISOString()
  };
  const list = state.notes[state.lesson.id] || [];
  list.unshift(note);
  state.notes[state.lesson.id] = list;
  writeJson(STORAGE.notes, state.notes);
  els.noteText.value = '';
  els.noteTime.value = '';
  renderNotes();
  toast('Đã lưu ghi chú.');
}

function renderNotes() {
  els.notesList.innerHTML = '';
  const list = state.notes[state.lesson.id] || [];
  if (!list.length) {
    els.notesList.innerHTML = '<div style="font-size:13px;color:#8b93a0;padding:8px 0">Chưa có ghi chú cho bài này.</div>';
    return;
  }
  const tagLabel = { note: 'Ghi chú', important: '⭐ Quan trọng', question: '❓ Chưa hiểu', formula: '📌 Công thức', mistake: '🔥 Hay sai' };
  for (const note of list) {
    const item = document.createElement('article');
    item.className = 'note-item';
    const time = document.createElement('button');
    time.className = 'note-time';
    time.textContent = note.time || '00:00';
    time.addEventListener('click', () => seekTo(note.time));
    const body = document.createElement('div');
    const p = document.createElement('p');
    p.textContent = note.text;
    const tag = document.createElement('div');
    tag.className = 'note-tag';
    tag.textContent = tagLabel[note.tag] || 'Ghi chú';
    body.append(p, tag);
    const del = document.createElement('button');
    del.className = 'delete-note';
    del.type = 'button';
    del.textContent = '×';
    del.title = 'Xóa ghi chú';
    del.addEventListener('click', () => deleteNote(note.id));
    item.append(time, body, del);
    els.notesList.appendChild(item);
  }
}

function deleteNote(id) {
  state.notes[state.lesson.id] = (state.notes[state.lesson.id] || []).filter(n => n.id !== id);
  writeJson(STORAGE.notes, state.notes);
  renderNotes();
}

function seekTo(time) {
  const seconds = parseTime(time);
  try {
    state.youtubePlayer?.seekTo?.(seconds, true);
    state.youtubePlayer?.playVideo?.();
  } catch {}
}

function openImportDialog() {
  els.sheetUrlInput.value = localStorage.getItem(STORAGE.sourceUrl) || SOURCE_INFO.sheetUrl;
  els.syncEndpointInput.value = localStorage.getItem(STORAGE.syncEndpoint) || '';
  els.importStatus.textContent = `Dữ liệu hiện tại: ${state.course.chapters.length} chương • ${state.course.lessons.length} tiết.`;
  els.importDialog.showModal();
}

function applyImportedRaw(raw) {
  const parsed = parseCourse(raw);
  if (!parsed.chapters.length || !parsed.lessons.length) {
    els.importStatus.textContent = 'Không nhận diện được dữ liệu. Kiểm tra format C|, B|, L|.';
    return;
  }
  localStorage.setItem(STORAGE.rawOverride, raw.trim());
  state.raw = raw.trim();
  state.course = parsed;
  state.lesson = parsed.lessons[0];
  state.resourceKey = Object.keys(state.lesson.resources)[0] || null;
  renderAll();
  renderLesson();
  els.importStatus.textContent = `Đã nhập ${parsed.chapters.length} chương • ${parsed.lessons.length} tiết.`;
  toast('Nhập dữ liệu thành công.');
}

async function importFile() {
  const file = els.fileImport.files?.[0];
  if (!file) return toast('Chọn file trước.');
  applyImportedRaw(await file.text());
}

async function syncFromEndpoint() {
  const endpoint = els.syncEndpointInput.value.trim();
  const sheetUrl = els.sheetUrlInput.value.trim() || SOURCE_INFO.sheetUrl;
  localStorage.setItem(STORAGE.sourceUrl, sheetUrl);
  if (!endpoint) {
    els.importStatus.textContent = 'Sheet hiện tại đã được seed đầy đủ rich hyperlink. Để đồng bộ thay đổi hyperlink tự động, hãy deploy Apps Script trong thư mục apps-script rồi dán endpoint vào đây.';
    return;
  }
  localStorage.setItem(STORAGE.syncEndpoint, endpoint);
  els.importStatus.textContent = 'Đang đồng bộ...';
  try {
    const url = new URL(endpoint);
    url.searchParams.set('sheetUrl', sheetUrl);
    const response = await fetch(url, { method: 'GET' });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const payload = await response.json();
    if (!payload.rawCourse) throw new Error('Endpoint không trả rawCourse');
    applyImportedRaw(payload.rawCourse);
    els.importStatus.textContent = `Đồng bộ thành công: ${state.course.chapters.length} chương • ${state.course.lessons.length} tiết.`;
  } catch (error) {
    els.importStatus.textContent = `Đồng bộ thất bại: ${error.message}`;
  }
}

async function runAi(action) {
  if (!state.lesson) return toast('Chọn bài học trước.');
  const question = els.aiQuestion.value.trim();
  if (action === 'question' && !question) return toast('Nhập câu hỏi cho AI Tutor.');

  const promptByAction = {
    summary: 'Tóm tắt bài học này theo kiểu ôn thi THPT: trọng tâm, công thức, lỗi hay gặp và checklist cần nhớ.',
    quiz: 'Tạo 5 câu trắc nghiệm bám sát bài học, có 4 lựa chọn, đáp án và giải thích ngắn. Không bịa dữ kiện ngoài ngữ cảnh.',
    explain: 'Giải thích trọng tâm bài này thật dễ hiểu, nêu trực giác, quy trình giải và khi nào dễ nhầm.',
    question
  };

  els.aiOutput.hidden = false;
  els.aiOutput.textContent = 'AI đang xử lý...';
  try {
    const response = await fetch(window.MATH12_AI_ENDPOINT || '/api/gemini', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action,
        prompt: promptByAction[action],
        context: {
          chapter: state.lesson.chapterTitle,
          group: state.lesson.groupTitle,
          lesson: state.lesson.title,
          resources: state.lesson.resources
        }
      })
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || `HTTP ${response.status}`);
    els.aiOutput.textContent = payload.text || 'AI không trả nội dung.';
  } catch (error) {
    els.aiOutput.textContent = `Chưa gọi được Gemini: ${error.message}\n\nNếu đang chạy GitHub Pages, deploy bằng Vercel và đặt biến môi trường GEMINI_API_KEY để bật /api/gemini.`;
  }
}

function findLesson(id) {
  return state.course?.lessons.find(l => l.id === id) || null;
}

function ensureYouTubeApi() {
  if (window.YT?.Player) return Promise.resolve();
  if (state.youtubeReadyPromise) return state.youtubeReadyPromise;
  state.youtubeReadyPromise = new Promise((resolve, reject) => {
    const previous = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      previous?.();
      resolve();
    };
    const script = document.createElement('script');
    script.src = 'https://www.youtube.com/iframe_api';
    script.async = true;
    script.onerror = reject;
    document.head.appendChild(script);
    setTimeout(() => window.YT?.Player ? resolve() : null, 1500);
  });
  return state.youtubeReadyPromise;
}

function isYouTube(url) {
  return /(?:youtube\.com|youtu\.be)/i.test(url);
}

function getYouTubeId(url) {
  try {
    const u = new URL(url);
    if (u.hostname.includes('youtu.be')) return u.pathname.split('/').filter(Boolean)[0] || null;
    return u.searchParams.get('v') || u.pathname.match(/\/embed\/([^/?]+)/)?.[1] || null;
  } catch { return null; }
}

function isDriveFile(url) {
  return /drive\.google\.com\/file\/d\//i.test(url);
}

function drivePreviewUrl(url) {
  const match = url.match(/\/file\/d\/([^/]+)/);
  return match ? `https://drive.google.com/file/d/${match[1]}/preview` : url;
}

function readJson(key, fallback) {
  try { return JSON.parse(localStorage.getItem(key)) || fallback; } catch { return fallback; }
}
function writeJson(key, value) { localStorage.setItem(key, JSON.stringify(value)); }
function escapeHtml(value) { return String(value).replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c])); }
function formatTime(seconds) { const m = Math.floor(seconds / 60); const s = Math.floor(seconds % 60); return `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`; }
function parseTime(value) { const p = String(value || '').split(':').map(Number); return p.length === 2 && p.every(Number.isFinite) ? p[0] * 60 + p[1] : 0; }
function normalizeTime(value) { return formatTime(parseTime(value)); }
function toast(message) { els.toast.textContent = message; els.toast.classList.add('show'); clearTimeout(toast.timer); toast.timer = setTimeout(() => els.toast.classList.remove('show'), 2200); }
