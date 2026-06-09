/**
 * Template Name: INSPINIA - Multipurpose Admin & Dashboard Template
 * By (Author): WebAppLayers
 * Module/App (File Name): Landing
 * Version: 4.2.0
 */

function scrollNavbar() {
    const topnav = document.getElementById('landing-navbar');
    let lastScrollTop = 0;
    const activateAt = 100;

    if (topnav) {
        window.addEventListener('scroll', function () {
            const currentScroll = window.pageYOffset || document.documentElement.scrollTop;

            // Toggle fixed positioning
            if (currentScroll > activateAt) {
                topnav.classList.add('top-fixed');
            } else {
                topnav.classList.remove('top-fixed', 'top-hide', 'top-scroll-up');
            }

            // Only apply scroll-up/down logic if fixed
            if (topnav.classList.contains('top-fixed')) {
                if (currentScroll > lastScrollTop) {
                    // Scrolling down
                    topnav.classList.add('top-hide');
                    topnav.classList.remove('top-scroll-up');
                } else if (currentScroll < lastScrollTop) {
                    // Scrolling up
                    topnav.classList.remove('top-hide');
                    topnav.classList.add('top-scroll-up');
                }
            }

            lastScrollTop = currentScroll <= 0 ? 0 : currentScroll;
        });
    }
}

function themeToggle() {
    const html = document.documentElement;
    const toggleButton = document.getElementById('theme-toggle');

    const savedTheme = localStorage.getItem('theme') || 'light';
    html.setAttribute('data-bs-theme', savedTheme);

    if (toggleButton) {
        toggleButton.addEventListener('click', () => {
            const currentTheme = html.getAttribute('data-bs-theme');
            const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
            html.setAttribute('data-bs-theme', newTheme);
            localStorage.setItem('theme', newTheme);
        });
    }
}

scrollNavbar()
themeToggle()