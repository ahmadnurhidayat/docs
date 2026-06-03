const sidebar = document.getElementById('sidebar');
const resizer = document.getElementById('sidebar-resizer');
let isResizing = false;

resizer?.addEventListener('mousedown', (e) => {
    e.preventDefault();
    isResizing = true;
    document.body.classList.add('is-resizing');
    resizer.classList.add('active');
    if (sidebar) {
        sidebar.style.transition = 'none';
    }
});

document.addEventListener('mousemove', (e) => {
    if (!isResizing || window.innerWidth <= 768) return;

    let newWidth = e.clientX;
    if (newWidth < 200) newWidth = 200;
    if (newWidth > 600) newWidth = 600;

    if (sidebar) {
        sidebar.style.width = `${newWidth}px`;
        sidebar.style.minWidth = `${newWidth}px`;
    }
    document.documentElement.style.setProperty('--sidebar-width', `${newWidth}px`);
});

document.addEventListener('mouseup', () => {
    if (isResizing) {
        isResizing = false;
        document.body.classList.remove('is-resizing');
        resizer?.classList.remove('active');
        if (sidebar) {
            sidebar.style.transition = '';
            const currentWidth = parseInt(sidebar.style.width);
            if (currentWidth) {
                localStorage.setItem('sidebar-width', `${currentWidth}px`);
            }
        }
    }
});

// Load saved sidebar width
const savedWidth = localStorage.getItem('sidebar-width');
if (savedWidth && window.innerWidth > 768 && sidebar) {
    sidebar.style.width = savedWidth;
    sidebar.style.minWidth = savedWidth;
    document.documentElement.style.setProperty('--sidebar-width', savedWidth);
}
