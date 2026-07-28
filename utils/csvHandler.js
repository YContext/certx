const fs = require('fs');
const { parse } = require('csv-parse/sync');

/**
 * Parse a CSV file and return { records, columns, nameColumn }.
 * @param {string} filePath - Path to the CSV file
 * @returns {{ records: object[], columns: string[], nameColumn: string }}
 */
function parseCSV(filePath) {
  const raw = fs.readFileSync(filePath, 'utf-8');
  const records = parse(raw, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
  });

  if (!records || records.length === 0) {
    throw new Error('CSV file is empty or has no data rows.');
  }

  const columns = Object.keys(records[0]);

  // Auto-detect the name column (case-insensitive)
  const nameCol = columns.find((c) => /name/i.test(c)) || columns[0];

  return { records, columns, nameColumn: nameCol };
}

/**
 * Extract names from parsed CSV records.
 * @param {object[]} records
 * @param {string} nameColumn
 * @returns {string[]}
 */
function extractNames(records, nameColumn) {
  return records
    .map((r) => r[nameColumn])
    .filter((n) => n && n.trim().length > 0)
    .map((n) => n.trim());
}

module.exports = { parseCSV, extractNames };
