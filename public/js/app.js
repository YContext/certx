/* ============================================================
   CertX — Frontend App
   Handles file uploads, drag & drop, CSV preview, interactive
   template editor (drag, resize, delete, width), generation.
   ============================================================ */

(function () {
  'use strict';

  // ── State ─────────────────────────────────────────────────
  const state = {
    templateFile: null,
    csvFile: null,
    csvData: null,
    currentStep: 1,
    batchId: null,
    certificates: [],
    selectedField: 'title',
    editorPositions: {
      title:       { x: 50, y: 12, align: 'center', fontSize: 'L',  enabled: true, width: 70 },
      name:        { x: 50, y: 38, align: 'center', fontSize: 'XL', enabled: true, width: 70 },
      description: { x: 15, y: 51, align: 'left',   fontSize: 'M',  enabled: true, width: 70 },
      date:        { x: 15, y: 78, align: 'left',   fontSize: 'S',  enabled: true, width: 30 },
      signatory:   { x: 55, y: 78, align: 'left',   fontSize: 'S',  enabled: true, width: 30 },
    },
    isDragging: false,
    isResizing: false,
    dragField: null,
    dragStartX: 0,
    dragStartY: 0,
    dragOrigLeft: 0,
    dragOrigTop: 0,
  };

  const FIELD_META = {
    title:       { label: 'Title',       color: '#1a1a2e' },
    name:        { label: 'Name',        color: '#1a1a2e' },
    description: { label: 'Description', color: '#475569' },
    date:        { label: 'Date',        color: '#475569' },
    signatory:   { label: 'Signatory',   color: '#475569' },
  };

  // Map fontSize setting → actual CSS font-size
  const FONT_SIZES = {
    XS: '0.75rem',
    S: '1rem',
    M: '1.4rem',
    L: '2rem',
    XL: '2.8rem',
  };

  // ── DOM refs ──────────────────────────────────────────────
  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => document.querySelectorAll(sel);

  const els = {
    steps: $$('.step'),
    step1: $('#step1'),
    step2: $('#step2'),
    step3: $('#step3'),
    app: $('.app'),

    dropzones: {
      template: { el: $('#dropzone-template'), input: $('#dropzone-template .dropzone__input') },
      csv: { el: $('#dropzone-csv'), input: $('#dropzone-csv .dropzone__input') },
    },

    csvPreview: $('#csv-preview'),
    csvPreviewTitle: $('#csv-preview-title'),
    csvPreviewCount: $('#csv-preview-count'),
    csvPreviewTable: $('#csv-preview-table'),
    csvPreviewCol: $('#csv-preview-col'),

    title: $('#title'),
    date: $('#date'),
    description: $('#description'),
    signatory: $('#signatory'),

    btnToEditor: $('#btn-to-editor'),
    btnBack1: $('#btn-back-1'),
    btnToGenerate: $('#btn-to-generate'),
    btnBack2: $('#btn-back-2'),
    btnDownloadAll: $('#btn-download-all'),

    progressArea: $('#progress-area'),
    progressBar: $('#progress-bar'),
    progressText: $('#progress-text'),

    resultsArea: $('#results-area'),
    resultsTitle: $('#results-title'),
    gallery: $('#gallery'),
    resultsSummary: $('#results-summary'),

    toastContainer: $('#toast-container'),

    // Editor
    editorCanvas: $('#editor-canvas'),
    editorCanvasInner: $('#editor-canvas-inner'),
    editorTemplateImg: $('#editor-template-img'),
    editorSelectedName: $('#editor-selected-name'),
    editorPosInputX: $('#editor-pos-input-x'),
    editorPosInputY: $('#editor-pos-input-y'),
    editorPosInputW: $('#editor-pos-input-w'),
    editorAlignBtns: $$('.editor-align-btn'),
    editorFsBtns: $$('.editor-fs-btn'),
    editorNudgeBtns: $$('.editor-pos__nudge'),
    editorToggleBtn: $('#editor-btn-toggle'),
    editorStatusText: $('#editor-status-text'),
  };

  els.date.value = new Date().toISOString().slice(0, 10);

  // ── Helpers ───────────────────────────────────────────────
  const show = (el) => { el.style.display = ''; };
  const hide = (el) => { el.style.display = 'none'; };

  function toast(message, type = 'info') {
    const el = document.createElement('div');
    el.className = `toast toast--${type}`;
    el.textContent = message;
    els.toastContainer.appendChild(el);
    setTimeout(() => { el.remove(); }, 4000);
  }

  function setLoading(btn, loading) {
    if (loading) {
      btn.disabled = true;
      btn._origHtml = btn.innerHTML;
      btn.innerHTML = '<span class="spinner"></span>';
    } else {
      btn.disabled = false;
      btn.innerHTML = btn._origHtml || btn.innerHTML;
    }
  }

  function escapeHtml(str) {
    const d = document.createElement('div');
    d.textContent = str;
    return d.innerHTML;
  }

  function clamp(v, min, max) {
    return Math.round(Math.min(max, Math.max(min, v)) * 10) / 10;
  }

  function formatDate(dateStr) {
    if (!dateStr) return '';
    const d = new Date(dateStr + 'T00:00:00');
    return d.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  }

  /**
   * Returns the actual certificate content for a given field,
   * using the first CSV row for name and form input values for everything else.
   */
  function getFieldContent(field) {
    const firstRow = state.csvData && state.csvData.preview && state.csvData.preview[0];
    switch (field) {
      case 'title':
        return els.title.value.trim() || 'Certificate of Completion';
      case 'name':
        if (firstRow && state.csvData.nameColumn) {
          return firstRow[state.csvData.nameColumn] || '[Name]';
        }
        return '[Participant Name]';
      case 'description':
        return els.description.value.trim() || 'Awarded for participation';
      case 'date':
        return els.date.value ? formatDate(els.date.value) : 'Date';
      case 'signatory':
        return els.signatory.value.trim() || 'Jane Smith';
      default:
        return '';
    }
  }

  // ── Step Navigation ───────────────────────────────────────
  function goToStep(step) {
    state.currentStep = step;
    els.steps.forEach((s, i) => {
      const num = i + 1;
      s.classList.toggle('step--active', num === step);
      s.classList.toggle('step--done', num < step);
    });
    hide(els.step1);
    hide(els.step2);
    hide(els.step3);
    els.app.classList.toggle('app--wide', step === 2);
    if (step === 1) show(els.step1);
    if (step === 2) {
      show(els.step2);
      if (!els.editorCanvasInner._initialized) initEditor();
    }
    if (step === 3) show(els.step3);
  }

  // ── Dropzone Logic ───────────────────────────────────────
  function initDropzone(key) {
    const dz = els.dropzones[key];
    const { el, input } = dz;
    input.addEventListener('change', () => {
      if (input.files && input.files[0]) handleFile(key, input.files[0]);
    });
    el.addEventListener('dragover', (e) => { e.preventDefault(); el.classList.add('dropzone--dragover'); });
    el.addEventListener('dragleave', () => { el.classList.remove('dropzone--dragover'); });
    el.addEventListener('drop', (e) => {
      e.preventDefault();
      el.classList.remove('dropzone--dragover');
      if (e.dataTransfer.files[0]) handleFile(key, e.dataTransfer.files[0]);
    });
    const rm = el.querySelector('.dropzone__remove');
    if (rm) rm.addEventListener('click', (e) => { e.stopPropagation(); removeFile(key); });
  }

  function handleFile(key, file) {
    state[key === 'template' ? 'templateFile' : 'csvFile'] = file;
    const dz = els.dropzones[key];
    const { el } = dz;
    const placeholder = el.querySelector('.dropzone__placeholder');
    const preview = el.querySelector('.dropzone__preview');
    hide(placeholder); show(preview);
    el.classList.add('dropzone--has-file');
    if (key === 'template') {
      const img = preview.querySelector('img');
      const reader = new FileReader();
      reader.onload = (e) => { img.src = e.target.result; };
      reader.readAsDataURL(file);
    } else {
      const nameSpan = preview.querySelector('.dropzone__csv-name');
      if (nameSpan) nameSpan.textContent = file.name;
      previewCSV(file);
    }
    updateContinueButton();
  }

  function removeFile(key) {
    state[key === 'template' ? 'templateFile' : 'csvFile'] = null;
    const dz = els.dropzones[key];
    const { el, input } = dz;
    const placeholder = el.querySelector('.dropzone__placeholder');
    const preview = el.querySelector('.dropzone__preview');
    show(placeholder); hide(preview);
    el.classList.remove('dropzone--has-file');
    input.value = '';
    if (key === 'csv') { hide(els.csvPreview); state.csvData = null; }
    updateContinueButton();
  }

  function updateContinueButton() {
    els.btnToEditor.disabled = !(state.templateFile && state.csvFile);
  }

  // ── CSV Preview ──────────────────────────────────────────
  async function previewCSV(file) {
    const fd = new FormData();
    fd.append('csv', file);
    try {
      const res = await fetch('/api/preview-csv', { method: 'POST', body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      state.csvData = data;
      renderCSVPreview(data);
      show(els.csvPreview);
      // Live-update the editor name overlay with the first CSV row
      if (els.editorCanvasInner._initialized) buildOverlays();
    } catch (err) {
      toast(err.message, 'error');
      removeFile('csv');
    }
  }

  function renderCSVPreview(data) {
    els.csvPreviewTitle.textContent = data.fileName;
    els.csvPreviewCount.textContent = `${data.totalRows} participant${data.totalRows !== 1 ? 's' : ''}`;
    const cols = data.columns;
    const thead = els.csvPreviewTable.querySelector('thead');
    const tbody = els.csvPreviewTable.querySelector('tbody');
    thead.innerHTML = ''; tbody.innerHTML = '';
    const hr = document.createElement('tr');
    cols.forEach((c) => {
      const th = document.createElement('th');
      th.textContent = c;
      if (c === data.nameColumn) { th.style.color = 'var(--primary)'; th.innerHTML += ' ⭐'; }
      hr.appendChild(th);
    });
    thead.appendChild(hr);
    data.preview.forEach((row) => {
      const tr = document.createElement('tr');
      cols.forEach((c) => {
        const td = document.createElement('td');
        td.textContent = row[c] || '';
        if (c === data.nameColumn) td.style.fontWeight = '600';
        tr.appendChild(td);
      });
      tbody.appendChild(tr);
    });
    els.csvPreviewCol.textContent = `Detected name column: "${data.nameColumn}" ⭐`;
  }

  // ══════════════════════════════════════════════════════════
  //  INTERACTIVE TEMPLATE EDITOR
  // ══════════════════════════════════════════════════════════

  function initEditor() {
    els.editorCanvasInner._initialized = true;
    if (state.templateFile) {
      const reader = new FileReader();
      reader.onload = (e) => {
        els.editorTemplateImg.src = e.target.result;
        els.editorTemplateImg.onload = buildOverlays;
      };
      reader.readAsDataURL(state.templateFile);
    } else {
      buildOverlays();
    }
  }

  // ── Field Selection ──────────────────────────────────────
  function selectField(field) {
    state.selectedField = field;
    const meta = FIELD_META[field];
    const pos = state.editorPositions[field];
    els.editorCanvasInner.querySelectorAll('.editor-overlay').forEach((el) => {
      el.classList.toggle('editor-overlay--selected', el.dataset.field === field && state.editorPositions[el.dataset.field].enabled);
    });
    els.editorSelectedName.textContent = meta.label;
    els.editorPosInputX.value = Math.round(pos.x);
    els.editorPosInputY.value = Math.round(pos.y);
    els.editorPosInputW.value = pos.width;
    els.editorAlignBtns.forEach((btn) => {
      btn.classList.toggle('editor-align-btn--active', btn.dataset.align === pos.align);
    });
    els.editorFsBtns.forEach((btn) => {
      btn.classList.toggle('editor-fs-btn--active', btn.dataset.fs === pos.fontSize);
    });
    syncDeleteUI();
  }

  function syncDeleteUI() {
    const pos = state.editorPositions[state.selectedField];
    if (pos.enabled) {
      els.editorToggleBtn.textContent = '🗑 Delete';
      els.editorToggleBtn.style.borderColor = 'var(--danger)';
      els.editorToggleBtn.style.color = 'var(--danger)';
      els.editorToggleBtn.style.background = 'transparent';
      els.editorStatusText.textContent = 'Active on certificate';
      els.editorStatusText.style.color = 'var(--success)';
    } else {
      els.editorToggleBtn.textContent = '↩ Restore';
      els.editorToggleBtn.style.borderColor = 'var(--primary)';
      els.editorToggleBtn.style.color = 'var(--primary)';
      els.editorToggleBtn.style.background = 'var(--primary-light)';
      els.editorStatusText.textContent = 'Hidden — click Restore to include this element';
      els.editorStatusText.style.color = 'var(--text-secondary)';
    }
  }

  // ── Coordinate Update Helper ─────────────────────────────
  function updateFieldPosition(field, newX, newY) {
    newX = clamp(newX, 0, 95);
    newY = clamp(newY, 0, 95);
    state.editorPositions[field].x = newX;
    state.editorPositions[field].y = newY;
    const overlay = els.editorCanvasInner.querySelector(`.editor-overlay[data-field="${field}"]`);
    if (overlay) {
      overlay.style.left = newX + '%';
      overlay.style.top = newY + '%';
      const coords = overlay.querySelector('.editor-overlay__coords');
      if (coords) coords.textContent = `${Math.round(newX)}% · ${Math.round(newY)}%`;
    }
    els.editorPosInputX.value = Math.round(newX);
    els.editorPosInputY.value = Math.round(newY);
  }

  // ── Width Update Helper ──────────────────────────────────
  function updateFieldWidth(field, newW) {
    newW = clamp(newW, 10, 100);
    state.editorPositions[field].width = newW;
    els.editorPosInputW.value = newW;
    const overlay = els.editorCanvasInner.querySelector(`.editor-overlay[data-field="${field}"]`);
    if (overlay) {
      const wl = overlay.querySelector('.editor-overlay__width-label');
      if (wl) wl.textContent = newW + '%';
    }
  }

  // ── Drag (Mouse) ─────────────────────────────────────────
  function startDrag(e, field, overlay) {
    state.isDragging = true;
    state.dragField = field;
    const rect = els.editorCanvasInner.getBoundingClientRect();
    state.dragStartX = e.clientX;
    state.dragStartY = e.clientY;
    state.dragOrigLeft = state.editorPositions[field].x;
    state.dragOrigTop = state.editorPositions[field].y;
    state.dragParentRect = rect;
    overlay.classList.add('editor-overlay--selected', 'editor-overlay--dragging');
    const onMove = (ev) => {
      ev.preventDefault();
      const dx = ((ev.clientX - state.dragStartX) / rect.width) * 100;
      const dy = ((ev.clientY - state.dragStartY) / rect.height) * 100;
      updateFieldPosition(field, state.dragOrigLeft + dx, state.dragOrigTop + dy);
    };
    const onUp = () => {
      state.isDragging = false;
      overlay.classList.remove('editor-overlay--dragging');
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }

  // ── Drag (Touch) ─────────────────────────────────────────
  function startDragTouch(e, field, overlay) {
    const touch = e.touches[0];
    state.isDragging = true;
    state.dragField = field;
    const rect = els.editorCanvasInner.getBoundingClientRect();
    state.dragStartX = touch.clientX;
    state.dragStartY = touch.clientY;
    state.dragOrigLeft = state.editorPositions[field].x;
    state.dragOrigTop = state.editorPositions[field].y;
    state.dragParentRect = rect;
    overlay.classList.add('editor-overlay--selected', 'editor-overlay--dragging');
    const onMove = (ev) => {
      ev.preventDefault();
      const t = ev.touches[0];
      const dx = ((t.clientX - state.dragStartX) / rect.width) * 100;
      const dy = ((t.clientY - state.dragStartY) / rect.height) * 100;
      updateFieldPosition(field, state.dragOrigLeft + dx, state.dragOrigTop + dy);
    };
    const onEnd = () => {
      state.isDragging = false;
      overlay.classList.remove('editor-overlay--dragging');
      document.removeEventListener('touchmove', onMove);
      document.removeEventListener('touchend', onEnd);
    };
    document.addEventListener('touchmove', onMove, { passive: false });
    document.addEventListener('touchend', onEnd);
  }

  // ── Resize ───────────────────────────────────────────────
  function getResizeOverlay(field) {
    return els.editorCanvasInner.querySelector(`.editor-overlay[data-field="${field}"]`);
  }

  function startResize(e, field) {
    state.isResizing = true;
    state.dragField = field;
    state.dragStartX = e.clientX;
    state.dragOrigLeft = state.editorPositions[field].width;
    const rect = els.editorCanvasInner.getBoundingClientRect();
    const overlay = getResizeOverlay(field);
    if (overlay) overlay.classList.add('editor-overlay--dragging');

    const onMove = (ev) => {
      ev.preventDefault();
      const dx = ((ev.clientX - state.dragStartX) / rect.width) * 100;
      updateFieldWidth(field, state.dragOrigLeft + dx);
    };
    const onUp = () => {
      state.isResizing = false;
      if (overlay) overlay.classList.remove('editor-overlay--dragging');
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }

  function startResizeTouch(e, field) {
    const touch = e.touches[0];
    state.isResizing = true;
    state.dragField = field;
    state.dragStartX = touch.clientX;
    state.dragOrigLeft = state.editorPositions[field].width;
    const rect = els.editorCanvasInner.getBoundingClientRect();
    const overlay = getResizeOverlay(field);
    if (overlay) overlay.classList.add('editor-overlay--dragging');

    const onMove = (ev) => {
      ev.preventDefault();
      const t = ev.touches[0];
      const dx = ((t.clientX - state.dragStartX) / rect.width) * 100;
      updateFieldWidth(field, state.dragOrigLeft + dx);
    };
    const onEnd = () => {
      state.isResizing = false;
      if (overlay) overlay.classList.remove('editor-overlay--dragging');
      document.removeEventListener('touchmove', onMove);
      document.removeEventListener('touchend', onEnd);
    };
    document.addEventListener('touchmove', onMove, { passive: false });
    document.addEventListener('touchend', onEnd);
  }

  // ── Keyboard Nudge ──────────────────────────────────────
  function setupKeyboardNudge() {
    document.addEventListener('keydown', (e) => {
      if (state.currentStep !== 2) return;
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
      if (e.target.closest('.editor-pos__input')) return;
      if (state.isDragging || state.isResizing) return;
      const field = state.selectedField;
      const pos = state.editorPositions[field];
      let dx = 0, dy = 0;
      switch (e.key) {
        case 'ArrowLeft':  e.preventDefault(); dx = -1; break;
        case 'ArrowRight': e.preventDefault(); dx = 1;  break;
        case 'ArrowUp':    e.preventDefault(); dy = -1; break;
        case 'ArrowDown':  e.preventDefault(); dy = 1;  break;
      }
      if (dx !== 0 || dy !== 0) updateFieldPosition(field, pos.x + dx, pos.y + dy);
    });
  }

  // ── Coordinate Inputs ────────────────────────────────────
  function setupCoordInputs() {
    els.editorPosInputX.addEventListener('change', () => {
      const val = parseFloat(els.editorPosInputX.value);
      if (!isNaN(val)) updateFieldPosition(state.selectedField, val, state.editorPositions[state.selectedField].y);
    });
    els.editorPosInputY.addEventListener('change', () => {
      const val = parseFloat(els.editorPosInputY.value);
      if (!isNaN(val)) updateFieldPosition(state.selectedField, state.editorPositions[state.selectedField].x, val);
    });
    els.editorPosInputW.addEventListener('change', () => {
      const val = parseFloat(els.editorPosInputW.value);
      if (!isNaN(val)) updateFieldWidth(state.selectedField, val);
    });
  }

  // ── Nudge Buttons ────────────────────────────────────────
  function setupNudgeButtons() {
    els.editorNudgeBtns.forEach((btn) => {
      btn.addEventListener('click', () => {
        const field = state.selectedField;
        const pos = state.editorPositions[field];
        const axis = btn.dataset.axis;
        const dir = parseInt(btn.dataset.dir);
        const widthStep = btn.dataset.width ? parseInt(btn.dataset.width) : null;

        if (widthStep) {
          updateFieldWidth(field, pos.width + widthStep);
        } else if (axis) {
          const step = parseFloat(btn.dataset.step) || 0.5;
          let newX = pos.x, newY = pos.y;
          if (axis === 'x') newX = pos.x + dir * step;
          if (axis === 'y') newY = pos.y + dir * step;
          updateFieldPosition(field, newX, newY);
        }
      });
    });
  }

  // ── Editor Controls ──────────────────────────────────────
  function setupEditorControls() {
    els.editorAlignBtns.forEach((btn) => {
      btn.addEventListener('click', () => {
        const field = state.selectedField;
        state.editorPositions[field].align = btn.dataset.align;
        els.editorAlignBtns.forEach((b) => b.classList.remove('editor-align-btn--active'));
        btn.classList.add('editor-align-btn--active');
      });
    });
    els.editorFsBtns.forEach((btn) => {
      btn.addEventListener('click', () => {
        const field = state.selectedField;
        state.editorPositions[field].fontSize = btn.dataset.fs;
        els.editorFsBtns.forEach((b) => b.classList.remove('editor-fs-btn--active'));
        btn.classList.add('editor-fs-btn--active');
      });
    });
    // Delete/Restore toggle
    els.editorToggleBtn.addEventListener('click', () => {
      const field = state.selectedField;
      state.editorPositions[field].enabled = !state.editorPositions[field].enabled;
      // Rebuild overlays to reflect disabled state
      buildOverlays();
      syncDeleteUI();
    });
  }

  function buildOverlays() {
    const inner = els.editorCanvasInner;
    inner.querySelectorAll('.editor-overlay').forEach((el) => el.remove());
    Object.keys(FIELD_META).forEach((field) => {
      const pos = state.editorPositions[field];
      const meta = FIELD_META[field];
      const content = getFieldContent(field);
      const overlay = document.createElement('div');
      overlay.className = 'editor-overlay';
      overlay.dataset.field = field;
      overlay.style.left = pos.x + '%';
      overlay.style.top = pos.y + '%';
      overlay.style.width = pos.width + '%';
      overlay.style.maxWidth = 'none';
      overlay.style.fontSize = FONT_SIZES[pos.fontSize] || '1rem';
      overlay.style.textAlign = pos.align;
      overlay.style.color = meta.color;
      if (!pos.enabled) overlay.classList.add('editor-overlay--disabled');
      if (field === state.selectedField && pos.enabled) overlay.classList.add('editor-overlay--selected');

      const safeContent = escapeHtml(content);
      overlay.innerHTML = `
        <span class="editor-overlay__label" title="${meta.label}: ${safeContent.replace(/"/g, '&quot;')}">${safeContent}</span>
        <span class="editor-overlay__coords">${Math.round(pos.x)}% · ${Math.round(pos.y)}%</span>
        <span class="editor-overlay__width-label">${pos.width}%</span>
        <span class="editor-overlay__resize"></span>
      `;

      if (pos.enabled) {
        overlay.addEventListener('mousedown', (e) => {
          if (e.button !== 0) return;
          if (e.target.closest('.editor-overlay__resize')) return;
          selectField(field);
          startDrag(e, field, overlay);
        });
        overlay.addEventListener('touchstart', (e) => {
          if (e.target.closest('.editor-overlay__resize')) return;
          selectField(field);
          startDragTouch(e, field, overlay);
        }, { passive: false });
      } else {
        overlay.addEventListener('click', () => {
          state.editorPositions[field].enabled = true;
          buildOverlays();
          selectField(field);
          syncDeleteUI();
        });
      }
      const resize = overlay.querySelector('.editor-overlay__resize');
      if (resize && pos.enabled) {
        resize.addEventListener('mousedown', (e) => {
          e.stopPropagation();
          e.preventDefault();
          selectField(field);
          startResize(e, field);
        });
        resize.addEventListener('touchstart', (e) => {
          e.stopPropagation();
          e.preventDefault();
          selectField(field);
          startResizeTouch(e, field);
        }, { passive: false });
      }

      inner.appendChild(overlay);
    });
    selectField(state.selectedField);
  }

  /** Rebuild overlays whenever form content changes */
  function setupLiveContentPreview() {
    [els.title, els.date, els.description, els.signatory].forEach((inp) => {
      inp.addEventListener('input', () => {
        if (els.editorCanvasInner._initialized) buildOverlays();
      });
    });
  }

  // ── Generate ─────────────────────────────────────────────
  async function generateCertificates() {
    const fd = new FormData();
    fd.append('template', state.templateFile);
    fd.append('csv', state.csvFile);
    fd.append('title', els.title.value.trim());
    fd.append('description', els.description.value.trim());
    fd.append('signatory', els.signatory.value.trim());
    fd.append('date', els.date.value);
    fd.append('positions', JSON.stringify(state.editorPositions));

    hide(els.resultsArea);
    show(els.progressArea);
    els.progressBar.style.width = '0%';
    els.progressText.textContent = 'Uploading files and generating certificates...';
    goToStep(3);
    setLoading(els.btnToGenerate, true);
    els.btnDownloadAll.style.display = 'none';

    try {
      const res = await fetch('/api/generate', { method: 'POST', body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      state.batchId = data.batchId;
      state.certificates = data.certificates;
      els.progressBar.style.width = '100%';
      els.progressText.textContent = `Generated ${data.total} certificate${data.total !== 1 ? 's' : ''}!`;
      setTimeout(() => {
        hide(els.progressArea);
        renderResults(data);
        show(els.resultsArea);
      }, 500);
    } catch (err) {
      toast(err.message, 'error');
      hide(els.progressArea);
      goToStep(2);
    } finally {
      setLoading(els.btnToGenerate, false);
    }
  }

  function renderResults(data) {
    const { certificates, downloadAllUrl } = data;
    els.resultsTitle.textContent = `${data.total} Certificate${data.total !== 1 ? 's' : ''} Generated`;
    els.btnDownloadAll.href = downloadAllUrl;
    els.btnDownloadAll.style.display = 'inline-flex';
    els.gallery.innerHTML = '';
    certificates.forEach((cert) => {
      const card = document.createElement('div');
      card.className = 'gallery__card';
      const img = document.createElement('img');
      img.src = cert.url; img.alt = cert.name; img.loading = 'lazy';
      img.addEventListener('click', () => openLightbox(cert.url, cert.name));
      const body = document.createElement('div');
      body.className = 'gallery__card-body';
      const nameEl = document.createElement('div');
      nameEl.className = 'gallery__card-name';
      nameEl.textContent = cert.name;
      const actions = document.createElement('div');
      actions.className = 'gallery__card-actions';
      const vb = document.createElement('a');
      vb.className = 'btn btn--secondary btn--sm';
      vb.href = cert.url; vb.target = '_blank'; vb.textContent = 'View';
      const db = document.createElement('a');
      db.className = 'btn btn--primary btn--sm';
      db.href = cert.url; db.download = cert.filename; db.textContent = 'Download';
      actions.appendChild(vb); actions.appendChild(db);
      body.appendChild(nameEl); body.appendChild(actions);
      card.appendChild(img); card.appendChild(body);
      els.gallery.appendChild(card);
    });
    els.resultsSummary.textContent = `✅ Successfully generated ${data.total} certificate${data.total !== 1 ? 's' : ''} for "${data.title}" with ${data.csvFileName}`;
  }

  // ── Lightbox ─────────────────────────────────────────────
  function openLightbox(src, name) {
    const existing = document.querySelector('.modal');
    if (existing) existing.remove();
    const modal = document.createElement('div');
    modal.className = 'modal';
    const content = document.createElement('div');
    content.className = 'modal__content';
    const img = document.createElement('img');
    img.src = src; img.alt = name;
    const close = document.createElement('button');
    close.className = 'modal__close';
    close.innerHTML = '&times;';
    close.addEventListener('click', () => modal.remove());
    content.appendChild(img); content.appendChild(close);
    modal.appendChild(content);
    modal.addEventListener('click', (e) => { if (e.target === modal) modal.remove(); });
    document.body.appendChild(modal);
    const esc = (e) => { if (e.key === 'Escape') { modal.remove(); document.removeEventListener('keydown', esc); } };
    document.addEventListener('keydown', esc);
  }

  // ── Init ─────────────────────────────────────────────────
  function init() {
    initDropzone('template');
    initDropzone('csv');
    setupEditorControls();
    setupKeyboardNudge();
    setupCoordInputs();
    setupNudgeButtons();
    setupLiveContentPreview();

    els.btnToEditor.addEventListener('click', () => goToStep(2));
    els.btnBack1.addEventListener('click', () => {
      els.editorCanvasInner._initialized = false;
      goToStep(1);
    });
    els.btnBack2.addEventListener('click', () => {
      state.templateFile = null;
      state.csvFile = null;
      state.certificates = [];
      state.batchId = null;
      state.editorPositions = {
        title:       { x: 50, y: 12, align: 'center', fontSize: 'L',  enabled: true, width: 70 },
        name:        { x: 50, y: 38, align: 'center', fontSize: 'XL', enabled: true, width: 70 },
        description: { x: 15, y: 51, align: 'left',   fontSize: 'M',  enabled: true, width: 70 },
        date:        { x: 15, y: 78, align: 'left',   fontSize: 'S',  enabled: true, width: 30 },
        signatory:   { x: 55, y: 78, align: 'left',   fontSize: 'S',  enabled: true, width: 30 },
      };
      els.editorCanvasInner._initialized = false;
      Object.values(els.dropzones).forEach((dz) => {
        const placeholder = dz.el.querySelector('.dropzone__placeholder');
        const preview = dz.el.querySelector('.dropzone__preview');
        show(placeholder); hide(preview);
        dz.el.classList.remove('dropzone--has-file');
        dz.input.value = '';
      });
      hide(els.csvPreview); hide(els.resultsArea);
      state.csvData = null;
      updateContinueButton();
      goToStep(1);
    });

    els.btnToGenerate.addEventListener('click', generateCertificates);
    [els.title, els.date, els.description, els.signatory].forEach((inp) => {
      inp.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { e.preventDefault(); generateCertificates(); }
      });
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
