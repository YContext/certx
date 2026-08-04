const { Jimp } = require('jimp');
const { Resvg } = require('@resvg/resvg-js');
const opentype = require('opentype.js');
const path = require('path');
const fs = require('fs');

const SUPPORTED_EXTS = ['.png', '.jpg', '.jpeg', '.webp'];
const CANVAS_W = 1400;
const CANVAS_H = 900;

// Legacy font-size presets (kept for backward compatibility with old saves)
const FONT_PRESETS = { XS: 16, S: 32, M: 48, L: 64, XL: 128 };

// ── Default elements (legacy field keys preserved) ─────────────
const DEFAULT_POSITIONS = {
  title: {
    id: 'title', type: 'text', label: 'Title', text: 'Certificate of Completion',
    x: 50, y: 12, width: 70, height: 12,
    align: 'center', vAlign: 'middle', fontSize: 64, fontFamily: 'Georgia',
    fontWeight: 700, fontStyle: 'normal', underline: false,
    textTransform: 'uppercase', letterSpacing: 1.5, lineHeight: 1.15,
    color: '#282828', bgColor: 'transparent', opacity: 100, rotation: 0,
    enabled: true, zIndex: 0,
  },
  name: {
    id: 'name', type: 'csv', label: 'Name', text: '{{Name}}', csvColumn: null,
    x: 50, y: 38, width: 70, height: 14,
    align: 'center', vAlign: 'middle', fontSize: 128, fontFamily: 'Georgia',
    fontWeight: 700, fontStyle: 'normal', underline: false,
    textTransform: 'none', letterSpacing: 0, lineHeight: 1.1,
    color: '#1e235f', bgColor: 'transparent', opacity: 100, rotation: 0,
    enabled: true, zIndex: 1,
  },
  description: {
    id: 'description', type: 'text', label: 'Description', text: 'Awarded for participation',
    x: 15, y: 51, width: 70, height: 8,
    align: 'left', vAlign: 'middle', fontSize: 34, fontFamily: 'Arial',
    fontWeight: 400, fontStyle: 'normal', underline: false,
    textTransform: 'none', letterSpacing: 0, lineHeight: 1.3,
    color: '#3c3c3c', bgColor: 'transparent', opacity: 100, rotation: 0,
    enabled: true, zIndex: 2,
  },
  date: {
    id: 'date', type: 'text', label: 'Date', text: 'Date',
    x: 15, y: 78, width: 30, height: 6,
    align: 'left', vAlign: 'middle', fontSize: 28, fontFamily: 'Arial',
    fontWeight: 400, fontStyle: 'normal', underline: false,
    textTransform: 'none', letterSpacing: 0, lineHeight: 1.2,
    color: '#000000', bgColor: 'transparent', opacity: 100, rotation: 0,
    enabled: true, zIndex: 3,
  },
  signatory: {
    id: 'signatory', type: 'text', label: 'Signatory', text: 'Jane Smith',
    x: 55, y: 78, width: 30, height: 6,
    align: 'left', vAlign: 'middle', fontSize: 28, fontFamily: 'Arial',
    fontWeight: 400, fontStyle: 'normal', underline: false,
    textTransform: 'none', letterSpacing: 0, lineHeight: 1.2,
    color: '#000000', bgColor: 'transparent', opacity: 100, rotation: 0,
    enabled: true, zIndex: 4,
  },
};

// ── Small helpers ──────────────────────────────────────────────
const num = (v, d) => {
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : d;
};
const clamp = (v, min, max) => Math.min(max, Math.max(min, v));

function escapeXml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function applyTextTransform(text, transform) {
  if (transform === 'uppercase') return text.toUpperCase();
  if (transform === 'lowercase') return text.toLowerCase();
  if (transform === 'capitalize') {
    return text.replace(/\b\w/g, (c) => c.toUpperCase());
  }
  return text;
}

function resolveFontSize(v) {
  if (typeof v === 'string' && FONT_PRESETS[v] != null) return FONT_PRESETS[v];
  return clamp(num(v, 48), 4, 1024);
}

