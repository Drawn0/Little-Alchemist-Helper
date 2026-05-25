import { getCard } from '../util/card_data.js';
import { getCardImage, placeholderForRarity, rarityColor } from '../util/card_image.js';

/**
 * Returns a DOM element rendering a card thumbnail with badges.
 * Composition per GUI_PATTERNS:
 *   - image with rarity-colored border
 *   - Lv badge bottom-left (if level provided)
 *   - fused ƒ / onyx ◊ badges bottom-right
 *   - quantity badge top-right if quantity > 1
 */
export function createCardThumbnail({ name, level = null, fused = false, onyx = false, quantity = 1, size = 48 }) {
    const card = getCard(name);
    const rarity = card ? card.rarity : '';

    const root = document.createElement('div');
    root.className = 'card-thumb';
    root.style.width = root.style.height = `${size}px`;
    root.style.borderColor = rarityColor(rarity);
    root.dataset.cardName = name;

    const img = document.createElement('img');
    img.loading = 'lazy';
    img.alt = name;
    img.src = getCardImage(name) || placeholderForRarity(rarity);
    img.addEventListener('error', () => { img.src = placeholderForRarity(rarity); }, { once: true });
    root.appendChild(img);

    if (level !== null) {
        const lvl = document.createElement('span');
        lvl.className = 'card-thumb__lvl';
        lvl.textContent = level;
        root.appendChild(lvl);
    }

    if (fused || onyx) {
        const flags = document.createElement('span');
        flags.className = 'card-thumb__flags';
        if (fused) {
            const f = document.createElement('span');
            f.className = 'card-thumb__flag card-thumb__flag--fused';
            f.textContent = 'ƒ';
            f.title = 'Fused';
            flags.appendChild(f);
        }
        if (onyx) {
            const o = document.createElement('span');
            o.className = 'card-thumb__flag card-thumb__flag--onyx';
            o.textContent = '◊';
            o.title = 'Onyx';
            flags.appendChild(o);
        }
        root.appendChild(flags);
    }

    if (quantity > 1) {
        const qty = document.createElement('span');
        qty.className = 'card-thumb__qty';
        qty.textContent = `×${quantity}`;
        root.appendChild(qty);
    }

    return root;
}
