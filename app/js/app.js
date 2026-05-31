/**
 * app.js  –  Little Alchemist Deck Optimizer  (Web App)
 *
 * All application state, UI bindings and interaction logic.
 */
import {
    comboValue, rankSuggestions, nextSuggestion, totalDeckScore,
    fillDeck, advancedFill, buildKeyLookup, defaultSettings,
} from './engine.js';
import comboData from '../combo_data.json';
import { loadCardData, hasCard, getCard } from './util/card_data.js';
import { showToast } from './util/toast.js';
import { recordUndo } from './util/undo.js';
import { createLibraryRow } from './components/library_row.js';
import { createLibrarySearch } from './components/library_search.js';
import { createCardThumbnail } from './components/card_thumbnail.js';
import { loadPackData } from './util/pack_data.js';
import { initPackPicker, openPackPicker } from './components/pack_picker.js';
import { initImportModal, openImportModal, applyImportedLibrary } from './components/import_modal.js';
import { initChangeCardModal, openChangeCardModal } from './components/change_card_modal.js';
import { buildDeckXlsx } from './services/deck_export.js';

// Phase 2: in-session memory for "Recently Added" section (newest first).
const _recentlyAdded = [];
// Card key of the library row currently expanded inline (so a re-render after
// an inline edit keeps that row open instead of snapping shut).
let _expandedKey = null;
function _pushRecent(name) {
    const idx = _recentlyAdded.indexOf(name);
    if (idx >= 0) _recentlyAdded.splice(idx, 1);
    _recentlyAdded.unshift(name);
    if (_recentlyAdded.length > 10) _recentlyAdded.length = 10;
}

// ── Phase 2: panel layout state (persisted) ──────────────────────────────────
const PANEL_LAYOUT = {
    max: null,                     // 'library' | 'deck' | 'suggestions' | null
    collapsed: new Set(),          // subset of those names
};
function _loadPanelLayout() {
    try {
        const raw = localStorage.getItem('la_panel_layout');
        if (!raw) return;
        const p = JSON.parse(raw);
        if (typeof p.max === 'string' || p.max === null) PANEL_LAYOUT.max = p.max;
        if (Array.isArray(p.collapsed)) PANEL_LAYOUT.collapsed = new Set(p.collapsed);
    } catch { /* ignore */ }
}
function _savePanelLayout() {
    try {
        localStorage.setItem('la_panel_layout', JSON.stringify({
            max: PANEL_LAYOUT.max,
            collapsed: [...PANEL_LAYOUT.collapsed],
        }));
    } catch { /* ignore */ }
}
function _applyPanelLayout() {
    const mc = document.getElementById('main-content');
    if (!mc) return;
    mc.dataset.maxPanel = PANEL_LAYOUT.max || '';
    document.querySelectorAll('#main-content > .panel').forEach((p) => {
        const name = p.dataset.panel;
        p.classList.toggle('panel--collapsed', PANEL_LAYOUT.collapsed.has(name));
        p.classList.toggle('panel--maximized', PANEL_LAYOUT.max === name);
        p.classList.toggle('panel--hidden-by-max', PANEL_LAYOUT.max && PANEL_LAYOUT.max !== name);
    });
}

// ── Phase 2A: filter + sort state (persisted) ────────────────────────────────
const RARITIES = ['Bronze', 'Silver', 'Gold', 'Diamond', 'Onyx'];
const RARITY_RANK = { Bronze: 0, Silver: 1, Gold: 2, Diamond: 3, Onyx: 4 };
const SORT_OPTIONS = ['az', 'za', 'newest', 'oldest', 'rarity', 'deck-first', 'suggested'];

const FILTER = {
    rarities: new Set(RARITIES),    // all on by default
    includeCombo: true,             // show everything by default; toggles NARROW
    includeFusion: true,
    sort: 'az',
};
const FILTER_VERSION = 2;   // bump to migrate persisted filter state
function _loadFilterSort() {
    try {
        const raw = localStorage.getItem('la_filter_sort');
        if (!raw) return;
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed.rarities)) FILTER.rarities = new Set(parsed.rarities.filter((r) => RARITIES.includes(r)));
        if (SORT_OPTIONS.includes(parsed.sort)) FILTER.sort = parsed.sort;
        // v2 migration: combos/finals now default ON (show everything). Saved
        // state from v1 had them OFF, which hid most cards. Ignore the old
        // combo/fusion booleans unless the saved state is already v2+.
        if (parsed.v >= FILTER_VERSION) {
            if (typeof parsed.includeCombo === 'boolean') FILTER.includeCombo = parsed.includeCombo;
            if (typeof parsed.includeFusion === 'boolean') FILTER.includeFusion = parsed.includeFusion;
        } else {
            FILTER.includeCombo = true;
            FILTER.includeFusion = true;
            _saveFilterSort();   // upgrade the stored record
        }
    } catch { /* ignore */ }
}
function _saveFilterSort() {
    try {
        localStorage.setItem('la_filter_sort', JSON.stringify({
            v: FILTER_VERSION,
            rarities: [...FILTER.rarities],
            includeCombo: FILTER.includeCombo,
            includeFusion: FILTER.includeFusion,
            sort: FILTER.sort,
        }));
    } catch { /* ignore */ }
}

/** Returns true if a card name should appear under the current filter.
 *  Three-way kind:
 *   - base: not combo AND not final → always visible (default category)
 *   - combo: has Combinations entries → visible only when Include combos ticked
 *   - final: appears as combo result → visible only when Include final forms ticked
 *  A card flagged as BOTH combo AND final appears when EITHER toggle is on. */
function _passesFilter(name) {
    const info = getCard(name);
    const rarity = (info && info.rarity) || '';
    if (rarity && !FILTER.rarities.has(rarity)) return false;
    const isCombo = !!(info && info.is_combo);
    const isFinal = !!(info && info.is_final);
    if (!isCombo && !isFinal) return true;  // base — always visible
    if (isCombo && FILTER.includeCombo) return true;
    if (isFinal && FILTER.includeFusion) return true;
    return false;
}

function _sortLibrary(rows) {
    const sort = FILTER.sort;
    if (sort === 'az')      return [...rows].sort((a, b) => a.name.localeCompare(b.name));
    if (sort === 'za')      return [...rows].sort((a, b) => b.name.localeCompare(a.name));
    if (sort === 'newest')  return [...rows].sort((a, b) => (b.added_at || 0) - (a.added_at || 0));
    if (sort === 'oldest')  return [...rows].sort((a, b) => (a.added_at || 0) - (b.added_at || 0));
    if (sort === 'rarity') {
        return [...rows].sort((a, b) => {
            const ra = RARITY_RANK[(getCard(a.name) || {}).rarity] ?? -1;
            const rb = RARITY_RANK[(getCard(b.name) || {}).rarity] ?? -1;
            return (rb - ra) || a.name.localeCompare(b.name);
        });
    }
    if (sort === 'deck-first') {
        const deckNames = new Set(STATE.deck.filter(Boolean).map((c) => c.name));
        return [...rows].sort((a, b) => {
            const aIn = deckNames.has(a.name) ? 0 : 1;
            const bIn = deckNames.has(b.name) ? 0 : 1;
            return (aIn - bIn) || a.name.localeCompare(b.name);
        });
    }
    if (sort === 'suggested') {
        const deckKeys = STATE.deck.filter(Boolean).map((c) => _cardKey(c));
        const ranked = rankSuggestions(STATE.comboDict, STATE.library, deckKeys, STATE.settings);
        const rankByKey = {};
        ranked.forEach(([k], i) => { rankByKey[k] = i; });
        return [...rows].sort((a, b) => {
            const ra = rankByKey[_cardKey(a)] ?? Infinity;
            const rb = rankByKey[_cardKey(b)] ?? Infinity;
            return (ra - rb) || a.name.localeCompare(b.name);
        });
    }
    return [...rows].sort((a, b) => a.name.localeCompare(b.name));
}

// ── State ────────────────────────────────────────────────────────────────────
const STATE = {
    comboDict:    {},          // loaded from combo_data.json
    nameToId:     {},          // card_name → CC_Num (catalog number)
    comboNameToId: {},         // card_name → sequential combo ID (used in scoring)
    cardInfo:     {},          // card_name → { num, rare, cmb_cntr }
    baseCardNames: [],         // sorted unique base card names (for datalist)
    library:      [],          // array of { name, id, level, fused, onyx, quantity }
    deck:         [],          // array of card name strings
    settings:     defaultSettings(),
    leaderboard:  [],          // array of { startCard, score, deck }
    startCard:    '',
};

// Composite card key: distinguishes plain / fused / onyx variants of the same name
function _cardKey(c) { return c.name + '|' + (c.level ?? '') + '|' + (c.fused ? '1' : '0') + '|' + (c.onyx ? '1' : '0'); }
function _nameFromKey(k) { return k ? k.split('|')[0] : ''; }
function _dispName(c) { return c && c.name ? c.name + (c.onyx ? ' (Onyx)' : '') : ''; }

/** Returns an <img> tag for the card's rarity, or an empty string if unknown. */
function _rarityImg(card) {
    if (!card) return '';
    if (card.onyx) return `<img src="assets/Onyx.png" class="rarity-icon" alt="Onyx" title="Onyx">`;
    const info = STATE.cardInfo[card.name];
    const rare = info ? info.rare : '';
    const map = {
        'Common':   'Bronze_Card.png',
        'Uncommon': 'Silver_Card.png',
        'Rare':     'Gold_Card.png',
        'Onyx':     'Onyx.png',
    };
    const img = map[rare];
    return img ? `<img src="assets/${img}" class="rarity-icon" alt="${esc(rare)}" title="${esc(rare)}">` : '';
}

// UI selection tracking
let _libSelectedKey    = null;   // composite key (name|fused|onyx)
let _deckSelectedIdx   = null;   // 0-based
let _sugSelectedKey    = null;
let _lbSelectedIdx     = null;   // 0-based

// Sort tracking for library
let _libSortCol = 'name';
let _libSortAsc = true;

// Sort tracking for deck
let _deckSortCol = null;
let _deckSortAsc = true;

// Background worker
let _worker        = null;
let _workerCancelled = false;
let _workerRunning = false;

// Confirm dialog callback
let _confirmCallback = null;

