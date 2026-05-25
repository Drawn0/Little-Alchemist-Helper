/**
 * Hybrid level control: − [1][2][3][4][5] + (default max=5; pass 6 for level-6
 * cards). Either the stepper buttons or the discrete segments mutate the value
 * and re-sync the visual state. onChange(newLevel) fires once per net change.
 */
export function createSegmentedLevel({ value = 1, max = 5, onChange }) {
    const wrap = document.createElement('div');
    wrap.className = 'seg-level-wrap';
    // Stop bubbling so a click in here doesn't collapse the parent row.
    wrap.addEventListener('click', (e) => e.stopPropagation());

    const minus = document.createElement('button');
    minus.type = 'button';
    minus.className = 'seg-level__step seg-level__step--minus';
    minus.textContent = '−';
    minus.setAttribute('aria-label', 'Level down');

    const seg = document.createElement('div');
    seg.className = 'seg-level';
    seg.setAttribute('role', 'radiogroup');
    seg.setAttribute('aria-label', 'Level');

    const plus = document.createElement('button');
    plus.type = 'button';
    plus.className = 'seg-level__step seg-level__step--plus';
    plus.textContent = '+';
    plus.setAttribute('aria-label', 'Level up');

    const buttons = [];
    for (let i = 1; i <= max; i++) {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'seg-level__btn';
        b.textContent = i;
        b.dataset.value = i;
        b.setAttribute('role', 'radio');
        b.addEventListener('click', () => setValue(i));
        buttons.push(b);
        seg.appendChild(b);
    }

    function setValue(v) {
        v = Math.max(1, Math.min(max, v));
        if (v === value) return;
        value = v;
        buttons.forEach((bb) => {
            const active = Number(bb.dataset.value) === value;
            bb.classList.toggle('seg-level__btn--active', active);
            bb.setAttribute('aria-checked', active ? 'true' : 'false');
        });
        minus.disabled = value <= 1;
        plus.disabled = value >= max;
        if (onChange) onChange(value);
    }

    // Initialize highlight + disabled state
    buttons.forEach((bb) => {
        const active = Number(bb.dataset.value) === value;
        bb.classList.toggle('seg-level__btn--active', active);
        bb.setAttribute('aria-checked', active ? 'true' : 'false');
    });
    minus.disabled = value <= 1;
    plus.disabled = value >= max;

    minus.addEventListener('click', () => setValue(value - 1));
    plus.addEventListener('click', () => setValue(value + 1));

    wrap.appendChild(minus);
    wrap.appendChild(seg);
    wrap.appendChild(plus);
    return wrap;
}
