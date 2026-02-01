const express = require('express');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware to log all incoming headers
app.use((req, res, next) => {
  const timestamp = new Date().toISOString();
  console.log('\n' + '='.repeat(80));
  console.log(`[${timestamp}] ${req.method} ${req.url}`);
  console.log('-'.repeat(40) + ' REQUEST HEADERS ' + '-'.repeat(23));
  Object.entries(req.headers).forEach(([key, value]) => {
    console.log(`  ${key}: ${value}`);
  });
  console.log('='.repeat(80));
  next();
});

// Add response header logging
app.use((req, res, next) => {
  const originalSend = res.send.bind(res);
  res.send = function(body) {
    console.log('-'.repeat(40) + ' RESPONSE HEADERS ' + '-'.repeat(22));
    Object.entries(res.getHeaders()).forEach(([key, value]) => {
      console.log(`  ${key}: ${value}`);
    });
    console.log('-'.repeat(80));
    return originalSend(body);
  };
  next();
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'healthy', timestamp: new Date().toISOString() });
});

// Echo all headers back as JSON
app.get('/echo-headers', (req, res) => {
  res.json({
    method: req.method,
    url: req.url,
    headers: req.headers,
    timestamp: new Date().toISOString()
  });
});

// ============================================================================
// CACHEABLE STATIC ASSETS - Should be cached by WSLProxy
// ============================================================================

// CSS with long cache (1 year)
app.get('/static/css/:file', (req, res) => {
  res.set({
    'Content-Type': 'text/css',
    'Cache-Control': 'public, max-age=31536000, immutable',
    'X-Cache-Test': 'css-public-immutable'
  });
  const filePath = path.join(__dirname, 'static/css', req.params.file);
  if (fs.existsSync(filePath)) {
    res.sendFile(filePath);
  } else {
    res.send(`/* Generated CSS: ${req.params.file} */\nbody { margin: 0; padding: 20px; font-family: sans-serif; }`);
  }
});

// JavaScript with long cache (1 year)
app.get('/static/js/:file', (req, res) => {
  res.set({
    'Content-Type': 'application/javascript',
    'Cache-Control': 'public, max-age=31536000, immutable',
    'X-Cache-Test': 'js-public-immutable'
  });
  const filePath = path.join(__dirname, 'static/js', req.params.file);
  if (fs.existsSync(filePath)) {
    res.sendFile(filePath);
  } else {
    res.send(`// Generated JS: ${req.params.file}\nconsole.log("Cache test JS loaded");`);
  }
});

// Images with long cache (1 year)
app.get('/static/images/:file', (req, res) => {
  const ext = path.extname(req.params.file).toLowerCase();
  const contentTypes = {
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.gif': 'image/gif',
    '.svg': 'image/svg+xml',
    '.webp': 'image/webp',
    '.ico': 'image/x-icon'
  };

  res.set({
    'Content-Type': contentTypes[ext] || 'application/octet-stream',
    'Cache-Control': 'public, max-age=31536000, immutable',
    'X-Cache-Test': 'image-public-immutable'
  });

  const filePath = path.join(__dirname, 'static/images', req.params.file);
  if (fs.existsSync(filePath)) {
    res.sendFile(filePath);
  } else {
    // Return a simple SVG placeholder
    res.set('Content-Type', 'image/svg+xml');
    res.send(`<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200">
      <rect width="200" height="200" fill="#6366f1"/>
      <text x="50%" y="50%" text-anchor="middle" fill="white" font-size="16">
        ${req.params.file}
      </text>
    </svg>`);
  }
});

// ============================================================================
// CACHE CONTROL TEST ENDPOINTS
// ============================================================================

// Public cache - should be cached
app.get('/cache/public', (req, res) => {
  res.set({
    'Content-Type': 'application/json',
    'Cache-Control': 'public, max-age=3600',
    'X-Cache-Test': 'public-1hour'
  });
  res.json({ type: 'public', maxAge: 3600, timestamp: new Date().toISOString() });
});

// Private cache - should NOT be cached by proxy
app.get('/cache/private', (req, res) => {
  res.set({
    'Content-Type': 'application/json',
    'Cache-Control': 'private, max-age=3600',
    'X-Cache-Test': 'private-nocache-at-proxy'
  });
  res.json({ type: 'private', note: 'Should not be cached by proxy', timestamp: new Date().toISOString() });
});

// No-store - should NEVER be cached
app.get('/cache/no-store', (req, res) => {
  res.set({
    'Content-Type': 'application/json',
    'Cache-Control': 'no-store, no-cache, must-revalidate',
    'X-Cache-Test': 'no-store-never-cache'
  });
  res.json({ type: 'no-store', note: 'Should never be cached', timestamp: new Date().toISOString() });
});