// Pending conflict resolution { updated, collisionCard, origKey }
let _conflictPending = null;

// ── Startup ──────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
    // Restore theme before first paint
    if (localStorage.getItem('la_theme') === 'light') {
        document.body.classList.add('light');
        document.getElementById('theme-toggle-cb').checked = true;
    }
    _bindEvents();
    _loadFromStorage();
});

function _loadFromStorage() {
    // Restore persisted user data (library, settings, deck, leaderboard)
    try {
        const lib = localStorage.getItem('la_library');
        if (lib) STATE.library = JSON.parse(lib);
    } catch { /* ignore */ }
    // Phase 2A: ensure every entry has an added_at timestamp (legacy entries → 0).
    for (const c of STATE.library) {
        if (typeof c.added_at !== 'number') c.added_at = 0;
    }
    // Safety: keep a rolling backup of the last known-good library so a bad
    // migration or edit can be recovered. Only overwrite the backup when the
    // current library is non-empty (never clobber a good backup with []).
    try {
        if (STATE.library.length > 0) {
            localStorage.setItem('la_library_backup', JSON.stringify({
                savedAt: new Date().toISOString(),
                library: STATE.library,
            }));
        }
    } catch { /* ignore */ }
    try {
        const s = localStorage.getItem('la_settings');
        if (s) Object.assign(STATE.settings, JSON.parse(s));
    } catch { /* ignore */ }
    try {
        const d = localStorage.getItem('la_deck');
        if (d) {
            const parsed = JSON.parse(d);
            // Migrate: old format stored composite key strings – discard and rebuild
            if (Array.isArray(parsed) && parsed.length && typeof parsed[0] === 'string') {
                STATE.deck = [];
            } else {
                STATE.deck = parsed;
            }
        }
    } catch { /* ignore */ }
    try {
        const lb = localStorage.getItem('la_leaderboard');
        if (lb) STATE.leaderboard = JSON.parse(lb);
    } catch { /* ignore */ }
    try {
        STATE.startCard = localStorage.getItem('la_start_card') || '';
    } catch { /* ignore */ }

    // Load combo data from the statically-imported combo_data.json
    const data = comboData;
    if (!data || !data.combos) {
        setStatus('\u26a0 combo_data.json is empty or invalid. Run data_loader.py then rebuild.');
        _toast('combo_data.json missing \u2014 run data_loader.py', 'error');
        return;
    }

    STATE.comboDict     = data.combos;
    STATE.nameToId      = data.name_to_id || {};
    STATE.cardInfo      = data.card_info  || {};
    STATE.comboNameToId = data.combo_name_to_id || {};
    STATE.baseCardNames = data.base_card_names || Object.keys(data.name_to_id || {}).sort();

    // Seed settings / deck / start-card from bundled data if not already persisted
    if (data.settings) Object.assign(STATE.settings, data.settings);
    // Re-apply localStorage settings on top (user overrides)
    try {
        const s = localStorage.getItem('la_settings');
        if (s) Object.assign(STATE.settings, JSON.parse(s));
    } catch { /* ignore */ }
    if (!STATE.startCard && data.start_card) STATE.startCard = data.start_card;

    _enterApp();
}

// ── Event binding ─────────────────────────────────────────────────────────────
function _bindEvents() {

    // ── Theme toggle ──────────────────────────────────────────────────────────
    document.getElementById('theme-toggle-cb').addEventListener('change', e => {
        if (e.target.checked) {
            document.body.classList.add('light');
            localStorage.setItem('la_theme', 'light');
        } else {
            document.body.classList.remove('light');
            localStorage.setItem('la_theme', 'dark');
        }
    });

    // ── Top bar ───────────────────────────────────────────────────────────────
    document.getElementById('btn-settings').addEventListener('click', _openSettings);
    document.getElementById('btn-reload-data').addEventListener('click', () => {
        STATE.comboDict = {};
        STATE.library = [];
        _loadFromStorage();
    });

    // ── Library (Phase 2: search-to-add + inline-edit rows) ────────────────────
    document.getElementById('btn-lib-to-deck').addEventListener('click', _addSelectedToDeck);
    document.getElementById('btn-lib-add-pack').addEventListener('click', () => {
        openPackPicker({ onCommit: _bulkAddFromPack });
    });
    document.getElementById('btn-lib-import-xls').addEventListener('click', () => {
        openImportModal({
            getLibrary: () => STATE.library,
            applyToLibrary: (entries, strategy) => {
                const before = STATE.library.map((c) => ({ ...c }));
                const result = applyImportedLibrary(STATE.library, entries, strategy, STATE.comboNameToId);
                STATE.library.sort((a, b) => a.name.localeCompare(b.name));
                _persistLibrary();
                _refreshAfterLibraryMutation();
                recordUndo('xlsm import', () => {
                    STATE.library.length = 0;
                    for (const c of before) STATE.library.push(c);
                    _persistLibrary();
                    _refreshAfterLibraryMutation();
                });
                return result;
            },
            onComplete: (r) => showToast(`Imported: +${r.added} new, ${r.merged} merged, ${r.skipped} skipped`),
        });
    });
    // ── Panel layout controls (maximize / collapse per panel) ─────────────────
    _loadPanelLayout();
    _applyPanelLayout();
    document.querySelectorAll('.panel-ctrl').forEach((btn) => {
        btn.addEventListener('click', () => {
            const panel = btn.closest('.panel').dataset.panel;
            const action = btn.dataset.action;
            if (action === 'max') {
                PANEL_LAYOUT.max = (PANEL_LAYOUT.max === panel) ? null : panel;
                // Maximizing implies expanding (un-collapse)
                if (PANEL_LAYOUT.max === panel) PANEL_LAYOUT.collapsed.delete(panel);
            } else if (action === 'collapse') {
                if (PANEL_LAYOUT.collapsed.has(panel)) PANEL_LAYOUT.collapsed.delete(panel);
                else PANEL_LAYOUT.collapsed.add(panel);
                // If this is the maximized panel, collapsing it cancels max
                if (PANEL_LAYOUT.max === panel && PANEL_LAYOUT.collapsed.has(panel)) {
                    PANEL_LAYOUT.max = null;
                }
            }
            _savePanelLayout();
            _applyPanelLayout();
        });
    });

    // Outside-click collapses any expanded row
    document.addEventListener('click', (e) => {
        if (e.target.closest('.lib-row')) return;
        document.querySelectorAll('.lib-row--expanded').forEach((row) => {
            if (typeof row.collapse === 'function') row.collapse();
        });
    });
    document.getElementById('btn-save-library').addEventListener('click', _saveLibraryToStorage);
    document.getElementById('btn-export-library').addEventListener('click', _exportLibrary);
    document.getElementById('btn-import-library').addEventListener('click', () => {
        document.getElementById('input-import-library').value = '';
        document.getElementById('input-import-library').click();
    });
    document.getElementById('input-import-library').addEventListener('change', _importLibrary);

    // (Library table header sorting removed in Phase 2 — list now uses
    //  card-row layout with no sort headers. Re-add as a dropdown in Phase 4.)

    // Deck table header sorting
    document.querySelectorAll('#deck-table thead th').forEach(th => {
        th.addEventListener('click', () => {
            const col = th.dataset.col;
            if (!col) return;
            if (_deckSortCol === col) _deckSortAsc = !_deckSortAsc;
            else { _deckSortCol = col; _deckSortAsc = true; }
            _sortDeckBy(_deckSortCol, _deckSortAsc);
        });
    });

    // ── Deck ──────────────────────────────────────────────────────────────────
    document.getElementById('btn-set-start').addEventListener('click', _setStartCard);
    _initDeckTarget();
    document.getElementById('deck-sort').addEventListener('change', (e) => {
        const v = e.target.value;
        if (!v) { refreshDeck(); return; }   // "Deck order" — leave as-is
        const [col, dir] = v.split('-');
        _sortDeckBy(col, dir === 'asc');
        _saveDeck();
    });
    document.getElementById('btn-deck-up').addEventListener('click', _deckUp);
    document.getElementById('btn-deck-down').addEventListener('click', _deckDown);
    document.getElementById('btn-deck-remove').addEventListener('click', _removeFromDeck);
    document.getElementById('btn-fill').addEventListener('click', () => _runAlgorithm('fill'));
    document.getElementById('btn-complete-deck').addEventListener('click', () => _runAlgorithm('complete'));
    document.getElementById('btn-advanced-fill').addEventListener('click', () => _runAlgorithm('advanced'));
    document.getElementById('btn-try-all').addEventListener('click', () => _runAlgorithm('try_all'));
    document.getElementById('btn-best-possible').addEventListener('click', () => _runAlgorithm('best'));
    document.getElementById('btn-to-leaderboard').addEventListener('click', _copyToLeaderboard);
    document.getElementById('btn-export-deck').addEventListener('click', _exportDeck);
    document.getElementById('btn-export-deck-xlsx').addEventListener('click', _exportDeckXlsx);
    document.getElementById('btn-clear-deck').addEventListener('click', () => {
        _confirm('Clear Deck', 'Clear all cards from the deck?', () => {
            STATE.deck = [];
            _refreshAll();
        });
    });

    // ── Suggestions ───────────────────────────────────────────────────────────
    document.getElementById('btn-add-best').addEventListener('click', _addBestSuggestion);

    // ── Bottom tabs ────────────────────────────────────────────────────────────
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const tab = btn.dataset.tab;
            document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
            document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
            btn.classList.add('active');
            document.getElementById('tab-' + tab).classList.add('active');
        });
    });

    // ── Leaderboard ────────────────────────────────────────────────────────────
    document.getElementById('btn-lb-load').addEventListener('click', _loadLbDeck);
    document.getElementById('btn-lb-clear').addEventListener('click', () => {
        _confirm('Clear Leaderboard', 'Clear all leaderboard entries?', () => {
            STATE.leaderboard = [];
            refreshLeaderboard();
        });
    });
    document.getElementById('btn-lb-save').addEventListener('click', _saveLeaderboardToStorage);
    document.getElementById('btn-lb-export').addEventListener('click', _exportLeaderboard);
    document.getElementById('btn-lb-import').addEventListener('click', () => {
        document.getElementById('input-lb-import').value = '';
        document.getElementById('input-lb-import').click();
    });
    document.getElementById('input-lb-import').addEventListener('change', _importLeaderboard);

    // ── Status bar ─────────────────────────────────────────────────────────────
    document.getElementById('btn-cancel').addEventListener('click', _cancelWorker);

    // ── Modals ─────────────────────────────────────────────────────────────────
    document.querySelectorAll('[data-close]').forEach(el => {
        el.addEventListener('click', () => _closeModal(el.dataset.close));
    });
    document.getElementById('modal-overlay').addEventListener('click', _closeAllModals);

    // Settings save
    document.getElementById('btn-settings-save').addEventListener('click', _saveSettings);

    // Card dialog OK
    document.getElementById('btn-card-ok').addEventListener('click', _cardDialogOk);
    document.getElementById('btn-card-add-another').addEventListener('click', _cardDialogAddAnother);

    // Confirm dialog OK
    document.getElementById('btn-confirm-ok').addEventListener('click', () => {
        _closeModal('modal-confirm');
        if (_confirmCallback) { _confirmCallback(); _confirmCallback = null; }
    });

    document.getElementById('btn-conflict-keep-edited').addEventListener('click', _conflictKeepEdited);
    document.getElementById('btn-conflict-keep-existing').addEventListener('click', _conflictKeepExisting);

    // Double-click suggestions to add to deck
    document.getElementById('sug-tbody').addEventListener('dblclick', e => {
        const row = e.target.closest('tr');
        if (row && row.dataset.key) {
            _addToDeck(row.dataset.key);
        }
    });

    // (Double-click library to edit removed in Phase 2 — inline editing
    //  replaces the modal-based edit flow.)

    // Double-click leaderboard to load
    document.getElementById('lb-tbody').addEventListener('dblclick', () => _loadLbDeck());

    // ── Bottom area vertical resize ────────────────────────────────────────────
    const _resizeHandle = document.getElementById('bottom-resize-handle');
    const _appEl        = document.getElementById('app');
    const _BOTTOM_MIN   = 220;
    const _BOTTOM_MAX   = 440;

    _resizeHandle.addEventListener('mousedown', e => {
        e.preventDefault();
        const startY      = e.clientY;
        const startHeight = document.getElementById('bottom-area').getBoundingClientRect().height;
        _resizeHandle.classList.add('dragging');

        const onMove = ev => {
            const delta     = startY - ev.clientY;
            const newHeight = Math.min(_BOTTOM_MAX, Math.max(_BOTTOM_MIN, startHeight + delta));
            _appEl.style.gridTemplateRows = `52px 1fr 5px ${newHeight}px 36px`;
        };
        const onUp = () => {
            _resizeHandle.classList.remove('dragging');
            document.removeEventListener('mousemove', onMove);
            document.removeEventListener('mouseup',   onUp);
        };
        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup',   onUp);
    });
}

