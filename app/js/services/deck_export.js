import * as XLSX from 'xlsx';

/**
 * Build an .xlsx blob containing the current deck in two formats:
 *
 *   Sheet "Notation"   — one column of cards in Andersam Sheet1 notation:
 *                         "Name (level)ƒ"  (fused)
 *                         "Name:Onyx (level)"  (onyx variant)
 *                         "Name:Onyx (level)ƒ"  (onyx + fused)
 *                        Paste this column into your old Andersam workbook's
 *                        Sheet1 (any deck column like "Attack Deck").
 *
 *   Sheet "Structured" — four columns (Card / Level / Fused / Onyx) suitable
 *                        for the v5.11 USER!G:J deck region or for any other
 *                        spreadsheet that uses column-per-attribute layout.
 *
 * Returns a Blob ready to hand to URL.createObjectURL.
 */
export function buildDeckXlsx(deck, opts = {}) {
    const { deckName = 'Deck', score = null, targetSize = null } = opts;

    const wb = XLSX.utils.book_new();

    // ── Notation sheet ────────────────────────────────────────────────────────
    const headerBits = [`${deckName} — ${deck.length} cards`];
    if (targetSize != null) headerBits.push(`target ${targetSize}`);
    if (score != null) headerBits.push(`score ${Math.round(score).toLocaleString()}`);
    const notationRows = [
        [headerBits.join(' · ')],
        ['Andersam notation (paste into Sheet1)'],
        [],
        ...deck.map((c) => [formatNotation(c)]),
    ];
    const wsN = XLSX.utils.aoa_to_sheet(notationRows);
    wsN['!cols'] = [{ wch: 32 }];
    XLSX.utils.book_append_sheet(wb, wsN, 'Notation');

    // ── Structured sheet ──────────────────────────────────────────────────────
    const structuredRows = [
        ['Card', 'Level', 'Fused', 'Onyx'],
        ...deck.map((c) => [c.name, c.level, c.fused ? 'Yes' : 'No', c.onyx ? 'Yes' : 'No']),
    ];
    const wsS = XLSX.utils.aoa_to_sheet(structuredRows);
    wsS['!cols'] = [{ wch: 28 }, { wch: 8 }, { wch: 8 }, { wch: 8 }];
    XLSX.utils.book_append_sheet(wb, wsS, 'Structured');

    const buf = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
    return new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}

function formatNotation(c) {
    const name = c.onyx ? `${c.name}:Onyx` : c.name;
    return `${name} (${c.level ?? 1})${c.fused ? 'ƒ' : ''}`;
}
