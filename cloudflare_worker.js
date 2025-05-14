/**
 * Cloudflare Worker for TOTP Extension Sync with R2
 */

// The filename in R2 where the backup will be stored.
// For multi-user systems, you'd make this user-specific.
const R2_BACKUP_KEY = 'totp_backup.json';

export default {
  async fetch(request, env, ctx) {
    // env.R2_BUCKET: Contains the R2 binding
    // env.API_TOKEN: Contains the secret API token

    // --- CORS Headers ---
    // Allows requests from your Chrome extension's origin (and potentially others during development)
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*', // Be more specific in production, e.g., 'chrome-extension://YOUR_EXTENSION_ID'
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-API-Token', // Allow your chosen auth header
    };

    // --- Handle CORS Preflight Requests ---
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    // --- Authentication ---
    // Expect token in 'X-API-Token' header (adjust if using 'Authorization: Bearer')
    const receivedToken = request.headers.get('X-API-Token');
    if (!receivedToken || receivedToken !== env.API_TOKEN) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // --- Routing ---
    const url = new URL(request.url);

    try {
      // --- Backup Endpoint ---
      if (url.pathname === '/backup' && request.method === 'POST') {
        // Ensure content type is JSON
        if (request.headers.get('Content-Type') !== 'application/json') {
          return new Response(JSON.stringify({ error: 'Expected Content-Type: application/json' }), {
             status: 415, // Unsupported Media Type
             headers: { ...corsHeaders, 'Content-Type': 'application/json' },
           });
        }

        const backupData = await request.text(); // Get raw text to store directly

        // Validate if it's somewhat valid JSON (basic check)
        try {
            JSON.parse(backupData); // Try parsing
        } catch (e) {
            return new Response(JSON.stringify({ error: 'Invalid JSON data received in request body' }), {
                status: 400, // Bad Request
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            });
        }


        await env.R2_BUCKET.put(R2_BACKUP_KEY, backupData, {
          httpMetadata: { contentType: 'application/json' },
        });

        return new Response(JSON.stringify({ success: true, message: 'Backup successful' }), {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // --- Restore Endpoint ---
      if (url.pathname === '/restore' && request.method === 'GET') {
        const object = await env.R2_BUCKET.get(R2_BACKUP_KEY);

        if (object === null) {
          return new Response(JSON.stringify({ error: `Backup file '${R2_BACKUP_KEY}' not found in R2 bucket.` }), {
            status: 404, // Not Found
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }

        // Return the content directly from R2
        const headers = new Headers(corsHeaders);
        object.writeHttpMetadata(headers); // Copies Content-Type etc. from R2 object
        headers.set('etag', object.httpEtag);
        headers.set('Content-Type', 'application/json'); // Ensure correct content type

        return new Response(object.body, {
          headers,
        });
      }

      // --- Route Not Found ---
      return new Response(JSON.stringify({ error: 'Not Found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });

    } catch (error) {
      console.error('Worker Error:', error);
      return new Response(JSON.stringify({ error: 'Internal Server Error', details: error.message }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
  },
};