// ── Data loading ──────────────────────────────────────────────────────────────

function _onComboFileChosen(e) {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = evt => {
        try {
            const data = JSON.parse(evt.target.result);
            if (!data.combos || typeof data.combos !== 'object') {
                throw new Error('Missing "combos" key — is this a combo_data.json file?');
            }
            STATE.comboDict     = data.combos;
            STATE.nameToId      = data.name_to_id || {};
            STATE.cardInfo      = data.card_info  || {};
            STATE.comboNameToId = data.combo_name_to_id || {};
            STATE.baseCardNames = data.base_card_names || Object.keys(data.name_to_id || {}).sort();

            // Persist to sessionStorage for reload within session
            try {
                sessionStorage.setItem('la_combo_data', JSON.stringify({
                    combos:          STATE.comboDict,
                    name_to_id:      STATE.nameToId,
                    card_info:       STATE.cardInfo,
                    combo_name_to_id: STATE.comboNameToId,
                    base_card_names: STATE.baseCardNames,
                }));
            } catch { /* quota exceeded — no biggie */ }

            // Try to load library from data if no library yet
            if (STATE.library.length === 0 && data.library && data.library.length > 0) {
                STATE.library = data.library;
            }
            if (!STATE.startCard && data.start_card) STATE.startCard = data.start_card;
            if (data.settings) Object.assign(STATE.settings, data.settings);

            document.getElementById('load-combo-err').classList.add('hidden');
            document.getElementById('load-lib-row').classList.remove('hidden');
            document.getElementById('load-lib-row').style.display = 'flex';
        } catch (err) {
            const errEl = document.getElementById('load-combo-err');
            errEl.textContent = '✗ ' + err.message;
            errEl.classList.remove('hidden');
        }
    };
    reader.readAsText(file);
}

function _onLibFileChosen(e) {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = evt => {
        try {
            const lib = JSON.parse(evt.target.result);
            if (!Array.isArray(lib)) throw new Error('library.json must be an array');
            STATE.library = lib;
            _resolveIds();
            _toast('Library imported (' + lib.length + ' cards)', 'success');
        } catch (err) {
            _toast('Library import failed: ' + err.message, 'error');
        }
    };
    reader.readAsText(file);
}

async function _enterApp() {
    // On first launch (no saved library) seed with all Common + Uncommon cards
    if (STATE.library.length === 0) {
        const SEED_RARITIES = new Set(['Common', 'Uncommon']);
        for (const [name, info] of Object.entries(STATE.cardInfo)) {
            if (!SEED_RARITIES.has(info.rare) || name.includes(':Onyx')) continue;
            const id = STATE.comboNameToId[name] || STATE.nameToId[name] || 0;
            STATE.library.push({ name, level: 5, fused: false, onyx: false, quantity: 3, id });
        }
        STATE.library.sort((a, b) => a.name.localeCompare(b.name));
        try { localStorage.setItem('la_library', JSON.stringify(STATE.library)); } catch { /* ignore */ }
    }
    _resolveIds();
    // Phase 2: load enriched card metadata + pack data before first paint so
    // thumbnails, search, and pack picker are all ready.
    await Promise.all([loadCardData(), loadPackData()]);
    _initLibraryUI();
    initPackPicker({ openModal: _openModal, closeModal: _closeModal });
    initImportModal({ openModal: _openModal, closeModal: _closeModal });
    initChangeCardModal({ openModal: _openModal, closeModal: _closeModal });
    _refreshAll();
    setStatus('Loaded ' + Object.keys(STATE.comboDict).length.toLocaleString() + ' combinations  |  ' + STATE.library.length + ' cards in library');
}

// ── Phase 2 library UI wiring ────────────────────────────────────────────────
let _librarySearchReady = false;
let _librarySearch = null;
function _initLibraryUI() {
    if (_librarySearchReady) return;
    _librarySearchReady = true;
    _loadFilterSort();

    _librarySearch = createLibrarySearch({
        input: document.getElementById('lib-search'),
        resultsHost: document.getElementById('lib-search-results'),
        passesFilter: _passesFilter,
        getOwnedCount: (name) => STATE.library.filter((c) => c.name === name).reduce((n, c) => n + c.quantity, 0),
        onPick: _addOrIncrementFromSearch,
    });

    _buildKindToggles();
    _buildRarityChips();
    _wireSortDropdown();
}

function _onFiltersChanged() {
    _saveFilterSort();
    refreshLibrary();
    if (_librarySearch) _librarySearch.refresh();
}

function _buildKindToggles() {
    const host = document.getElementById('lib-search-filters');
    host.innerHTML = '';
    const mk = (key, label, stateKey) => {
        const wrap = document.createElement('label');
        wrap.className = 'search-filter';
        const cb = document.createElement('input');
        cb.type = 'checkbox';
        cb.checked = FILTER[stateKey];
        cb.addEventListener('change', () => { FILTER[stateKey] = cb.checked; _onFiltersChanged(); });
        wrap.appendChild(cb);
        const text = document.createElement('span');
        text.textContent = label;
        wrap.appendChild(text);
        return wrap;
    };
    host.appendChild(mk('combo', 'Include combos', 'includeCombo'));
    host.appendChild(mk('fusion', 'Include final forms', 'includeFusion'));
}

function _buildRarityChips() {
    const host = document.getElementById('rarity-chips');
    host.innerHTML = '';
    const label = document.createElement('span');
    label.className = 'rarity-chips__label';
    label.textContent = 'Rarity:';
    host.appendChild(label);
    for (const rarity of RARITIES) {
        const chip = document.createElement('button');
        chip.type = 'button';
        chip.className = `rarity-chip rarity-chip--${rarity.toLowerCase()}`;
        chip.textContent = rarity[0];
        chip.title = rarity;
        chip.setAttribute('aria-pressed', FILTER.rarities.has(rarity) ? 'true' : 'false');
        if (!FILTER.rarities.has(rarity)) chip.classList.add('rarity-chip--off');
        chip.addEventListener('click', () => {
            if (FILTER.rarities.has(rarity)) FILTER.rarities.delete(rarity);
            else FILTER.rarities.add(rarity);
            chip.classList.toggle('rarity-chip--off', !FILTER.rarities.has(rarity));
            chip.setAttribute('aria-pressed', FILTER.rarities.has(rarity) ? 'true' : 'false');
            _onFiltersChanged();
        });
        host.appendChild(chip);
    }
}

function _wireSortDropdown() {
    const sel = document.getElementById('lib-sort');
    sel.value = FILTER.sort;
    sel.addEventListener('change', () => {
        FILTER.sort = sel.value;
        _saveFilterSort();
        refreshLibrary();
    });
}

function _libIndexOfKey(key) {
    return STATE.library.findIndex((c) => `${c.name}|${c.fused ? 1 : 0}|${c.onyx ? 1 : 0}` === key);
}

function _findEntry(name, { level = null, fused = false, onyx = false } = {}) {
    return STATE.library.find((c) =>
        c.name === name
        && (level === null || c.level === level)
        && !!c.fused === fused
        && !!c.onyx === onyx);
}

function _persistLibrary() {
    try { localStorage.setItem('la_library', JSON.stringify(STATE.library)); } catch { /* ignore */ }
}

