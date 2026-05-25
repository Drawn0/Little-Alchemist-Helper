/**
 * Floating undo button bottom-corner. Shows for `ms` after each
 * recordUndo() call. Calling undo() reverses the most recent action.
 * Multiple recordUndo calls overwrite — only the latest is undoable
 * (matches the "5 seconds for the most recent thing" pattern).
 */
let _btn = null;
let _hideTimer = null;
let _pending = null;

function ensure() {
    if (_btn) return _btn;
    _btn = document.getElementById('undo-btn') || (() => {
        const b = document.createElement('button');
        b.id = 'undo-btn';
        b.type = 'button';
        b.textContent = '↶ Undo';
        document.body.appendChild(b);
        return b;
    })();
    _btn.addEventListener('click', undo);
    return _btn;
}

export function recordUndo(label, reverseFn, { ms = 5000 } = {}) {
    const btn = ensure();
    _pending = { label, reverseFn };
    btn.textContent = `↶ Undo ${label}`;
    btn.classList.add('undo-btn--visible');
    if (_hideTimer) clearTimeout(_hideTimer);
    _hideTimer = setTimeout(hide, ms);
}

function hide() {
    if (!_btn) return;
    _btn.classList.remove('undo-btn--visible');
    _pending = null;
}

export function undo() {
    if (!_pending) return;
    const fn = _pending.reverseFn;
    _pending = null;
    hide();
    try { fn(); } catch (e) { console.error('Undo failed:', e); }
}
