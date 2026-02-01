/**
 * WSLProxy Cache Test Client Script
 * This JavaScript file should be cached by the proxy with Cache-Control: public, max-age=31536000
 */

(function() {
  'use strict';

  console.log('[Cache Test] JavaScript loaded at:', new Date().toISOString());

  // Log cache-related headers if available
  if (window.performance && performance.getEntriesByType) {
    const resources = performance.getEntriesByType('resource');
    resources.forEach(resource => {
      if (resource.name.includes('/static/')) {
        console.log('[Cache Test] Resource:', resource.name, 'Duration:', resource.duration.toFixed(2) + 'ms');
      }
    });
  }

  // Add cache status indicator to the page
  document.addEventListener('DOMContentLoaded', function() {
    const indicator = document.createElement('div');
    indicator.style.cssText = `
      position: fixed;
      bottom: 20px;
      right: 20px;
      background: #6366f1;
      color: white;
      padding: 10px 20px;
      border-radius: 8px;
      font-size: 14px;
      box-shadow: 0 4px 6px rgba(0,0,0,0.1);
    `;
    indicator.textContent = 'JS Loaded: ' + new Date().toLocaleTimeString();
    document.body.appendChild(indicator);
  });
})();
