const themeToggle = document.getElementById('theme-toggle');
const html = document.documentElement;

function updateIcon() {
    const icon = themeToggle?.querySelector('i');
    if (icon) {
        icon.className = html.classList.contains('dark-mode')
            ? 'fa-solid fa-sun'
            : 'fa-solid fa-moon';
    }
}

themeToggle?.addEventListener('click', () => {
    html.classList.toggle('dark-mode');
    const theme = html.classList.contains('dark-mode') ? 'dark' : 'light';
    localStorage.setItem('theme', theme);
    updateIcon();
});

// Set initial icon state
updateIcon();
