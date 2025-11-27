// Simple analytics tracker
(function() {
    'use strict';

    // Don't track if user is the admin (checking localhost or create.html)
    if (window.location.hostname === 'localhost' ||
        window.location.pathname.includes('create.html') ||
        window.location.pathname.includes('analytics.html')) {
        return;
    }

    // Track page view
    function trackView() {
        const data = {
            page: window.location.pathname + window.location.search,
            referrer: document.referrer,
            userAgent: navigator.userAgent
        };

        // Send to tracking function (fire and forget)
        fetch('/.netlify/functions/track-view', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        }).catch(err => {
            // Silently fail - don't interrupt user experience
            console.log('Analytics tracking failed:', err);
        });
    }

    // Track when page loads
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', trackView);
    } else {
        trackView();
    }
})();
