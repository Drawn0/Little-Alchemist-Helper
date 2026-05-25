import * as XLSX from 'xlsx';

/**
 * Parse an Andersam spreadsheet (xlsm / xlsx) and extract the LIB table.
 *
 *   parseAndersamFile(arrayBuffer) → {
 *     library: [ { name, level, fused, onyx, quantity }, ... ],
 *     detectedVersion: '4.01.83a' | '5.10d' | null,
 *     headerRowFoundAt: 11,        // for debugging
 *     skippedEmpty: 23,            // qty-0 rows that v5.11 ships
 *   }
 *
 * Header detection: scans the USER sheet for a contiguous run of four cells
 * matching ["Card", "Level", "Fused", "Quantity"] (works across versions
 * v4.01 through v5.11 and any older release that follows the same convention).
 *
 * Onyx detection: an entry whose Card cell ends in ":Onyx" is taken as the
 * onyx variant of the base card name (so "Apocalypse:Onyx" becomes
 * { name: "Apocalypse", onyx: true } — matching vladajankovic's library
 * schema where onyx is a flag, not a name suffix).
 *
 * Quantities of 0 are skipped (v5.11 ships an exhaustive LIB with quantity=0
 * for every catalogued card).
 */
export function parseAndersamFile(arrayBuffer) {
    const wb = XLSX.read(arrayBuffer, { type: 'array' });
    const sheet = wb.Sheets['USER'];
    if (!sheet) {
        throw new Error('No USER sheet found — this does not look like an Andersam spreadsheet.');
    }

    const detectedVersion = sheet['C8'] && sheet['C8'].v != null
        ? String(sheet['C8'].v)
        : null;

    if (!sheet['!ref']) {
        throw new Error('USER sheet is empty.');
    }
    const range = XLSX.utils.decode_range(sheet['!ref']);

    // Find a contiguous Card | Level | Fused | Quantity header.
    let headerRow = -1;
    let startCol = -1;
    outer: for (let r = range.s.r; r <= range.e.r; r++) {
        for (let c = range.s.c; c <= range.e.c - 3; c++) {
            const seq = [0, 1, 2, 3].map((i) => {
                const cell = sheet[XLSX.utils.encode_cell({ r, c: c + i })];
                return cell ? cell.v : null;
            });
            if (seq[0] === 'Card' && seq[1] === 'Level' && seq[2] === 'Fused' && seq[3] === 'Quantity') {
                headerRow = r;
                startCol = c;
                break outer;
            }
        }
    }
    if (headerRow < 0) {
        throw new Error('Could not find the LIB header "Card | Level | Fused | Quantity" in the USER sheet.');
    }

    const library = [];
    let skippedEmpty = 0;
    for (let r = headerRow + 1; r <= range.e.r; r++) {
        const cardCell = sheet[XLSX.utils.encode_cell({ r, c: startCol })];
        if (!cardCell || cardCell.v == null || cardCell.v === '') break;

        const rawName = String(cardCell.v).trim();
        const lvCell = sheet[XLSX.utils.encode_cell({ r, c: startCol + 1 })];
        const fuCell = sheet[XLSX.utils.encode_cell({ r, c: startCol + 2 })];
        const qtCell = sheet[XLSX.utils.encode_cell({ r, c: startCol + 3 })];

        const level = clampLevel(lvCell ? lvCell.v : null);
        const fused = fuCell && String(fuCell.v).toLowerCase().startsWith('y');
        const quantity = parseInt(qtCell ? qtCell.v : 0, 10) || 0;

        if (quantity <= 0) { skippedEmpty++; continue; }

        const onyx = /:\s*Onyx\b/i.test(rawName);
        const name = onyx ? rawName.replace(/:\s*Onyx\b/i, '').trim() : rawName;

        library.push({ name, level, fused, onyx, quantity });
    }

    return {
        library,
        detectedVersion,
        headerRowFoundAt: headerRow + 1,  // 1-indexed for human display
        skippedEmpty,
    };
}

function clampLevel(v) {
    let n;
    if (typeof v === 'number') n = Math.round(v);
    else if (typeof v === 'string') n = parseInt(v, 10);
    if (!Number.isFinite(n)) return 1;
    return Math.max(1, Math.min(5, n));
}

/**
 * Apply parsed library entries to the live STATE.library according to the
 * chosen merge strategy. Returns counts so the caller can show a summary.
 *
 * strategies:
 *   'max'  — for collisions (same name + fused + onyx), take max(quantity,
 *            level) of existing vs imported. Adds non-colliding rows.
 *   'skip' — drop colliding imports, keep existing untouched. Adds
 *            non-colliding rows.
 *   'new'  — append every imported row, even when it collides. Will create
 *            duplicate library entries that the engine treats as the same
 *            logical card; surface a warning in the UI.
 */
export function applyImportedLibrary(stateLibrary, parsed, strategy, comboNameToId = {}) {
    let added = 0, merged = 0, skipped = 0, duplicated = 0;
    for (const imp of parsed) {
        const match = stateLibrary.find(
            (c) => c.name === imp.name && c.level === imp.level && !!c.fused === imp.fused && !!c.onyx === imp.onyx,
        );
        if (match) {
            if (strategy === 'skip') { skipped++; continue; }
            if (strategy === 'max') {
                if (imp.quantity > match.quantity) match.quantity = imp.quantity;
                if (imp.level > match.level) match.level = imp.level;
                merged++;
                continue;
            }
            if (strategy === 'new') {
                stateLibrary.push({
                    ...imp,
                    id: comboNameToId[imp.name] || 0,
                    added_at: Date.now(),
                });
                duplicated++;
                continue;
            }
        }
        stateLibrary.push({
            ...imp,
            id: comboNameToId[imp.name] || 0,
            added_at: Date.now(),
        });
        added++;
    }
    return { added, merged, skipped, duplicated };
}
