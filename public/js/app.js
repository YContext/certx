/* ============================================================
   CertX — Frontend App
   Handles file uploads, drag & drop, CSV preview, configuration,
   certificate generation, and gallery display.
   ============================================================ */

(function () {
  'use strict';

  // ── State ─────────────────────────────────────────────────
  const state = {
    templateFile: null,    // File object
    csvFile: null,         // File object
    csvData: null,         // Parsed preview from server
    currentStep: 1,
    batchId: null,
    certificates: [],
  };

  // ── DOM refs ──────────────────────────────────────────────
  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => document.querySelectorAll(sel);

  const els = {
    steps: $$('.step'),
    step1: $('#step1'),
    step2: $('#step2'),
    step3: $('#step3'),

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

    btnToConfig: $('#btn-to-config'),
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
  };

  // Set default date to today
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

  function formatDate(dateStr) {
    if (!dateStr) return '';
    const d = new Date(dateStr + 'T00:00:00');
    return d.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
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
    if (step === 1) show(els.step1);
    if (step === 2) show(els.step2);
    if (step === 3) show(els.step3);
  }

  // ── Dropzone Logic ───────────────────────────────────────
  function initDropzone(key) {
    const dz = els.dropzones[key];
    const { el, input } = dz;

    // Click handler: input is triggered by the hidden input inside
    input.addEventListener('change', () => {
      if (input.files && input.files[0]) {
        handleFile(key, input.files[0]);
      }
    });

    // Drag & drop
    el.addEventListener('dragover', (e) => {
      e.preventDefault();
      el.classList.add('dropzone--dragover');
    });
    el.addEventListener('dragleave', () => {
      el.classList.remove('dropzone--dragover');
    });
    el.addEventListener('drop', (e) => {
      e.preventDefault();
      el.classList.remove('dropzone--dragover');
      const files = e.dataTransfer.files;
      if (files && files[0]) {
        handleFile(key, files[0]);
      }
    });

    // Remove button (delegated)
    const removeBtn = el.querySelector('.dropzone__remove');
    if (removeBtn) {
      removeBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        removeFile(key);
      });
    }
  }

  function handleFile(key, file) {
    state[key === 'template' ? 'templateFile' : 'csvFile'] = file;
    const dz = els.dropzones[key];
    const { el, input } = dz;

    // Show preview
    const placeholder = el.querySelector('.dropzone__placeholder');
    const preview = el.querySelector('.dropzone__preview');
    hide(placeholder);
    show(preview);
    el.classList.add('dropzone--has-file');

    if (key === 'template') {
      const img = preview.querySelector('img');
      const reader = new FileReader();
      reader.onload = (e) => { img.src = e.target.result; };
      reader.readAsDataURL(file);
      el.querySelector('.dropzone__csv-info')?.remove(); // safety
    } else {
      // CSV: show filename and send to server for preview
      const info = preview.querySelector('.dropzone__csv-info');
      const nameSpan = preview.querySelector('.dropzone__csv-name');
      if (info && nameSpan) {
        nameSpan.textContent = file.name;
      }
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
    show(placeholder);
    hide(preview);
    el.classList.remove('dropzone--has-file');
    input.value = '';

    if (key === 'csv') {
      hide(els.csvPreview);
      state.csvData = null;
    }

    updateContinueButton();
  }

  function updateContinueButton() {
    els.btnToConfig.disabled = !(state.templateFile && state.csvFile);
  }

  // ── CSV Preview ──────────────────────────────────────────
  async function previewCSV(file) {
    const formData = new FormData();
    formData.append('csv', file);

    try {
      const res = await fetch('/api/preview-csv', { method: 'POST', body: formData });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      state.csvData = data;
      renderCSVPreview(data);
      show(els.csvPreview);
    } catch (err) {
      toast(err.message, 'error');
      removeFile('csv');
    }
  }

  function renderCSVPreview(data) {
    // Header
    els.csvPreviewTitle.textContent = data.fileName;
    els.csvPreviewCount.textContent = `${data.totalRows} participant${data.totalRows !== 1 ? 's' : ''}`;

    // Table
    const cols = data.columns;
    const thead = els.csvPreviewTable.querySelector('thead');
    const tbody = els.csvPreviewTable.querySelector('tbody');
    thead.innerHTML = '';
    tbody.innerHTML = '';

    const headerRow = document.createElement('tr');
    cols.forEach((c) => {
      const th = document.createElement('th');
      th.textContent = c;
      if (c === data.nameColumn) {
        th.style.color = 'var(--primary)';
        th.innerHTML += ' ⭐';
      }
      headerRow.appendChild(th);
    });
    thead.appendChild(headerRow);

    data.preview.forEach((row) => {
      const tr = document.createElement('tr');
      cols.forEach((c) => {
        const td = document.createElement('td');
        td.textContent = row[c] || '';
        if (c === data.nameColumn) {
          td.style.fontWeight = '600';
        }
        tr.appendChild(td);
      });
      tbody.appendChild(tr);
    });

    // Footer
    els.csvPreviewCol.textContent = `Detected name column: "${data.nameColumn}" ⭐`;
  }

  // ── Generate ─────────────────────────────────────────────
  async function generateCertificates() {
    const formData = new FormData();
    formData.append('template', state.templateFile);
    formData.append('csv', state.csvFile);
    formData.append('title', els.title.value.trim());
    formData.append('description', els.description.value.trim());
    formData.append('signatory', els.signatory.value.trim());
    formData.append('date', els.date.value);

    // Show progress
    hide(els.resultsArea);
    show(els.progressArea);
    els.progressBar.style.width = '0%';
    els.progressText.textContent = 'Uploading files and generating certificates...';
    goToStep(3);
    setLoading(els.btnToGenerate, true);
    els.btnDownloadAll.style.display = 'none';

    try {
      const res = await fetch('/api/generate', { method: 'POST', body: formData });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      state.batchId = data.batchId;
      state.certificates = data.certificates;

      // Simulate progress completion
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
      img.src = cert.url;
      img.alt = cert.name;
      img.loading = 'lazy';
      img.addEventListener('click', () => openLightbox(cert.url, cert.name));

      const body = document.createElement('div');
      body.className = 'gallery__card-body';

      const nameEl = document.createElement('div');
      nameEl.className = 'gallery__card-name';
      nameEl.textContent = cert.name;

      const actions = document.createElement('div');
      actions.className = 'gallery__card-actions';

      const viewBtn = document.createElement('a');
      viewBtn.className = 'btn btn--secondary btn--sm';
      viewBtn.href = cert.url;
      viewBtn.target = '_blank';
      viewBtn.textContent = 'View';

      const dlBtn = document.createElement('a');
      dlBtn.className = 'btn btn--primary btn--sm';
      dlBtn.href = cert.url;
      dlBtn.download = cert.filename;
      dlBtn.textContent = 'Download';

      actions.appendChild(viewBtn);
      actions.appendChild(dlBtn);
      body.appendChild(nameEl);
      body.appendChild(actions);
      card.appendChild(img);
      card.appendChild(body);
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
    img.src = src;
    img.alt = name;

    const close = document.createElement('button');
    close.className = 'modal__close';
    close.innerHTML = '&times;';
    close.addEventListener('click', () => modal.remove());

    content.appendChild(img);
    content.appendChild(close);
    modal.appendChild(content);

    modal.addEventListener('click', (e) => {
      if (e.target === modal) modal.remove();
    });

    document.body.appendChild(modal);

    // Esc key
    const escHandler = (e) => {
      if (e.key === 'Escape') {
        modal.remove();
        document.removeEventListener('keydown', escHandler);
      }
    };
    document.addEventListener('keydown', escHandler);
  }

  // ── Event Binding ────────────────────────────────────────
  function init() {
    // Dropzones
    initDropzone('template');
    initDropzone('csv');

    // Step navigation
    els.btnToConfig.addEventListener('click', () => goToStep(2));
    els.btnBack1.addEventListener('click', () => goToStep(1));
    els.btnBack2.addEventListener('click', () => {
      state.templateFile = null;
      state.csvFile = null;
      state.certificates = [];
      state.batchId = null;
      Object.values(els.dropzones).forEach((dz) => {
        const placeholder = dz.el.querySelector('.dropzone__placeholder');
        const preview = dz.el.querySelector('.dropzone__preview');
        show(placeholder);
        hide(preview);
        dz.el.classList.remove('dropzone--has-file');
        dz.input.value = '';
      });
      hide(els.csvPreview);
      hide(els.resultsArea);
      state.csvData = null;
      updateContinueButton();
      goToStep(1);
    });

    // Generate
    els.btnToGenerate.addEventListener('click', generateCertificates);

    // Enter key on inputs to go to next step or generate
    const inputs = [els.title, els.date, els.description, els.signatory];
    inputs.forEach((inp) => {
      inp.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          generateCertificates();
        }
      });
    });
  }

  // ── Boot ─────────────────────────────────────────────────
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
