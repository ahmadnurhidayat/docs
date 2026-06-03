let currentFontSize = parseFloat(localStorage.getItem('fontSize') || '1.2');
let isWideMode = localStorage.getItem('widthMode') === 'wide';

function applyFontSize() {
    document.documentElement.style.setProperty('--dynamic-font-size', `${currentFontSize}rem`);
}

function applyWidthMode() {
    const width = isWideMode ? '1200px' : '740px';
    document.documentElement.style.setProperty('--reading-max-width', width);
}

// Font size controls
document.getElementById('font-decrease')?.addEventListener('click', () => {
    currentFontSize = Math.max(0.8, currentFontSize - 0.1);
    localStorage.setItem('fontSize', currentFontSize.toString());
    applyFontSize();
});

document.getElementById('font-increase')?.addEventListener('click', () => {
    currentFontSize = Math.min(2.5, currentFontSize + 0.1);
    localStorage.setItem('fontSize', currentFontSize.toString());
    applyFontSize();
});

// Width toggle
document.getElementById('width-toggle')?.addEventListener('click', () => {
    isWideMode = !isWideMode;
    localStorage.setItem('widthMode', isWideMode ? 'wide' : 'narrow');
    applyWidthMode();
});

// Apply saved preferences
applyFontSize();
applyWidthMode();
