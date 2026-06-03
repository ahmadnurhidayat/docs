const contentBody = document.querySelector('.content-body');
const progressBar = document.getElementById('progress-bar');
const backToTop = document.getElementById('back-to-top');

contentBody?.addEventListener('scroll', () => {
    const scrollTop = contentBody.scrollTop;
    const scrollHeight = contentBody.scrollHeight - contentBody.clientHeight;
    const progress = scrollHeight > 0 ? (scrollTop / scrollHeight) * 100 : 0;

    if (progressBar) {
        progressBar.style.width = `${progress}%`;
    }

    // Show back-to-top after scrolling 300px
    if (backToTop) {
        if (scrollTop > 300) {
            backToTop.classList.add('visible');
        } else {
            backToTop.classList.remove('visible');
        }
    }
});

// Back to Top click
backToTop?.addEventListener('click', () => {
    contentBody?.scrollTo({ top: 0, behavior: 'smooth' });
});