// ── Font metric measurement (opentype) for accurate wrapping ──
const WIN_FONT_DIR = 'C:\\Windows\\Fonts';
const FONT_FILES = {
  Arial: { r: 'arial.ttf', i: 'ariali.ttf', b: 'arialbd.ttf', bi: 'arialbi.ttf' },
  'Arial Black': { r: 'ariblk.ttf' },
  Calibri: { r: 'calibri.ttf', i: 'calibrii.ttf', b: 'calibrib.ttf', bi: 'calibriz.ttf' },
  Cambria: { r: 'cambria.ttc', i: 'cambriai.ttf', b: 'cambriab.ttf', bi: 'cambriaz.ttf' },
  'Century Gothic': { r: 'gothic.ttf', i: 'gothici.ttf', b: 'gothicb.ttf', bi: 'gothicbi.ttf' },
  'Comic Sans MS': { r: 'comic.ttf', i: 'comici.ttf', b: 'comicbd.ttf', bi: 'comicz.ttf' },
  Consolas: { r: 'consola.ttf', i: 'consolai.ttf', b: 'consolab.ttf', bi: 'consolaz.ttf' },
  'Courier New': { r: 'cour.ttf', i: 'couri.ttf', b: 'courbd.ttf', bi: 'courbi.ttf' },
  Garamond: { r: 'garamond.ttf' },
  Georgia: { r: 'georgia.ttf', i: 'georgiai.ttf', b: 'georgiab.ttf', bi: 'georgiaz.ttf' },
  Impact: { r: 'impact.ttf' },
  'Lucida Calligraphy': { r: 'lcallig.ttf' },
  'Lucida Console': { r: 'lucon.ttf' },
  'Palatino Linotype': { r: 'pala.ttf', i: 'palai.ttf', b: 'palab.ttf', bi: 'palabi.ttf' },
  Rockwell: { r: 'rockwell.ttf', i: 'rockwelli.ttf', b: 'rockwellb.ttf', bi: 'rockwellbi.ttf' },
  'Segoe UI': { r: 'segoeui.ttf', i: 'segoeuii.ttf', b: 'segoeuib.ttf', bi: 'segoeuiz.ttf' },
  Tahoma: { r: 'tahoma.ttf', b: 'tahomabd.ttf' },
  'Times New Roman': { r: 'times.ttf', i: 'timesi.ttf', b: 'timesbd.ttf', bi: 'timesbi.ttf' },
  'Trebuchet MS': { r: 'trebuc.ttf', i: 'trebucit.ttf', b: 'trebucbd.ttf', bi: 'trebucbi.ttf' },
  Verdana: { r: 'verdana.ttf', i: 'verdanai.ttf', b: 'verdanab.ttf', bi: 'verdanaz.ttf' },
};

const measureCache = new Map();
function resolveFontFile(family, weight, style) {
  const spec = FONT_FILES[family];
  if (!spec) return null;
  const bold = num(weight, 400) >= 600;
  const italic = style === 'italic';
  const variant = bold && italic ? spec.bi : bold ? spec.b : italic ? spec.i : spec.r;
  if (!variant) return null;
  const candidates = [path.join(WIN_FONT_DIR, variant), '/System/Library/Fonts/' + variant, '/Library/Fonts/' + variant, '/usr/share/fonts/truetype/msttcorefonts/' + variant];
  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }
  return null;
}

function getMeasureFont(family, weight, style) {
  const key = `${family}|${weight}|${style}`;
  if (!measureCache.has(key)) {
    let font = null;
    const file = resolveFontFile(family, weight, style);
    if (file) {
      try {
        const parsed = opentype.parseSync(fs.readFileSync(file));
        // parseSync on a .ttc returns a FontCollection
        font = parsed && parsed.fonts ? parsed.fonts[0] : parsed;
      } catch { font = null; }
    }
    measureCache.set(key, font);
  }
  return measureCache.get(key);
}

// Approximate average character width factor when a font can't be measured
const WIDTH_FACTOR = {
  'Courier New': 0.6,
  Consolas: 0.6,
  'Lucida Console': 0.6,
  Impact: 0.74,
  'Arial Black': 0.66,
  'Times New Roman': 0.52,
  Georgia: 0.56,
};