// No-cache - should revalidate on every request
app.get('/cache/no-cache', (req, res) => {
  res.set({
    'Content-Type': 'application/json',
    'Cache-Control': 'no-cache',
    'ETag': `"${Date.now()}"`,
    'X-Cache-Test': 'no-cache-revalidate'
  });
  res.json({ type: 'no-cache', note: 'Should revalidate every request', timestamp: new Date().toISOString() });
});

// Short TTL - 10 seconds
app.get('/cache/short-ttl', (req, res) => {
  res.set({
    'Content-Type': 'application/json',
    'Cache-Control': 'public, max-age=10',
    'X-Cache-Test': 'short-ttl-10s'
  });
  res.json({ type: 'short-ttl', maxAge: 10, timestamp: new Date().toISOString() });
});

// Long TTL - 1 day
app.get('/cache/long-ttl', (req, res) => {
  res.set({
    'Content-Type': 'application/json',
    'Cache-Control': 'public, max-age=86400',
    'X-Cache-Test': 'long-ttl-1day'
  });
  res.json({ type: 'long-ttl', maxAge: 86400, timestamp: new Date().toISOString() });
});

// S-MaxAge override - proxy cache differs from browser cache
app.get('/cache/s-maxage', (req, res) => {
  res.set({
    'Content-Type': 'application/json',
    'Cache-Control': 'public, max-age=60, s-maxage=3600',
    'X-Cache-Test': 's-maxage-1hour-browser-1min'
  });
  res.json({ type: 's-maxage', browserMaxAge: 60, proxyMaxAge: 3600, timestamp: new Date().toISOString() });
});

// Stale-while-revalidate
app.get('/cache/stale-while-revalidate', (req, res) => {
  res.set({
    'Content-Type': 'application/json',
    'Cache-Control': 'public, max-age=60, stale-while-revalidate=300',
    'X-Cache-Test': 'stale-while-revalidate'
  });
  res.json({ type: 'stale-while-revalidate', maxAge: 60, staleFor: 300, timestamp: new Date().toISOString() });
});

// ============================================================================
// DYNAMIC CACHE CONTROL - Set via query params
// ============================================================================

app.get('/cache/custom', (req, res) => {
  const cacheControl = req.query.cc || 'public, max-age=60';
  const contentType = req.query.type || 'application/json';

  res.set({
    'Content-Type': contentType,
    'Cache-Control': cacheControl,
    'X-Cache-Test': 'custom-cache-control',
    'X-Cache-Control-Used': cacheControl
  });

  res.json({
    type: 'custom',
    cacheControl: cacheControl,
    contentType: contentType,
    timestamp: new Date().toISOString(),
    usage: 'GET /cache/custom?cc=public,max-age=120&type=application/json'
  });
});

// ============================================================================
// VARY HEADER TESTS
// ============================================================================

app.get('/cache/vary-accept', (req, res) => {
  const accept = req.headers.accept || 'application/json';
  res.set({
    'Content-Type': 'application/json',
    'Cache-Control': 'public, max-age=3600',
    'Vary': 'Accept',
    'X-Cache-Test': 'vary-accept'
  });
  res.json({ type: 'vary-accept', acceptHeader: accept, timestamp: new Date().toISOString() });
});

app.get('/cache/vary-encoding', (req, res) => {
  res.set({
    'Content-Type': 'application/json',
    'Cache-Control': 'public, max-age=3600',
    'Vary': 'Accept-Encoding',
    'X-Cache-Test': 'vary-encoding'
  });
  res.json({ type: 'vary-encoding', timestamp: new Date().toISOString() });
});

// ============================================================================
// CONDITIONAL REQUEST TESTS (ETag/Last-Modified)
// ============================================================================

const staticContent = { data: 'This is static content for conditional requests' };
const staticEtag = '"static-etag-12345"';
const staticLastModified = 'Wed, 01 Jan 2025 00:00:00 GMT';

app.get('/cache/etag', (req, res) => {
  const ifNoneMatch = req.headers['if-none-match'];

  if (ifNoneMatch === staticEtag) {
    res.status(304).end();
    return;
  }

  res.set({
    'Content-Type': 'application/json',
    'Cache-Control': 'public, max-age=0, must-revalidate',
    'ETag': staticEtag,
    'X-Cache-Test': 'etag-conditional'
  });
  res.json({ ...staticContent, timestamp: new Date().toISOString() });
});

app.get('/cache/last-modified', (req, res) => {
  const ifModifiedSince = req.headers['if-modified-since'];

  if (ifModifiedSince === staticLastModified) {
    res.status(304).end();
    return;
  }

  res.set({
    'Content-Type': 'application/json',
    'Cache-Control': 'public, max-age=0, must-revalidate',
    'Last-Modified': staticLastModified,
    'X-Cache-Test': 'last-modified-conditional'
  });
  res.json({ ...staticContent, timestamp: new Date().toISOString() });
});

