/**
 * iOS-style on/off toggle switch with a label.
 * Variants: 'fused' (gold) | 'onyx' (purple). Visually distinct per GUI_PATTERNS.
 */
export function createToggle({ label, value = false, variant = 'fused', onChange }) {
    const root = document.createElement('label');
    root.className = `toggle toggle--${variant}`;

    const text = document.createElement('span');
    text.className = 'toggle__label';
    text.textContent = label;
    root.appendChild(text);

    const input = document.createElement('input');
    input.type = 'checkbox';
    input.checked = value;
    input.className = 'toggle__input';

    const track = document.createElement('span');
    track.className = 'toggle__track';
    const thumb = document.createElement('span');
    thumb.className = 'toggle__thumb';
    track.appendChild(thumb);

    input.addEventListener('change', (e) => {
        e.stopPropagation();
        if (onChange) onChange(input.checked);
    });
    // Prevent label-click bubbling from triggering row collapse
    root.addEventListener('click', (e) => e.stopPropagation());

    root.appendChild(input);
    root.appendChild(track);
    return root;
}
