/**
 * Segmented control of buttons [1..max] (default max=5; pass 6 for level-6 cards).
 * onChange(newLevel) fires when user taps a different value.
 */
export function createSegmentedLevel({ value = 1, max = 5, onChange }) {
    const root = document.createElement('div');
    root.className = 'seg-level';
    root.setAttribute('role', 'radiogroup');
    root.setAttribute('aria-label', 'Level');

    const buttons = [];
    for (let i = 1; i <= max; i++) {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'seg-level__btn';
        b.textContent = i;
        b.dataset.value = i;
        b.setAttribute('role', 'radio');
        if (i === value) {
            b.classList.add('seg-level__btn--active');
            b.setAttribute('aria-checked', 'true');
        } else {
            b.setAttribute('aria-checked', 'false');
        }
        b.addEventListener('click', (e) => {
            e.stopPropagation();
            if (i === value) return;
            value = i;
            buttons.forEach((bb) => {
                const active = Number(bb.dataset.value) === value;
                bb.classList.toggle('seg-level__btn--active', active);
                bb.setAttribute('aria-checked', active ? 'true' : 'false');
            });
            if (onChange) onChange(value);
        });
        buttons.push(b);
        root.appendChild(b);
    }
    return root;
}
