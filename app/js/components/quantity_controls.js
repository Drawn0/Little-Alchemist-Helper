/**
 * [−] [N] [+] qty controls. − is disabled at min. Long-press +/− auto-repeats.
 * onChange(newQty) fires on each step. Reads/writes via getValue/setDisplay so
 * external state updates (e.g. via search-add) can refresh the display.
 */
const REPEAT_INITIAL_MS = 400;
const REPEAT_INTERVAL_MS = 80;

export function createQuantityControls({ value = 1, min = 1, max = 99, onChange }) {
    let current = value;

    const root = document.createElement('div');
    root.className = 'qty-ctrl';

    const minus = document.createElement('button');
    minus.type = 'button';
    minus.className = 'qty-ctrl__btn qty-ctrl__btn--minus';
    minus.textContent = '−';
    minus.setAttribute('aria-label', 'Decrement quantity');

    const display = document.createElement('span');
    display.className = 'qty-ctrl__val';
    display.textContent = current;

    const plus = document.createElement('button');
    plus.type = 'button';
    plus.className = 'qty-ctrl__btn qty-ctrl__btn--plus';
    plus.textContent = '+';
    plus.setAttribute('aria-label', 'Increment quantity');

    function step(delta) {
        const next = Math.max(min, Math.min(max, current + delta));
        if (next === current) return;
        current = next;
        display.textContent = current;
        minus.disabled = current <= min;
        plus.disabled = current >= max;
        if (onChange) onChange(current);
    }

    function attachRepeat(btn, delta) {
        let initial = null;
        let interval = null;
        const start = (e) => {
            // Single immediate step
            step(delta);
            initial = setTimeout(() => {
                interval = setInterval(() => step(delta), REPEAT_INTERVAL_MS);
            }, REPEAT_INITIAL_MS);
            e.stopPropagation();
        };
        const stop = () => {
            if (initial) { clearTimeout(initial); initial = null; }
            if (interval) { clearInterval(interval); interval = null; }
        };
        btn.addEventListener('pointerdown', start);
        btn.addEventListener('pointerup', stop);
        btn.addEventListener('pointerleave', stop);
        btn.addEventListener('pointercancel', stop);
    }

    attachRepeat(minus, -1);
    attachRepeat(plus, +1);
    minus.disabled = current <= min;
    plus.disabled = current >= max;

    root.appendChild(minus);
    root.appendChild(display);
    root.appendChild(plus);

    // Expose a way to update display from outside (e.g., when add-or-increment
    // bumps the qty via search rather than via these buttons).
    root.setValue = (v) => {
        current = Math.max(min, Math.min(max, v));
        display.textContent = current;
        minus.disabled = current <= min;
        plus.disabled = current >= max;
    };
    return root;
}
