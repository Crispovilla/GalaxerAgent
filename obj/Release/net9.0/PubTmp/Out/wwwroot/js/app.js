/**
 * Template Name: INSPINIA - Multipurpose Admin & Dashboard Template
 * By (Author): WebAppLayers
 * Module/App (File Name): Main App JS File
 * Version: 4.2.0
 */

//
// ------------------------------ Required main scripts ------------------------------
//

// Common
class App {

    init() {
        this.initComponents();
        this.initPreloader();
        this.initPortletCard();
        this.initMultiDropdown();
        this.initFormValidation();
        this.initCounter();
        this.initCodePreview();
        this.initToggle();
        this.initDismissible();
        this.initLeftSidebar(); // Menu Link Activation (Vertical Menu)
        this.initTopbarMenu(); // Menu Link Activation (Horizontal Menu)
    }

    // Bootstrap Components
    initComponents() {

        if (typeof lucide.createIcons === 'function') {
            lucide.createIcons();
        }

        // Popovers
        document.querySelectorAll('[data-bs-toggle="popover"]').forEach(el => {
            new bootstrap.Popover(el);
        });

        // Tooltips
        document.querySelectorAll('[data-bs-toggle="tooltip"]').forEach(el => {
            new bootstrap.Tooltip(el);
        });

        // Offcanvas
        document.querySelectorAll('.offcanvas').forEach(el => {
            new bootstrap.Offcanvas(el);
        });

        // Toasts
        document.querySelectorAll('.toast').forEach(el => {
            new bootstrap.Toast(el);
        });
    }

    // Preloader
    initPreloader() {
        window.addEventListener('load', () => {
            const status = document.getElementById('status');
            const preloader = document.getElementById('preloader');
            if (status) status.style.display = 'none';
            if (preloader) {
                setTimeout(() => preloader.style.display = 'none', 350);
            }
        });
    }

    // Portlet Widget (Card Reload, Collapse, and Delete)
    initPortletCard() {

        // Handle card close
        $('[data-action="card-close"]').on('click', function (event) {
            event.preventDefault();

            const $card = $(this).closest('.card');
            $card.fadeOut(300, function () {
                $card.remove();
            });
        });

        // Handle card toggle
        $('[data-action="card-toggle"]').on('click', function (event) {
            event.preventDefault();

            const $card = $(this).closest('.card');
            const $icon = $(this).find('i').eq(0);
            const $body = $card.find('.card-body');
            const $footer = $card.find('.card-footer');

            $body.slideToggle(300);
            $footer.slideToggle(200);
            $icon.toggleClass('ti-chevron-up ti-chevron-down');
            $card.toggleClass('card-collapse');
        });

        // Handle card refresh
        const refreshButtons = document.querySelectorAll('[data-action="card-refresh"]');
        if (refreshButtons) {
            refreshButtons.forEach(function (button) {
                button.addEventListener('click', function (event) {
                    event.preventDefault();

                    const card = event.target.closest('.card');

                    let overlay = card.querySelector('.card-overlay');
                    if (!overlay) {
                        overlay = document.createElement('div');
                        overlay.classList.add('card-overlay');

                        const spinner = document.createElement('div');
                        spinner.classList.add('spinner-border', 'text-primary');

                        overlay.appendChild(spinner);
                        card.appendChild(overlay);
                    }

                    overlay.style.display = 'flex';

                    setTimeout(function () {
                        overlay.style.display = 'none';
                    }, 1500);
                });
            });
        }

        // Handle code preview collapse
        $('[data-action="code-collapse"]').on('click', function (event) {
            event.preventDefault();

            const $card = $(this).closest('.card');
            const $icon = $(this).find('i').eq(0);
            const $codeBody = $card.find('.code-body');

            $codeBody.slideToggle(300);
            $icon.toggleClass('ti-chevron-up ti-chevron-down');
        });
    }

    //  Multi Dropdown
    initMultiDropdown() {
        $('.dropdown-menu a.dropdown-toggle').on('click', function () {
            const dropdown = $(this).next('.dropdown-menu');
            const otherDropdown = $(this).parent().parent().find('.dropdown-menu').not(dropdown);
            otherDropdown.removeClass('show')
            otherDropdown.parent().find('.dropdown-toggle').removeClass('show')
            return false;
        });
    }

