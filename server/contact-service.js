'use strict';

/**
 * Contact form endpoint for the landing page.
 *
 * Listens on 127.0.0.1 only; nginx proxies POST /api/contact to it.
 * No dependencies -- node:http plus the global fetch (Node 18+).
 *
 * Delivery channels are configured in the env file (see contact.env.example).
 * Set CHANNELS to pick explicitly, or leave it empty to auto-enable every
 * channel whose credentials are present.
 */

const http = require('node:http');

const PORT = Number(process.env.PORT || 8787);
const HOST = process.env.HOST || '127.0.0.1';

const TELEGRAM_BOT_TOKEN = (process.env.TELEGRAM_BOT_TOKEN || '').trim();
const TELEGRAM_CHAT_ID = (process.env.TELEGRAM_CHAT_ID || '').trim();
const RESEND_API_KEY = (process.env.RESEND_API_KEY || '').trim();
const MAIL_TO = (process.env.MAIL_TO || '').trim();
const MAIL_FROM = (process.env.MAIL_FROM || 'Portfolio Contact <onboarding@resend.dev>').trim();

const RATE_LIMIT_MAX = Number(process.env.RATE_LIMIT_MAX || 5);
const RATE_LIMIT_WINDOW_MS = Number(process.env.RATE_LIMIT_WINDOW_MS || 60 * 60 * 1000);

const MAX_BODY_BYTES = 32 * 1024;
const SEND_TIMEOUT_MS = 10000;

const LIMITS = {
    name: 100,
    email: 200,
    subject: 150,
    message: 5000,
};

const CHANNEL_CONFIGURED = {
    telegram: Boolean(TELEGRAM_BOT_TOKEN && TELEGRAM_CHAT_ID),
    email: Boolean(RESEND_API_KEY && MAIL_TO),
};

function resolveChannels() {
    const requested = (process.env.CHANNELS || '')
        .split(',')
        .map((c) => c.trim().toLowerCase())
        .filter(Boolean);

    if (requested.length === 0) {
        return Object.keys(CHANNEL_CONFIGURED).filter((c) => CHANNEL_CONFIGURED[c]);
    }

    const enabled = [];
    for (const channel of requested) {
        if (!(channel in CHANNEL_CONFIGURED)) {
            log('warn', `unknown channel in CHANNELS: ${channel}`);
        } else if (!CHANNEL_CONFIGURED[channel]) {
            log('warn', `channel "${channel}" is requested but its credentials are missing -- skipping`);
        } else {
            enabled.push(channel);
        }
    }
    return enabled;
}

const CHANNELS = resolveChannels();

function log(level, message) {
    process.stdout.write(`[${level}] ${message}\n`);
}

/* ---------- rate limiting (in-memory, per IP) ---------- */

const hits = new Map();

function clientIp(req) {
    const forwarded = req.headers['x-forwarded-for'];
    if (typeof forwarded === 'string' && forwarded.length > 0) {
        return forwarded.split(',')[0].trim();
    }
    return req.socket.remoteAddress || 'unknown';
}

function rateLimited(ip) {
    const now = Date.now();
    const cutoff = now - RATE_LIMIT_WINDOW_MS;

    if (hits.size > 5000) {
        for (const [key, stamps] of hits) {
            if (stamps.every((t) => t <= cutoff)) hits.delete(key);
        }
    }

    const recent = (hits.get(ip) || []).filter((t) => t > cutoff);
    if (recent.length >= RATE_LIMIT_MAX) {
        hits.set(ip, recent);
        return true;
    }

    recent.push(now);
    hits.set(ip, recent);
    return false;
}

/* ---------- validation ---------- */

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

function validate(payload) {
    const clean = {};
    for (const [field, max] of Object.entries(LIMITS)) {
        const raw = payload[field];
        if (typeof raw !== 'string') return { error: `Missing field: ${field}` };
        const value = raw.trim();
        if (value.length === 0) return { error: `Missing field: ${field}` };
        if (value.length > max) return { error: `Field too long: ${field}` };
        clean[field] = value;
    }
    if (!EMAIL_RE.test(clean.email)) return { error: 'Invalid email address' };
    return { clean };
}

/* ---------- delivery ---------- */

async function sendTelegram(msg) {
    const text = [
        'New message from the portfolio contact form',
        '',
        `Name:    ${msg.name}`,
        `Email:   ${msg.email}`,
        `Subject: ${msg.subject}`,
        '',
        msg.message,
    ].join('\n');

    const res = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            chat_id: TELEGRAM_CHAT_ID,
            text,
            disable_web_page_preview: true,
        }),
        signal: AbortSignal.timeout(SEND_TIMEOUT_MS),
    });

    if (!res.ok) {
        throw new Error(`Telegram responded ${res.status}: ${(await res.text()).slice(0, 300)}`);
    }
}