// ============================================================================
// AUTOMATION TEST SUITE ENDPOINT
// ============================================================================

app.get('/test-suite', (req, res) => {
  res.set({
    'Content-Type': 'application/json',
    'Cache-Control': 'no-store'
  });

  res.json({
    name: 'WSLProxy Cache Test Suite',
    endpoints: {
      static: {
        css: '/static/css/style.css',
        js: '/static/js/app.js',
        image: '/static/images/test.png'
      },
      cacheControl: {
        public: '/cache/public',
        private: '/cache/private',
        noStore: '/cache/no-store',
        noCache: '/cache/no-cache',
        shortTtl: '/cache/short-ttl',
        longTtl: '/cache/long-ttl',
        sMaxAge: '/cache/s-maxage',
        staleWhileRevalidate: '/cache/stale-while-revalidate',
        custom: '/cache/custom?cc=public,max-age=300'
      },
      vary: {
        accept: '/cache/vary-accept',
        encoding: '/cache/vary-encoding'
      },
      conditional: {
        etag: '/cache/etag',
        lastModified: '/cache/last-modified'
      },
      utility: {
        health: '/health',
        echoHeaders: '/echo-headers'
      }
    },
    expectedBehavior: {
      shouldCache: ['/static/*', '/cache/public', '/cache/long-ttl', '/cache/s-maxage'],
      shouldNotCache: ['/cache/private', '/cache/no-store'],
      shouldRevalidate: ['/cache/no-cache', '/cache/etag', '/cache/last-modified']
    }
  });
});

// Serve index page
app.get('/', (req, res) => {
  res.set({
    'Content-Type': 'text/html',
    'Cache-Control': 'no-cache'
  });
  res.send(`<!DOCTYPE html>
<html>
<head>
  <title>WSLProxy Cache Test Origin</title>
  <link rel="stylesheet" href="/static/css/style.css">
</head>
<body>
  <h1>WSLProxy Cache Test Origin Server</h1>
  <p>This server provides endpoints for testing cache behavior.</p>

  <h2>Quick Links</h2>
  <ul>
    <li><a href="/test-suite">Test Suite (JSON)</a> - All available endpoints</li>
    <li><a href="/echo-headers">Echo Headers</a> - See what headers we receive</li>
    <li><a href="/health">Health Check</a></li>
  </ul>

  <h2>Static Assets (Cacheable)</h2>
  <ul>
    <li><a href="/static/css/style.css">CSS</a> - Cache-Control: public, max-age=31536000</li>
    <li><a href="/static/js/app.js">JavaScript</a> - Cache-Control: public, max-age=31536000</li>
    <li><a href="/static/images/test.png">Image</a> - Cache-Control: public, max-age=31536000</li>
  </ul>

  <h2>Cache Control Tests</h2>
  <ul>
    <li><a href="/cache/public">Public</a> - Should be cached by proxy</li>
    <li><a href="/cache/private">Private</a> - Should NOT be cached by proxy</li>
    <li><a href="/cache/no-store">No-Store</a> - Should NEVER be cached</li>
    <li><a href="/cache/no-cache">No-Cache</a> - Should revalidate</li>
    <li><a href="/cache/short-ttl">Short TTL (10s)</a></li>
    <li><a href="/cache/long-ttl">Long TTL (1 day)</a></li>
    <li><a href="/cache/s-maxage">S-MaxAge</a> - Different proxy vs browser cache</li>
    <li><a href="/cache/custom?cc=public,max-age=120">Custom Cache-Control</a></li>
  </ul>

  <h2>Test Image</h2>
  <img src="/static/images/logo.svg" alt="Test Logo" width="200">

  <script src="/static/js/app.js"></script>
</body>
</html>`);
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`
╔═══════════════════════════════════════════════════════════════════════════════╗
║                     WSLProxy Cache Test Origin Server                         ║
╠═══════════════════════════════════════════════════════════════════════════════╣
║  Server running on port ${PORT}                                                  ║
║  All incoming request headers will be logged below                            ║
╚═══════════════════════════════════════════════════════════════════════════════╝

Endpoints:
  GET /                    - Index page
  GET /test-suite          - All endpoints as JSON
  GET /echo-headers        - Echo request headers
  GET /health              - Health check

  Static (Cacheable):
  GET /static/css/:file    - CSS files
  GET /static/js/:file     - JavaScript files
  GET /static/images/:file - Image files

  Cache Control Tests:
  GET /cache/public        - public, max-age=3600
  GET /cache/private       - private (no proxy cache)
  GET /cache/no-store      - no-store (never cache)
  GET /cache/no-cache      - no-cache (revalidate)
  GET /cache/short-ttl     - public, max-age=10
  GET /cache/long-ttl      - public, max-age=86400
  GET /cache/s-maxage      - s-maxage for proxy
  GET /cache/custom?cc=... - Custom cache-control

Waiting for requests...
`);
});
