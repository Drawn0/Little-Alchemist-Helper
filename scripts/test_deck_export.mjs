/**
 * Sanity test for app/js/services/deck_export.js.
 * Builds a synthetic deck, runs buildDeckXlsx, writes the result to disk,
 * and prints the path + verifies the file is a valid .xlsx by reopening it.
 *
 *   node scripts/test_deck_export.mjs
 */
import { buildDeckXlsx } from '../app/js/services/deck_export.js';
import * as XLSX from 'xlsx';
import fs from 'node:fs';
import path from 'node:path';

// Mix of card types to cover every notation branch:
//  - plain card
//  - fused
//  - onyx variant (no fusion)
//  - onyx + fused
//  - level-5 fused
const deck = [
    { name: 'Adventure',  level: 5, fused: true,  onyx: false, quantity: 1 },
    { name: 'Anger',      level: 5, fused: true,  onyx: false, quantity: 1 },
    { name: 'Angel',      level: 3, fused: false, onyx: false, quantity: 1 },
    { name: 'Apocalypse', level: 5, fused: false, onyx: true,  quantity: 1 },
    { name: 'Death',      level: 5, fused: true,  onyx: true,  quantity: 1 },
    { name: 'Wizard',     level: 4, fused: false, onyx: false, quantity: 1 },
];

const blob = buildDeckXlsx(deck, {
    deckName: 'Synthetic Test Deck',
    score: 1234,
    targetSize: 30,
});

const buf = Buffer.from(await blob.arrayBuffer());
const outDir = path.resolve('test-output');
fs.mkdirSync(outDir, { recursive: true });
const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const outPath = path.join(outDir, `lar-deck-${ts}.xlsx`);
fs.writeFileSync(outPath, buf);

console.log(`Wrote ${outPath}  (${buf.length} bytes)`);

// Verify by reopening and reading both sheets
const wb = XLSX.read(buf, { type: 'buffer' });
console.log(`Sheets: ${wb.SheetNames.join(', ')}`);
for (const name of wb.SheetNames) {
    const rows = XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1, defval: '' });
    console.log(`\n── ${name} (${rows.length} rows) ──`);
    rows.forEach((r, i) => console.log(`  ${i + 1}: ${JSON.stringify(r)}`));
}
console.log(`\n✓ File ready: ${outPath}`);