function textWidth(text, fontSize, letterSpacing, measure) {
  if (!text.length) return 0;
  let w;
  if (measure) {
    const scale = fontSize / measure.unitsPerEm;
    w = 0;
    for (const ch of text) {
      const glyph = measure.charToGlyph(ch);
      w += (glyph.advanceWidth || 500) * scale;
    }
  } else {
    const factor = WIDTH_FACTOR[measureFamily] || 0.55;
    w = factor * fontSize * text.length;
  }
  return w + letterSpacing * Math.max(0, text.length - 1);
}

let measureFamily = 'Georgia';
function wrapText(text, maxWidth, fontSize, letterSpacing, family, weight, style) {
  measureFamily = family;
  const measure = getMeasureFont(family, weight, style);
  const width = (t) => textWidth(t, fontSize, letterSpacing, measure);
  const lines = [];
  for (const para of String(text).split('\n')) {
    const words = para.split(/\s+/).filter((w) => w.length);
    if (!words.length) { lines.push(''); continue; }
    let cur = '';
    for (const word of words) {
      const trial = cur ? cur + ' ' + word : word;
      if (!cur || width(trial) <= maxWidth) cur = trial;
      else { lines.push(cur); cur = word; }
    }
    lines.push(cur);
  }
  return lines;
}

// ── Element value resolution ───────────────────────────────────
function resolveElementValue(el, row, participantName) {
  if (el.type !== 'csv') {
    return el.text == null ? '' : String(el.text);
  }
  let template = el.text;
  if (template == null || template === '') {
    template = el.csvColumn ? `{{${el.csvColumn}}}` : '{{Name}}';
  }
  let out = String(template).replace(/\{\{\s*([^}]+?)\s*\}\}/g, (_m, col) => {
    const key = col.trim();
    return row && row[key] != null && row[key] !== '' ? String(row[key]) : '';
  });
  if (!out && participantName && (el.id === 'name' || !el.csvColumn)) out = participantName;
  return out;
}

// ── SVG builders ───────────────────────────────────────────────
function textToSVG(el, value, W, H) {
  const fontSize = resolveFontSize(el.fontSize);
  if (fontSize < 4) return null;
  const boxX = (num(el.x, 50) / 100) * W;
  const boxY = (num(el.y, 50) / 100) * H;
  const boxW = (num(el.width, 50) / 100) * W;
  const boxH = (num(el.height, 8) / 100) * H;
  const text = applyTextTransform(String(value || ''), el.textTransform);
  const ls = num(el.letterSpacing, 0);
  const lh = num(el.lineHeight, 1.2);
  const lines = wrapText(text, boxW, fontSize, ls, el.fontFamily || 'Georgia', el.fontWeight, el.fontStyle);
  if (!lines.length) return null;

  const lineH = fontSize * lh;
  const blockH = lines.length * lineH;
  const align = el.align || 'center';
  const vAlign = el.vAlign || 'middle';
  const anchor = align === 'center' ? 'middle' : align === 'right' ? 'end' : 'start';
  const firstY = vAlign === 'top'
    ? boxY + lineH / 2
    : vAlign === 'bottom'
      ? boxY + boxH - blockH + lineH / 2
      : boxY + boxH / 2 - blockH / 2 + lineH / 2;
  const ax = align === 'center' ? boxX + boxW / 2 : align === 'right' ? boxX + boxW : boxX;

  const opacity = clamp(num(el.opacity, 100), 0, 100) / 100;
  const rotation = num(el.rotation, 0);
  const fontWeight = num(el.fontWeight, 400);
  const italic = el.fontStyle === 'italic' ? 'italic' : 'normal';
  const underline = el.underline ? ' text-decoration="underline"' : '';
  const fontSpec = `font-family="${escapeXml(el.fontFamily || 'Georgia')}" font-size="${fontSize}" font-weight="${fontWeight}" font-style="${italic}"${underline}`;

  let s = '';
  if (rotation || opacity < 1) {
    let attrs = '';
    if (rotation) attrs += ` transform="rotate(${rotation} ${ax} ${firstY})"`;
    if (opacity < 1) attrs += ` opacity="${opacity}"`;
    s += `<g${attrs}>`;
  }
  const bg = el.bgColor && el.bgColor !== 'transparent' && el.bgColor !== 'none';
  if (bg) {
    s += `<rect x="${boxX}" y="${boxY}" width="${boxW}" height="${boxH}" rx="${Math.min(10, boxH / 4)}" fill="${escapeXml(el.bgColor)}"/>`;
  }
  s += `<text x="${ax}" y="${firstY}" ${fontSpec} fill="${escapeXml(el.color || '#282828')}" text-anchor="${anchor}" dominant-baseline="central" letter-spacing="${ls}">`;
  lines.forEach((line, i) => {
    const content = escapeXml(line) || '&#8203;';
    if (i === 0) s += content;
    else s += `<tspan x="${ax}" dy="${lineH}">${content}</tspan>`;
  });
  s += '</text>';
  if (rotation || opacity < 1) s += '</g>';
  return s;
}

