import { createCardThumbnail } from './card_thumbnail.js';
import { createSegmentedLevel } from './segmented_level.js';
import { createToggle } from './toggle.js';
import { createQuantityControls } from './quantity_controls.js';
import { getCard } from '../util/card_data.js';

/**
 * Library row. Compact: thumbnail + name + qty +/- + delete.
 * Tap the name area to expand showing level (1-5) + fused + onyx controls.
 * Tap the name area again or call collapse() to hide.
 *
 * Callbacks: { onChangeLevel, onChangeFused, onChangeOnyx, onChangeQty, onDelete }
 * Each receives only the new value; the caller mutates state + persists.
 */
export function createLibraryRow(card, callbacks = {}) {
    const info = getCard(card.name) || {};
    const root = document.createElement('div');
    root.className = 'lib-row';
    if (info.rarity) root.classList.add(`lib-row--${info.rarity.toLowerCase()}`);
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

    const nameBlock = document.createElement('span');
    nameBlock.className = 'lib-row__name-block';
    const nameText = document.createElement('span');
    nameText.className = 'lib-row__name-text';
    nameText.textContent = card.name + (card.onyx ? ' (Onyx)' : '');
    nameBlock.appendChild(nameText);
    if (info.base_attack != null || info.base_defense != null) {
        const stats = document.createElement('span');
        stats.className = 'lib-row__stats';
        stats.innerHTML = `<span class="lib-row__stat-key">ATK</span> ${info.base_attack ?? '?'} <span class="lib-row__stat-sep">·</span> <span class="lib-row__stat-key">DEF</span> ${info.base_defense ?? '?'}`;
        if (info.is_combo) {
            const b = document.createElement('span');
            b.className = 'lib-row__kind lib-row__kind--combo';
            b.textContent = 'combo';
            stats.appendChild(b);
        }
        if (info.is_final) {
            const b = document.createElement('span');
            b.className = 'lib-row__kind lib-row__kind--final';
            b.textContent = 'final';
            stats.appendChild(b);
        }
        nameBlock.appendChild(stats);
    }
    nameArea.appendChild(nameBlock);
    main.appendChild(nameArea);

    const qty = createQuantityControls({
        value: card.quantity,
        min: 1,
        onChange: (v) => callbacks.onChangeQty && callbacks.onChangeQty(v),
    });
    main.appendChild(qty);

    const toDeck = document.createElement('button');
    toDeck.type = 'button';
    toDeck.className = 'lib-row__to-deck';
    toDeck.textContent = '→';
    toDeck.title = 'Add to deck';
    toDeck.setAttribute('aria-label', 'Add to deck');
    toDeck.addEventListener('click', (e) => {
        e.stopPropagation();
        if (callbacks.onAddToDeck) callbacks.onAddToDeck();
    });
    main.appendChild(toDeck);

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
    const changeBtn = document.createElement('button');
    changeBtn.type = 'button';
    changeBtn.className = 'lib-row__change-card';
    changeBtn.textContent = '🔄 Change card';
    changeBtn.title = 'Replace this entry with a different card (preserves level / fused / onyx / qty)';
    changeBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (callbacks.onChangeCard) callbacks.onChangeCard();
    });
    panel.appendChild(changeBtn);
    root.appendChild(panel);

    function setExpanded(next) {
        panel.hidden = !next;
        root.classList.toggle('lib-row--expanded', next);
        nameArea.setAttribute('aria-expanded', String(next));
        if (callbacks.onToggleExpand) callbacks.onToggleExpand(next);
    }

    // Honor initial expanded state (so a re-render after an inline edit keeps
    // the row open instead of snapping shut).
    if (callbacks.startExpanded) setExpanded(true);

    nameArea.addEventListener('click', (e) => {
        e.stopPropagation();
        setExpanded(panel.hidden);
    });

    // Expose collapse for outside-click handler
    root.collapse = () => setExpanded(false);
    root.setQuantityDisplay = (v) => qty.setValue(v);
    return root;
}
