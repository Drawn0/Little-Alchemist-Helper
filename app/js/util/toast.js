let _container = null;
let _timer = null;

function ensure() {
    if (_container) return _container;
    _container = document.getElementById('toast-host') || (() => {
        const d = document.createElement('div');
        d.id = 'toast-host';
        document.body.appendChild(d);
        return d;
    })();
    return _container;
}

export function showToast(message, { ms = 2000 } = {}) {
    const host = ensure();
    host.textContent = message;
    host.classList.add('toast-host--visible');
    if (_timer) clearTimeout(_timer);
    _timer = setTimeout(() => {
        host.classList.remove('toast-host--visible');
    }, ms);
}
