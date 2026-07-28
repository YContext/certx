const { Jimp, loadFont, measureTextHeight } = require('jimp');
const { SANS_64_WHITE, SANS_32_WHITE, SANS_16_WHITE, SANS_8_WHITE } = require('@jimp/plugin-print/fonts');
const path = require('path');
const fs = require('fs');

const SUPPORTED_EXTS = ['.png', '.jpg', '.jpeg', '.webp'];
const CANVAS_W = 1400;
const CANVAS_H = 900;

/**
 * Generate a certificate image by overlaying colored text on a template.
 *
 * Jimp's built-in bitmap fonts are monochrome (white), so we render text
 * on a transparent layer, then use pixel scanning to colorize each rendered
 * glyph before compositing onto the template.
 *
 * @param {string} templatePath - Path to the template image
 * @param {string} participantName - Name to place on the certificate
 * @param {string} title - Certificate title (e.g. "Certificate of Completion")
 * @param {string} description - Body text
 * @param {string} signatory - Signatory name
 * @param {string} certDate - Date string
 * @param {string} outputPath - Where to save the PNG result
 * @returns {Promise<string>} The output path
 */
async function buildCertificate(
  templatePath,
  participantName,
  title,
  description,
  signatory,
  certDate,
  outputPath
) {
  // ── Load or create template ──────────────────────────────
  let base;
  const ext = path.extname(templatePath).toLowerCase();
  const templateExists = fs.existsSync(templatePath);

  if (!templateExists || !SUPPORTED_EXTS.includes(ext)) {
    console.warn(
      `Template not found or unsupported (${templatePath}) — using blank canvas.`
    );
    base = new Jimp({
      width: CANVAS_W,
      height: CANVAS_H,
      color: 0xffffffff,
    });
  } else {
    base = await Jimp.read(templatePath);
  }

  const w = base.bitmap.width;
  const h = base.bitmap.height;
  const scale = h / CANVAS_H;

  const px = (baseSize) => Math.max(10, Math.round(baseSize * scale));

  // ── Load fonts ───────────────────────────────────────────
  // Font path constants are imported at the top from @jimp/plugin-print/fonts
  const titleFontSize = px(60);
  const nameFontSize = px(72);
  const bodyFontSize = px(34);
  const smallFontSize = px(28);

  // Map size → nearest Jimp font path constant
  function pickFont(sizePt) {
    if (sizePt >= 48) return SANS_64_WHITE;
    if (sizePt >= 24) return SANS_32_WHITE;
    if (sizePt >= 12) return SANS_16_WHITE;
    return SANS_8_WHITE;
  }

  const titleFont = await loadFont(pickFont(titleFontSize));
  const nameFont = await loadFont(pickFont(nameFontSize));
  const bodyFont = await loadFont(pickFont(bodyFontSize));
  const smallFont = await loadFont(pickFont(smallFontSize));

  // ── Helper: render colored text via compositing ──────────
  /**
   * Render text onto a transparent layer, colorize it, and composite onto base.
   *
   * @param {Jimp}   font     - Loaded Jimp font
   * @param {string} text     - Text to render
   * @param {number} x        - X position on base
   * @param {number} y        - Y position on base
   * @param {number} maxWidth - Max width for text wrapping
   * @param {string} hexColor - Target hex color e.g. "#282828"
   * @param {string} [align]  - 'left' | 'center' | 'right'
   */
  async function drawColoredText(font, text, x, y, maxWidth, hexColor, align) {
    // Parse hex to RGB
    const hex = hexColor.replace('#', '');
    const r = parseInt(hex.substring(0, 2), 16);
    const g = parseInt(hex.substring(2, 4), 16);
    const b = parseInt(hex.substring(4, 6), 16);

    // Measure text height
    const charH = measureTextHeight(font, text, maxWidth);

    // Create a transparent layer
    const layer = new Jimp({
      width: maxWidth,
      height: Math.max(charH + 10, 10),
      color: 0x00000000,
    });

    // Render text in white (the baked-in font color)
    layer.print({ font, x: 0, y: 0, text, maxWidth });

    // Colorize each non-transparent pixel
    layer.scan(0, 0, layer.bitmap.width, layer.bitmap.height, (_ix, _iy, idx) => {
      const alpha = layer.bitmap.data[idx + 3];
      if (alpha > 0) {
        layer.bitmap.data[idx] = r;
        layer.bitmap.data[idx + 1] = g;
        layer.bitmap.data[idx + 2] = b;
      }
    });

    // Handle alignment
    let finalX = x;
    if (align === 'center') {
      finalX = x - Math.round(maxWidth / 2);
    } else if (align === 'right') {
      finalX = x - maxWidth;
    }

    // Composite onto base
    base.composite(layer, finalX, y);
  }

  // ── Layout positions (fraction-based, same as original) ──
  const titleStr = title.toUpperCase();
  const titleW = Math.round(w * 0.7);
  const titleX = Math.round(w * 0.5);
  const titleY = Math.round(h * 0.12 - px(32));

  const nameW = Math.round(w * 0.7);
  const nameX = Math.round(w * 0.5);
  const nameY = Math.round(h * 0.38 - px(36));

  const descW = Math.round(w * 0.7);
  const descX = Math.round(w * 0.15);
  const descY = Math.round(h * 0.51 - px(16));

  const dateW = Math.round(w * 0.3);
  const dateX = Math.round(w * 0.15);
  const dateY = Math.round(h * 0.78);

  const sigW = Math.round(w * 0.3);
  const sigX = Math.round(w * 0.55);
  const sigY = Math.round(h * 0.78);

  // ── Draw each text element with its color ────────────────
  // (Colors match the original PIL implementation)
  await drawColoredText(titleFont, titleStr, titleX, titleY, titleW, '#282828', 'center');
  await drawColoredText(nameFont, participantName, nameX, nameY, nameW, '#1e235f', 'center');
  await drawColoredText(bodyFont, description, descX, descY, descW, '#3c3c3c', 'left');
  await drawColoredText(smallFont, certDate, dateX, dateY, dateW, '#000000', 'left');
  await drawColoredText(smallFont, signatory, sigX, sigY, sigW, '#000000', 'left');

  // ── Save ─────────────────────────────────────────────────
  const dir = path.dirname(outputPath);
  fs.mkdirSync(dir, { recursive: true });
  await base.write(outputPath);

  return outputPath;
}

/**
 * Generate certificates for multiple participants.
 *
 * @param {object} options
 * @param {string} options.templatePath
 * @param {string[]} options.names
 * @param {string} options.title
 * @param {string} options.description
 * @param {string} options.signatory
 * @param {string} options.date
 * @param {string} options.outputDir
 * @param {function} [options.onProgress] - Callback(index, total, name)
 * @returns {Promise<string[]>} Array of output file paths
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
      outPath
    );
    results.push(outPath);
    if (onProgress) {
      onProgress(i + 1, names.length, name);
    }
  }
  return results;
}

function slugify(text) {
  return text
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/^_|_$/g, '')
    .toLowerCase() || 'participant';
}

module.exports = { buildCertificate, buildCertificates };
