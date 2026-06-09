/**
 * Template Name: INSPINIA - Multipurpose Admin & Dashboard Template
 * By (Author): WebAppLayers
 * Module/App (File Name): Auth Password
 * Version: 4.2.0
 */

class PasswordAuth {
    constructor() {
        this.barCount = 4;
    }

    init() {
        this.initPasswordStrengthBars();
    }

    // Find all wrappers and initialize
    initPasswordStrengthBars() {
        document.querySelectorAll('[data-password="bar"]').forEach(wrapper => {
            const input = wrapper.querySelector('input[type="password"]');
            const barContainer = wrapper.querySelector('.password-bar');

            if (!input || !barContainer) {
                console.warn('Auth: Missing input or .password-bar in', wrapper);
                return;
            }

            this.renderBars(barContainer);
            const bars = barContainer.querySelectorAll('.strong-bar');

            input.addEventListener('input', () => {
                const score = this.getPasswordScore(input.value);
                this.updateBarUI(bars, score);
            });
        });
    }

    // Create N strength bars
    renderBars(container) {
        container.innerHTML = '';
        for (let i = 0; i < this.barCount; i++) {
            const bar = document.createElement('div');
            bar.classList.add('strong-bar');
            container.appendChild(bar);
        }
    }

    // Evaluate password and return score from 0–4
    getPasswordScore(password) {
        let score = 0;
        if (password.length >= 8) score++;
        if (/[A-Z]/.test(password)) score++;
        if (/\d/.test(password)) score++;
        if (/[\W_]/.test(password)) score++;
        return score;
    }

    // Update the visual state of the bars
    updateBarUI(bars, score) {
        bars.forEach((bar, i) => {
            bar.className = 'strong-bar';
            if (i < score) {
                bar.classList.add(`bar-active-${score}`);
            }
        });
    }
}

document.addEventListener("DOMContentLoaded", () => {
    new PasswordAuth().init()
})