    // Form Validation
    initFormValidation() {
        // Example starter JavaScript for disabling form submissions if there are invalid fields
        // Fetch all the forms we want to apply custom Bootstrap validation styles to
        // Loop over them and prevent submission
        document.querySelectorAll('.needs-validation').forEach(form => {
            form.addEventListener('submit', event => {
                if (!form.checkValidity()) {
                    event.preventDefault()
                    event.stopPropagation()
                }

                form.classList.add('was-validated')
            }, false)
        })
    }

    // Counter for Numbers
    initCounter() {
        const counters = document.querySelectorAll('[data-target]');

        const observer = new IntersectionObserver((entries, observer) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    const counter = entry.target;

                    // Parse the target value, removing any commas first
                    let target = counter.getAttribute('data-target').replace(/,/g, '');

                    target = parseFloat(target); // Convert to float

                    let current = 0; // Initial counter value

                    let increment;  // Increment step for smooth animation

                    if (Number.isInteger(target)) {
                        increment = Math.floor(target / 25); // Increment for integer values
                    } else {
                        increment = target / 25; // Increment for float values
                    }

                    const updateCounter = () => {
                        if (current < target) {
                            current += increment;
                            if (current > target) current = target; // Avoid overshooting
                            // Format as integer or decimal and add commas
                            counter.innerText = formatNumber(current);
                            requestAnimationFrame(updateCounter); // Continue animation frame by frame
                        } else {
                            counter.innerText = formatNumber(target); // Final display
                        }
                    };

                    updateCounter(); // Start the animation

                    // Function to format numbers with commas and decimal places if necessary
                    function formatNumber(num) {
                        if (num % 1 === 0) {
                            // Format as integer with commas
                            return num.toLocaleString();
                        } else {
                            // Format as float with two decimal places and commas
                            return num.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
                        }
                    }

                    observer.unobserve(counter);
                }
            });
        }, {
            threshold: 1 // Adjust this threshold to control when to trigger (e.g., 0.5 means 50% of the element is visible)
        });

        counters.forEach(counter => observer.observe(counter));
    }

    // Code Preview
    initCodePreview() {
        if (typeof Prism !== 'undefined' && Prism.plugins && Prism.plugins.NormalizeWhitespace) {
            Prism.plugins.NormalizeWhitespace.setDefaults({
                'remove-trailing': true,
                'remove-indent': true,
                'left-trim': true,
                'right-trim': true,
                'tabs-to-spaces': 4,
                'spaces-to-tabs': 4
            });
        }
    }

    // Toggle logic based on data attributes
    initToggle() {
        document.querySelectorAll('[data-toggler]').forEach(wrapper => {
            const toggleOn = wrapper.querySelector('[data-toggler-on]');
            const toggleOff = wrapper.querySelector('[data-toggler-off]');
            let isOn = wrapper.getAttribute('data-toggler') === 'on';

            const updateToggleState = () => {
                if (isOn) {
                    toggleOn?.classList.remove('d-none');
                    toggleOff?.classList.add('d-none');
                } else {
                    toggleOn?.classList.add('d-none');
                    toggleOff?.classList.remove('d-none');
                }
            };

            toggleOn?.addEventListener('click', () => {
                isOn = false;
                updateToggleState();
            });

            toggleOff?.addEventListener('click', () => {
                isOn = true;
                updateToggleState();
            });

            updateToggleState();
        });
    }

    // Dismiss elements with [data-dismissible]
    initDismissible() {
        document.querySelectorAll('[data-dismissible]').forEach(trigger => {
            trigger.addEventListener('click', () => {
                const selector = trigger.getAttribute('data-dismissible');
                const target = document.querySelector(selector);
                if (target) target.remove();
            });
        });
    }

    // Left Sidebar Menu Link Activation (Vertical Menu)
    initLeftSidebar() {
        const sideNav = document.querySelector('.side-nav');
        if (!sideNav) return;

        // Prevent default toggle behavior for toggle links
        sideNav.querySelectorAll("li [data-bs-toggle='collapse']").forEach(toggle => {
            toggle.addEventListener('click', e => e.preventDefault());
        });

        // Ensure only one collapse is open at a time
        const allCollapses = sideNav.querySelectorAll('li .collapse');
        allCollapses.forEach(collapse => {
            collapse.addEventListener('show.bs.collapse', event => {
                const currentCollapse = event.target;

                // Get all ancestor collapses of the current item
                const ancestors = [];
                let el = currentCollapse.parentElement;
                while (el && el !== sideNav) {
                    if (el.classList.contains('collapse')) {
                        ancestors.push(el);
                    }
                    el = el.parentElement;
                }

                allCollapses.forEach(other => {
                    if (other !== currentCollapse && !ancestors.includes(other)) {
                        new bootstrap.Collapse(other, { toggle: false }).hide();
                    }
                });
            });
        });

        // Match current URL
        const currentUrl = window.location.href.split(/[?#]/)[0];
        const allLinks = sideNav.querySelectorAll('a');

        allLinks.forEach(link => {
            if (link.href === currentUrl) {

                sideNav.querySelectorAll('a.active, li.active, .collapse.show').forEach(el => {
                    el.classList.remove('active')
                    el.classList.remove('show')
                });

                link.classList.add('active');

                // Traverse up to activate all parents and show collapses
                let currentElement = link.closest('li');
                while (currentElement && currentElement !== sideNav) {
                    currentElement.classList.add('active');

                    // Show parent collapses
                    const parentCollapse = currentElement.closest('.collapse');
                    if (parentCollapse) {
                        new bootstrap.Collapse(parentCollapse, { toggle: false }).show();

                        // Also mark the <li> that contains the collapse as active
                        const collapseParentLi = parentCollapse.closest('li');
                        if (collapseParentLi) {
                            collapseParentLi.classList.add('active');
                        }

                        currentElement = collapseParentLi;
                    } else {
                        currentElement = currentElement.parentElement;
                    }
                }
            }
        });

        // Auto-scroll to active item
        setTimeout(() => {
            const activeItem = sideNav.querySelector('li.active .active');
            const scrollContainer = document.querySelector('.sidenav-menu .simplebar-content-wrapper');

            if (activeItem && scrollContainer) {
                const offset = activeItem.offsetTop - 300;
                if (offset > 100) {
                    scrollToPosition(scrollContainer, offset, 600);
                }
            }
        }, 200);

        // Smooth scroll utility
        function scrollToPosition(element, to, duration) {
            const start = element.scrollTop;
            const change = to - start;
            const increment = 20;
            let currentTime = 0;

            function animateScroll() {
                currentTime += increment;
                element.scrollTop = easeInOutQuad(currentTime, start, change, duration);
                if (currentTime < duration) {
                    setTimeout(animateScroll, increment);
                }
            }

            animateScroll();
        }

        function easeInOutQuad(t, b, c, d) {
            t /= d / 2;
            if (t < 1) return c / 2 * t * t + b;
            t--;
            return -c / 2 * (t * (t - 2) - 1) + b;
        }
    }

    // Topbar Menu Link Activation (Horizontal Menu)
    initTopbarMenu() {
        const navbarNav = document.querySelector('.navbar-nav');
        if (!navbarNav) return;

        const currentUrl = window.location.href.split(/[?#]/)[0];
        const navLinks = navbarNav.querySelectorAll('li a');

        navLinks.forEach(link => {
            if (link.href === currentUrl) {
                link.classList.add('active');

                // Add active to parent hierarchy (up to 3 levels for deeply nested dropdowns)
                let el = link.parentElement;
                for (let i = 0; i < 6 && el && el !== document.body; i++) {
                    if (el.tagName === 'LI' || el.classList.contains('dropdown')) {
                        el.classList.add('active');
                    }
                    el = el.parentElement;
                }
            }
        });

        // Handle navbar toggle (mobile view)
        const navbarToggle = document.querySelector('.navbar-toggle');
        const navigation = document.getElementById('navigation');

        if (navbarToggle && navigation) {
            navbarToggle.addEventListener('click', () => {
                navbarToggle.classList.toggle('open');
                if (navigation.style.display === 'block') {
                    navigation.style.display = 'none';
                } else {
                    navigation.style.display = 'block';
                }
            });
        }
    }
}

// Layout Customizer
class LayoutCustomizer {
    constructor() {
        this.html = document.documentElement;
        this.config = {};
    }

    init() {
        this.initConfig();
        this.initSwitchListener();
        this.initWindowSize();
        this._adjustLayout();
        this.setSwitchFromConfig();
    }

    initConfig() {
        this.defaultConfig = JSON.parse(JSON.stringify(window.defaultConfig));
        this.config = JSON.parse(JSON.stringify(window.config));
        this.setSwitchFromConfig();
    }

    changeSkin(skin) {
        this.config.skin = skin;
        this.html.setAttribute("data-skin", skin);
        this.setSwitchFromConfig();
    }

    changeMenuColor(color) {
        this.config.menu.color = color;
        this.html.setAttribute("data-menu-color", color);
        this.setSwitchFromConfig();
    }

    changeLeftbarSize(size, save = true) {
        this.html.setAttribute("data-sidenav-size", size);
        if (save) {
            this.config.sidenav.size = size;
            this.setSwitchFromConfig();
        }
    }

    changeLayoutPosition(position) {
        this.config.layout.position = position;
        this.html.setAttribute("data-layout-position", position);
        this.setSwitchFromConfig();
    }

    changeTheme(color) {
        const nColor = color === 'system' ? this.getSystemTheme() : color;
        this.config.theme = color
        this.html.setAttribute("data-bs-theme", color === 'system' ? this.getSystemTheme() : color);
        this.setSwitchFromConfig();
    }

    changeTopbarColor(color) {
        this.config.topbar.color = color;
        this.html.setAttribute("data-topbar-color", color);
        this.setSwitchFromConfig();
    }

    changeSidebarUser(showUser) {
        this.config.sidenav.user = showUser;
        if (showUser) {
            this.html.setAttribute("data-sidenav-user", showUser);
        } else {
            this.html.removeAttribute("data-sidenav-user");
        }
        this.setSwitchFromConfig();
    }

    resetTheme() {
        this.config = JSON.parse(JSON.stringify(window.defaultConfig));
        this.changeSkin(this.config.skin);
        this.changeMenuColor(this.config.menu.color);
        this.changeLeftbarSize(this.config.sidenav.size);
        this.changeTheme(this.config.theme);
        this.changeLayoutPosition(this.config.layout.position);
        this.changeTopbarColor(this.config.topbar.color);
        this.changeSidebarUser(this.config.sidenav.user);
        this._adjustLayout();
    }

    getSystemTheme() {
        return window.matchMedia("(prefers-color-scheme: dark)").matches
            ? "dark"
            : "light";
    }

    setSwitchFromConfig() {
        const config = this.config;

        sessionStorage.setItem("__INSPINIA_CONFIG__", JSON.stringify(config));

        document
            .querySelectorAll(".right-bar input[type=checkbox]")
            .forEach((cb) => (cb.checked = false));

        const select = (name, val) =>
            document.querySelector(`input[name="${name}"][value="${val}"]`);
        const toggle = (sel, state) => {
            const el = document.querySelector(sel);
            if (el) el.checked = state;
        };

        toggle('input[name="sidebar-user"]', config.sidenav.user === true);

        [
            ["data-skin", config.skin],
            ["data-bs-theme", config.theme],
            ["data-layout-position", config.layout.position],
            ["data-topbar-color", config.topbar.color],
            ["data-menu-color", config.menu.color],
            ["data-sidenav-size", config.sidenav.size],
        ].forEach(([name, val]) => {
            const el = select(name, val);
            if (el) el.checked = true;
        });
    }

    initSwitchListener() {
        const bindChange = (selector, handler) => {
            document
                .querySelectorAll(selector)
                .forEach((input) =>
                    input.addEventListener("change", () => handler(input))
                );
        };

        // Bind theme and layout related radios
        bindChange('input[name="data-skin"]', (input) =>
            this.changeSkin(input.value)
        );
        bindChange('input[name="data-menu-color"]', (input) =>
            this.changeMenuColor(input.value)
        );
        bindChange('input[name="data-sidenav-size"]', (input) =>
            this.changeLeftbarSize(input.value)
        );
        bindChange('input[name="data-bs-theme"]', (input) =>
            this.changeTheme(input.value)
        );
        bindChange('input[name="data-layout-position"]', (input) =>
            this.changeLayoutPosition(input.value)
        );
        bindChange('input[name="data-topbar-color"]', (input) =>
            this.changeTopbarColor(input.value)
        );
        bindChange('input[name="sidebar-user"]', (input) =>
            this.changeSidebarUser(input.checked)
        );

        const themeToggle = document.getElementById("light-dark-mode");
        if (themeToggle) {
            themeToggle.addEventListener("click", () => {
                const newTheme = this.config.theme === "light" ? "dark" : "light";
                this.changeTheme(newTheme);
            });
        }

        const resetBtn = document.querySelector("#reset-layout");
        if (resetBtn) {
            resetBtn.addEventListener("click", () => this.resetTheme());
        }

        const toggleBtn = document.querySelector(".sidenav-toggle-button");
        if (toggleBtn) {
            toggleBtn.addEventListener("click", () => this._toggleSidebar());
        }

        const closeBtn = document.querySelector(".button-close-offcanvas");
        if (closeBtn) {
            closeBtn.addEventListener("click", () => {
                this.html.classList.remove("sidebar-enable");
                this.hideBackdrop();
            });
        }

        document.querySelectorAll(".button-on-hover").forEach((el) => {
            el.addEventListener("click", () => {
                const current = this.html.getAttribute("data-sidenav-size");
                this.changeLeftbarSize(
                    current === "on-hover-active" ? "on-hover" : "on-hover-active",
                    true
                );
            });
        });
    }

    _toggleSidebar() {
        const current = this.html.getAttribute("data-sidenav-size");
        const isOffcanvas = current === "offcanvas";
        const configSize = this.config.sidenav.size;

        if (isOffcanvas) {
            this.showBackdrop();
        } else if (configSize === "compact") {
            this.changeLeftbarSize(
                current === "condensed" ? "compact" : "condensed",
                false
            );
        } else {
            this.changeLeftbarSize(
                current === "condensed" ? "default" : "condensed",
                true
            );
        }

        this.html.classList.toggle("sidebar-enable");
    }

    showBackdrop() {
        const backdrop = document.createElement("div");
        backdrop.id = "custom-backdrop";
        backdrop.className = "offcanvas-backdrop fade show";
        document.body.appendChild(backdrop);
        document.body.style.overflow = "hidden";
        if (window.innerWidth > 767) {
            document.body.style.paddingRight = "15px";
        }
        backdrop.addEventListener("click", () => {
            this.html.classList.remove("sidebar-enable");
            this.hideBackdrop();
        });
    }

    hideBackdrop() {
        const backdrop = document.getElementById("custom-backdrop");
        if (backdrop) {
            document.body.removeChild(backdrop);
            document.body.style.overflow = "";
            document.body.style.paddingRight = "";
        }
    }

    _adjustLayout() {
        const width = window.innerWidth;
        const size = this.config.sidenav.size;

        if (width <= 767.98) {
            this.changeLeftbarSize("offcanvas", false);
        } else if (width <= 1140 && !["offcanvas"].includes(size)) {
            this.changeLeftbarSize(
                size === "on-hover" ? "condensed" : "condensed",
                false
            );
        } else {
            this.changeLeftbarSize(size);
        }
    }

    initWindowSize() {
        window.addEventListener("resize", () => this._adjustLayout());
    }
}

// If you need only theme toggler not whole layout customizer, you can use this.
// Note: If you are using this, comment or remove LayoutCustomizer.

// const themeToggle = document.getElementById('light-dark-mode');
// if (themeToggle) {
//     const html = document.documentElement;
//
//     const storageKey = '__INSPINIA_CONFIG__';
//     const savedConfig = sessionStorage.getItem(storageKey);
//     const config = savedConfig ? JSON.parse(savedConfig) : {
//         theme: html.getAttribute('data-bs-theme') || 'light'
//     };
//
//     themeToggle.addEventListener('click', () => {
//         const newTheme = config.theme === 'light' ? 'dark' : 'light';
//         config.theme = newTheme;
//         html.setAttribute('data-bs-theme', newTheme);
//         sessionStorage.setItem(storageKey, JSON.stringify(config));
//     });
// }

document.addEventListener('DOMContentLoaded', function (e) {
    new App().init();
    new LayoutCustomizer().init();
});