function shapeToSVG(el, W, H) {
  const x = (num(el.x, 50) / 100) * W;
  const y = (num(el.y, 50) / 100) * H;
  const w = (num(el.width, 20) / 100) * W;
  const h = (num(el.height, 20) / 100) * H;
  const cx = x + w / 2;
  const cy = y + h / 2;
  const fill = el.fill && el.fill !== 'transparent' ? el.fill : 'none';
  const stroke = el.stroke && el.stroke !== 'transparent' && el.stroke !== 'none' ? el.stroke : 'none';
  const strokeWidth = num(el.strokeWidth, el.type === 'line' ? 3 : 2);
  const opacity = clamp(num(el.opacity, 100), 0, 100) / 100;
  const rotation = num(el.rotation, 0);
  const strokeAttr = stroke !== 'none' ? ` stroke="${escapeXml(stroke)}" stroke-width="${strokeWidth}"` : '';

  let inner = '';
  if (el.type === 'rect') {
    inner = `<rect x="${x}" y="${y}" width="${Math.max(0.5, w)}" height="${Math.max(0.5, h)}" rx="${num(el.borderRadius, 0)}" fill="${escapeXml(fill)}"${strokeAttr}/>`;
  } else if (el.type === 'ellipse') {
    inner = `<ellipse cx="${cx}" cy="${cy}" rx="${Math.max(0.5, w / 2)}" ry="${Math.max(0.5, h / 2)}" fill="${escapeXml(fill)}"${strokeAttr}/>`;
  } else if (el.type === 'line') {
    inner = `<line x1="${x}" y1="${y}" x2="${x + w}" y2="${y + h}" stroke="${escapeXml(stroke !== 'none' ? stroke : '#1a1a2e')}" stroke-width="${Math.max(1, strokeWidth)}" stroke-linecap="round"/>`;
  }
  if (!inner) return null;

  let s = '';
  if (rotation || opacity < 1) {
    let attrs = '';
    if (rotation) attrs += ` transform="rotate(${rotation} ${cx} ${cy})"`;
    if (opacity < 1) attrs += ` opacity="${opacity}"`;
    s += `<g${attrs}>`;
  }
  s += inner;
  if (rotation || opacity < 1) s += '</g>';
  return s;
}

// ── Element normalization / legacy merge ───────────────────────
function normalizeElement(raw) {
  const el = { ...raw };
  el.id = raw.id || 'el';
  el.type = raw.type || 'text';
  el.x = num(el.x, 50);
  el.y = num(el.y, 50);
  el.width = num(el.width, 50);
  el.height = num(el.height, el.type === 'text' || el.type === 'csv' ? 8 : 20);
  el.enabled = el.enabled !== false;
  el.opacity = num(el.opacity, 100);
  el.rotation = num(el.rotation, 0);
  el.zIndex = num(el.zIndex, 10);
  el.fontSize = el.fontSize != null ? el.fontSize : 48;
  return el;
}