function _addOrIncrementFromSearch(name) {
    if (!hasCard(name) && !STATE.comboNameToId[name] && !STATE.nameToId[name]) {
        showToast(`Unknown card: ${name}`);
        return;
    }
    // New adds default to Lv 1 / unfused / no-onyx; match that exact identity
    // so a fresh add increments only an existing Lv1 base entry (an existing
    // Arachnid Lv5 is a different row and is left alone).
    const existing = _findEntry(name, { level: 1, fused: false, onyx: false });
    if (existing) {
        const prevQty = existing.quantity;
        existing.quantity = prevQty + 1;
        _persistLibrary();
        _refreshAfterLibraryMutation();
        showToast(`${name}: ×${existing.quantity}`);
        recordUndo(`+1 ${name}`, () => {
            const e = _findEntry(name, { level: 1, fused: false, onyx: false });
            if (!e) return;
            e.quantity = prevQty;
            _persistLibrary();
            _refreshAfterLibraryMutation();
        });
    } else {
        const id = STATE.comboNameToId[name] || STATE.nameToId[name] || 0;
        const newCard = { name, level: 1, fused: false, onyx: false, quantity: 1, id, added_at: Date.now() };
        STATE.library.push(newCard);
        STATE.library.sort((a, b) => a.name.localeCompare(b.name));
        _persistLibrary();
        _refreshAfterLibraryMutation();
        showToast(`Added ${name}`);
        recordUndo(`Add ${name}`, () => {
            const idx = STATE.library.indexOf(newCard);
            if (idx >= 0) STATE.library.splice(idx, 1);
            _persistLibrary();
            _refreshAfterLibraryMutation();
        });
    }
    _pushRecent(name);
}

function _refreshAfterLibraryMutation() {
    refreshLibrary();
    refreshSuggestions();
    refreshScore();
}

function _bulkAddFromPack(cards) {
    if (!cards || cards.length === 0) return;
    const before = STATE.library.map((c) => ({ ...c }));
    let added = 0;
    let incremented = 0;
    for (const { name, onyx } of cards) {
        // Pack pulls come in at Lv 1 / unfused; match that exact identity.
        const existing = _findEntry(name, { level: 1, fused: false, onyx });
        if (existing) {
            existing.quantity += 1;
            incremented++;
        } else {
            const id = STATE.comboNameToId[name] || STATE.nameToId[name] || 0;
            STATE.library.push({
                name, level: 1, fused: false, onyx, quantity: 1, id,
                added_at: Date.now(),
            });
            added++;
        }
        _pushRecent(name);
    }
    STATE.library.sort((a, b) => a.name.localeCompare(b.name));
    _persistLibrary();
    _refreshAfterLibraryMutation();
    showToast(`Pack: +${added} new, +1 to ${incremented}`);
    recordUndo('pack add', () => {
        STATE.library.length = 0;
        for (const c of before) STATE.library.push(c);
        _persistLibrary();
        _refreshAfterLibraryMutation();
    });
}

function _resolveIds() {
    // Always use the sequential combo ID (not CC_Num) so score lookups work
    for (const card of STATE.library) {
        card.id = STATE.comboNameToId[card.name] || STATE.nameToId[card.name] || 0;
    }
    for (const card of STATE.deck) {
        if (card) card.id = STATE.comboNameToId[card.name] || STATE.nameToId[card.name] || 0;
    }
}

// ── Refresh all panels ────────────────────────────────────────────────────────

function _refreshAll() {
    refreshLibrary();
    refreshDeck();
    refreshSuggestions();
    refreshMatrix();
    refreshScore();
    _refreshStartCardDropdown();
    refreshLeaderboard();
}

// ── Library refresh ───────────────────────────────────────────────────────────

function refreshLibrary() {
    const list = document.getElementById('lib-list');
    if (!list) return;
    list.innerHTML = '';

    const filtered = STATE.library.filter((c) => _passesFilter(c.name));
    const sorted = _sortLibrary(filtered);

    // Recently Added section — in-session memory, ignores sort/filter
    if (_recentlyAdded.length > 0) {
        const title = document.createElement('div');
        title.className = 'lib-section-title';
        title.textContent = 'Recently added';
        list.appendChild(title);
        for (const name of _recentlyAdded) {
            list.appendChild(_makeRecentRow(name));
        }
        const allTitle = document.createElement('div');
        allTitle.className = 'lib-section-title';
        allTitle.textContent = `All cards (${sorted.length}${sorted.length !== STATE.library.length ? ` of ${STATE.library.length}` : ''})`;
        list.appendChild(allTitle);
    }

    if (sorted.length === 0 && _recentlyAdded.length === 0) {
        const empty = document.createElement('div');
        empty.className = 'lib-empty';
        empty.textContent = STATE.library.length === 0
            ? 'Add your first card with the search bar above.'
            : 'No cards match the current filter.';
        list.appendChild(empty);
    }
    for (const card of sorted) {
        list.appendChild(_makeLibraryRow(card));
    }
}

function _makeLibraryRow(card) {
    return createLibraryRow(card, {
        startExpanded: _expandedKey === _cardKey(card),
        onToggleExpand: (isOpen) => { _expandedKey = isOpen ? _cardKey(card) : null; },
        onChangeLevel: (v) => _applyIdentityChange(card, { level: v }, `Lv ${v}`),
        // Marking a card fused implies it's maxed (Lv 5) — set both together.
        onChangeFused: (v) => _applyIdentityChange(card, v ? { fused: true, level: 5 } : { fused: false }, `fused ${v ? 'on (Lv 5)' : 'off'}`),
        onChangeOnyx:  (v) => _applyIdentityChange(card, { onyx: v }, `onyx ${v ? 'on' : 'off'}`),
        onChangeQty: (v) => {
            const prev = card.quantity;
            if (v === prev) return;
            card.quantity = v;
            _persistLibrary();
            refreshSuggestions(); refreshScore();
            recordUndo(`Qty ${card.name} → ${prev}`, () => {
                card.quantity = prev;
                _persistLibrary(); refreshLibrary(); refreshSuggestions(); refreshScore();
            });
        },
        onDelete: () => {
            const idx = STATE.library.indexOf(card);
            if (idx < 0) return;
            const removed = STATE.library.splice(idx, 1)[0];
            if (_expandedKey === _cardKey(card)) _expandedKey = null;
            _persistLibrary();
            _refreshAfterLibraryMutation();
            showToast(`Removed ${card.name}`);
            recordUndo(`Remove ${card.name}`, () => {
                STATE.library.splice(idx, 0, removed);
                _persistLibrary(); _refreshAfterLibraryMutation();
            });
        },
        onChangeCard: () => {
            openChangeCardModal({
                currentCard: card,
                onPick: (newName) => _renameLibraryCard(card, newName),
            });
        },
        onAddToDeck: () => {
            _addToDeck(_cardKey(card));
        },
    });
}

/**
 * Apply a level/fused/onyx change to a library entry. If the change collides
 * with an existing entry (same name + level + fused + onyx), merge quantities
 * into that entry and drop this row. Keeps the row's expand state pinned to the
 * surviving entry so inline edits don't snap the row shut. Single undo unit.
 */
function _applyIdentityChange(card, changes, label) {
    const target = {
        name: card.name,
        level: changes.level ?? card.level,
        fused: changes.fused ?? card.fused,
        onyx: changes.onyx ?? card.onyx,
    };
    const snapshot = STATE.library.map((c) => ({ ...c }));
    const collision = STATE.library.find((c) =>
        c !== card
        && c.name === target.name
        && c.level === target.level
        && !!c.fused === !!target.fused
        && !!c.onyx === !!target.onyx);

    if (collision) {
        collision.quantity += card.quantity;
        const idx = STATE.library.indexOf(card);
        STATE.library.splice(idx, 1);
        _expandedKey = _cardKey(collision);
        _persistLibrary();
        _refreshAfterLibraryMutation();
        showToast(`Merged into existing ${card.name}`);
    } else {
        Object.assign(card, changes);
        _expandedKey = _cardKey(card);   // follow the row to its new key
        _persistLibrary();
        _refreshAfterLibraryMutation();
        showToast(`${card.name}: ${label}`);
    }
    recordUndo(`undo ${label} on ${card.name}`, () => {
        STATE.library.length = 0;
        for (const c of snapshot) STATE.library.push(c);
        _persistLibrary();
        _refreshAfterLibraryMutation();
    });
}

function _renameLibraryCard(card, newName) {
    if (newName === card.name) return;
    const idx = STATE.library.indexOf(card);
    if (idx < 0) return;
    const oldName = card.name;
    const snapshot = STATE.library.map((c) => ({ ...c }));

    // Collision: if another row already represents (newName, level, fused,
    // onyx), merge this row's quantity into it and remove this row.
    const collision = STATE.library.find(
        (c) => c !== card && c.name === newName && c.level === card.level && !!c.fused === !!card.fused && !!c.onyx === !!card.onyx,
    );
    if (collision) {
        collision.quantity += card.quantity;
        STATE.library.splice(idx, 1);
    } else {
        card.name = newName;
        card.id = STATE.comboNameToId[newName] || STATE.nameToId[newName] || 0;
    }
    STATE.library.sort((a, b) => a.name.localeCompare(b.name));
    _persistLibrary();
    _refreshAfterLibraryMutation();
    showToast(collision ? `Merged into existing ${newName}` : `Changed to ${newName}`);
    recordUndo(`rename ${oldName} → ${newName}`, () => {
        STATE.library.length = 0;
        for (const c of snapshot) STATE.library.push(c);
        _persistLibrary(); _refreshAfterLibraryMutation();
    });
}

function _makeRecentRow(name) {
    const row = document.createElement('div');
    row.className = 'lib-row lib-row--compact';
    const main = document.createElement('div');
    main.className = 'lib-row__main';
    const labelBtn = document.createElement('button');
    labelBtn.type = 'button';
    labelBtn.className = 'lib-row__name-area';
    labelBtn.appendChild(createCardThumbnail({ name, size: 36 }));
    const txt = document.createElement('span');
    txt.className = 'lib-row__name-text';
    txt.textContent = name;
    labelBtn.appendChild(txt);
    main.appendChild(labelBtn);

    const plus = document.createElement('button');
    plus.type = 'button';
    plus.className = 'qty-ctrl__btn qty-ctrl__btn--plus';
    plus.textContent = '+1';
    plus.setAttribute('aria-label', `Add another ${name}`);
    plus.addEventListener('click', (e) => {
        e.stopPropagation();
        _addOrIncrementFromSearch(name);
    });
    main.appendChild(plus);

    row.appendChild(main);
    return row;
}

