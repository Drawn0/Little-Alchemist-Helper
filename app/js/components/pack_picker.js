import { allPacks, getPack, parsePackCardName } from '../util/pack_data.js';
import { createCardThumbnail } from './card_thumbnail.js';
import { getCard } from '../util/card_data.js';

/**
 * Pack picker modal — two views:
 *  picker:   recently-used packs at top, then alphabetical list of all 128
 *            with a name filter input.
 *  contents: grid of cards in the selected pack. Multi-select. "Add Selected"
 *            calls onCommit(selectedCards) where each selectedCard is
 *            { name, onyx } (Onyx suffix stripped from MORGANlTE).
 *
 * State machine lives inside this module so the host just wires the open
 * call. Recently-used packs persist in localStorage so they survive reloads.
 */
const RECENT_KEY = 'la_recent_packs';
const RECENT_MAX = 8;

function loadRecent() {
    try {
        const raw = localStorage.getItem(RECENT_KEY);
        return raw ? JSON.parse(raw) : [];
    } catch { return []; }
}
function saveRecent(ids) {
    try { localStorage.setItem(RECENT_KEY, JSON.stringify(ids)); } catch {}
}
function pushRecent(id) {
    const ids = loadRecent().filter((x) => x !== id);
    ids.unshift(id);
    if (ids.length > RECENT_MAX) ids.length = RECENT_MAX;
    saveRecent(ids);
}

let _currentPackId = null;
let _selected = new Set();
let _onCommit = null;
let _openModalFn = null;
let _closeModalFn = null;

export function initPackPicker({ openModal, closeModal }) {
    _openModalFn = openModal;
    _closeModalFn = closeModal;
    // Back button + footer add button wired here once
    document.getElementById('pack-back').addEventListener('click', renderPicker);
}

export function openPackPicker({ onCommit }) {
    _onCommit = onCommit;
    _selected.clear();
    renderPicker();
    _openModalFn('modal-pack');
}

function renderPicker() {
    _currentPackId = null;
    document.getElementById('pack-title').textContent = 'Add from Pack';
    document.getElementById('pack-back').hidden = true;

    const body = document.getElementById('pack-body');
    body.innerHTML = '';

    const filterWrap = document.createElement('div');
    filterWrap.className = 'pack-filter-wrap';
    const filter = document.createElement('input');
    filter.type = 'text';
    filter.id = 'pack-filter';
    filter.placeholder = '🔍 filter packs…';
    filter.autocomplete = 'off';
    filterWrap.appendChild(filter);
    body.appendChild(filterWrap);

    const listHost = document.createElement('div');
    listHost.id = 'pack-list';
    body.appendChild(listHost);

    function renderList() {
        const q = filter.value.trim().toLowerCase();
        listHost.innerHTML = '';
        const recents = loadRecent().map(getPack).filter(Boolean);
        const recentMatches = q
            ? recents.filter((p) => p.name.toLowerCase().includes(q))
            : recents;
        if (recentMatches.length > 0) {
            const t = document.createElement('div');
            t.className = 'pack-list__section-title';
            t.textContent = 'Recently used';
            listHost.appendChild(t);
            for (const p of recentMatches) listHost.appendChild(packRow(p));
        }

        const all = allPacks().filter((p) => !q || p.name.toLowerCase().includes(q));
        const t2 = document.createElement('div');
        t2.className = 'pack-list__section-title';
        t2.textContent = `All packs (${all.length})`;
        listHost.appendChild(t2);
        for (const p of all) listHost.appendChild(packRow(p));
    }

    filter.addEventListener('input', renderList);
    renderList();

    document.getElementById('pack-footer').innerHTML = '';
    const cancel = document.createElement('button');
    cancel.type = 'button';
    cancel.textContent = 'Cancel';
    cancel.addEventListener('click', () => _closeModalFn('modal-pack'));
    document.getElementById('pack-footer').appendChild(cancel);
}

function packRow(pack) {
    const row = document.createElement('button');
    row.type = 'button';
    row.className = 'pack-row';
    const name = document.createElement('span');
    name.className = 'pack-row__name';
    name.textContent = pack.name;
    row.appendChild(name);
    const meta = document.createElement('span');
    meta.className = 'pack-row__meta';
    const bits = [];
    if (pack.price != null) bits.push(`${pack.price}g`);
    bits.push(`${pack.cards.length} cards`);
    if (pack.onyx_fragments) bits.push('+onyx frag');
    meta.textContent = bits.join(' · ');
    row.appendChild(meta);
    row.addEventListener('click', () => renderContents(pack.id));
    return row;
}

function renderContents(packId) {
    const pack = getPack(packId);
    if (!pack) return;
    _currentPackId = packId;
    _selected.clear();
    pushRecent(packId);

    document.getElementById('pack-title').textContent = pack.name;
    document.getElementById('pack-back').hidden = false;

    const body = document.getElementById('pack-body');
    body.innerHTML = '';

    const grid = document.createElement('div');
    grid.className = 'pack-grid';
    for (const rawName of pack.cards) {
        const parsed = parsePackCardName(rawName);
        const cell = document.createElement('button');
        cell.type = 'button';
        cell.className = 'pack-cell';
        cell.dataset.raw = rawName;
        cell.appendChild(createCardThumbnail({
            name: parsed.name,
            onyx: parsed.onyx,
            size: 72,
        }));
        const label = document.createElement('span');
        label.className = 'pack-cell__name';
        label.textContent = rawName;
        cell.appendChild(label);
        cell.addEventListener('click', () => {
            if (_selected.has(rawName)) {
                _selected.delete(rawName);
                cell.classList.remove('pack-cell--selected');
            } else {
                _selected.add(rawName);
                cell.classList.add('pack-cell--selected');
            }
            updateAddBtn();
        });
        grid.appendChild(cell);
    }
    body.appendChild(grid);

    const footer = document.getElementById('pack-footer');
    footer.innerHTML = '';
    const cancel = document.createElement('button');
    cancel.type = 'button';
    cancel.textContent = 'Cancel';
    cancel.addEventListener('click', () => _closeModalFn('modal-pack'));
    footer.appendChild(cancel);
    const add = document.createElement('button');
    add.type = 'button';
    add.id = 'pack-add-selected';
    add.className = 'accent';
    add.addEventListener('click', () => {
        if (_selected.size === 0 || !_onCommit) return;
        const cards = [..._selected].map(parsePackCardName);
        _onCommit(cards);
        _closeModalFn('modal-pack');
    });
    footer.appendChild(add);
    updateAddBtn();
}

function updateAddBtn() {
    const btn = document.getElementById('pack-add-selected');
    if (!btn) return;
    const n = _selected.size;
    btn.disabled = n === 0;
    btn.textContent = n === 0 ? 'Add Selected' : `Add Selected (${n})`;
}