function buildElements(customPositions) {
  const elements = [];
  Object.keys(DEFAULT_POSITIONS).forEach((key) => {
    const def = { ...DEFAULT_POSITIONS[key], height: DEFAULT_POSITIONS[key].height };
    const over = (customPositions && customPositions[key]) || {};
    // Merge legacy overrides (old field names) + new props
    const merged = { ...def };
    Object.keys(over).forEach((k) => {
      if (k === 'id') return;
      merged[k] = over[k];
    });
    elements.push(normalizeElement(merged));
  });
  if (customPositions) {
    Object.keys(customPositions).forEach((id) => {
      if (DEFAULT_POSITIONS[id]) return; // already handled above
      const raw = customPositions[id];
      const el = normalizeElement({ id, ...raw });
      elements.push(el);
    });
  }
  // Assign stable zIndex for elements missing one (insertion order)
  elements.forEach((el, i) => {
    if (el.zIndex == null || el.zIndex === 10) el.zIndex = i + 5;
  });
  elements.sort((a, b) => a.zIndex - b.zIndex);
  return elements;
}

// ── SVG document ───────────────────────────────────────────────
function buildSVG(W, H, templateDataUri, elements, row, participantName) {
  const parts = [`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">`];
  if (templateDataUri) {
    parts.push(`<image href="${templateDataUri}" x="0" y="0" width="${W}" height="${H}" preserveAspectRatio="xMidYMid slice"/>`);
  }
  for (const el of elements) {
    if (!el.enabled) continue;
    if (el.type === 'text' || el.type === 'csv') {
      const value = resolveElementValue(el, row, participantName);
      if (!value) continue;
      const s = textToSVG(el, value, W, H);
      if (s) parts.push(s);
    } else {
      const s = shapeToSVG(el, W, H);
      if (s) parts.push(s);
    }
  }
  parts.push('</svg>');
  return parts.join('');
}

// ── Main build ─────────────────────────────────────────────────
async function buildCertificate(
  templatePath,
  participantName,
  title,
  description,
  signatory,
  certDate,
  outputPath,
  customPositions,
  extra = {}
) {
  // Load template (or blank canvas)
  let base;
  const ext = path.extname(templatePath).toLowerCase();
  if (!fs.existsSync(templatePath) || !SUPPORTED_EXTS.includes(ext)) {
    console.warn(`Template not found or unsupported (${templatePath}) — using blank canvas.`);
    base = new Jimp({ width: CANVAS_W, height: CANVAS_H, color: 0xffffffff });
  } else {
    base = await Jimp.read(templatePath);
  }
  const W = base.bitmap.width;
  const H = base.bitmap.height;
  const png = await base.getBuffer('image/png');
  const templateDataUri = `data:image/png;base64,${png.toString('base64')}`;

  // Legacy: if element.text is missing for the 5 core fields, inject form values
  const legacyTexts = { title, description, signatory, date: certDate };
  const elements = buildElements(customPositions);
  elements.forEach((el) => {
    if (DEFAULT_POSITIONS[el.id] && (el.text == null || el.text === '')) {
      if (el.id === 'name') el.text = '{{Name}}';
      else if (legacyTexts[el.id] != null) el.text = legacyTexts[el.id];
    }
  });

  const row = extra.row || null;
  const svg = buildSVG(W, H, templateDataUri, elements, row, participantName);

  const resvg = new Resvg(svg, {
    fitTo: { mode: 'original' },
    font: { loadSystemFonts: true, defaultFontFamily: 'Georgia' },
    logLevel: 'error',
  });
  const rendered = resvg.render();
  const pngBuffer = rendered.asPng();

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, pngBuffer);
  return outputPath;
}

async function buildCertificates(options) {
  const {
    templatePath,
    names,
    title,
    description,
    signatory,
    date,
    outputDir,
    positions,
    records,
    nameColumn,
    onProgress,
  } = options;

  const results = [];
  for (let i = 0; i < names.length; i++) {
    const name = names[i];
    const row = records && nameColumn ? records[i] || null : null;
    const outPath = path.join(outputDir, `certificate_${i + 1}_${slugify(name)}.png`);
    await buildCertificate(
      templatePath,
      name,
      title,
      description,
      signatory,
      date,
      outPath,
      positions,
      { row, nameColumn }
    );
    results.push(outPath);
    if (onProgress) onProgress(i + 1, names.length, name);
  }
  return results;
}

function slugify(text) {
  return (
    text
      .replace(/[^a-zA-Z0-9]+/g, '_')
      .replace(/^_|_$/g, '')
      .toLowerCase() || 'participant'
  );
}

module.exports = { buildCertificate, buildCertificates, DEFAULT_POSITIONS, FONT_PRESETS };