// ── Deck refresh ──────────────────────────────────────────────────────────────

// Helper: build a <td> containing a card thumbnail + name for use in any
// of the read-only tables (deck, suggestions, leaderboard).
function _cardCell(card, { size = 32, title = null } = {}) {
    const td = document.createElement('td');
    td.className = 'cell-card';
    if (title) td.title = title;
    const wrap = document.createElement('span');
    wrap.className = 'cell-card__inner';
    if (card && card.name) {
        wrap.appendChild(createCardThumbnail({
            name: card.name,
            level: card.level || null,
            fused: !!card.fused,
            onyx: !!card.onyx,
            size,
        }));
    }
    const txt = document.createElement('span');
    txt.className = 'cell-card__name';
    txt.textContent = card ? _dispName(card) : '';
    wrap.appendChild(txt);
    td.appendChild(wrap);
    return td;
}

function refreshDeck() {
    document.querySelectorAll('#deck-table thead th').forEach(th => {
        th.classList.remove('sort-asc', 'sort-desc');
        if (th.dataset.col && th.dataset.col === _deckSortCol) {
            th.classList.add(_deckSortAsc ? 'sort-asc' : 'sort-desc');
        }
    });

    const tbody = document.getElementById('deck-tbody');
    tbody.innerHTML = '';
    for (let i = 0; i < STATE.deck.length; i++) {
        const card = STATE.deck[i] || {};
        const tr = document.createElement('tr');
        tr.dataset.idx = i;
        if (i === _deckSelectedIdx) tr.classList.add('selected');

        const idxTd = document.createElement('td');
        idxTd.className = 'center text-fg2';
        idxTd.textContent = i + 1;
        tr.appendChild(idxTd);

        tr.appendChild(_cardCell(card, { size: 32, title: _dispName(card) }));

        const rarTd = document.createElement('td');
        rarTd.className = 'center';
        rarTd.innerHTML = _rarityImg(card);
        tr.appendChild(rarTd);

        const lvTd = document.createElement('td');
        lvTd.className = 'center';
        lvTd.textContent = card.level || '?';
        tr.appendChild(lvTd);

        const fuTd = document.createElement('td');
        fuTd.className = 'center';
        fuTd.textContent = card.fused ? '✓' : '–';
        tr.appendChild(fuTd);

        const onTd = document.createElement('td');
        onTd.className = 'center';
        onTd.textContent = card.onyx ? '✓' : '–';
        tr.appendChild(onTd);

        // Inline remove button per deck row
        const rmTd = document.createElement('td');
        rmTd.className = 'center';
        const rmBtn = document.createElement('button');
        rmBtn.type = 'button';
        rmBtn.className = 'deck-row__remove';
        rmBtn.textContent = '×';
        rmBtn.title = 'Remove from deck';
        rmBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            const removed = STATE.deck.splice(i, 1)[0];
            _saveDeck();
            _refreshAll();
            showToast(`Removed ${_dispName(removed)} from deck`);
            recordUndo(`re-add ${_dispName(removed)}`, () => {
                STATE.deck.splice(i, 0, removed);
                _saveDeck(); _refreshAll();
            });
        });
        rmTd.appendChild(rmBtn);
        tr.appendChild(rmTd);

        tr.addEventListener('click', () => {
            document.querySelectorAll('#deck-tbody tr').forEach(r => r.classList.remove('selected'));
            tr.classList.add('selected');
            _deckSelectedIdx = i;
        });
        tbody.appendChild(tr);
    }
    document.getElementById('deck-count').textContent = `(${STATE.deck.length} / ${STATE.settings.n_cards})`;
}

// ── Suggestions refresh ───────────────────────────────────────────────────────

function refreshSuggestions() {
    if (Object.keys(STATE.comboDict).length === 0 || STATE.library.length === 0) return;

    const deckKeys = STATE.deck.map(c => _cardKey(c));
    const ranked = rankSuggestions(STATE.comboDict, STATE.library, deckKeys, STATE.settings);
    const keyLookup = buildKeyLookup(STATE.library);
    const deckCards = STATE.deck;

    const tbody = document.getElementById('sug-tbody');
    tbody.innerHTML = '';

    const cap = Math.min(ranked.length, 80);
    for (let i = 0; i < cap; i++) {
        const [key, score] = ranked[i];
        const libCard = keyLookup[key];
        const topCombo = libCard ? _getTopComboName(libCard, deckCards) : '';
        const topComboCard = keyLookup[topCombo];
        const topComboLabel = topComboCard ? _dispName(topComboCard) : topCombo;

        const tr = document.createElement('tr');
        tr.dataset.key = key;
        if (key === _sugSelectedKey) tr.classList.add('selected');

        const idxTd = document.createElement('td');
        idxTd.className = 'center text-fg2';
        idxTd.textContent = i + 1;
        tr.appendChild(idxTd);

        tr.appendChild(_cardCell(libCard, { size: 32, title: _dispName(libCard) }));

        const scoreTd = document.createElement('td');
        scoreTd.className = 'center text-score';
        scoreTd.textContent = score.toFixed(1);
        tr.appendChild(scoreTd);

        tr.appendChild(_cardCell(topComboCard || { name: topCombo }, { size: 28, title: topComboLabel }));

        // Click a suggestion to add it straight to the deck.
        tr.classList.add('sug-row--clickable');
        tr.title = `Tap to add ${_dispName(libCard)} to the deck`;
        tr.addEventListener('click', () => {
            _sugSelectedKey = key;
            _addToDeck(key);
        });
        tbody.appendChild(tr);
    }
}

function _getTopComboName(libCard, deckCards) {
    if (!deckCards.length) return '';
    const s = STATE.settings;
    let bestVal = -1, bestName = '';
    for (const dc of deckCards) {
        const val = comboValue(STATE.comboDict,
            libCard.id, libCard.level, libCard.onyx,
            dc.id, dc.level, dc.onyx,
            s.mode, s.ab, s.db);
        if (val > bestVal) { bestVal = val; bestName = dc.name; }
    }
    return bestVal > 0 ? bestName : '';
}

// ── Matrix refresh ────────────────────────────────────────────────────────────

function refreshMatrix() {
    const el = document.getElementById('matrix-output');
    if (Object.keys(STATE.comboDict).length === 0 || STATE.deck.length === 0) {
        el.textContent = '';
        return;
    }

    const keyLookup = buildKeyLookup(STATE.library);
    const deckCards  = STATE.deck;
    if (!deckCards.length) { el.textContent = ''; return; }

    const s   = STATE.settings;
    const w   = 6;
    const nw  = 18;

    const lines = [];
    const header = ' '.repeat(nw) + deckCards.map(c => {
        const prefix = c.fused ? '●' : ' ';
        return (prefix + _dispName(c)).substring(0, w - 1).padStart(w);
    }).join('');
    lines.push(header);
    lines.push('─'.repeat(header.length));

    for (const libCard of STATE.library) {
        if (!keyLookup[_cardKey(libCard)]) continue;
        const rowVals = deckCards.map(dc =>
            comboValue(STATE.comboDict,
                libCard.id, libCard.level, libCard.onyx,
                dc.id, dc.level, dc.onyx,
                s.mode, s.ab, s.db)
        );
        if (!rowVals.some(v => v > 0)) continue;

        const prefix = libCard.fused ? '●' : '';
        let row = (prefix + _dispName(libCard)).substring(0, nw - 1).padEnd(nw);
        for (const val of rowVals) {
            row += val > 0 ? String(Math.round(val)).padStart(w) : (' '.repeat(w - 1) + '–');
        }
        lines.push(row);
    }

    el.textContent = lines.join('\n');
}

// ── Score refresh ─────────────────────────────────────────────────────────────

function refreshScore() {
    if (Object.keys(STATE.comboDict).length === 0 || STATE.deck.length === 0) {
        document.getElementById('score-display').textContent = 'Score: –';
        document.getElementById('info-display').textContent = '';
        return;
    }
    const score = totalDeckScore(STATE.comboDict, STATE.deck.map(c => _cardKey(c)), STATE.library, STATE.settings);
    document.getElementById('score-display').textContent = 'Score: ' + Math.round(score).toLocaleString();

    const fused   = STATE.deck.filter(c => c && c.fused).length;
    const unfused = STATE.deck.length - fused;
    document.getElementById('info-display').textContent =
        `Fused: ${fused}  |  Unfused: ${unfused}  |  Deck: ${STATE.deck.length}`;
}

// ── Leaderboard refresh ───────────────────────────────────────────────────────

function refreshLeaderboard() {
    const tbody = document.getElementById('lb-tbody');
    tbody.innerHTML = '';
    const keyLookup = buildKeyLookup(STATE.library);
    for (let i = 0; i < STATE.leaderboard.length; i++) {
        const entry = STATE.leaderboard[i];
        // Support both old (composite key string) and new (card object) deck formats
        const _resolveCard = item =>
            typeof item === 'string' ? (keyLookup[item] || { name: _nameFromKey(item) }) : item;
        const deckNames = entry.deck.map(item => _dispName(_resolveCard(item)));
        const startDisp = (() => {
            if (typeof entry.startCard === 'object') return _dispName(entry.startCard);
            const c = keyLookup[entry.startCard];
            return c ? _dispName(c) : _nameFromKey(entry.startCard);
        })();
        const preview = deckNames.slice(0, 6).join(', ') + (deckNames.length > 6 ? '…' : '');
        const tr = document.createElement('tr');
        tr.dataset.idx = i;
        if (i === _lbSelectedIdx) tr.classList.add('selected');

        const idxTd = document.createElement('td');
        idxTd.className = 'center text-fg2';
        idxTd.textContent = i + 1;
        tr.appendChild(idxTd);

        const startCard = typeof entry.startCard === 'object'
            ? entry.startCard
            : (keyLookup[entry.startCard] || { name: _nameFromKey(entry.startCard) });
        tr.appendChild(_cardCell(startCard, { size: 32, title: startDisp }));

        const scoreTd = document.createElement('td');
        scoreTd.className = 'center text-score';
        scoreTd.textContent = Math.round(entry.score).toLocaleString();
        tr.appendChild(scoreTd);

        const cntTd = document.createElement('td');
        cntTd.className = 'center';
        cntTd.textContent = entry.deck.length;
        tr.appendChild(cntTd);

        // Deck preview: small horizontal strip of up to 8 thumbnails
        const previewTd = document.createElement('td');
        previewTd.className = 'cell-deck-preview';
        previewTd.title = deckNames.join(', ');
        const strip = document.createElement('span');
        strip.className = 'deck-preview-strip';
        const previewItems = entry.deck.slice(0, 8).map(_resolveCard);
        for (const c of previewItems) {
            strip.appendChild(createCardThumbnail({
                name: c.name,
                level: c.level || null,
                fused: !!c.fused,
                onyx: !!c.onyx,
                size: 24,
            }));
        }
        if (entry.deck.length > 8) {
            const more = document.createElement('span');
            more.className = 'deck-preview-strip__more';
            more.textContent = `+${entry.deck.length - 8}`;
            strip.appendChild(more);
        }
        previewTd.appendChild(strip);
        tr.appendChild(previewTd);

        tr.addEventListener('click', () => {
            document.querySelectorAll('#lb-tbody tr').forEach(r => r.classList.remove('selected'));
            tr.classList.add('selected');
            _lbSelectedIdx = i;
        });
        tbody.appendChild(tr);
    }
}

