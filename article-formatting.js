// One article representation for writing, previewing, and saving: semantic HTML.
(function () {
    const markdown = window.markdownit({ html: false, breaks: true, linkify: false, typographer: false });
    const plainText = new window.TurndownService({
        headingStyle: 'atx', bulletListMarker: '-', emDelimiter: '*',
        strongDelimiter: '**', codeBlockStyle: 'fenced'
    });
    plainText.addRule('strikethrough', {
        filter: ['s', 'del', 'strike'],
        replacement: (content) => `~~${content}~~`
    });
    // A nested ordered list starting above 1 needs a blank line in CommonMark.
    plainText.addRule('lists', {
        filter: ['ul', 'ol'],
        replacement: (content) => `\n\n${content}\n\n`
    });

    function sanitize(html) {
        const container = document.createElement('div');
        container.innerHTML = String(html || '');
        container.querySelectorAll('script, style, iframe, object, embed, template').forEach((node) => node.remove());
        const allowed = new Set(['P', 'BR', 'H2', 'H3', 'STRONG', 'B', 'EM', 'I', 'S', 'DEL', 'BLOCKQUOTE', 'UL', 'OL', 'LI', 'A', 'IMG', 'PRE', 'CODE', 'HR']);
        // Walk children first so formatting survives when a pasted wrapper is unwrapped.
        Array.from(container.querySelectorAll('*')).reverse().forEach((element) => {
            if (/^H[1456]$/.test(element.tagName)) {
                const heading = document.createElement(element.tagName === 'H1' ? 'h2' : 'h3');
                heading.append(...element.childNodes);
                element.replaceWith(heading);
                element = heading;
            }
            if (!allowed.has(element.tagName)) {
                element.replaceWith(...element.childNodes);
                return;
            }
            const href = element.getAttribute('href') || '';
            const src = element.getAttribute('src') || '';
            const alt = element.getAttribute('alt') || '';
            const start = element.getAttribute('start');
            Array.from(element.attributes).forEach((attribute) => element.removeAttribute(attribute.name));
            if (element.tagName === 'A' && /^(https?:\/\/|mailto:|\/(?!\/)|#)/i.test(href)) element.setAttribute('href', href);
            if (element.tagName === 'OL' && /^\d+$/.test(start || '')) element.setAttribute('start', start);
            if (element.tagName === 'IMG') {
                if (/^(https:\/\/|\/images\/)/i.test(src)) {
                    element.setAttribute('src', src);
                    element.setAttribute('alt', alt);
                    element.setAttribute('loading', 'lazy');
                } else element.remove();
            }
        });
        // Browsers repair invalid block nesting; remove empty wrappers left by that repair.
        container.querySelectorAll('p').forEach((p) => {
            if (!p.textContent.trim() && !p.querySelector('img, br')) p.remove();
        });
        return container.innerHTML;
    }

    window.ArticleFormatting = {
        sanitize,
        toText: (html) => plainText.turndown(sanitize(html)),
        toHtml: (text) => sanitize(markdown.render(String(text || ''))),
        fromGenerated: (content) => /<(?:p|h[1-6]|blockquote|ul|ol|pre)\b/i.test(content)
            ? sanitize(content) : sanitize(markdown.render(String(content || '')))
    };
})();
