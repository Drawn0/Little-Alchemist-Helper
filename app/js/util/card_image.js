import { getCard } from './card_data.js';

const RARITY_COLORS = {
    Bronze: '#a07040',
    Silver: '#bbbbc0',
    Gold: '#d4a93a',
    Diamond: '#7ec7d6',
    Onyx: '#5b4380',
    Rare: '#888',
};

export function rarityColor(rarity) {
    return RARITY_COLORS[rarity] || '#888';
}

export function getCardImage(name) {
    const card = getCard(name);
    return card ? card.image_url : null;
}

export function placeholderForRarity(rarity) {
    const color = rarityColor(rarity);
    const svg =
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48">' +
        `<rect width="48" height="48" fill="${color}" opacity="0.25"/>` +
        `<text x="50%" y="55%" text-anchor="middle" font-family="-apple-system,sans-serif" font-size="18" fill="${color}">?</text>` +
        '</svg>';
    return 'data:image/svg+xml;utf8,' + encodeURIComponent(svg);
}
