import Fuse from 'fuse.js';
import { allCardNames, getCard } from '../util/card_data.js';
import { createCardThumbnail } from './card_thumbnail.js';

/**
 * "Change card" flow — opens a modal with a fuzzy search input so the user
 * can replace a library entry's identity with a different card name while
 * keeping level / fused / onyx / quantity intact.
 *
 *   initChangeCardModal({ openModal, closeModal })
 *   openChangeCardModal({ currentCard, onPick })
 *
 * onPick(newName) is called when the user taps a result. The caller decides
 * how to apply the change (merge into a colliding entry, refresh ids, etc).
 */
const FUSE_OPTS = {
    threshold: 0.4,
    distance: 50,
    minMatchCharLength: 1,
    keys: ['name'],
};
const MAX_RESULTS = 15;

let _openModalFn = null;
let _closeModalFn = null;
let _fuse = null;

export function initChangeCardModal({ openModal, closeModal }) {
    _openModalFn = openModal;
    _closeModalFn = closeModal;
}

export function openChangeCardModal({ currentCard, onPick }) {
    if (!_fuse) {
        _fuse = new Fuse(
            allCardNames().map((name) => ({ name })),
            FUSE_OPTS,
        );
    }

    const title = document.getElementById('change-card-title');
    title.textContent = `Change card (was ${currentCard.name}${currentCard.onyx ? ' (Onyx)' : ''})`;

    const body = document.getElementById('change-card-body');
    body.innerHTML = '';

    const input = document.createElement('input');
    input.type = 'text';
    input.id = 'change-card-input';
    input.placeholder = '🔍 search to replace…';
    input.autocomplete = 'off';
    body.appendChild(input);

    const results = document.createElement('div');
    results.id = 'change-card-results';
    body.appendChild(results);

    function render(q) {
        results.innerHTML = '';
        if (!q) return;
        const hits = _fuse.search(q, { limit: MAX_RESULTS });
        if (hits.length === 0) {
            const empty = document.createElement('div');
            empty.className = 'search-empty';
            empty.textContent = `No card matches "${q}"`;
            results.appendChild(empty);
            return;
        }
        for (const hit of hits) {
            const name = hit.item.name;
            if (name === currentCard.name) continue;  // skip the one being replaced
            const row = document.createElement('button');
            row.type = 'button';
            row.className = 'search-result';
            row.appendChild(createCardThumbnail({ name, size: 36 }));
            const label = document.createElement('span');
            label.className = 'search-result__name';
            label.textContent = name;
            row.appendChild(label);
            const info = getCard(name) || {};
            if (info.is_combo) {
                const b = document.createElement('span');
                b.className = 'search-result__kind search-result__kind--combo';
                b.textContent = 'combo';
                row.appendChild(b);
            }
            if (info.is_final) {
                const b = document.createElement('span');
                b.className = 'search-result__kind search-result__kind--final';
                b.textContent = 'final';
                row.appendChild(b);
            }
            row.addEventListener('click', () => {
                _closeModalFn('modal-change-card');
                onPick(name);
            });
            results.appendChild(row);
        }
    }

    input.addEventListener('input', () => render(input.value.trim()));
    input.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') _closeModalFn('modal-change-card');
    });

    document.getElementById('change-card-footer').innerHTML = '';
    const cancel = document.createElement('button');
    cancel.type = 'button';
    cancel.textContent = 'Cancel';
    cancel.addEventListener('click', () => _closeModalFn('modal-change-card'));
    document.getElementById('change-card-footer').appendChild(cancel);

    _openModalFn('modal-change-card');
    // Focus the input only after the modal is visible so iOS doesn't show the
    // keyboard early.
    setTimeout(() => input.focus(), 50);
}