// ── Start card dropdown ───────────────────────────────────────────────────────

function _refreshStartCardDropdown() {
    const sel = document.getElementById('start-card-select');
    const cards = STATE.library;
    sel.innerHTML = cards.map(c => {
        const key = _cardKey(c);
        const label = (c.fused ? '\u25cf ' : '') + _dispName(c);
        return `<option value="${esc(key)}">${esc(label)}</option>`;
    }).join('');
    const keys = cards.map(c => _cardKey(c));
    if (STATE.startCard && keys.includes(STATE.startCard)) {
        sel.value = STATE.startCard;
    } else if (keys.length > 0) {
        sel.value = keys[0];
        STATE.startCard = keys[0];
    }

    // Populate datalist used in card dialog
    const dl = document.getElementById('card-name-list');
    dl.innerHTML = STATE.baseCardNames.map(n => `<option value="${esc(n)}"></option>`).join('');
}

// ── Library actions ───────────────────────────────────────────────────────────

function _addCard() {
    _openCardDialog(null);
}

function _editCard() {
    if (!_libSelectedKey) { _toast('Select a card first.'); return; }
    const card = STATE.library.find(c => _cardKey(c) === _libSelectedKey);
    if (card) _openCardDialog(card);
}

function _removeCard() {
    if (!_libSelectedKey) { _toast('Select a card first.'); return; }
    const cardName = _nameFromKey(_libSelectedKey);
    _confirm('Remove Card', `Remove "${cardName}" from library?`, () => {
        STATE.library = STATE.library.filter(c => _cardKey(c) !== _libSelectedKey);
        _libSelectedKey = null;
        _refreshAll();
        _saveLibraryToStorage();
    });
}

function _addSelectedToDeck() {
    if (!_libSelectedKey) { _toast('Select a card first.'); return; }
    const card = buildKeyLookup(STATE.library)[_libSelectedKey];
    if (card) _addToDeck(_libSelectedKey);
}

function _saveLibraryToStorage() {
    try {
        localStorage.setItem('la_library', JSON.stringify(STATE.library));
        _toast('Library saved (' + STATE.library.length + ' cards)', 'success');
    } catch (err) {
        _toast('Save failed: ' + err.message, 'error');
    }
}

function _exportLibrary() {
    _download('library.json', JSON.stringify(STATE.library, null, 2));
    _toast('Library exported', 'success');
}

function _importLibrary(e) {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = evt => {
        try {
            const lib = JSON.parse(evt.target.result);
            if (!Array.isArray(lib)) throw new Error('Not an array');
            STATE.library = lib;
            _resolveIds();
            _refreshAll();
            _saveLibraryToStorage();
            _toast('Library imported (' + lib.length + ' cards)', 'success');
        } catch (err) { _toast('Import failed: ' + err.message, 'error'); }
    };
    reader.readAsText(file);
}

// ── Card dialog ────────────────────────────────────────────────────────────────

let _cardDialogMode     = 'add';   // 'add' | 'edit'
let _cardDialogOrigKey  = null;    // composite key of the card being edited

function _openCardDialog(card) {
    _cardDialogMode = card ? 'edit' : 'add';
    _cardDialogOrigKey = card ? _cardKey(card) : null;

    document.getElementById('modal-card-title').textContent = card ? 'Edit Card' : 'Add Card';
    document.getElementById('card-name').value   = card ? card.name     : '';
    document.getElementById('card-level').value  = card ? card.level    : 5;
    document.getElementById('card-fused').checked = card ? !!card.fused : false;
    document.getElementById('card-onyx').checked  = card ? !!card.onyx  : false;
    document.getElementById('card-qty').value    = card ? card.quantity : 1;

    _openModal('modal-card');
    // Show 'Add Another' only in add mode
    document.getElementById('btn-card-add-another').style.display =
        card ? 'none' : '';
}

function _cardDialogOk() {
    const name   = document.getElementById('card-name').value.trim();
    const level  = parseInt(document.getElementById('card-level').value, 10);
    const fused  = document.getElementById('card-fused').checked;
    const onyx   = document.getElementById('card-onyx').checked;
    const qty    = parseInt(document.getElementById('card-qty').value, 10);

    if (!name) { _toast('Please enter a card name.', 'error'); return; }
    if (!STATE.nameToId[name]) { _toast(`"${name}" is not a valid card name.`, 'error'); return; }
    if (isNaN(level) || level < 1 || level > 5) { _toast('Level must be 1–5.', 'error'); return; }
    if (isNaN(qty)   || qty < 1 || qty > 3)      { _toast('Quantity must be 1–3.', 'error'); return; }

    const id = STATE.comboNameToId[name] || STATE.nameToId[name] || 0;
    const updated = { name, level, fused, onyx, quantity: qty, id };

    if (_cardDialogMode === 'edit' && _cardDialogOrigKey) {
        const newKey = _cardKey(updated);

        // If the key changed, check for a collision with an existing entry
        if (newKey !== _cardDialogOrigKey) {
            const collisionIdx = STATE.library.findIndex(c => _cardKey(c) === newKey);
            if (collisionIdx !== -1) {
                // Pause and ask the user which entry to keep
                _conflictPending = { updated, collisionCard: STATE.library[collisionIdx], origKey: _cardDialogOrigKey };
                _closeModal('modal-card');
                _showConflictModal();
                return;
            }
        }

        // No collision — just update in place
        const freshIdx = STATE.library.findIndex(c => _cardKey(c) === _cardDialogOrigKey);
        if (freshIdx !== -1) STATE.library[freshIdx] = updated;
        else STATE.library.push(updated);

        // Update any deck cards that were the old variant to the new variant
        if (newKey !== _cardDialogOrigKey) {
            STATE.deck = STATE.deck.map(c => _cardKey(c) === _cardDialogOrigKey ? updated : c);
            _saveDeck();
        }
    } else {
        // Deduplicate by composite key (name + fused + onyx)
        const existing = STATE.library.findIndex(c => _cardKey(c) === _cardKey(updated));
        if (existing !== -1) {
            STATE.library[existing] = updated;
        } else {
            STATE.library.push(updated);
        }
    }

    _libSelectedKey = _cardKey(updated);
    _closeModal('modal-card');
    _refreshAll();
    _saveLibraryToStorage();
}

function _cardDialogAddAnother() {
    // Save current card without closing the modal, then reset for the next entry
    const name   = document.getElementById('card-name').value.trim();
    const level  = parseInt(document.getElementById('card-level').value, 10);
    const fused  = document.getElementById('card-fused').checked;
    const onyx   = document.getElementById('card-onyx').checked;
    const qty    = parseInt(document.getElementById('card-qty').value, 10);

    if (!name) { _toast('Please enter a card name.', 'error'); return; }
    if (!STATE.nameToId[name]) { _toast(`"${name}" is not a valid card name.`, 'error'); return; }
    if (isNaN(level) || level < 1 || level > 5) { _toast('Level must be 1–5.', 'error'); return; }
    if (isNaN(qty)   || qty < 1 || qty > 3)     { _toast('Quantity must be 1–3.', 'error'); return; }

    const id = STATE.comboNameToId[name] || STATE.nameToId[name] || 0;
    const card = { name, level, fused, onyx, quantity: qty, id };
    // Deduplicate by composite key (name + fused + onyx)
    const existing = STATE.library.findIndex(c => _cardKey(c) === _cardKey(card));
    if (existing !== -1) STATE.library[existing] = card;
    else STATE.library.push(card);

    _saveLibraryToStorage();
    _refreshAll();
    _toast(`"${name}" added`, 'success');

    // Reset form for next card
    document.getElementById('card-name').value = '';
    document.getElementById('card-level').value = '5';
    document.getElementById('card-fused').checked = false;
    document.getElementById('card-onyx').checked = false;
    document.getElementById('card-qty').value = '1';
    document.getElementById('card-name').focus();
}

// ── Deck actions ──────────────────────────────────────────────────────────────

function _addToDeck(cardKey) {
    const card = buildKeyLookup(STATE.library)[cardKey];
    if (!card) { _toast(`Card not found in library.`, 'error'); return; }

    // Per-variant copy limit
    const copies = STATE.deck.filter(c => _cardKey(c) === cardKey).length;
    if (copies >= card.quantity) {
        _toast(`Already have ${copies}/${card.quantity} copies of "${_dispName(card)}".`);
        return;
    }

    // Cross-variant name cap: total of all variants of the same base name
    const nameTotal = STATE.deck.filter(c => c.name === card.name).length;
    const nameMaxQty = STATE.library
        .filter(c => c.name === card.name)
        .reduce((mx, c) => Math.max(mx, c.quantity), 0);
    if (nameTotal >= nameMaxQty) {
        _toast(`Deck already has ${nameTotal}/${nameMaxQty} "${card.name}" cards (all variants combined).`);
        return;
    }
    STATE.deck.push(card);
    _saveDeck();
    refreshDeck();
    refreshSuggestions();
    refreshMatrix();
    refreshScore();
}

