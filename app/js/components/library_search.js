import Fuse from 'fuse.js';
import { createCardThumbnail } from './card_thumbnail.js';
import { getCard, allCardNames } from '../util/card_data.js';

/**
 * Search-as-you-type fuzzy card search. Results appear below the input.
 *
 * passesFilter(name) — caller-provided predicate. Cards for which this
 * returns false are dropped from results. Lets the host app share its
 * filter state (kind toggles, rarity chips) across the library list and
 * the search dropdown.
 *
 * Returns an object with `.refresh()` so the host can re-render results
 * after external filter state changes.
 */
const FUSE_OPTS = {
    threshold: 0.4,
    distance: 50,
    minMatchCharLength: 1,
    keys: ['name'],
};
const FUSE_LIMIT = 50;
const MAX_RESULTS = 12;

export function createLibrarySearch({ input, resultsHost, passesFilter, getOwnedCount, onPick }) {
    if (!input) throw new Error('library_search requires an input element');
    if (!resultsHost) throw new Error('library_search requires a resultsHost element');

    const fuse = new Fuse(
        allCardNames().map((name) => ({ name })),
        FUSE_OPTS,
    );

    function render(q) {
        resultsHost.innerHTML = '';
        if (!q) { resultsHost.hidden = true; return; }
        const hits = fuse.search(q, { limit: FUSE_LIMIT });
        const filtered = (passesFilter
            ? hits.filter((h) => passesFilter(h.item.name))
            : hits).slice(0, MAX_RESULTS);

        if (filtered.length === 0) {
            const empty = document.createElement('div');
            empty.className = 'search-empty';
            empty.textContent = hits.length > 0
                ? 'No matches in current filter — broaden filters above.'
                : `No card matches "${q}"`;
            resultsHost.appendChild(empty);
            resultsHost.hidden = false;
            return;
        }
        for (const hit of filtered) {
            const name = hit.item.name;
            const row = document.createElement('button');
            row.type = 'button';
            row.className = 'search-result';

            row.appendChild(createCardThumbnail({ name, size: 36 }));

            const label = document.createElement('span');
            label.className = 'search-result__name';
            label.textContent = name;
            row.appendChild(label);

            const kind = (getCard(name) || {}).card_kind || 'base';
            if (kind !== 'base') {
                const kindBadge = document.createElement('span');
                kindBadge.className = `search-result__kind search-result__kind--${kind}`;
                kindBadge.textContent = kind === 'combo' ? 'combo' : 'final';
                row.appendChild(kindBadge);
            }

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
    document.addEventListener('click', (e) => {
        if (e.target === input) return;
        if (resultsHost.contains(e.target)) return;
        resultsHost.hidden = true;
    });

    return {
        refresh: () => render(input.value.trim()),
    };
}
