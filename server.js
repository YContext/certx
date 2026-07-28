const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const archiver = require('archiver');

const { parseCSV, extractNames } = require('./utils/csvHandler');
const { buildCertificates } = require('./utils/certificate');

const app = express();
const PORT = process.env.PORT || 3000;

// ---------------------------------------------------------------------------
// Multer setup – save uploads under /uploads with unique filenames
// ---------------------------------------------------------------------------
const uploadsDir = path.join(__dirname, 'uploads');
const generatedDir = path.join(__dirname, 'generated');

fs.mkdirSync(uploadsDir, { recursive: true });
fs.mkdirSync(generatedDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadsDir),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `${uuidv4()}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 50 * 1024 * 1024 }, // 50 MB
  fileFilter: (_req, file, cb) => {
    const allowedImages = ['.png', '.jpg', '.jpeg', '.webp'];
    const allowedCSV = ['.csv'];
    const ext = path.extname(file.originalname).toLowerCase();

    if (file.fieldname === 'template' && allowedImages.includes(ext)) {
      return cb(null, true);
    }
    if (file.fieldname === 'csv' && allowedCSV.includes(ext)) {
      return cb(null, true);
    }
    cb(new Error(`Unsupported file type for field "${file.fieldname}": ${file.originalname}`));
  },
});

// ---------------------------------------------------------------------------
// Serve static files
// ---------------------------------------------------------------------------
app.use(express.static(path.join(__dirname, 'public')));
app.use('/generated', express.static(generatedDir));

// Parse JSON bodies
app.use(express.json());

// ---------------------------------------------------------------------------
// API Routes
// ---------------------------------------------------------------------------

/**
 * POST /api/preview-csv
 * Upload a CSV and return its parsed contents so the user can verify.
 */
app.post('/api/preview-csv', upload.single('csv'), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No CSV file uploaded.' });
    }
    const { records, columns, nameColumn } = parseCSV(req.file.path);
    res.json({
      fileId: path.basename(req.file.filename, path.extname(req.file.filename)),
      columns,
      nameColumn,
      preview: records.slice(0, 10),
      totalRows: records.length,
      fileName: req.file.originalname,
    });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

/**
 * POST /api/generate
 * Accept template + CSV (or CSV fileId), along with certificate metadata,
 * generate all certificates, return their URLs.
 */
const cpUpload = upload.fields([
  { name: 'template', maxCount: 1 },
  { name: 'csv', maxCount: 1 },
]);

app.post('/api/generate', (req, res) => {
  cpUpload(req, res, async (err) => {
    if (err) {
      if (err instanceof multer.MulterError) {
        return res.status(400).json({ error: `Upload error: ${err.message}` });
      }
      return res.status(400).json({ error: err.message });
    }

    try {
      // --- Gather inputs ---
      const templateFile = req.files && req.files['template'] && req.files['template'][0];
      const csvFile = req.files && req.files['csv'] && req.files['csv'][0];

      if (!templateFile) {
        return res.status(400).json({ error: 'Template image is required.' });
      }
      if (!csvFile) {
        return res.status(400).json({ error: 'CSV file is required.' });
      }

      // Fall back to body fields
      const title = req.body.title?.trim() || 'Certificate of Completion';
      const description = req.body.description?.trim() || 'Awarded for participation';
      const signatory = req.body.signatory?.trim() || 'Jane Smith';
      const date = req.body.date?.trim() || new Date().toISOString().slice(0, 10);

      // Parse custom positions (JSON string from form-data)
      let positions = null;
      try {
        if (req.body.positions) {
          positions = JSON.parse(req.body.positions);
        }
      } catch {
        // ignore invalid JSON, fall back to defaults
      }

      // Parse CSV
      const { records, nameColumn } = parseCSV(csvFile.path);
      const names = extractNames(records, nameColumn);

      if (names.length === 0) {
        return res.status(400).json({ error: 'No participant names found in CSV.' });
      }

      // Create a unique batch folder
      const batchId = uuidv4().slice(0, 8);
      const batchDir = path.join(generatedDir, batchId);
      fs.mkdirSync(batchDir, { recursive: true });

      // Generate certificates with custom positions
      const results = await buildCertificates({
        templatePath: templateFile.path,
        names,
        title,
        description,
        signatory,
        date,
        outputDir: batchDir,
        positions,
      });

      // Build response with download URLs
      const certificates = results.map((filePath, idx) => ({
        id: idx + 1,
        name: names[idx],
        filename: path.basename(filePath),
        url: `/generated/${batchId}/${path.basename(filePath)}`,
      }));

      res.json({
        batchId,
        title,
        total: certificates.length,
        certificates,
        downloadAllUrl: `/api/download/${batchId}`,
        csvFileName: csvFile.originalname,
        templateFileName: templateFile.originalname,
      });
    } catch (err) {
      console.error('Generation error:', err);
      res.status(500).json({ error: err.message || 'Failed to generate certificates.' });
    }
  });
});

/**
 * GET /api/download/:batchId
 * Download all certificates in a batch as a ZIP archive.
 */
app.get('/api/download/:batchId', (req, res) => {
  const batchDir = path.join(generatedDir, req.params.batchId);

  if (!fs.existsSync(batchDir)) {
    return res.status(404).json({ error: 'Batch not found.' });
  }

  res.setHeader('Content-Type', 'application/zip');
  res.setHeader('Content-Disposition', `attachment; filename="certificates-${req.params.batchId}.zip"`);

  const archive = archiver('zip', { zlib: { level: 9 } });
  archive.pipe(res);
  archive.directory(batchDir, false);
  archive.finalize();
});

/**
 * GET /api/cleanup (optional – remove old generated files)
 * Could be called periodically or manually.
 */
app.get('/api/cleanup', (_req, res) => {
  let cleaned = 0;
  const dirs = fs.readdirSync(generatedDir);
  const now = Date.now();
  for (const d of dirs) {
    const full = path.join(generatedDir, d);
    const stat = fs.statSync(full);
    if (stat.isDirectory() && now - stat.mtimeMs > 3600 * 1000 * 2) {
      // Older than 2 hours
      fs.rmSync(full, { recursive: true, force: true });
      cleaned++;
    }
  }
  res.json({ cleaned });
});

// ---------------------------------------------------------------------------
// Start server
// ---------------------------------------------------------------------------
app.listen(PORT, () => {
  console.log(`🚀 CertX server running at http://localhost:${PORT}`);
});