function _initDeckTarget() {
    const input = document.getElementById('deck-target-input');
    const minus = document.getElementById('deck-target-minus');
    const plus = document.getElementById('deck-target-plus');
    if (!input) return;

    const clamp = (v) => Math.max(1, Math.min(60, v || 1));
    const sync = () => {
        const v = clamp(STATE.settings.n_cards);
        STATE.settings.n_cards = v;
        input.value = v;
        try { localStorage.setItem('la_settings', JSON.stringify(STATE.settings)); } catch { /* ignore */ }
        // Reflect in the deck count header (shows current / target)
        const count = document.getElementById('deck-count');
        if (count) count.textContent = `(${STATE.deck.length} / ${v})`;
    };
    input.value = clamp(STATE.settings.n_cards);
    input.addEventListener('change', () => { STATE.settings.n_cards = clamp(parseInt(input.value, 10)); sync(); });
    minus.addEventListener('click', () => { STATE.settings.n_cards = clamp(STATE.settings.n_cards - 1); sync(); });
    plus.addEventListener('click', () => { STATE.settings.n_cards = clamp(STATE.settings.n_cards + 1); sync(); });
    sync();
}

function _setStartCard() {
    const sel = document.getElementById('start-card-select');
    const key = sel.value;  // now a composite key
    if (!key) return;

    STATE.startCard = key;
    localStorage.setItem('la_start_card', key);

    // Find the card for this composite key
    const card = buildKeyLookup(STATE.library)[key];
    if (!card) { _toast(`Selected card is not in your library.`, 'error'); return; }

    const idx = STATE.deck.findIndex(c => _cardKey(c) === key);
    if (idx === 0) {
        _toast(`"${_dispName(card)}" is already the first card.`);
        return;
    } else if (idx > 0) {
        STATE.deck.splice(idx, 1);
        STATE.deck.unshift(card);
    } else {
        STATE.deck.unshift(card);
    }

    _deckSelectedIdx = 0;
    _saveDeck();
    refreshDeck();
    refreshSuggestions();
    refreshMatrix();
    refreshScore();
}

function _removeFromDeck() {
    if (_deckSelectedIdx === null) { _toast('Select a card first.'); return; }
    STATE.deck.splice(_deckSelectedIdx, 1);
    _deckSelectedIdx = Math.min(_deckSelectedIdx, STATE.deck.length - 1);
    if (_deckSelectedIdx < 0) _deckSelectedIdx = null;
    _saveDeck();
    refreshDeck();
    refreshSuggestions();
    refreshMatrix();
    refreshScore();
}

function _deckUp() {
    if (_deckSelectedIdx === null || _deckSelectedIdx === 0) return;
    const i = _deckSelectedIdx;
    [STATE.deck[i - 1], STATE.deck[i]] = [STATE.deck[i], STATE.deck[i - 1]];
    _deckSelectedIdx = i - 1;
    _saveDeck();
    refreshDeck();
}

function _deckDown() {
    if (_deckSelectedIdx === null || _deckSelectedIdx >= STATE.deck.length - 1) return;
    const i = _deckSelectedIdx;
    [STATE.deck[i + 1], STATE.deck[i]] = [STATE.deck[i], STATE.deck[i + 1]];
    _deckSelectedIdx = i + 1;
    _saveDeck();
    refreshDeck();
}

function _sortDeckBy(col, asc) {
    const _rarityOrder = { 'Common': 0, 'Uncommon': 1, 'Rare': 2, 'Onyx': 3 };
    STATE.deck.sort((a, b) => {
        let va, vb;
        if (col === 'level') {
            va = a.level || 0;
            vb = b.level || 0;
        } else if (col === 'rarity') {
            const ra = a.onyx ? 'Onyx' : (STATE.cardInfo[a.name] || {}).rare || '';
            const rb = b.onyx ? 'Onyx' : (STATE.cardInfo[b.name] || {}).rare || '';
            va = _rarityOrder[ra] ?? -1;
            vb = _rarityOrder[rb] ?? -1;
        } else { // name
            va = (a.name || '').toLowerCase();
            vb = (b.name || '').toLowerCase();
        }
        if (va < vb) return asc ? -1 : 1;
        if (va > vb) return asc ? 1 : -1;
        return (a.name || '').localeCompare(b.name || '');
    });
    _deckSelectedIdx = null;
    _saveDeck();
    refreshDeck();
}

function _saveDeck() {
    try { localStorage.setItem('la_deck', JSON.stringify(STATE.deck)); } catch { /* ignore */ }
}

// ── Suggestion actions ────────────────────────────────────────────────────────

function _addBestSuggestion() {
    if (Object.keys(STATE.comboDict).length === 0 || STATE.library.length === 0) return;
    const ranked = rankSuggestions(STATE.comboDict, STATE.library, STATE.deck.map(c => _cardKey(c)), STATE.settings);
    if (ranked.length > 0) _addToDeck(ranked[0][0]);
}

// ── Algorithm runner ──────────────────────────────────────────────────────────

function _makeWorker() {
    return new Worker(new URL('./worker.js', import.meta.url), { type: 'module' });
}

function _runAlgorithm(job) {
    if (_workerRunning) { _toast('Another operation is in progress.'); return; }
    if (Object.keys(STATE.comboDict).length === 0) { _toast('Load combo data first.', 'error'); return; }

    const startCard = document.getElementById('start-card-select').value || STATE.startCard;

    // Seeded fill keeps the current deck and completes it; only requires a
    // start card when the deck is empty (otherwise the existing cards seed it).
    const seedDeck = STATE.deck.map((c) => _cardKey(c));
    if (job === 'fill' || job === 'complete') {
        if (seedDeck.length === 0 && !startCard) {
            _toast('Add a card to the deck or pick a start card first.', 'error');
            return;
        }
    }
    if (job === 'advanced') {
        if (!startCard) { _toast('Select a start card.', 'error'); return; }
        if (!buildKeyLookup(STATE.library)[startCard]) {
            _toast(`Selected start card is not in your library.`, 'error'); return;
        }
    }

    // 'fill' → greedy seeded completion; 'complete' → seeded + optimize remaining;
    // 'best' → thorough optimize from scratch across all start cards.
    const realJob = job === 'fill' ? 'fill_seed'
        : (job === 'complete' ? 'complete_seed'
        : (job === 'best' ? 'best_possible' : job));

    const label = {
        fill:     '⚡ Completing deck…',
        complete: '🎯 Finding best completion…',
        advanced: '🧠 Running advanced fill…',
        try_all:  '🔁 Trying all start cards…',
        best:     '🏆 Finding best possible deck…',
    }[job] || 'Running…';

    setStatus(label);
    setProgress(0);
    _setWorkerBusy(true);

    // Advanced fill and Best Possible rebuild from scratch, so clear first.
    // Seeded fill (job==='fill'/'complete') keeps the current deck.
    if (job === 'advanced' || job === 'best') {
        STATE.deck = [];
        refreshDeck();
    }

    _worker = _makeWorker();
    if (!_worker) {
        _setWorkerBusy(false);
        _toast('Worker bundle missing — run build_data.py', 'error');
        return;
    }

    // Seed fill from current deck; if empty, seed with the chosen start card.
    const effectiveSeed = seedDeck.length > 0 ? seedDeck : (startCard ? [startCard] : []);

    const msg = {
        type:       'run',
        job:        realJob,
        comboDict:  STATE.comboDict,
        library:    STATE.library,
        startCard,
        seedDeck:   effectiveSeed,
        targetSize: STATE.settings.n_cards,
        settings:   STATE.settings,
    };
    _worker.onmessage = e => {
        const { type, pct, label: lbl, result, message } = e.data;
        if (type === 'progress') {
            setProgress(pct);
            if (lbl) setStatus(label.replace('…', '') + ' — ' + lbl + '…');
        } else if (type === 'done') {
            _setWorkerBusy(false);
            setProgress(100);
            if (job === 'try_all') {
                const kl = buildKeyLookup(STATE.library);
                STATE.leaderboard = result.map(r => ({
                    startCard: r.startCard,
                    score:     r.score,
                    deck:      r.deck.map(k => kl[k]).filter(Boolean),
                }));
                refreshLeaderboard();
                setStatus(`Tried ${result.length} start cards. Best: "${result[0]?.startCard || '–'}"`);
                // Switch to leaderboard tab
                document.querySelector('.tab-btn[data-tab="leaderboard"]').click();
            } else {
                const kl = buildKeyLookup(STATE.library);
                STATE.deck = result.map(k => kl[k]).filter(Boolean);
                _saveDeck();
                _refreshAll();
                const sc = totalDeckScore(STATE.comboDict, result, STATE.library, STATE.settings);
                setStatus(`Deck filled: ${result.length} cards  |  Score: ${Math.round(sc).toLocaleString()}`);
            }
        } else if (type === 'error') {
            _setWorkerBusy(false);
            setProgress(0);
            _toast('Error: ' + message, 'error');
            setStatus('Error: ' + message);
        }
    };
    _worker.onerror = err => {
        _setWorkerBusy(false);
        setProgress(0);
        _toast('Worker error: ' + (err.message || 'unknown'), 'error');
    };
    _worker.postMessage(msg);
}

function _cancelWorker() {
    if (_worker) {
        _worker.postMessage({ type: 'cancel' });
        setTimeout(() => { _worker.terminate(); _worker = null; }, 500);
    }
    _setWorkerBusy(false);
    setStatus('Cancelled.');
}

function _setWorkerBusy(busy) {
    _workerRunning = busy;
    document.getElementById('btn-cancel').disabled = !busy;
}

// ── Leaderboard actions ───────────────────────────────────────────────────────

function _copyToLeaderboard() {
    if (!STATE.deck.length) { _toast('Deck is empty.'); return; }
    const startCard = document.getElementById('start-card-select').value || (STATE.deck[0] ? _cardKey(STATE.deck[0]) : '?');
    const deckKeys = STATE.deck.map(c => _cardKey(c));
    const score = totalDeckScore(STATE.comboDict, deckKeys, STATE.library, STATE.settings);
    const entry = { startCard, score, deck: [...STATE.deck] };

    const idx = STATE.leaderboard.findIndex(e => e.startCard === startCard);
    if (idx !== -1) {
        if (score > STATE.leaderboard[idx].score) STATE.leaderboard[idx] = entry;
    } else {
        STATE.leaderboard.push(entry);
    }
    STATE.leaderboard.sort((a, b) => b.score - a.score);
    refreshLeaderboard();
    setStatus(`Copied to leaderboard  (score ${Math.round(score).toLocaleString()})`);
    // Switch to leaderboard tab
    document.querySelector('.tab-btn[data-tab="leaderboard"]').click();
}

