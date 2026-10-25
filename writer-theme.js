// Use the same preference as the public site, before the page paints.
(function () {
    const root = document.documentElement;
    const system = window.matchMedia('(prefers-color-scheme: dark)');
    let savedTheme;
    try { savedTheme = localStorage.getItem('theme'); } catch (_) {}

    function applyTheme(dark) {
        root.classList.toggle('u-mode-invert', dark);
        document.querySelectorAll('[data-writer-theme]').forEach((toggle) => {
            toggle.checked = dark;
        });
    }

    function preferredDark() {
        return savedTheme === 'dark' || (savedTheme !== 'light' && system.matches);
    }

    applyTheme(preferredDark());
    document.addEventListener('DOMContentLoaded', () => {
        applyTheme(preferredDark());
        document.querySelectorAll('[data-writer-theme]').forEach((toggle) => {
            toggle.addEventListener('change', () => {
                savedTheme = toggle.checked ? 'dark' : 'light';
                try { localStorage.setItem('theme', savedTheme); } catch (_) {}
                applyTheme(toggle.checked);
            });
        });
    });
    system.addEventListener('change', () => {
        if (savedTheme !== 'dark' && savedTheme !== 'light') applyTheme(system.matches);
    });
    window.addEventListener('storage', (event) => {
        if (event.key === 'theme') {
            savedTheme = event.newValue;
            applyTheme(preferredDark());
        }
    });
})();
