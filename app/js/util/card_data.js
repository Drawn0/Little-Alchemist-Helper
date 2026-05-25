let _cards = null;
let _loading = null;

export function loadCardData() {
    if (_cards) return Promise.resolve(_cards);
    if (_loading) return _loading;
    _loading = fetch(new URL('../../card_data.json', import.meta.url))
        .then((r) => r.json())
        .then((data) => { _cards = data; return _cards; });
    return _loading;
}

export function getCard(name) {
    return _cards ? _cards[name] || null : null;
}

export function hasCard(name) {
    return _cards ? Object.prototype.hasOwnProperty.call(_cards, name) : false;
}

export function allCardNames() {
    return _cards ? Object.keys(_cards) : [];
}