function _loadLbDeck() {
    if (_lbSelectedIdx === null) { _toast('Select a leaderboard entry first.'); return; }
    const entry = STATE.leaderboard[_lbSelectedIdx];
    if (!entry) return;
    STATE.deck = [...entry.deck];
    STATE.startCard = entry.startCard;
    _saveDeck();
    localStorage.setItem('la_start_card', entry.startCard);
    _refreshAll();
    setStatus(`Loaded leaderboard deck: "${entry.startCard}"  (score ${Math.round(entry.score).toLocaleString()})`);
}

function _saveLeaderboardToStorage() {
    try {
        localStorage.setItem('la_leaderboard', JSON.stringify(STATE.leaderboard));
        _toast('Leaderboard saved', 'success');
    } catch (err) { _toast('Save failed: ' + err.message, 'error'); }
}

function _exportLeaderboard() {
    _download('leaderboard.json', JSON.stringify(STATE.leaderboard, null, 2));
    _toast('Leaderboard exported', 'success');
}

function _importLeaderboard(e) {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = evt => {
        try {
            const lb = JSON.parse(evt.target.result);
            if (!Array.isArray(lb)) throw new Error('Not an array');
            STATE.leaderboard = lb;
            refreshLeaderboard();
            _toast('Leaderboard imported (' + lb.length + ' entries)', 'success');
        } catch (err) { _toast('Import failed: ' + err.message, 'error'); }
    };
    reader.readAsText(file);
}

// ── Export deck ───────────────────────────────────────────────────────────────

function _exportDeckXlsx() {
    if (!STATE.deck.length) { _toast('Deck is empty.'); return; }
    const score = totalDeckScore(STATE.comboDict, STATE.deck.map(c => _cardKey(c)), STATE.library, STATE.settings);
    const blob = buildDeckXlsx(STATE.deck, {
        deckName: 'LAR Helper Deck',
        score,
        targetSize: STATE.settings.n_cards,
    });
    const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const filename = `lar-deck-${ts}.xlsx`;
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename; a.click();
    URL.revokeObjectURL(url);
    showToast(`Exported ${filename}`);
}

function _exportDeck() {
    if (!STATE.deck.length) { _toast('Deck is empty.'); return; }

    const keyLookup = buildKeyLookup(STATE.library);
    const score  = totalDeckScore(STATE.comboDict, STATE.deck.map(c => _cardKey(c)), STATE.library, STATE.settings);
    const startKey = document.getElementById('start-card-select').value || (STATE.deck[0] ? _cardKey(STATE.deck[0]) : '');
    const startCard = keyLookup[startKey] ? _dispName(keyLookup[startKey]) : (startKey ? _nameFromKey(startKey) : '–');
    const start = startCard;
    const modeLabels = { 1: 'Sum (Attack+Defence)', 2: 'Attack only', 3: 'Defence only', 4: 'Heroics' };
    const modeStr = modeLabels[STATE.settings.mode] || 'Sum';
    const s = STATE.settings;

    const lines = [
        'Little Alchemist Deck Optimizer  –  Deck Export',
        '='.repeat(52),
        `Start card  : ${start}`,
        `Deck size   : ${STATE.deck.length} cards`,
        `Score       : ${Math.round(score).toLocaleString()}`,
        `Score mode  : ${modeStr}`,
        `LCwC: ${s.lcwc}  SV: ${s.sv}  CR: ${s.cr}  FB: ${s.fb}`,
        '',
        `${'#'.padEnd(4)} ${'Card'.padEnd(26)} ${'Lv'.padEnd(4)} ${'Fused'.padEnd(6)} Onyx`,
        '-'.repeat(52),
    ];

    STATE.deck.forEach((card, i) => {
        const level = card.level || '?';
        const fused = card.fused ? 'Yes' : 'No';
        const onyx  = card.onyx  ? 'Yes' : 'No';
        lines.push(`${String(i + 1).padEnd(4)} ${_dispName(card).padEnd(26)} ${String(level).padEnd(4)} ${fused.padEnd(6)} ${onyx}`);
    });

    lines.push('-'.repeat(52), '', 'Generated by Little Alchemist Deck Optimizer (Web)');
    _download('deck_export.txt', lines.join('\n'));
    setStatus('Deck exported.');
}

// ── Settings modal ────────────────────────────────────────────────────────────

function _openSettings() {
    const s = STATE.settings;
    document.getElementById('setting-mode').value    = s.mode;
    document.getElementById('setting-lcwc').value    = s.lcwc;
    document.getElementById('setting-sv').value      = s.sv;
    document.getElementById('setting-cr').value      = s.cr;
    document.getElementById('setting-fb').value      = s.fb;
    document.getElementById('setting-ab').value      = s.ab;
    document.getElementById('setting-db').value      = s.db;
    document.getElementById('setting-ncards').value  = s.n_cards;
    _openModal('modal-settings');
}

function _saveSettings() {
    const mode    = parseInt(document.getElementById('setting-mode').value, 10);
    const lcwc    = parseInt(document.getElementById('setting-lcwc').value, 10);
    const sv      = parseFloat(document.getElementById('setting-sv').value);
    const cr      = parseFloat(document.getElementById('setting-cr').value);
    const fb      = parseFloat(document.getElementById('setting-fb').value);
    const ab      = parseFloat(document.getElementById('setting-ab').value);
    const db      = parseFloat(document.getElementById('setting-db').value);
    const n_cards = parseInt(document.getElementById('setting-ncards').value, 10);

    if ([mode, lcwc, sv, cr, fb, ab, db, n_cards].some(isNaN)) {
        _toast('Invalid value — check all fields.', 'error'); return;
    }

    Object.assign(STATE.settings, { mode, lcwc, sv, cr, fb, ab, db, n_cards });
    try {
        localStorage.setItem('la_settings', JSON.stringify(STATE.settings));
    } catch { /* ignore */ }

    _closeModal('modal-settings');
    _refreshAll();
    _toast('Settings saved', 'success');
}

// ── Modal helpers ─────────────────────────────────────────────────────────────

function _cardDesc(c) {
    return `<div style="font-size:0.85em;line-height:1.7">
        <b>${esc(_dispName(c))}</b><br>
        Level: ${c.level} &nbsp;|&nbsp; Fused: ${c.fused ? 'Yes' : 'No'} &nbsp;|&nbsp; Onyx: ${c.onyx ? 'Yes' : 'No'} &nbsp;|&nbsp; Qty: ${c.quantity}
    </div>`;
}

function _showConflictModal() {
    const { updated, collisionCard } = _conflictPending;
    document.getElementById('conflict-edited').innerHTML   = _cardDesc(updated);
    document.getElementById('conflict-existing').innerHTML = _cardDesc(collisionCard);
    _openModal('modal-conflict');
}

function _conflictKeepEdited() {
    if (!_conflictPending) return;
    const { updated, collisionCard, origKey } = _conflictPending;
    _conflictPending = null;
    _closeModal('modal-conflict');

    // Remove both the original and the collision, then insert the edited one
    STATE.library = STATE.library.filter(c => _cardKey(c) !== origKey && _cardKey(c) !== _cardKey(collisionCard));
    STATE.library.push(updated);

    // Migrate deck entries from both old keys to the new card
    const newKey = _cardKey(updated);
    STATE.deck = STATE.deck.map(c =>
        (_cardKey(c) === origKey || _cardKey(c) === _cardKey(collisionCard)) ? updated : c);
    _saveDeck();
    _libSelectedKey = newKey;
    _refreshAll();
    _saveLibraryToStorage();
}

function _conflictKeepExisting() {
    if (!_conflictPending) return;
    const { updated, collisionCard, origKey } = _conflictPending;
    _conflictPending = null;
    _closeModal('modal-conflict');

    // Remove the original being edited; the existing (collision) entry is kept as-is
    STATE.library = STATE.library.filter(c => _cardKey(c) !== origKey);

    // Migrate deck entries that pointed to the old key to point to the surviving card
    STATE.deck = STATE.deck.map(c => _cardKey(c) === origKey ? collisionCard : c);
    _saveDeck();
    _libSelectedKey = _cardKey(collisionCard);
    _refreshAll();
    _saveLibraryToStorage();
}

function _openModal(id) {
    document.getElementById(id).classList.add('visible');
    document.getElementById('modal-overlay').classList.add('visible');
}

function _closeModal(id) {
    document.getElementById(id).classList.remove('visible');
    // Close overlay if no other modal is open
    const anyOpen = document.querySelector('.modal.visible');
    if (!anyOpen) document.getElementById('modal-overlay').classList.remove('visible');
}

function _closeAllModals() {
    document.querySelectorAll('.modal').forEach(m => m.classList.remove('visible'));
    document.getElementById('modal-overlay').classList.remove('visible');
}

function _confirm(title, message, callback) {
    document.getElementById('confirm-title').textContent   = title;
    document.getElementById('confirm-message').textContent = message;
    _confirmCallback = callback;
    _openModal('modal-confirm');
}

// ── Status bar helpers ────────────────────────────────────────────────────────

function setStatus(text) {
    document.getElementById('status-text').textContent = text;
}

function setProgress(pct) {
    document.getElementById('progress-bar').value = Math.max(0, Math.min(100, pct));
}

// ── Toast ─────────────────────────────────────────────────────────────────────

let _toastTimer = null;

function _toast(text, type = '') {
    const el = document.getElementById('toast');
    el.textContent  = text;
    el.className    = 'visible' + (type ? ' ' + type : '');
    if (_toastTimer) clearTimeout(_toastTimer);
    _toastTimer = setTimeout(() => { el.className = ''; }, 2800);
}

// ── Download helper ───────────────────────────────────────────────────────────

function _download(filename, content) {
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
}

// ── HTML escaping ─────────────────────────────────────────────────────────────

function esc(s) {
    if (!s) return '';
    return String(s)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}
