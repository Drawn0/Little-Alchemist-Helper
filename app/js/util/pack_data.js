let _packs = null;
let _loading = null;

export function loadPackData() {
    if (_packs) return Promise.resolve(_packs);
    if (_loading) return _loading;
    _loading = fetch(new URL('../../pack_data.json', import.meta.url))
        .then((r) => r.json())
        .then((data) => { _packs = data; return _packs; });
    return _loading;
}

export function allPacks() {
    return _packs || [];
}

export function getPack(id) {
    return _packs ? _packs.find((p) => p.id === id) : null;
}

/**
 * MORGANlTE pack-cards strings sometimes carry an " (Onyx)" suffix. Strip it
 * and return { name, onyx } so the caller can construct a library entry that
 * matches vladajankovic's schema (name + onyx flag, not name with suffix).
 */
export function parsePackCardName(raw) {
    const m = raw.match(/^(.*)\s*\(Onyx\)\s*$/i);
    if (m) return { name: m[1].trim(), onyx: true };
    return { name: raw, onyx: false };
}
