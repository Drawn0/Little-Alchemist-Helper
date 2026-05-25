import { createCardThumbnail } from './card_thumbnail.js';
import { createSegmentedLevel } from './segmented_level.js';
import { createToggle } from './toggle.js';
import { createQuantityControls } from './quantity_controls.js';

/**
 * Library row. Compact: thumbnail + name + qty +/- + delete.
 * Tap the name area to expand showing level (1-5) + fused + onyx controls.
 * Tap the name area again or call collapse() to hide.
 *
 * Callbacks: { onChangeLevel, onChangeFused, onChangeOnyx, onChangeQty, onDelete }
 * Each receives only the new value; the caller mutates state + persists.
 */
export function createLibraryRow(card, callbacks = {}) {
    const root = document.createElement('div');
    root.className = 'lib-row';
    root.dataset.cardKey = `${card.name}|${card.fused ? 1 : 0}|${card.onyx ? 1 : 0}`;

    // ── Compact line: tappable name area + qty + delete ───────────────────────
    const main = document.createElement('div');
    main.className = 'lib-row__main';
    const nameArea = document.createElement('button');
    nameArea.type = 'button';
    nameArea.className = 'lib-row__name-area';
    nameArea.setAttribute('aria-expanded', 'false');

    const thumb = createCardThumbnail({
        name: card.name,
        level: card.level,
        fused: card.fused,
        onyx: card.onyx,
        quantity: card.quantity,
        size: 48,
    });
    nameArea.appendChild(thumb);

    const nameText = document.createElement('span');
    nameText.className = 'lib-row__name-text';
    nameText.textContent = card.name + (card.onyx ? ' ◊' : '');
    nameArea.appendChild(nameText);
    main.appendChild(nameArea);

    const qty = createQuantityControls({
        value: card.quantity,
        min: 1,
        onChange: (v) => callbacks.onChangeQty && callbacks.onChangeQty(v),
    });
    main.appendChild(qty);

    const del = document.createElement('button');
    del.type = 'button';
    del.className = 'lib-row__delete';
    del.textContent = '×';
    del.setAttribute('aria-label', 'Remove from library');
    del.addEventListener('click', (e) => {
        e.stopPropagation();
        if (callbacks.onDelete) callbacks.onDelete();
    });
    main.appendChild(del);

    root.appendChild(main);

    // ── Expanded panel: level + fused + onyx ──────────────────────────────────
    const panel = document.createElement('div');
    panel.className = 'lib-row__expanded';
    panel.hidden = true;

    panel.appendChild(createSegmentedLevel({
        value: card.level,
        max: 5,
        onChange: (v) => callbacks.onChangeLevel && callbacks.onChangeLevel(v),
    }));
    panel.appendChild(createToggle({
        label: 'Fused',
        value: card.fused,
        variant: 'fused',
        onChange: (v) => callbacks.onChangeFused && callbacks.onChangeFused(v),
    }));
    panel.appendChild(createToggle({
        label: 'Onyx',
        value: card.onyx,
        variant: 'onyx',
        onChange: (v) => callbacks.onChangeOnyx && callbacks.onChangeOnyx(v),
    }));
    root.appendChild(panel);

    nameArea.addEventListener('click', (e) => {
        e.stopPropagation();
        const next = panel.hidden;
        panel.hidden = !next;
        root.classList.toggle('lib-row--expanded', next);
        nameArea.setAttribute('aria-expanded', String(next));
    });

    // Expose collapse for outside-click handler
    root.collapse = () => {
        panel.hidden = true;
        root.classList.remove('lib-row--expanded');
        nameArea.setAttribute('aria-expanded', 'false');
    };
    root.setQuantityDisplay = (v) => qty.setValue(v);
    return root;
}
