import { parseAndersamFile, applyImportedLibrary } from '../services/andersam_import.js';

/**
 * Import-from-spreadsheet modal flow.
 *
 *   openImportModal({ getLibrary, applyToLibrary, comboNameToId })
 *
 *   getLibrary()    returns the live STATE.library array (for collision counts)
 *   applyToLibrary(parsed, strategy) is called on confirm; should mutate the
 *     real library and refresh the UI. Receives the parsed entries and the
 *     chosen strategy ('max' | 'skip' | 'new').
 *
 * Two views in the same modal:
 *   - "picker" — file input + pick instructions
 *   - "preview" — parsed counts, detected version, strategy radios, sample
 */
let _openModalFn = null;
let _closeModalFn = null;
let _ctx = null;
let _parsed = null;

export function initImportModal({ openModal, closeModal }) {
    _openModalFn = openModal;
    _closeModalFn = closeModal;
}

export function openImportModal(ctx) {
    _ctx = ctx;
    _parsed = null;
    renderPicker();
    _openModalFn('modal-import');
}

function renderPicker() {
    document.getElementById('import-title').textContent = 'Import from Spreadsheet';

    const body = document.getElementById('import-body');
    body.innerHTML = '';

    const intro = document.createElement('p');
    intro.className = 'import-intro';
    intro.textContent = 'Pick a .xlsm or .xlsx Andersam library file. Reads the LIB table from the USER sheet; works across v4.01, v5.11, and older releases that share the Card | Level | Fused | Quantity header.';
    body.appendChild(intro);

    const pickBtn = document.createElement('button');
    pickBtn.type = 'button';
    pickBtn.className = 'import-pick';
    pickBtn.textContent = '📂 Pick spreadsheet file…';
    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = '.xlsx,.xlsm,.xls';
    fileInput.style.display = 'none';
    body.appendChild(pickBtn);
    body.appendChild(fileInput);

    pickBtn.addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', () => {
        const f = fileInput.files && fileInput.files[0];
        if (!f) return;
        const reader = new FileReader();
        reader.onload = () => {
            try {
                _parsed = parseAndersamFile(reader.result);
                renderPreview(f.name);
            } catch (err) {
                renderError(err.message || String(err));
            }
        };
        reader.onerror = () => renderError('Could not read file.');
        reader.readAsArrayBuffer(f);
    });

    const footer = document.getElementById('import-footer');
    footer.innerHTML = '';
    const cancel = document.createElement('button');
    cancel.type = 'button';
    cancel.textContent = 'Cancel';
    cancel.addEventListener('click', () => _closeModalFn('modal-import'));
    footer.appendChild(cancel);
}

function renderError(msg) {
    const body = document.getElementById('import-body');
    const err = document.createElement('div');
    err.className = 'import-error';
    err.textContent = `❌ ${msg}`;
    body.appendChild(err);
}

function renderPreview(filename) {
    document.getElementById('import-title').textContent = filename;

    const body = document.getElementById('import-body');
    body.innerHTML = '';

    const liveLib = _ctx.getLibrary ? _ctx.getLibrary() : [];
    const existingKey = new Set(liveLib.map((c) => `${c.name}|${c.fused?1:0}|${c.onyx?1:0}`));
    const newCount = _parsed.library.filter(
        (c) => !existingKey.has(`${c.name}|${c.fused?1:0}|${c.onyx?1:0}`)
    ).length;
    const collisionCount = _parsed.library.length - newCount;

    const summary = document.createElement('div');
    summary.className = 'import-summary';
    summary.innerHTML = `
        <div><span class="k">Detected version</span>${_parsed.detectedVersion || '(unknown)'}</div>
        <div><span class="k">Header row</span>${_parsed.headerRowFoundAt}</div>
        <div><span class="k">Entries read</span>${_parsed.library.length}</div>
        <div><span class="k">Empty rows skipped</span>${_parsed.skippedEmpty}</div>
        <div><span class="k">Already in library</span>${collisionCount}</div>
        <div><span class="k">New to library</span>${newCount}</div>
    `;
    body.appendChild(summary);

    const stratWrap = document.createElement('fieldset');
    stratWrap.className = 'import-strategy';
    stratWrap.innerHTML = '<legend>For cards already in your library:</legend>';
    const strategies = [
        { val: 'max',  label: 'Merge — take the higher quantity and level (recommended)' },
        { val: 'skip', label: 'Skip — keep your existing entries unchanged' },
        { val: 'new',  label: 'Add anyway — creates duplicate rows (rarely useful)' },
    ];
    for (const s of strategies) {
        const lbl = document.createElement('label');
        lbl.className = 'import-strategy__opt';
        const radio = document.createElement('input');
        radio.type = 'radio';
        radio.name = 'import-strategy';
        radio.value = s.val;
        if (s.val === 'max') radio.checked = true;
        lbl.appendChild(radio);
        const txt = document.createElement('span');
        txt.textContent = s.label;
        lbl.appendChild(txt);
        stratWrap.appendChild(lbl);
    }
    body.appendChild(stratWrap);

    // Sample of first ~10 entries so user can sanity-check
    if (_parsed.library.length > 0) {
        const sampleTitle = document.createElement('div');
        sampleTitle.className = 'import-sample__title';
        sampleTitle.textContent = `First ${Math.min(10, _parsed.library.length)} of ${_parsed.library.length} entries:`;
        body.appendChild(sampleTitle);
        const sample = document.createElement('div');
        sample.className = 'import-sample';
        for (const c of _parsed.library.slice(0, 10)) {
            const row = document.createElement('div');
            row.className = 'import-sample__row';
            const flags = [];
            if (c.fused) flags.push('ƒ');
            if (c.onyx) flags.push('◊');
            row.textContent = `${c.name}${flags.length ? ' ' + flags.join('') : ''}  ·  Lv ${c.level}  ·  ×${c.quantity}`;
            sample.appendChild(row);
        }
        body.appendChild(sample);
    }

    const footer = document.getElementById('import-footer');
    footer.innerHTML = '';
    const cancel = document.createElement('button');
    cancel.type = 'button';
    cancel.textContent = 'Cancel';
    cancel.addEventListener('click', () => _closeModalFn('modal-import'));
    footer.appendChild(cancel);
    const apply = document.createElement('button');
    apply.type = 'button';
    apply.className = 'accent';
    apply.textContent = `Import ${_parsed.library.length} entries`;
    apply.addEventListener('click', () => {
        const strategy = document.querySelector('input[name=import-strategy]:checked').value;
        const result = _ctx.applyToLibrary(_parsed.library, strategy);
        _closeModalFn('modal-import');
        if (_ctx.onComplete) _ctx.onComplete(result);
    });
    footer.appendChild(apply);
}

// Re-export so callers don't need a second import.
export { applyImportedLibrary };
