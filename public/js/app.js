/* ============================================================
   CertX — Frontend App v2
   Uploads, CSV preview, rich design editor (Excalidraw/Canva-
   style), batch generation.
   ============================================================ */

(function () {
  'use strict';

  const $ = (s) => document.querySelector(s);
  const $$ = (s) => document.querySelectorAll(s);

  // ── State ─────────────────────────────────────────────────
  const state = {
    templateFile: null,
    csvFile: null,
    csvData: null,
    currentStep: 1,
    certificates: [],
  };

  const editor = {
    initialized: false,
    zoom: 1,
    panX: 0,
    panY: 0,
    zoomTouched: false,
    naturalW: 1400,
    naturalH: 900,
    elements: {},
    order: [],            // bottom → top
    selection: new Set(),
    tool: 'select',
    grid: false,
    snap: true,
    snapPx: 10,
    history: [],
    redo: [],
    nextId: 100,
    editingId: null,
    spaceDown: false,
    interaction: null,
    clipboard: [],
    pointers: new Map(),
  };

  const FONT_FAMILIES = [
    'Georgia', 'Times New Roman', 'Arial', 'Arial Black', 'Calibri',
    'Cambria', 'Century Gothic', 'Comic Sans MS', 'Consolas',
    'Courier New', 'Garamond', 'Impact', 'Palatino Linotype',
    'Rockwell', 'Segoe UI', 'Tahoma', 'Trebuchet MS', 'Verdana',
  ];

  const TEXT_COLORS = [
    '#1a1a2e', '#282828', '#3c3c3c', '#475569', '#64748b', '#ffffff',
    '#1e235f', '#6366f1', '#8b5cf6', '#ec4899', '#ef4444', '#f59e0b',
    '#14b8a6', '#10b981',
  ];

  const BG_COLORS = [
    'transparent', '#ffffff', '#f1f5f9', '#eef2ff', '#fef3c7',
    '#fee2e2', '#d1fae5', '#dbeafe', '#6366f1', '#1a1a2e', '#000000',
  ];

  const SHAPE_FILLS = [
    '#6366f1', '#1a1a2e', '#ffffff', '#10b981', '#ef4444',
    '#f59e0b', '#14b8a6', '#ec4899', '#8b5cf6', '#475569',
  ];

  function defaultElements() {
    const today = new Date().toLocaleDateString('en-US', {
      year: 'numeric', month: 'long', day: 'numeric',
    });
    return {
      title:       { id: 'title', type: 'text', label: 'Title', text: 'Certificate of Completion', x: 50, y: 12, width: 70, height: 12, align: 'center', vAlign: 'middle', fontSize: 64, fontFamily: 'Georgia', fontWeight: 700, fontStyle: 'normal', underline: false, textTransform: 'uppercase', letterSpacing: 1.5, lineHeight: 1.15, color: '#282828', bgColor: 'transparent', opacity: 100, rotation: 0, enabled: true, zIndex: 0 },
      name:        { id: 'name', type: 'csv', label: 'Name', text: '{{Name}}', csvColumn: null, x: 50, y: 38, width: 70, height: 14, align: 'center', vAlign: 'middle', fontSize: 128, fontFamily: 'Georgia', fontWeight: 700, fontStyle: 'normal', underline: false, textTransform: 'none', letterSpacing: 0, lineHeight: 1.1, color: '#1e235f', bgColor: 'transparent', opacity: 100, rotation: 0, enabled: true, zIndex: 1 },
      description: { id: 'description', type: 'text', label: 'Description', text: 'Awarded for participation', x: 15, y: 51, width: 70, height: 8, align: 'left', vAlign: 'middle', fontSize: 34, fontFamily: 'Arial', fontWeight: 400, fontStyle: 'normal', underline: false, textTransform: 'none', letterSpacing: 0, lineHeight: 1.3, color: '#3c3c3c', bgColor: 'transparent', opacity: 100, rotation: 0, enabled: true, zIndex: 2 },
      date:        { id: 'date', type: 'text', label: 'Date', text: today, x: 15, y: 78, width: 30, height: 6, align: 'left', vAlign: 'middle', fontSize: 28, fontFamily: 'Arial', fontWeight: 400, fontStyle: 'normal', underline: false, textTransform: 'none', letterSpacing: 0, lineHeight: 1.2, color: '#000000', bgColor: 'transparent', opacity: 100, rotation: 0, enabled: true, zIndex: 3 },
      signatory:   { id: 'signatory', type: 'text', label: 'Signatory', text: 'Jane Smith', x: 55, y: 78, width: 30, height: 6, align: 'left', vAlign: 'middle', fontSize: 28, fontFamily: 'Arial', fontWeight: 400, fontStyle: 'normal', underline: false, textTransform: 'none', letterSpacing: 0, lineHeight: 1.2, color: '#000000', bgColor: 'transparent', opacity: 100, rotation: 0, enabled: true, zIndex: 4 },
    };
  }

  // ── DOM refs ──────────────────────────────────────────────
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

    editorToolbar: $('#editor-toolbar'),
    editorCanvas: $('#editor-canvas'),
    editorInner: $('#editor-inner'),
    editorTemplateImg: $('#editor-template-img'),
    editorPanel: $('#editor-panel'),
    toolAlign: $('#tool-align'),
    footerHint: $('#editor-footer-hint'),
    zoomOut: $('#zoom-out'),
    zoomIn: $('#zoom-in'),
    zoomPercent: $('#zoom-percent'),
    zoomFit: $('#zoom-fit'),
  };

  // ── Helpers ───────────────────────────────────────────────
  const show = (el) => { el.style.display = ''; };
  const hide = (el) => { el.style.display = 'none'; };
  const clamp = (v, min, max) => Math.min(max, Math.max(min, v));
  const num = (v, d) => { const n = parseFloat(v); return Number.isFinite(n) ? n : d; };

  function toast(message, type = 'info') {
    const el = document.createElement('div');
    el.className = `toast toast--${type}`;
    el.textContent = message;
    els.toastContainer.appendChild(el);
    setTimeout(() => el.remove(), 4000);
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

  // ── Step navigation ───────────────────────────────────────
  function goToStep(step) {
    state.currentStep = step;
    els.steps.forEach((s, i) => {
      const n = i + 1;
      s.classList.toggle('step--active', n === step);
      s.classList.toggle('step--done', n < step);
    });
    hide(els.step1); hide(els.step2); hide(els.step3);
    els.app.classList.toggle('app--wide', step === 2);
    if (step === 1) show(els.step1);
    if (step === 2) { show(els.step2); if (!editor.initialized) initEditor(); }
    if (step === 3) show(els.step3);
  }

  // ── Dropzones ─────────────────────────────────────────────
  function initDropzone(key) {
    const dz = els.dropzones[key];
    const { el, input } = dz;
    input.addEventListener('change', () => {
      if (input.files && input.files[0]) handleFile(key, input.files[0]);
    });
    el.addEventListener('dragover', (e) => { e.preventDefault(); el.classList.add('dropzone--dragover'); });
    el.addEventListener('dragleave', () => el.classList.remove('dropzone--dragover'));
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
    const placeholder = dz.el.querySelector('.dropzone__placeholder');
    const preview = dz.el.querySelector('.dropzone__preview');
    hide(placeholder); show(preview);
    dz.el.classList.add('dropzone--has-file');
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
    const placeholder = dz.el.querySelector('.dropzone__placeholder');
    const preview = dz.el.querySelector('.dropzone__preview');
    show(placeholder); hide(preview);
    dz.el.classList.remove('dropzone--has-file');
    dz.input.value = '';
    if (key === 'csv') { hide(els.csvPreview); state.csvData = null; if (editor.initialized) { const name = editor.elements.name; if (name && tokenCol(name.text) && name.csvColumn && tokenCol(name.text) === name.csvColumn) name.text = '{{Name}}'; } }
    updateContinueButton();
  }

  function updateContinueButton() {
    els.btnToEditor.disabled = !(state.templateFile && state.csvFile);
  }

  // ── CSV preview ───────────────────────────────────────────
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
      // Bind the name element to the detected column
      if (editor.initialized) {
        const name = editor.elements.name;
        if (name && name.text === '{{Name}}') name.text = `{{${data.nameColumn}}}`;
        renderAll();
      }
    } catch (err) {
      toast(err.message, 'error');
      removeFile('csv');
    }
  }

  function renderCSVPreview(data) {
    els.csvPreviewTitle.textContent = data.fileName;
    els.csvPreviewCount.textContent = `${data.totalRows} participant${data.totalRows !== 1 ? 's' : ''}`;
    const thead = els.csvPreviewTable.querySelector('thead');
    const tbody = els.csvPreviewTable.querySelector('tbody');
    thead.innerHTML = ''; tbody.innerHTML = '';
    const hr = document.createElement('tr');
    data.columns.forEach((c) => {
      const th = document.createElement('th');
      th.textContent = c;
      if (c === data.nameColumn) { th.style.color = 'var(--primary)'; th.innerHTML += ' ⭐'; }
      hr.appendChild(th);
    });
    thead.appendChild(hr);
    data.preview.forEach((row) => {
      const tr = document.createElement('tr');
      data.columns.forEach((c) => {
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
  //  DESIGN EDITOR
  // ══════════════════════════════════════════════════════════

  function initEditor() {
    editor.initialized = true;
    editor.elements = defaultElements();
    editor.order = ['title', 'name', 'description', 'date', 'signatory'];
    editor.nextId = 100;
    editor.selection.clear();
    editor.history = [];
    editor.redo = [];
    bindEditorEvents();
    loadTemplateIntoEditor();
    // Always start at fit-to-screen, even before the first paint settles.
    requestAnimationFrame(zoomFit);
    renderAll();
  }

  function loadTemplateIntoEditor() {
    if (state.templateFile) {
      const reader = new FileReader();
      reader.onload = (e) => {
        els.editorTemplateImg.src = e.target.result;
        els.editorTemplateImg.onload = () => {
          editor.naturalW = els.editorTemplateImg.naturalWidth || editor.naturalW;
          editor.naturalH = els.editorTemplateImg.naturalHeight || editor.naturalH;
          applyStageSize();
          zoomFit();
          renderAll();
        };
      };
      reader.readAsDataURL(state.templateFile);
    } else {
      applyStageSize();
      renderAll();
    }
  }

  function applyStageSize() {
    els.editorInner.style.width = editor.naturalW + 'px';
    els.editorInner.style.height = editor.naturalH + 'px';
    els.editorTemplateImg.style.width = editor.naturalW + 'px';
    els.editorTemplateImg.style.height = editor.naturalH + 'px';
    // Canvas is exactly the certificate's aspect ratio — the image
    // itself is the editing ground.
    els.editorCanvas.style.aspectRatio = `${editor.naturalW} / ${editor.naturalH}`;
  }

  // ── Zoom / pan ────────────────────────────────────────────
  function applyView() {
    els.editorInner.style.transform = `translate(${editor.panX}px, ${editor.panY}px) scale(${editor.zoom})`;
    updateZoomLabel();
    renderAll();
  }

  function setZoom(z, cx, cy) {
    z = clamp(z, 0.05, 8);
    const rect = els.editorCanvas.getBoundingClientRect();
    const cxp = cx != null ? cx - rect.left : rect.width / 2;
    const cyp = cy != null ? cy - rect.top : rect.height / 2;
    const ratio = z / editor.zoom;
    editor.panX = cxp - (cxp - editor.panX) * ratio;
    editor.panY = cyp - (cyp - editor.panY) * ratio;
    editor.zoom = z;
    applyView();
  }

  function zoomAt(factor, cx, cy) {
    editor.zoomTouched = true;
    setZoom(editor.zoom * factor, cx, cy);
  }

  function zoomFit() {
    const rect = els.editorCanvas.getBoundingClientRect();
    // No padding: the certificate edge-to-edge fills the canvas.
    const z = clamp(Math.min(rect.width / editor.naturalW, rect.height / editor.naturalH), 0.05, 8);
    editor.zoom = z;
    editor.panX = (rect.width - editor.naturalW * z) / 2;
    editor.panY = (rect.height - editor.naturalH * z) / 2;
    editor.zoomTouched = false;
    applyView();
  }

  function updateZoomLabel() {
    els.zoomPercent.textContent = Math.round(editor.zoom * 100) + '%';
  }

  // ── Element text sampling ─────────────────────────────────
  function firstRow() {
    return state.csvData && state.csvData.preview && state.csvData.preview[0];
  }

  function tokenCol(t) {
    const m = String(t || '').match(/\{\{\s*([^}]+?)\s*\}\}/);
    return m ? m[1].trim() : null;
  }

  function sampleText(el) {
    if (el.type === 'text') return el.text || 'Text';
    const row = firstRow();
    const out = String(el.text || '').replace(/\{\{\s*([^}]+?)\s*\}\}/g, (m, col) => {
      const key = col.trim();
      return row && row[key] != null && row[key] !== '' ? String(row[key]) : `[${key}]`;
    });
    return out || '[Data]';
  }

  // ── Element DOM ───────────────────────────────────────────
  function makeElNode(id) {
    const el = editor.elements[id];
    const node = document.createElement('div');
    node.className = 'el';
    node.dataset.id = id;
    const sel = editor.selection.has(id);
    if (sel) node.classList.add('el--selected');
    if (el.type === 'csv') node.classList.add('el--csv');
    if (!el.enabled) node.classList.add('el--hidden');
    const zoom = editor.zoom;
    const px = (v) => v * zoom;

    if (el.type === 'text' || el.type === 'csv') {
      node.classList.add('el--text');
      node.style.left = el.x + '%';
      node.style.top = el.y + '%';
      node.style.width = el.width + '%';
      node.style.height = el.height + '%';
      node.style.opacity = el.opacity / 100;
      if (el.bgColor && el.bgColor !== 'transparent') node.style.background = el.bgColor;
      if (el.rotation) {
        node.style.transform = `rotate(${el.rotation}deg)`;
        node.style.transformOrigin =
          `${el.align === 'center' ? 50 : el.align === 'right' ? 100 : 0}% ${el.vAlign === 'middle' ? 50 : el.vAlign === 'bottom' ? 100 : 0}%`;
      }
      const content = document.createElement('div');
      content.className = 'el__content';
      content.style.justifyContent = el.vAlign === 'top' ? 'flex-start' : el.vAlign === 'bottom' ? 'flex-end' : 'center';
      const span = document.createElement('span');
      span.className = 'el__text';
      span.textContent = sampleText(el);
      span.style.fontFamily = `'${el.fontFamily}', Georgia, serif`;
      span.style.fontSize = px(el.fontSize) + 'px';
      span.style.fontWeight = el.fontWeight;
      span.style.fontStyle = el.fontStyle;
      span.style.textDecoration = el.underline ? 'underline' : 'none';
      span.style.letterSpacing = px(el.letterSpacing || 0) + 'px';
      span.style.lineHeight = el.lineHeight;
      span.style.color = el.color;
      span.style.textAlign = el.align;
      span.style.textTransform = el.textTransform || 'none';
      span.style.alignSelf = el.align === 'center' ? 'center' : el.align === 'right' ? 'flex-end' : 'flex-start';
      content.appendChild(span);
      node.appendChild(content);
    } else if (el.type === 'rect' || el.type === 'ellipse') {
      node.classList.add(el.type === 'rect' ? 'el--rect' : 'el--ellipse');
      node.style.left = el.x + '%';
      node.style.top = el.y + '%';
      node.style.width = el.width + '%';
      node.style.height = el.height + '%';
      node.style.opacity = el.opacity / 100;
      node.style.background = el.fill && el.fill !== 'transparent' ? el.fill : 'transparent';
      node.style.border = el.stroke && el.stroke !== 'transparent' && el.stroke !== 'none'
        ? `${Math.max(1, px(el.strokeWidth || 2))}px solid ${el.stroke}` : 'none';
      node.style.borderRadius = el.type === 'ellipse' ? '50%' : px(el.borderRadius || 0) + 'px';
      if (el.rotation) { node.style.transform = `rotate(${el.rotation}deg)`; node.style.transformOrigin = '50% 50%'; }
    } else if (el.type === 'line') {
      node.classList.add('el--line');
      const dxPx = (el.width / 100) * editor.naturalW;
      const dyPx = (el.height / 100) * editor.naturalH;
      const lenPc = (Math.sqrt(dxPx * dxPx + dyPx * dyPx) / editor.naturalW) * 100;
      const angle = (Math.atan2(dyPx, dxPx) * 180) / Math.PI;
      node.style.left = el.x + '%';
      node.style.top = el.y + '%';
      node.style.width = lenPc + '%';
      node.style.height = Math.max(1, px(el.strokeWidth || 3)) + 'px';
      node.style.background = el.stroke && el.stroke !== 'transparent' && el.stroke !== 'none' ? el.stroke : '#1a1a2e';
      node.style.borderRadius = '99px';
      node.style.opacity = el.opacity / 100;
      node.style.transform = `rotate(${angle}deg)`;
    }

    const badge = document.createElement('span');
    badge.className = 'el__badge';
    const tok = tokenCol(el.text);
    badge.textContent = el.type === 'csv' ? (tok ? `{{${tok}}}` : 'Data') : el.label;
    node.appendChild(badge);

    ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'].forEach((h) => {
      const hd = document.createElement('span');
      hd.className = `el__handle el__handle--${h}`;
      hd.dataset.handle = h;
      node.appendChild(hd);
    });
    if (el.type !== 'line') {
      const rt = document.createElement('span');
      rt.className = 'el__rotate';
      rt.dataset.rotate = '1';
      node.appendChild(rt);
    }
    return node;
  }

  function renderAll() {
    const inner = els.editorInner;
    inner.querySelectorAll('.el').forEach((n) => n.remove());
    editor.order.forEach((id) => {
      const el = editor.elements[id];
      if (!el) return;
      inner.appendChild(makeElNode(id));
    });
    updateGrid();
    renderPanel();
    updateToolbarState();
  }

  function updateElNode(id) {
    const node = els.editorInner.querySelector(`.el[data-id="${id}"]`);
    if (node) node.replaceWith(makeElNode(id));
  }

  // ── Grid overlay ──────────────────────────────────────────
  function updateGrid() {
    let grid = els.editorInner.querySelector('.grid-overlay');
    if (editor.grid) {
      if (!grid) {
        grid = document.createElement('div');
        grid.className = 'grid-overlay';
        els.editorInner.appendChild(grid);
      }
      const gx = (editor.snapPx / editor.naturalW) * 100;
      const gy = (editor.snapPx / editor.naturalH) * 100;
      grid.style.backgroundImage =
        `linear-gradient(to right, rgba(255,255,255,0.14) 1px, transparent 1px), linear-gradient(to bottom, rgba(255,255,255,0.14) 1px, transparent 1px)`;
      grid.style.backgroundSize = `${100 / gx}% ${100 / gy}%`;
    } else if (grid) {
      grid.remove();
    }
  }
  // ── Selection ─────────────────────────────────────────────
  function selectOnly(id) {
    editor.selection.clear();
    editor.selection.add(id);
    refreshSelection();
  }

  function toggleSelect(id) {
    if (editor.selection.has(id)) editor.selection.delete(id);
    else editor.selection.add(id);
    refreshSelection();
  }

  function clearSelection() {
    editor.selection.clear();
    refreshSelection();
  }

  function refreshSelection() {
    els.editorInner.querySelectorAll('.el').forEach((n) => {
      n.classList.toggle('el--selected', editor.selection.has(n.dataset.id));
    });
    renderPanel();
    updateToolbarState();
  }

  function updateToolbarState() {
    const n = editor.selection.size;
    els.toolAlign.hidden = n < 1;
    const toolBtns = els.editorToolbar.querySelectorAll('[data-tool]');
    toolBtns.forEach((b) => b.classList.toggle('is-active', b.dataset.tool === editor.tool));
    document.getElementById('tool-grid').classList.toggle('is-on', editor.grid);
    document.getElementById('tool-snap').classList.toggle('is-on', editor.snap);
    els.footerHint.textContent =
      n === 0 ? 'Drag to move · Double-click text to edit · ⇧+drag multi-select · Ctrl+wheel zoom · Space+drag pan'
      : n === 1 ? `${n} element selected · Drag to move · ⇧+drag to multi-select`
      : `${n} elements selected`;
    els.editorCanvas.dataset.tool = editor.tool;
  }

  // ── Coordinate helpers ────────────────────────────────────
  function innerPoint(e) {
    const rect = els.editorCanvas.getBoundingClientRect();
    return {
      x: (e.clientX - rect.left - editor.panX) / editor.zoom,
      y: (e.clientY - rect.top - editor.panY) / editor.zoom,
    };
  }

  function snapX(v) {
    const g = (editor.snapPx / editor.naturalW) * 100;
    return Math.round(v / g) * g;
  }

  function snapY(v) {
    const g = (editor.snapPx / editor.naturalH) * 100;
    return Math.round(v / g) * g;
  }

  function snapAngle(deg) {
    return Math.round(deg / 15) * 15;
  }

  // ── Pointer interactions ──────────────────────────────────
  function onPointerDown(e) {
    if (editor.editingId) return;
    if (e.button !== 0 && e.button !== 1) return;
    editor.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (editor.pointers.size === 2) { startPinch(); return; }

    if (e.button === 1) { e.preventDefault(); startPan(e); return; }

    const elNode = e.target.closest('.el');
    if (elNode) {
      const id = elNode.dataset.id;
      const el = editor.elements[id];
      if (!el.enabled) {
        el.enabled = true;
        pushHistory();
        renderAll();
        selectOnly(id);
        return;
      }
      const handle = e.target.closest('[data-handle]');
      if (handle && handle.dataset.rotate) { e.preventDefault(); selectOnly(id); startRotate(e, id); return; }
      if (handle) { e.preventDefault(); selectOnly(id); startResize(e, id, handle.dataset.handle); return; }
      e.preventDefault();
      if (editor.tool !== 'select') { selectOnly(id); setTool('select'); return; }
      if (e.shiftKey) toggleSelect(id);
      else if (!editor.selection.has(id)) selectOnly(id);
      startMove(e);
      return;
    }

    if (e.button !== 0) return;
    if (editor.spaceDown) { startPan(e); return; }
    if (editor.tool === 'select') {
      if (editor.selection.size) clearSelection();
      startMarquee(e);
    } else if (editor.tool === 'text' || editor.tool === 'csv') {
      placeTextElement(e);
    } else {
      startDrawShape(e);
    }
  }

  function onPointerMove(e) {
    if (editor.pointers.has(e.pointerId)) {
      editor.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    }
    if (editor.pinch) updatePinch(e);
    const it = editor.interaction;
    if (!it) return;
    if (it.type === 'move') moveMove(e);
    else if (it.type === 'resize') resizeMove(e);
    else if (it.type === 'rotate') rotateMove(e);
    else if (it.type === 'marquee') marqueeMove(e);
    else if (it.type === 'pan') panMove(e);
    else if (it.type === 'draw') drawMove(e);
  }

  function onPointerUp(e) {
    editor.pointers.delete(e.pointerId);
    if (editor.pinch && editor.pointers.size < 2) {
      editor.pinch = null;
      if (editor.interaction) endInteraction();
      return;
    }
    if (editor.interaction) endInteraction();
  }

  function endInteraction() {
    const it = editor.interaction;
    if (it && it.type === 'draw' && it.ghostId) {
      const el = editor.elements[it.ghostId];
      if (el) {
        if (el.type === 'rect' || el.type === 'ellipse') {
          el.width = Math.max(1, Math.abs(el.width));
          el.height = Math.max(1, Math.abs(el.height));
          if (el.width < 0.5 || el.height < 0.5) { delete editor.elements[it.ghostId]; }
        }
      }
    }
    editor.interaction = null;
    els.editorCanvas.classList.remove('is-dragging');
    window.removeEventListener('pointermove', onPointerMove);
    window.removeEventListener('pointerup', onPointerUp);
    renderAll();
  }

  // ── Move ──────────────────────────────────────────────────
  function startMove(e) {
    const p = innerPoint(e);
    const starts = {};
    editor.selection.forEach((id) => {
      const el = editor.elements[id];
      starts[id] = { x: el.x, y: el.y };
    });
    editor.interaction = { type: 'move', sx: p.x, sy: p.y, starts };
    pushHistory();
    attachDragListeners();
  }

  function moveMove(e) {
    const it = editor.interaction;
    const p = innerPoint(e);
    const dxPc = ((p.x - it.sx) / editor.naturalW) * 100;
    const dyPc = ((p.y - it.sy) / editor.naturalH) * 100;
    editor.selection.forEach((id) => {
      const el = editor.elements[id];
      let nx = it.starts[id].x + dxPc;
      let ny = it.starts[id].y + dyPc;
      if (editor.snap) { nx = snapX(nx); ny = snapY(ny); }
      el.x = clamp(nx, -50, 150);
      el.y = clamp(ny, -50, 150);
      updateElNode(id);
    });
  }

  // ── Resize ────────────────────────────────────────────────
  const RESIZE_RULES = {
    e:  { sx: 1, sy: 0 }, w:  { sx: -1, sy: 0 },
    s:  { sx: 0, sy: 1 }, n:  { sx: 0, sy: -1 },
    se: { sx: 1, sy: 1 }, sw: { sx: -1, sy: 1 },
    ne: { sx: 1, sy: -1 }, nw: { sx: -1, sy: -1 },
  };

  function startResize(e, id, handle) {
    const el = editor.elements[id];
    editor.interaction = {
      type: 'resize', id, handle,
      start: { x: e.clientX, y: e.clientY },
      orig: { x: el.x, y: el.y, w: el.width, h: el.height },
      rot: ((el.rotation || 0) * Math.PI) / 180,
    };
    pushHistory();
    attachDragListeners();
  }

  function resizeMove(e) {
    const it = editor.interaction;
    const el = editor.elements[it.id];
    if (!el) return;
    const rule = RESIZE_RULES[it.handle];
    const dx = (e.clientX - it.start.x) / editor.zoom;
    const dy = (e.clientY - it.start.y) / editor.zoom;
    const cos = Math.cos(-it.rot), sin = Math.sin(-it.rot);
    const lx = dx * cos - dy * sin;
    const ly = dx * sin + dy * cos;
    const dw = (lx / editor.naturalW) * 100 * rule.sx;
    const dh = (ly / editor.naturalH) * 100 * rule.sy;
    const minW = el.type === 'text' || el.type === 'csv' ? 4 : 0.5;
    const minH = el.type === 'text' || el.type === 'csv' ? 2 : 0.5;
    let w = clamp(it.orig.w + (rule.sx ? dw : 0), minW, 300);
    let h = clamp(it.orig.h + (rule.sy ? dh : 0), minH, 300);
    if (editor.snap) { w = snapX(w); h = snapY(h); }
    let x = it.orig.x, y = it.orig.y;
    if (rule.sx === -1) x = it.orig.x + (it.orig.w - w);
    if (rule.sy === -1) y = it.orig.y + (it.orig.h - h);
    el.x = x; el.y = y; el.width = w; el.height = h;
    updateElNode(it.id);
  }

  // ── Rotate ────────────────────────────────────────────────
  function startRotate(e, id) {
    const node = els.editorInner.querySelector(`.el[data-id="${id}"]`);
    const rect = node.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    editor.interaction = {
      type: 'rotate', id, cx, cy,
      startAngle: (Math.atan2(e.clientY - cy, e.clientX - cx) * 180) / Math.PI,
      orig: editor.elements[id].rotation || 0,
    };
    pushHistory();
    attachDragListeners();
  }

  function rotateMove(e) {
    const it = editor.interaction;
    const el = editor.elements[it.id];
    if (!el) return;
    let ang = (Math.atan2(e.clientY - it.cy, e.clientX - it.cx) * 180) / Math.PI;
    let rot = it.orig + (ang - it.startAngle);
    if (e.shiftKey) rot = snapAngle(rot);
    rot = ((rot % 360) + 360) % 360;
    if (rot > 180) rot -= 360;
    el.rotation = Math.round(rot);
    updateElNode(it.id);
  }

  // ── Marquee ───────────────────────────────────────────────
  function startMarquee(e) {
    const p = innerPoint(e);
    const m = document.createElement('div');
    m.className = 'editor__marquee';
    els.editorInner.appendChild(m);
    editor.interaction = { type: 'marquee', sx: p.x, sy: p.y, m };
    attachDragListeners();
  }

  function marqueeMove(e) {
    const it = editor.interaction;
    const p = innerPoint(e);
    const x = Math.min(it.sx, p.x);
    const y = Math.min(it.sy, p.y);
    const w = Math.abs(p.x - it.sx);
    const h = Math.abs(p.y - it.sy);
    it.m.style.left = x + 'px';
    it.m.style.top = y + 'px';
    it.m.style.width = w + 'px';
    it.m.style.height = h + 'px';
    const selected = new Set();
    editor.order.forEach((id) => {
      const el = editor.elements[id];
      if (!el.enabled) return;
      const ex = (el.x / 100) * editor.naturalW;
      const ey = (el.y / 100) * editor.naturalH;
      const ew = (el.width / 100) * editor.naturalW;
      const eh = (el.height / 100) * editor.naturalH;
      if (ex < x + w && ex + ew > x && ey < y + h && ey + eh > y) selected.add(id);
    });
    editor.selection = selected;
    refreshSelection();
  }

  // ── Pan ───────────────────────────────────────────────────
  function startPan(e) {
    editor.interaction = {
      type: 'pan', sx: e.clientX, sy: e.clientY,
      ox: editor.panX, oy: editor.panY,
    };
    els.editorCanvas.classList.add('is-panning');
    attachDragListeners();
  }

  function panMove(e) {
    const it = editor.interaction;
    editor.panX = it.ox + (e.clientX - it.sx);
    editor.panY = it.oy + (e.clientY - it.sy);
    els.editorInner.style.transform = `translate(${editor.panX}px, ${editor.panY}px) scale(${editor.zoom})`;
  }

  // ── Draw shapes ───────────────────────────────────────────
  function startDrawShape(e) {
    const p = innerPoint(e);
    const id = 'el' + editor.nextId++;
    const tool = editor.tool;
    const el = {
      id, type: tool, label: tool === 'rect' ? 'Rectangle' : tool === 'ellipse' ? 'Ellipse' : 'Line',
      x: p.x / editor.naturalW * 100, y: p.y / editor.naturalH * 100,
      width: 0, height: 0, opacity: 100, rotation: 0, enabled: true, zIndex: editor.order.length + 5,
      fill: '#6366f1', stroke: '#1a1a2e', strokeWidth: 2, borderRadius: 0,
    };
    if (tool === 'line') { el.fill = 'transparent'; el.stroke = '#1a1a2e'; el.strokeWidth = 3; }
    editor.elements[id] = el;
    editor.order.push(id);
    editor.interaction = { type: 'draw', sx: p.x, sy: p.y, ghostId: id };
    pushHistory();
    renderAll();
    selectOnly(id);
    attachDragListeners();
  }

  function drawMove(e) {
    const it = editor.interaction;
    const el = editor.elements[it.ghostId];
    if (!el) return;
    const p = innerPoint(e);
    let x = (Math.min(it.sx, p.x) / editor.naturalW) * 100;
    let y = (Math.min(it.sy, p.y) / editor.naturalH) * 100;
    let w = (Math.abs(p.x - it.sx) / editor.naturalW) * 100;
    let h = (Math.abs(p.y - it.sy) / editor.naturalH) * 100;
    if (e.shiftKey) { const m = Math.max(w, h); w = m; h = m; }
    if (editor.snap) { x = snapX(x); y = snapY(y); w = snapX(w); h = snapY(h); }
    el.x = x; el.y = y; el.width = Math.max(w, 0.5); el.height = Math.max(h, 0.5);
    updateElNode(it.ghostId);
  }

  // ── Pinch zoom (touch) ────────────────────────────────────
  function startPinch() {
    if (!editor.interaction) {
      editor.interaction = { type: 'pan', sx: 0, sy: 0, ox: editor.panX, oy: editor.panY };
      els.editorCanvas.classList.add('is-panning');
      attachDragListeners();
    }
    const pts = [...editor.pointers.values()];
    editor.pinch = {
      dist: Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y),
      zoom: editor.zoom,
      mx: (pts[0].x + pts[1].x) / 2,
      my: (pts[0].y + pts[1].y) / 2,
    };
  }

  function updatePinch(e) {
    if (!editor.pinch) return;
    const pts = [...editor.pointers.values()];
    if (pts.length < 2) return;
    const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
    const ratio = dist / editor.pinch.dist;
    setZoom(editor.pinch.zoom * ratio, editor.pinch.mx, editor.pinch.my);
  }

  // ── Place text/csv elements ───────────────────────────────
  function placeTextElement(e) {
    const id = 'el' + editor.nextId++;
    const isCsv = editor.tool === 'csv';
    const col = isCsv && state.csvData ? (state.csvData.columns[0] || '') : null;
    const p = innerPoint(e);
    const cx = clamp((p.x / editor.naturalW) * 100 - 15, 0, 70);
    const cy = clamp((p.y / editor.naturalH) * 100 - 4, 0, 90);
    const el = {
      id, type: isCsv ? 'csv' : 'text', label: isCsv ? 'Data' : 'Text',
      text: isCsv ? (col ? `{{${col}}` : '{{Column}}') : 'New text',
      csvColumn: col,
      x: cx, y: cy, width: 30, height: 8,
      align: 'center', vAlign: 'middle', fontSize: 48, fontFamily: 'Georgia',
      fontWeight: 400, fontStyle: 'normal', underline: false,
      textTransform: 'none', letterSpacing: 0, lineHeight: 1.2,
      color: '#1a1a2e', bgColor: 'transparent', opacity: 100, rotation: 0,
      enabled: true, zIndex: editor.order.length + 5,
    };
    editor.elements[id] = el;
    editor.order.push(id);
    pushHistory();
    renderAll();
    selectOnly(id);
    setTool('select');
    if (!isCsv) startInlineEdit(id);
    else toast('Data field added — pick a column in the panel', 'info');
  }

  function attachDragListeners() {
    window.removeEventListener('pointermove', onPointerMove);
    window.removeEventListener('pointerup', onPointerUp);
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
  }

  // ── Wheel / zoom ──────────────────────────────────────────
  function onWheel(e) {
    e.preventDefault();
    if (e.ctrlKey || e.metaKey) {
      const factor = e.deltaY < 0 ? 1.12 : 1 / 1.12;
      zoomAt(factor, e.clientX, e.clientY);
    } else {
      editor.panX -= e.deltaX;
      editor.panY -= e.deltaY;
      els.editorInner.style.transform = `translate(${editor.panX}px, ${editor.panY}px) scale(${editor.zoom})`;
    }
  }

  // ── Inline text editing ───────────────────────────────────
  function startInlineEdit(id) {
    const el = editor.elements[id];
    if (!el || el.type !== 'text') return;
    if (editor.editingId) commitInlineEdit();
    editor.editingId = id;
    const node = els.editorInner.querySelector(`.el[data-id="${id}"]`);
    const canvasRect = els.editorCanvas.getBoundingClientRect();
    const rect = node.getBoundingClientRect();
    const ta = document.createElement('textarea');
    ta.className = 'el-editor';
    ta.value = el.text;
    ta.style.left = (rect.left - canvasRect.left - 2) + 'px';
    ta.style.top = (rect.top - canvasRect.top - 2) + 'px';
    ta.style.width = rect.width + 'px';
    ta.style.height = Math.max(40, rect.height) + 'px';
    ta.style.fontFamily = `'${el.fontFamily}', Georgia, serif`;
    ta.style.fontSize = (el.fontSize * editor.zoom * 0.9) + 'px';
    ta.style.fontWeight = el.fontWeight;
    ta.style.fontStyle = el.fontStyle;
    ta.style.textAlign = el.align;
    ta.style.lineHeight = el.lineHeight;
    ta.style.color = el.color;
    ta.addEventListener('keydown', (ev) => {
      ev.stopPropagation();
      if (ev.key === 'Escape') { cancelInlineEdit(); }
      else if (ev.key === 'Enter' && !ev.shiftKey) { ev.preventDefault(); commitInlineEdit(); }
    });
    ta.addEventListener('blur', commitInlineEdit);
    els.editorCanvas.appendChild(ta);
    ta.focus();
    ta.select();
  }

  function commitInlineEdit() {
    const id = editor.editingId;
    if (!id) return;
    const ta = els.editorCanvas.querySelector('.el-editor');
    const el = editor.elements[id];
    if (ta && el) {
      const v = ta.value;
      if (v !== el.text) { el.text = v; pushHistory(); }
      renderAll();
      selectOnly(id);
    }
    if (ta) ta.remove();
    editor.editingId = null;
  }

  function cancelInlineEdit() {
    const ta = els.editorCanvas.querySelector('.el-editor');
    if (ta) ta.remove();
    editor.editingId = null;
  }

  function onDblClick(e) {
    const node = e.target.closest('.el');
    if (!node) return;
    const id = node.dataset.id;
    const el = editor.elements[id];
    if (!el.enabled) return;
    if (el.type === 'text') {
      e.preventDefault();
      selectOnly(id);
      startInlineEdit(id);
    } else if (el.type === 'csv') {
      selectOnly(id);
      const fmt = els.editorPanel.querySelector('[data-p="text"]');
      if (fmt) { fmt.focus(); fmt.select(); }
    }
  }

  // ── Tools ─────────────────────────────────────────────────
  function setTool(tool) {
    editor.tool = tool;
    els.editorToolbar.querySelectorAll('[data-tool]').forEach((b) => {
      b.classList.toggle('is-active', b.dataset.tool === tool);
    });
    els.editorCanvas.dataset.tool = tool;
    if (tool === 'select') return;
    clearSelection();
  }

  // ── History ───────────────────────────────────────────────
  function snapshot() {
    return JSON.stringify(editor.order.map((id) => editor.elements[id]));
  }

  function pushHistory() {
    const s = snapshot();
    if (editor.history[editor.history.length - 1] === s) return;
    editor.history.push(s);
    if (editor.history.length > 100) editor.history.shift();
    editor.redo = [];
  }

  function restore(s) {
    const list = JSON.parse(s);
    editor.elements = {};
    editor.order = [];
    list.forEach((el) => {
      editor.elements[el.id] = el;
      editor.order.push(el.id);
    });
    editor.selection.clear();
    renderAll();
  }

  function undo() {
    if (!editor.history.length) return;
    cancelInlineEdit();
    editor.redo.push(snapshot());
    restore(editor.history.pop());
  }

  function redo() {
    if (!editor.redo.length) return;
    cancelInlineEdit();
    editor.history.push(snapshot());
    restore(editor.redo.pop());
  }

  // ── Clipboard / duplicate / delete ────────────────────────
  function copySelected() {
    editor.clipboard = [...editor.selection].map((id) => ({ ...editor.elements[id] }));
  }

  function pasteClipboard() {
    if (!editor.clipboard.length) return;
    pushHistory();
    editor.selection.clear();
    editor.clipboard.forEach((src) => {
      const id = 'el' + editor.nextId++;
      const copy = { ...src, id, x: src.x + 3, y: src.y + 3, zIndex: editor.order.length + 5 };
      editor.elements[id] = copy;
      editor.order.push(id);
      editor.selection.add(id);
    });
    renderAll();
  }

  function duplicateSelected() {
    if (!editor.selection.size) return;
    pushHistory();
    const copied = [...editor.selection].map((id) => ({ ...editor.elements[id] }));
    editor.selection.clear();
    copied.forEach((src) => {
      const id = 'el' + editor.nextId++;
      const copy = { ...src, id, x: src.x + 3, y: src.y + 3, zIndex: editor.order.length + 5 };
      editor.elements[id] = copy;
      editor.order.push(id);
      editor.selection.add(id);
    });
    renderAll();
  }

  function deleteSelected() {
    if (!editor.selection.size) return;
    pushHistory();
    editor.selection.forEach((id) => {
      delete editor.elements[id];
      editor.order = editor.order.filter((o) => o !== id);
    });
    editor.selection.clear();
    renderAll();
  }

  // ── Z-order ───────────────────────────────────────────────
  function zMove(which) {
    if (!editor.selection.size) return;
    pushHistory();
    const sel = [...editor.selection];
    if (which === 'front' || which === 'forward') {
      const ids = sel.slice().sort((a, b) => editor.order.indexOf(a) - editor.order.indexOf(b));
      if (which === 'front') {
        ids.forEach((id) => { editor.order = editor.order.filter((o) => o !== id); editor.order.push(id); });
      } else {
        for (let i = ids.length - 1; i >= 0; i--) {
          const id = ids[i];
          const idx = editor.order.indexOf(id);
          if (idx < editor.order.length - 1) {
            const nxt = editor.order[idx + 1];
            if (!sel.includes(nxt)) { editor.order[idx] = nxt; editor.order[idx + 1] = id; }
          }
        }
      }
    } else {
      const ids = sel.slice().sort((a, b) => editor.order.indexOf(a) - editor.order.indexOf(b));
      if (which === 'back') {
        ids.forEach((id) => { editor.order = editor.order.filter((o) => o !== id); editor.order.unshift(id); });
      } else {
        ids.forEach((id) => {
          const idx = editor.order.indexOf(id);
          if (idx > 0) {
            const prv = editor.order[idx - 1];
            if (!sel.includes(prv)) { editor.order[idx] = prv; editor.order[idx - 1] = id; }
          }
        });
      }
    }
    editor.order.forEach((id, i) => { editor.elements[id].zIndex = i + 5; });
    renderAll();
  }

  // ── Alignment / distribution ──────────────────────────────
  function alignSelection(which) {
    if (!editor.selection.size) return;
    pushHistory();
    const ids = [...editor.selection];
    const get = (id) => editor.elements[id];
    if (ids.length === 1) {
      const el = get(ids[0]);
      if (which === 'left') el.x = 0;
      if (which === 'right') el.x = 100 - el.width;
      if (which === 'centerX') el.x = (100 - el.width) / 2;
      if (which === 'top') el.y = 0;
      if (which === 'bottom') el.y = 100 - el.height;
      if (which === 'centerY') el.y = (100 - el.height) / 2;
    } else {
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      ids.forEach((id) => {
        const el = get(id);
        minX = Math.min(minX, el.x);
        minY = Math.min(minY, el.y);
        maxX = Math.max(maxX, el.x + el.width);
        maxY = Math.max(maxY, el.y + el.height);
      });
      ids.forEach((id) => {
        const el = get(id);
        if (which === 'left') el.x = minX;
        if (which === 'right') el.x = maxX - el.width;
        if (which === 'centerX') el.x = (minX + maxX) / 2 - el.width / 2;
        if (which === 'top') el.y = minY;
        if (which === 'bottom') el.y = maxY - el.height;
        if (which === 'centerY') el.y = (minY + maxY) / 2 - el.height / 2;
      });
      if (which === 'distH') distribute('x');
      if (which === 'distV') distribute('y');
    }
    renderAll();
  }

  function distribute(axis) {
    const ids = [...editor.selection].sort((a, b) =>
      axis === 'x'
        ? editor.elements[a].x - editor.elements[b].x
        : editor.elements[a].y - editor.elements[b].y
    );
    if (ids.length < 3) return;
    const first = editor.elements[ids[0]];
    const last = editor.elements[ids[ids.length - 1]];
    let total = 0;
    ids.forEach((id) => {
      const el = editor.elements[id];
      total += axis === 'x' ? el.width : el.height;
    });
    const span = (axis === 'x' ? last.x + last.width - first.x : last.y + last.height - first.y) - total;
    const gap = span / (ids.length - 1);
    let pos = axis === 'x' ? first.x + first.width : first.y + first.height;
    for (let i = 1; i < ids.length - 1; i++) {
      const el = editor.elements[ids[i]];
      if (axis === 'x') { el.x = pos + gap; pos = el.x + el.width; }
      else { el.y = pos + gap; pos = el.y + el.height; }
    }
  }

  // ── Grid / snap toggles ───────────────────────────────────
  function toggleGrid() {
    editor.grid = !editor.grid;
    updateGrid();
    updateToolbarState();
  }

  function toggleSnap() {
    editor.snap = !editor.snap;
    updateToolbarState();
  }
  // ── Keyboard ──────────────────────────────────────────────
  function isTyping(e) {
    const t = e.target;
    return t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable;
  }

  function onKeyDown(e) {
    if (state.currentStep !== 2) return;
    if (e.code === 'Space' && !isTyping(e)) {
      editor.spaceDown = true;
      e.preventDefault();
      return;
    }
    if (isTyping(e)) return;
    const mod = e.ctrlKey || e.metaKey;
    if (mod && e.key.toLowerCase() === 'z') { e.preventDefault(); e.shiftKey ? redo() : undo(); return; }
    if (mod && e.key.toLowerCase() === 'y') { e.preventDefault(); redo(); return; }
    if (mod && e.key.toLowerCase() === 'd') { e.preventDefault(); duplicateSelected(); return; }
    if (mod && e.key.toLowerCase() === 'c') { e.preventDefault(); copySelected(); return; }
    if (mod && e.key.toLowerCase() === 'v') { e.preventDefault(); pasteClipboard(); return; }
    if (mod) return;

    switch (e.key) {
      case 'Delete':
      case 'Backspace':
        e.preventDefault();
        deleteSelected();
        return;
      case 'Escape':
        if (editor.editingId) { cancelInlineEdit(); return; }
        if (editor.selection.size) { clearSelection(); return; }
        setTool('select');
        return;
      case 'v': case 'V': setTool('select'); return;
      case 't': case 'T': setTool('text'); return;
      case 'd': case 'D': setTool('csv'); return;
      case 'r': case 'R': setTool('rect'); return;
      case 'o': case 'O': setTool('ellipse'); return;
      case 'l': case 'L': setTool('line'); return;
      case 'g': case 'G': toggleGrid(); return;
      case '0': zoomFit(); return;
      case '+': case '=': zoomAt(1.15, null, null); return;
      case '-': zoomAt(1 / 1.15, null, null); return;
    }

    if (editor.selection.size) {
      let dx = 0, dy = 0;
      const step = e.shiftKey ? 5 : 1;
      if (e.key === 'ArrowLeft') dx = -step;
      else if (e.key === 'ArrowRight') dx = step;
      else if (e.key === 'ArrowUp') dy = -step;
      else if (e.key === 'ArrowDown') dy = step;
      if (dx || dy) {
        e.preventDefault();
        pushHistory();
        const gx = (editor.snapPx / editor.naturalW) * 100;
        const gy = (editor.snapPx / editor.naturalH) * 100;
        editor.selection.forEach((id) => {
          const el = editor.elements[id];
          el.x = clamp(el.x + dx * gx, -50, 150);
          el.y = clamp(el.y + dy * gy, -50, 150);
          updateElNode(id);
        });
      }
    }
  }  function onKeyUp(e) {
    if (e.code === 'Space') editor.spaceDown = false;
  }

  // ── Panel rendering ───────────────────────────────────────
  function renderPanel() {
    const panel = els.editorPanel;
    const sel = [...editor.selection].filter((id) => editor.elements[id]);
    if (!sel.length) { panel.innerHTML = panelEmptyHTML(); return; }
    if (sel.length === 1) { panel.innerHTML = panelSingleHTML(sel[0]); return; }
    panel.innerHTML = panelMultiHTML(sel.length);
  }

  const panelEmptyHTML = () => `
    <div class="panel-empty">
      <div class="panel-empty__icon">🎨</div>
      <div class="panel-empty__title">Design your certificate</div>
      <div class="panel-empty__sub">Select an element to edit it, or add something new. Everything renders on the generated certificates.</div>
      <div class="panel-empty__grid">
        <button class="panel-empty__btn" data-add="text">➕<span>Text</span></button>
        <button class="panel-empty__btn" data-add="csv">📊<span>Data field</span></button>
        <button class="panel-empty__btn" data-add="rect">▭<span>Rectangle</span></button>
        <button class="panel-empty__btn" data-add="ellipse">◯<span>Ellipse</span></button>
        <button class="panel-empty__btn" data-add="line">╱<span>Line</span></button>
        <button class="panel-empty__btn" id="panel-duplicate" ${editor.clipboard.length ? '' : 'disabled'} style="${editor.clipboard.length ? '' : 'opacity:.4'}">📋<span>Paste</span></button>
      </div>
    </div>`;

  const panelMultiHTML = (n) => `
    <div class="panel__section">
      <div class="panel__name">
        <div class="panel__name-icon">⧉</div>
        <div>
          <div class="panel__name-title">${n} elements selected</div>
          <div class="panel__name-sub">Use the toolbar to align &amp; distribute</div>
        </div>
      </div>
    </div>
    <div class="panel__section">
      <div class="panel__label">Arrange</div>
      <div class="panel-actions">
        <button class="panel-btn" data-act="duplicate">⧉ Duplicate</button>
        <button class="panel-btn panel-btn--danger" data-act="delete">🗑 Delete</button>
        <button class="panel-btn" data-act="front">⬆ To front</button>
        <button class="panel-btn" data-act="back">⬇ To back</button>
      </div>
    </div>
    ${layersHTML()}`;

  const layersHTML = () => {
    const rows = [...editor.order].reverse().map((id) => {
      const el = editor.elements[id];
      if (!el) return '';
      const active = editor.selection.has(id) ? ' is-active' : '';
      const hidden = el.enabled ? '' : ' is-hidden';
      const color = el.type === 'text' || el.type === 'csv' ? (el.color || '#64748b')
        : el.type === 'line' ? (el.stroke || '#64748b') : (el.fill || '#64748b');
      const name = el.label || (el.type === 'text' ? 'Text' : el.type === 'csv' ? 'Data' : el.type);
      return `
        <div class="layer-row${active}${hidden}" data-layer="${id}">
          <span class="layer-row__dot" style="background:${color}"></span>
          <span class="layer-row__name">${escapeHtml(name)}</span>
          <button class="layer-row__btn" data-eye="${id}" title="${el.enabled ? 'Hide' : 'Show'}">${el.enabled ? '👁' : '🚫'}</button>
          <button class="layer-row__btn" data-zup="${id}" title="Move up">▲</button>
          <button class="layer-row__btn" data-zdown="${id}" title="Move down">▼</button>
        </div>`;
    }).join('');
    return `
      <div class="panel__section">
        <div class="panel__label">Layers <span style="text-transform:none">(top first)</span></div>
        <div class="layers">${rows}</div>
      </div>`;
  };

  function panelSingleHTML(id) {
    const el = editor.elements[id];
    const isText = el.type === 'text' || el.type === 'csv';
    const icon = el.type === 'text' ? 'T' : el.type === 'csv' ? '⛁' : el.type === 'rect' ? '▭' : el.type === 'ellipse' ? '◯' : '╱';
    let html = `
      <div class="panel__section">
        <div class="panel__name">
          <div class="panel__name-icon">${icon}</div>
          <div>
            <div class="panel__name-title">${escapeHtml(el.label || el.type)}</div>
            <div class="panel__name-sub">${el.type === 'text' ? 'Static text' : el.type === 'csv' ? 'Data field' : el.type === 'rect' ? 'Rectangle' : el.type === 'ellipse' ? 'Ellipse' : 'Line'}</div>
          </div>
        </div>
      </div>`;

    if (isText) {
      const row = firstRow();
      const cols = state.csvData ? state.csvData.columns : [];
      html += `
      <div class="panel__section">
        <div class="panel__label">${el.type === 'csv' ? 'Data &amp; Format' : 'Content'}</div>
        ${el.type === 'csv' ? `
        <div class="prop-field" style="margin-bottom:8px">
          <label>Data column</label>
          <select class="select" data-p="csvColumn">
            <option value="">— Static text —</option>
            ${cols.map((c) => `<option value="${escapeHtml(c)}" ${tokenCol(el.text) === c ? 'selected' : ''}>${escapeHtml(c)}</option>`).join('')}
          </select>
        </div>
        <div class="prop-field" style="margin-bottom:8px">
          <label>Format <span style="text-transform:none;font-weight:400">(use {{Column}})</span></label>
          <textarea class="text-input text-input--area" data-p="text">${escapeHtml(el.text || '')}</textarea>
        </div>
        ${row ? `<div class="panel__row" style="font-size:.72rem;color:var(--text-secondary)">Preview: <strong style="margin-left:4px">${escapeHtml(sampleText(el))}</strong></div>` : ''}
        ` : `
        <textarea class="text-input text-input--area" data-p="text">${escapeHtml(el.text || '')}</textarea>
        `}
      </div>
      <div class="panel__section">
        <div class="panel__label">Font</div>
        <div class="prop-field" style="margin-bottom:8px">
          <select class="select" data-p="fontFamily">
            ${FONT_FAMILIES.map((f) => `<option ${el.fontFamily === f ? 'selected' : ''}>${f}</option>`).join('')}
          </select>
        </div>
        <div class="panel__row">
          <input class="slider" type="range" min="8" max="300" step="1" value="${el.fontSize}" data-p="fontSize" />
          <input class="num-input" style="width:64px" type="number" min="8" max="300" value="${el.fontSize}" data-p="fontSize" />
        </div>
        <div class="panel__row">
          <button class="icon-btn ${el.fontWeight >= 600 ? 'is-active' : ''}" data-p="bold" title="Bold">B</button>
          <button class="icon-btn ${el.fontStyle === 'italic' ? 'is-active' : ''}" data-p="italic" title="Italic"><em>I</em></button>
          <button class="icon-btn ${el.underline ? 'is-active' : ''}" data-p="underline" title="Underline"><u>U</u></button>
          <div style="flex:1"></div>
          <select class="select" data-p="transform" style="width:130px">
            ${[['none', 'Aa'], ['uppercase', 'AA'], ['lowercase', 'aa'], ['capitalize', 'Aa']]
              .map(([v, l]) => `<option value="${v}" ${(el.textTransform || 'none') === v ? 'selected' : ''}>${l}</option>`).join('')}
          </select>
        </div>
        <div class="panel__row" style="margin-top:8px">
          <span style="font-size:.72rem;color:var(--text-secondary);width:88px">Letter spacing</span>
          <input class="slider" type="range" min="0" max="12" step="0.5" value="${el.letterSpacing || 0}" data-p="letterSpacing" />
          <span style="font-size:.7rem;width:24px;text-align:right">${el.letterSpacing || 0}</span>
        </div>
        <div class="panel__row">
          <span style="font-size:.72rem;color:var(--text-secondary);width:88px">Line height</span>
          <input class="slider" type="range" min="0.8" max="2.5" step="0.05" value="${el.lineHeight || 1.2}" data-p="lineHeight" />
          <span style="font-size:.7rem;width:24px;text-align:right">${(el.lineHeight || 1.2).toFixed(2)}</span>
        </div>
      </div>
      <div class="panel__section">
        <div class="panel__label">Alignment</div>
        <div class="panel__row">
          <div class="seg" style="flex:1">
            ${['left', 'center', 'right'].map((a) => `<button class="seg__btn ${el.align === a ? 'is-active' : ''}" data-p="align" data-val="${a}">${a === 'left' ? '⇤' : a === 'center' ? '⇹' : '⇥'}</button>`).join('')}
          </div>
          <div class="seg" style="flex:1">
            ${[['top', '⇑'], ['middle', '⇕'], ['bottom', '⇓']].map(([a, g]) => `<button class="seg__btn ${el.vAlign === a ? 'is-active' : ''}" data-p="vAlign" data-val="${a}">${g}</button>`).join('')}
          </div>
        </div>
      </div>
      <div class="panel__section">
        <div class="panel__label">Color</div>
        <div class="prop-field" style="margin-bottom:8px">
          <label>Text color</label>
          <div class="color-row">
            ${TEXT_COLORS.map((c) => swatchHTML(c, el.color, 'color')).join('')}
            <input type="color" class="color-input" data-p="color" value="${el.color}" />
          </div>
        </div>
        <div class="prop-field" style="margin-bottom:8px">
          <label>Background</label>
          <div class="color-row">
            ${BG_COLORS.map((c) => swatchHTML(c, el.bgColor, 'bgColor')).join('')}
          </div>
        </div>
        <div class="panel__row">
          <span style="font-size:.72rem;color:var(--text-secondary);width:88px">Opacity</span>
          <input class="slider" type="range" min="0" max="100" step="1" value="${el.opacity}" data-p="opacity" />
          <span style="font-size:.7rem;width:28px;text-align:right">${el.opacity}%</span>
        </div>
      </div>`;
    } else {
      const shapeColor = el.type === 'line' ? (el.stroke || '#1a1a2e') : (el.fill || '#6366f1');
      html += `
      <div class="panel__section">
        <div class="panel__label">Style</div>
        ${el.type === 'line' ? `
        <div class="prop-field" style="margin-bottom:8px">
          <label>Color</label>
          <div class="color-row">${SHAPE_FILLS.map((c) => swatchHTML(c, shapeColor, 'stroke')).join('')}
            <input type="color" class="color-input" data-p="stroke" value="${el.stroke && el.stroke !== 'transparent' ? el.stroke : '#1a1a2e'}" />
          </div>
        </div>` : `
        <div class="prop-field" style="margin-bottom:8px">
          <label>Fill</label>
          <div class="color-row">${SHAPE_FILLS.map((c) => swatchHTML(c, shapeColor, 'fill')).join('')}
            <input type="color" class="color-input" data-p="fill" value="${el.fill && el.fill !== 'transparent' ? el.fill : '#6366f1'}" />
          </div>
        </div>
        <div class="prop-field" style="margin-bottom:8px">
          <label>Outline</label>
          <div class="color-row">
            ${['transparent', '#ffffff', '#1a1a2e', '#6366f1', '#64748b', '#000000'].map((c) => swatchHTML(c, el.stroke, 'stroke')).join('')}
            <input type="color" class="color-input" data-p="stroke" value="${el.stroke && el.stroke !== 'transparent' ? el.stroke : '#1a1a2e'}" />
          </div>
        </div>
        <div class="panel__row">
          <span style="font-size:.72rem;color:var(--text-secondary);width:88px">Outline</span>
          <input class="slider" type="range" min="0" max="30" step="1" value="${el.strokeWidth || (el.type === 'line' ? 3 : 2)}" data-p="strokeWidth" />
          <span style="font-size:.7rem;width:24px;text-align:right">${el.strokeWidth || (el.type === 'line' ? 3 : 2)}</span>
        </div>
        ${el.type === 'rect' ? `
        <div class="panel__row">
          <span style="font-size:.72rem;color:var(--text-secondary);width:88px">Radius</span>
          <input class="slider" type="range" min="0" max="80" step="1" value="${el.borderRadius || 0}" data-p="borderRadius" />
          <span style="font-size:.7rem;width:24px;text-align:right">${el.borderRadius || 0}</span>
        </div>` : ''}
        <div class="panel__row">
          <span style="font-size:.72rem;color:var(--text-secondary);width:88px">Opacity</span>
          <input class="slider" type="range" min="0" max="100" step="1" value="${el.opacity}" data-p="opacity" />
          <span style="font-size:.7rem;width:28px;text-align:right">${el.opacity}%</span>
        </div>
        `}
      </div>`;
    }

    html += `
      <div class="panel__section">
        <div class="panel__label">Position &amp; Size <span style="text-transform:none;font-weight:400">(% of template)</span></div>
        <div class="prop-grid">
          <div class="prop-field"><label>X</label><input class="num-input" type="number" step="0.5" value="${Math.round(el.x * 10) / 10}" data-p="x" /></div>
          <div class="prop-field"><label>Y</label><input class="num-input" type="number" step="0.5" value="${Math.round(el.y * 10) / 10}" data-p="y" /></div>
          <div class="prop-field"><label>W</label><input class="num-input" type="number" step="0.5" value="${Math.round(el.width * 10) / 10}" data-p="w" /></div>
          <div class="prop-field"><label>H</label><input class="num-input" type="number" step="0.5" value="${Math.round(el.height * 10) / 10}" data-p="h" /></div>
          ${el.type !== 'line' ? `<div class="prop-field"><label>Rot</label><input class="num-input" type="number" step="1" value="${el.rotation || 0}" data-p="rotation" /></div>` : ''}
        </div>
      </div>
      <div class="panel__section">
        <div class="panel__label">Arrange</div>
        <div class="switch-row">
          <span>Visible on certificate</span>
          <button class="switch ${el.enabled ? 'is-on' : ''}" data-p="enabled" data-val="${el.enabled ? 1 : 0}"></button>
        </div>
        <div class="panel-actions" style="margin-top:10px">
          <button class="panel-btn" data-act="duplicate">⧉ Duplicate</button>
          <button class="panel-btn" data-act="front">⬆ Front</button>
          <button class="panel-btn" data-act="back">⬇ Back</button>
          <button class="panel-btn panel-btn--danger" data-act="delete">🗑 Delete</button>
        </div>
      </div>
      ${layersHTML()}`;
    return html;
  }

  function swatchHTML(color, current, prop = 'color') {
    if (color === 'transparent') {
      return `<button class="swatch is-${current === 'transparent' || !current || current === 'none' ? 'active' : ''}" data-color="transparent" data-prop="${prop}" style="background:linear-gradient(135deg,#fff 45%,#ef4444 46%,#ef4444 54%,#fff 55%)" title="None"></button>`;
    }
    return `<button class="swatch ${current === color ? 'is-active' : ''}" data-color="${color}" data-prop="${prop}" style="background:${color}" title="${color}"></button>`;
  }

  // ── Panel events (delegated, bound once at load) ─────────────
  els.editorPanel.addEventListener('click', (e) => {
      const add = e.target.closest('[data-add]');
      if (add) {
        const t = add.dataset.add;
        if (t === 'text' || t === 'csv') placeTextNow(t);
        else if (t === 'rect' || t === 'ellipse' || t === 'line') placeShapeNow(t);
        return;
      }
      if (e.target.id === 'panel-duplicate') { pasteClipboard(); return; }
      const act = e.target.closest('[data-act]');
      if (act) {
        const a = act.dataset.act;
        if (a === 'duplicate') duplicateSelected();
        if (a === 'delete') deleteSelected();
        if (a === 'front') zMove('front');
        if (a === 'back') zMove('back');
        return;
      }
      const layer = e.target.closest('[data-layer]');
      if (layer) { selectOnly(layer.dataset.layer); return; }
      const eye = e.target.closest('[data-eye]');
      if (eye) {
        const el = editor.elements[eye.dataset.eye];
        if (el) { pushHistory(); el.enabled = !el.enabled; renderAll(); if (editor.selection.size === 1) selectOnly(eye.dataset.eye); }
        return;
      }
      const zup = e.target.closest('[data-zup]');
      if (zup) { selectOnly(zup.dataset.zup); zMove('forward'); return; }
      const zdown = e.target.closest('[data-zdown]');
      if (zdown) { selectOnly(zdown.dataset.zdown); zMove('backward'); return; }
      const sw = e.target.closest('[data-color]');
      if (sw) {
        const el = editor.elements[[...editor.selection][0]];
        if (!el) return;
        pushHistory();
        el[sw.dataset.prop || 'color'] = sw.dataset.color;
        renderAll();
        return;
      }
      const pv = e.target.closest('[data-p][data-val]');
      if (pv) {
        const el = editor.elements[[...editor.selection][0]];
        if (!el) return;
        const p = pv.dataset.p;
        if (p === 'enabled') {
          pushHistory();
          el.enabled = !el.enabled;
          renderAll();
        } else if (p === 'align' || p === 'vAlign') {
          pushHistory();
          el[p] = pv.dataset.val;
          renderPanel();
        } else if (p === 'bold') {
          pushHistory();
          el.fontWeight = el.fontWeight >= 600 ? 400 : 700;
          renderAll();
        } else if (p === 'italic') {
          pushHistory();
          el.fontStyle = el.fontStyle === 'italic' ? 'normal' : 'italic';
          renderAll();
        } else if (p === 'underline') {
          pushHistory();
          el.underline = !el.underline;
          renderAll();
        }
      }
    });

  function placeTextNow(tool) {
    const canvas = els.editorCanvas.getBoundingClientRect();
    const fake = { clientX: canvas.left + canvas.width / 2, clientY: canvas.top + canvas.height / 2 };
    editor.tool = tool;
    placeTextElement(fake);
  }

  function placeShapeNow(tool) {
    const canvas = els.editorCanvas.getBoundingClientRect();
    const fake = { clientX: canvas.left + canvas.width / 2, clientY: canvas.top + canvas.height / 2 };
    editor.tool = tool;
    startDrawShape(fake);
    const el = editor.elements[editor.interaction.ghostId];
    if (el) { el.width = 18; el.height = 12; if (tool === 'line') { el.width = 25; el.height = 0; } }
    endInteraction();
    setTool('select');
    renderAll();
    if (el) selectOnly(el.id);
  }

  function onPanelChange(e, final) {
    const t = e.target;
    const p = t.dataset.p;
    if (!p) return;
    const id = [...editor.selection][0];
    const el = id ? editor.elements[id] : null;
    if (!el) return;
    if (!editor._histLock) pushHistory();
    const val = t.type === 'number' || t.type === 'range' ? num(t.value, 0) : t.value;
    if (p === 'text') el.text = t.value;
    else if (p === 'csvColumn') {
      if (t.value) el.text = `{{${t.value}}}`;
      el.csvColumn = t.value || null;
    } else if (p === 'fontSize') { el.fontSize = clamp(num(t.value, 48), 4, 1024); syncNumInputs(t, el.fontSize); }
    else if (p === 'fontFamily') el.fontFamily = t.value;
    else if (p === 'transform') el.textTransform = t.value;
    else if (p === 'letterSpacing') el.letterSpacing = val;
    else if (p === 'lineHeight') el.lineHeight = val;
    else if (p === 'align' || p === 'vAlign') { el[p] = t.dataset.val; renderPanel(); return; }
    else if (p === 'color') el.color = t.value;
    else if (p === 'fill') el.fill = t.value;
    else if (p === 'stroke') el.stroke = t.value;
    else if (p === 'strokeWidth') el.strokeWidth = val;
    else if (p === 'borderRadius') el.borderRadius = val;
    else if (p === 'opacity') el.opacity = clamp(val, 0, 100);
    else if (p === 'rotation') el.rotation = val;
    else if (p === 'x') el.x = clamp(val, -50, 150);
    else if (p === 'y') el.y = clamp(val, -50, 150);
    else if (p === 'w') el.width = clamp(val, 0.5, 300);
    else if (p === 'h') el.height = clamp(val, 0.5, 300);
    // Live updates only touch the element node so the panel keeps focus;
    // final (blur/change) events rebuild the whole panel.
    if (p === 'text') updateElNode(id);
    else if (final) renderAll();
    else updateElNode(id);
  }

  function syncNumInputs(changed, val) {
    els.editorPanel.querySelectorAll(`[data-p="${changed.dataset.p}"]`).forEach((n) => {
      if (n !== changed) n.value = val;
    });
  }

  // ── Editor events ─────────────────────────────────────────
  function bindEditorEvents() {
    const canvas = els.editorCanvas;
    canvas.addEventListener('pointerdown', onPointerDown);
    canvas.addEventListener('dblclick', onDblClick);
    canvas.addEventListener('wheel', onWheel, { passive: false });

    els.editorToolbar.addEventListener('click', (e) => {
      const btn = e.target.closest('button');
      if (!btn) return;
      const tool = btn.dataset.tool;
      if (tool) setTool(tool);
      if (btn.id === 'tool-undo') undo();
      if (btn.id === 'tool-redo') redo();
      if (btn.id === 'tool-duplicate') duplicateSelected();
      if (btn.id === 'tool-delete') deleteSelected();
      if (btn.id === 'tool-front') zMove('front');
      if (btn.id === 'tool-back') zMove('back');
      if (btn.id === 'tool-grid') toggleGrid();
      if (btn.id === 'tool-snap') toggleSnap();
      const al = btn.dataset.align;
      if (al) alignSelection(al);
    });

    // Panel delegation — bound once, the panel element persists.
    const panel = els.editorPanel;
    panel.addEventListener('pointerdown', (e) => {
      if (e.target.closest('input, textarea, select, [data-p]')) editor._histLock = true;
    });
    panel.addEventListener('input', (e) => onPanelChange(e, false));
    panel.addEventListener('change', (e) => onPanelChange(e, true));
    window.addEventListener('pointerup', () => { setTimeout(() => { editor._histLock = false; }, 60); });

    els.zoomOut.addEventListener('click', () => zoomAt(1 / 1.15, null, null));
    els.zoomIn.addEventListener('click', () => zoomAt(1.15, null, null));
    els.zoomPercent.addEventListener('click', () => { editor.zoomTouched = true; setZoom(1, null, null); });
    els.zoomFit.addEventListener('click', () => { editor.zoomTouched = false; zoomFit(); });

    window.addEventListener('resize', () => {
      if (editor.initialized && !editor.zoomTouched) zoomFit();
    });

    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('keyup', onKeyUp);
  }

  // ── Generate ──────────────────────────────────────────────
  function serializeElements() {
    const positions = {};
    editor.order.forEach((id) => {
      const el = editor.elements[id];
      positions[id] = { ...el };
    });
    return positions;
  }

  async function generateCertificates() {
    if (!editor.initialized) return;
    cancelInlineEdit();
    const fd = new FormData();
    fd.append('template', state.templateFile);
    fd.append('csv', state.csvFile);
    fd.append('positions', JSON.stringify(serializeElements()));

    hide(els.resultsArea);
    show(els.progressArea);
    els.progressBar.style.width = '0%';
    els.progressText.textContent = 'Rendering certificates...';
    goToStep(3);
    setLoading(els.btnToGenerate, true);
    els.btnDownloadAll.style.display = 'none';

    try {
      const res = await fetch('/api/generate', { method: 'POST', body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      state.certificates = data.certificates;
      els.progressBar.style.width = '100%';
      els.progressText.textContent = `Generated ${data.total} certificate${data.total !== 1 ? 's' : ''}!`;
      setTimeout(() => {
        hide(els.progressArea);
        renderResults(data);
        show(els.resultsArea);
      }, 400);
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
    els.resultsSummary.textContent = `✅ Successfully generated ${data.total} certificate${data.total !== 1 ? 's' : ''} for "${data.title || ''}" with ${data.csvFileName}`;
  }

  // ── Lightbox ──────────────────────────────────────────────
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

  // ── Init ──────────────────────────────────────────────────
  function resetAll() {
    state.templateFile = null;
    state.csvFile = null;
    state.csvData = null;
    state.certificates = [];
    editor.initialized = false;
    Object.values(els.dropzones).forEach((dz) => {
      const placeholder = dz.el.querySelector('.dropzone__placeholder');
      const preview = dz.el.querySelector('.dropzone__preview');
      show(placeholder); hide(preview);
      dz.el.classList.remove('dropzone--has-file');
      dz.input.value = '';
    });
    hide(els.csvPreview); hide(els.resultsArea);
    updateContinueButton();
    goToStep(1);
  }

  function init() {
    const yearEl = document.getElementById('footer-year');
    if (yearEl) yearEl.textContent = new Date().getFullYear();

    initDropzone('template');
    initDropzone('csv');
    els.btnToEditor.addEventListener('click', () => goToStep(2));
    els.btnBack1.addEventListener('click', () => goToStep(1));
    els.btnBack2.addEventListener('click', resetAll);
    els.btnToGenerate.addEventListener('click', generateCertificates);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
