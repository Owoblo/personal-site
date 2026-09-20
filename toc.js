// Table of contents sidebar for article pages.
//
// On wide screens (>=1100px) this builds a sticky "Contents" sidebar from the
// article's <h2> subheadings, Dario-style, with scroll-spy highlighting of the
// section currently in view. On narrow screens it stays out of the way and the
// page renders exactly as before.
//
// Works for both prerendered /post/<slug>/ pages (article already in the DOM)
// and the post.html fallback (article injected later by blog.js).
(function () {
    'use strict';

    var MIN_HEADINGS = 2;
    var WIDE_QUERY = '(min-width: 1100px)';

    function cleanLabel(text) {
        return String(text || '')
            .replace(/[*_~`#]+/g, '') // strip leftover markdown markers in headings
            .replace(/\s+/g, ' ')
            .trim();
    }

    function slugify(text) {
        return cleanLabel(text)
            .toLowerCase()
            .replace(/[''"]/g, '')
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-+|-+$/g, '')
            .slice(0, 60);
    }

    function buildToc() {
        // Only on article pages, only on wide screens, only once.
        if (document.body.classList.contains('has-toc')) return true;
        if (!document.getElementById('post-content')) return false;
        if (!window.matchMedia(WIDE_QUERY).matches) return false;

        var article = document.querySelector('#post-content article');
        if (!article) return false;

        var body = article.querySelector('.post-body');
        if (!body) return false;

        var headings = Array.prototype.filter.call(
            body.querySelectorAll('h2'),
            function (h) { return cleanLabel(h.textContent).length > 0; }
        );
        if (headings.length < MIN_HEADINGS) return false;

        // Give every heading a stable, unique id.
        headings.forEach(function (h, i) {
            if (h.id) return;
            var base = slugify(h.textContent) || 'section-' + (i + 1);
            var id = base;
            var n = 1;
            while (document.getElementById(id)) {
                n += 1;
                id = base + '-' + n;
            }
            h.id = id;
        });

        // Build the sidebar.
        var aside = document.createElement('aside');
        aside.className = 'post-toc';
        aside.setAttribute('aria-label', 'Table of contents');

        var title = document.createElement('p');
        title.className = 'post-toc-title';
        title.textContent = 'Contents';
        aside.appendChild(title);

        var list = document.createElement('ol');
        var linkById = {};
        headings.forEach(function (h, i) {
            var li = document.createElement('li');
            var a = document.createElement('a');
            a.href = '#' + h.id;
            a.textContent = (i + 1) + '. ' + cleanLabel(h.textContent);
            a.addEventListener('click', function (e) {
                e.preventDefault();
                var target = document.getElementById(h.id);
                if (target) {
                    target.scrollIntoView({ behavior: 'smooth', block: 'start' });
                }
                if (history.replaceState) {
                    history.replaceState(null, '', '#' + h.id);
                }
            });
            li.appendChild(a);
            list.appendChild(li);
            linkById[h.id] = a;
        });
        aside.appendChild(list);

        // Two-column layout: TOC on the left, article on the right.
        var postContent = document.getElementById('post-content');
        var layout = document.createElement('div');
        layout.className = 'post-layout';
        postContent.parentNode.insertBefore(layout, postContent);
        layout.appendChild(aside);
        layout.appendChild(postContent);
        document.body.classList.add('has-toc');

        // Scroll-spy: highlight the section nearest the top of the viewport.
        var current = null;
        function setActive(id) {
            var next = linkById[id] || null;
            if (next === current) return;
            if (current) current.classList.remove('is-active');
            current = next;
            if (current) current.classList.add('is-active');
        }

        if ('IntersectionObserver' in window) {
            var observer = new IntersectionObserver(
                function (entries) {
                    entries.forEach(function (entry) {
                        if (entry.isIntersecting) setActive(entry.target.id);
                    });
                },
                { rootMargin: '-15% 0px -75% 0px' }
            );
            headings.forEach(function (h) { observer.observe(h); });
        }

        return true;
    }

    function init() {
        if (buildToc()) return;

        // The post.html fallback renders the article asynchronously via
        // blog.js, so watch for it and build the TOC once it lands.
        var postContent = document.getElementById('post-content');
        if (!postContent || !('MutationObserver' in window)) return;

        var observer = new MutationObserver(function () {
            if (buildToc()) observer.disconnect();
        });
        observer.observe(postContent, { childList: true, subtree: true });

        // Stop watching after 15s; some pages never render an article.
        setTimeout(function () { observer.disconnect(); }, 15000);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
