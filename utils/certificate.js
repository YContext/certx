const { Jimp, loadFont, measureTextHeight } = require('jimp');
const {
  SANS_128_WHITE,
  SANS_64_WHITE,
  SANS_32_WHITE,
  SANS_16_WHITE,
  SANS_8_WHITE,
} = require('@jimp/plugin-print/fonts');
const path = require('path');
const fs = require('fs');

const SUPPORTED_EXTS = ['.png', '.jpg', '.jpeg', '.webp'];
const CANVAS_W = 1400;
const CANVAS_H = 900;

// ── Font size presets ─────────────────────────────────────
const FONT_PRESETS = {
  XS: { px: 16, fontPath: SANS_16_WHITE },
  S:  { px: 32, fontPath: SANS_32_WHITE },
  M:  { px: 48, fontPath: SANS_64_WHITE },
  L:  { px: 64, fontPath: SANS_64_WHITE },
  XL: { px: 128, fontPath: SANS_128_WHITE },
};

// ── Colors per field (from original PIL implementation) ──
const FIELD_COLORS = {
  title: '#282828',
  name: '#1e235f',
  description: '#3c3c3c',
  date: '#000000',
  signatory: '#000000',
};

// ── Default positions (fraction-based, matching original) ─
const DEFAULT_POSITIONS = {
  title:       { x: 50, y: 12, align: 'center', fontSize: 'L',  enabled: true, width: 70 },
  name:        { x: 50, y: 38, align: 'center', fontSize: 'XL', enabled: true, width: 70 },
  description: { x: 15, y: 51, align: 'left',   fontSize: 'M',  enabled: true, width: 70 },
  date:        { x: 15, y: 78, align: 'left',   fontSize: 'S',  enabled: true, width: 30 },
  signatory:   { x: 55, y: 78, align: 'left',   fontSize: 'S',  enabled: true, width: 30 },
};

/**
 * Generate a certificate image.
 *
 * @param {string} templatePath
 * @param {string} participantName
 * @param {string} title
 * @param {string} description
 * @param {string} signatory
 * @param {string} certDate
 * @param {string} outputPath
 * @param {object} [customPositions] - Override positions per field
 * @returns {Promise<string>}
 */
async function buildCertificate(
  templatePath,
  participantName,
  title,
  description,
  signatory,
  certDate,
  outputPath,
  customPositions
) {
  // ── Load or create template ──────────────────────────────
  let base;
  const ext = path.extname(templatePath).toLowerCase();
  const templateExists = fs.existsSync(templatePath);

  if (!templateExists || !SUPPORTED_EXTS.includes(ext)) {
    console.warn(
      `Template not found or unsupported (${templatePath}) — using blank canvas.`
    );
    base = new Jimp({ width: CANVAS_W, height: CANVAS_H, color: 0xffffffff });
  } else {
    base = await Jimp.read(templatePath);
  }

  const w = base.bitmap.width;
  const h = base.bitmap.height;
  const scale = h / CANVAS_H;

  // ── Merge positions ─────────────────────────────────────
  const positions = {};
  for (const key of Object.keys(DEFAULT_POSITIONS)) {
    const def = { ...DEFAULT_POSITIONS[key] };
    if (customPositions && customPositions[key]) {
      const overrides = customPositions[key];
      if (overrides.x != null) def.x = Number(overrides.x);
      if (overrides.y != null) def.y = Number(overrides.y);
      if (overrides.align) def.align = overrides.align;
      if (overrides.fontSize) def.fontSize = overrides.fontSize;
      if (overrides.enabled != null) def.enabled = Boolean(overrides.enabled);
      if (overrides.width != null) def.width = Number(overrides.width);
    }
    positions[key] = def;
  }

  // ── Helpers ──────────────────────────────────────────────
  const px = (baseSize) => Math.max(10, Math.round(baseSize * scale));
  const pcToPx = (pc, dimension) => Math.round((pc / 100) * dimension);

  /**
   * Render colored text via compositing.
   */
  async function drawColoredText(font, text, x, y, maxWidth, hexColor, align) {
    const hex = hexColor.replace('#', '');
    const r = parseInt(hex.substring(0, 2), 16);
    const g = parseInt(hex.substring(2, 4), 16);
    const b = parseInt(hex.substring(4, 6), 16);

    const charH = measureTextHeight(font, text, maxWidth);
    const layer = new Jimp({
      width: maxWidth,
      height: Math.max(charH + 10, 10),
      color: 0x00000000,
    });

    layer.print({ font, x: 0, y: 0, text, maxWidth });

    layer.scan(0, 0, layer.bitmap.width, layer.bitmap.height, (_ix, _iy, idx) => {
      const alpha = layer.bitmap.data[idx + 3];
      if (alpha > 0) {
        layer.bitmap.data[idx] = r;
        layer.bitmap.data[idx + 1] = g;
        layer.bitmap.data[idx + 2] = b;
      }
    });

    let finalX = x;
    if (align === 'center') finalX = x - Math.round(maxWidth / 2);
    else if (align === 'right') finalX = x - maxWidth;

    base.composite(layer, finalX, y);
  }

  // ── Render each field ──────────────────────────────────
  const fields = [
    {
      key: 'title',
      text: title.toUpperCase(),
      color: FIELD_COLORS.title,
      offsetY: -px(32),
    },
    {
      key: 'name',
      text: participantName,
      color: FIELD_COLORS.name,
      offsetY: -px(36),
    },
    {
      key: 'description',
      text: description,
      color: FIELD_COLORS.description,
      offsetY: -px(16),
    },
    {
      key: 'date',
      text: certDate,
      color: FIELD_COLORS.date,
      offsetY: 0,
    },
    {
      key: 'signatory',
      text: signatory,
      color: FIELD_COLORS.signatory,
      offsetY: 0,
    },
  ];

  for (const field of fields) {
    const pos = positions[field.key];
    // Skip disabled fields
    if (!pos.enabled) continue;

    const preset = FONT_PRESETS[pos.fontSize] || FONT_PRESETS.M;
    const font = await loadFont(preset.fontPath);
    // Use custom width percentage (0-100) converted to fraction of template width
    const widthFraction = Math.max(10, Math.min(100, pos.width)) / 100;
    const maxW = Math.round(w * widthFraction);
    const xPx = pcToPx(pos.x, w);
    const yPx = pcToPx(pos.y, h) + field.offsetY;

    await drawColoredText(font, field.text, xPx, yPx, maxW, field.color, pos.align);
  }

  // ── Save ─────────────────────────────────────────────────
  const dir = path.dirname(outputPath);
  fs.mkdirSync(dir, { recursive: true });
  await base.write(outputPath);
  return outputPath;
}

/**
 * Generate certificates for multiple participants.
 */
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
    onProgress,
  } = options;

  const results = [];
  for (let i = 0; i < names.length; i++) {
    const name = names[i];
    const safeName = slugify(name);
    const outPath = path.join(outputDir, `certificate_${i + 1}_${safeName}.png`);

    await buildCertificate(
      templatePath,
      name,
      title,
      description,
      signatory,
      date,
      outPath,
      positions
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
