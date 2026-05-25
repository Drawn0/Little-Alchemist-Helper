import Fuse from 'fuse.js';
import { createCardThumbnail } from './card_thumbnail.js';
import { getCard, allCardNames } from '../util/card_data.js';

/**
 * Search-as-you-type fuzzy card search. Results appear below the input.
 * Tap a result → onPick(name); the caller handles add-or-increment.
 *
 * `getOwnedCount(name)` returns how many entries (rows) exist in the library
 * for this card name (across fused/onyx variants) — drives the "In library: N"
 * badge.
 *
 * After onPick the search blurs (dismisses iPad keyboard), clears, and
 * the dropdown closes. Tap the input to focus + reopen.
 */
const FUSE_OPTS = {
    threshold: 0.4,
    distance: 50,
    minMatchCharLength: 1,
    keys: ['name'],
};
const MAX_RESULTS = 12;

export function createLibrarySearch({ input, resultsHost, getOwnedCount, onPick }) {
    if (!input) throw new Error('library_search requires an input element');
    if (!resultsHost) throw new Error('library_search requires a resultsHost element');

    const fuse = new Fuse(
        allCardNames().map((name) => ({ name })),
        FUSE_OPTS,
    );

    function render(q) {
        resultsHost.innerHTML = '';
        if (!q) {
            resultsHost.hidden = true;
            return;
        }
        const hits = fuse.search(q, { limit: MAX_RESULTS });
        if (hits.length === 0) {
            const empty = document.createElement('div');
            empty.className = 'search-empty';
            empty.textContent = `No card matches "${q}"`;
            resultsHost.appendChild(empty);
            resultsHost.hidden = false;
            return;
        }
        for (const hit of hits) {
            const name = hit.item.name;
            const card = getCard(name);
            const row = document.createElement('button');
            row.type = 'button';
            row.className = 'search-result';

            const thumb = createCardThumbnail({ name, size: 36 });
            row.appendChild(thumb);

            const label = document.createElement('span');
            label.className = 'search-result__name';
            label.textContent = name;
            row.appendChild(label);

            const owned = getOwnedCount ? getOwnedCount(name) : 0;
            if (owned > 0) {
                const badge = document.createElement('span');
                badge.className = 'search-result__owned';
                badge.textContent = `In library: ${owned}`;
                row.appendChild(badge);
            }

            row.addEventListener('click', () => {
                onPick(name);
                input.value = '';
                resultsHost.innerHTML = '';
                resultsHost.hidden = true;
                input.blur();
            });
            resultsHost.appendChild(row);
        }
        resultsHost.hidden = false;
    }

    input.addEventListener('input', () => render(input.value.trim()));
    input.addEventListener('focus', () => {
        if (input.value.trim()) render(input.value.trim());
    });
    input.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') { input.value = ''; render(''); input.blur(); }
    });
    // Hide results on outside click
    document.addEventListener('click', (e) => {
        if (e.target === input) return;
        if (resultsHost.contains(e.target)) return;
        resultsHost.hidden = true;
    });
}