async function sendEmail(msg) {
    const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${RESEND_API_KEY}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            from: MAIL_FROM,
            to: [MAIL_TO],
            reply_to: msg.email,
            subject: `[Portfolio] ${msg.subject}`,
            text: [
                `Name:  ${msg.name}`,
                `Email: ${msg.email}`,
                '',
                msg.message,
            ].join('\n'),
        }),
        signal: AbortSignal.timeout(SEND_TIMEOUT_MS),
    });

    if (!res.ok) {
        throw new Error(`Resend responded ${res.status}: ${(await res.text()).slice(0, 300)}`);
    }
}

const SENDERS = { telegram: sendTelegram, email: sendEmail };

async function deliver(msg) {
    const results = await Promise.allSettled(CHANNELS.map((c) => SENDERS[c](msg)));
    const failed = [];
    results.forEach((result, i) => {
        if (result.status === 'rejected') {
            failed.push(CHANNELS[i]);
            log('error', `${CHANNELS[i]} delivery failed: ${result.reason && result.reason.message}`);
        }
    });
    return { delivered: CHANNELS.length - failed.length, failed };
}

/* ---------- http ---------- */

function json(res, status, body) {
    const payload = JSON.stringify(body);
    res.writeHead(status, {
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Length': Buffer.byteLength(payload),
        'Cache-Control': 'no-store',
    });
    res.end(payload);
}

function readBody(req) {
    return new Promise((resolve, reject) => {
        const chunks = [];
        let size = 0;
        req.on('data', (chunk) => {
            size += chunk.length;
            if (size > MAX_BODY_BYTES) {
                reject(Object.assign(new Error('Body too large'), { status: 413 }));
                req.destroy();
                return;
            }
            chunks.push(chunk);
        });
        req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
        req.on('error', reject);
    });
}

const server = http.createServer(async (req, res) => {
    const path = (req.url || '').split('?')[0].replace(/\/+$/, '') || '/';

    if (path === '/health') {
        return json(res, 200, { ok: true, channels: CHANNELS });
    }

    if (path !== '/api/contact') {
        return json(res, 404, { ok: false, error: 'Not found' });
    }

    if (req.method !== 'POST') {
        res.setHeader('Allow', 'POST');
        return json(res, 405, { ok: false, error: 'Method not allowed' });
    }

    const ip = clientIp(req);

    let payload;
    try {
        payload = JSON.parse(await readBody(req));
    } catch (err) {
        if (err && err.status === 413) return json(res, 413, { ok: false, error: 'Message too large' });
        return json(res, 400, { ok: false, error: 'Malformed request' });
    }

    if (!payload || typeof payload !== 'object') {
        return json(res, 400, { ok: false, error: 'Malformed request' });
    }

    // Honeypot: real people never see this field, bots fill it in.
    // Answer with a normal success so the bot has nothing to learn.
    if (typeof payload.website === 'string' && payload.website.trim().length > 0) {
        log('info', `honeypot triggered from ${ip}`);
        return json(res, 200, { ok: true });
    }

    const { clean, error } = validate(payload);
    if (error) return json(res, 400, { ok: false, error });

    if (rateLimited(ip)) {
        log('warn', `rate limit hit by ${ip}`);
        return json(res, 429, { ok: false, error: 'Too many messages. Please try again later.' });
    }

    if (CHANNELS.length === 0) {
        log('error', 'message received but no delivery channel is configured');
        return json(res, 503, { ok: false, error: 'Contact form is not configured' });
    }

    const { delivered, failed } = await deliver(clean);

    if (delivered === 0) {
        return json(res, 502, { ok: false, error: 'Could not deliver the message. Please email me directly.' });
    }

    log('info', `message from ${clean.email} (${ip}) delivered via ${CHANNELS.filter((c) => !failed.includes(c)).join(', ')}`);
    return json(res, 200, { ok: true });
});

server.listen(PORT, HOST, () => {
    log('info', `contact endpoint listening on http://${HOST}:${PORT}`);
    log('info', CHANNELS.length > 0
        ? `active channels: ${CHANNELS.join(', ')}`
        : 'no active channels -- set TELEGRAM_* and/or RESEND_API_KEY + MAIL_TO');
});

for (const signal of ['SIGTERM', 'SIGINT']) {
    process.on(signal, () => {
        log('info', `${signal} received, shutting down`);
        server.close(() => process.exit(0));
    });
}
