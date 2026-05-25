const fs = require('fs');
const path = require('path');
const os = require('os');
const { addonBuilder, serveHTTP } = require('stremio-addon-sdk');

const PORT = Number(process.env.PORT || 3000);
const manifest = require('./manifest.json');

function parseMediaId(type, id) {
    if (!id || typeof id !== 'string') {
        return { mediaId: null, mediaType: type === 'series' ? 'tv' : 'movie', season: undefined, episode: undefined };
    }

    if (id.startsWith('tmdb:')) {
        const [, tmdbType, tmdbId, seasonRaw, episodeRaw] = id.split(':');
        return {
            mediaId: tmdbId || null,
            mediaType: tmdbType === 'tv' || tmdbType === 'series' ? 'tv' : 'movie',
            season: Number.isFinite(Number(seasonRaw)) ? Number(seasonRaw) : undefined,
            episode: Number.isFinite(Number(episodeRaw)) ? Number(episodeRaw) : undefined
        };
    }

    const [baseId, seasonRaw, episodeRaw] = id.split(':');
    const seriesRequest = type === 'series';
    return {
        mediaId: baseId || null,
        mediaType: seriesRequest ? 'tv' : 'movie',
        season: seriesRequest && Number.isFinite(Number(seasonRaw)) ? Number(seasonRaw) : undefined,
        episode: seriesRequest && Number.isFinite(Number(episodeRaw)) ? Number(episodeRaw) : undefined
    };
}

function toStremioStream(providerName, stream) {
    if (!stream || typeof stream.url !== 'string' || !stream.url) {
        return null;
    }

    const titleParts = [stream.title, stream.quality].filter(Boolean);
    const behaviorHints = stream.headers
        ? { proxyHeaders: { request: stream.headers } }
        : undefined;

    return {
        name: stream.name || providerName,
        title: titleParts.length > 0 ? titleParts.join(' • ') : providerName,
        url: stream.url,
        behaviorHints
    };
}

function loadProviders() {
    const registryPath = path.join(__dirname, 'providers.json');
    if (!fs.existsSync(registryPath)) {
        return [];
    }

    const providers = JSON.parse(fs.readFileSync(registryPath, 'utf8'));
    return providers
        .filter((provider) => provider.enabled && provider.filename)
        .map((provider) => {
            const providerPath = path.resolve(__dirname, provider.filename);
            if (!providerPath.startsWith(__dirname)) {
                return null;
            }

            if (!fs.existsSync(providerPath)) {
                console.warn(`[Addon] Missing provider file: ${provider.filename}`);
                return null;
            }

            const providerModule = require(providerPath);
            if (typeof providerModule.getStreams !== 'function') {
                console.warn(`[Addon] Provider "${provider.id}" has no getStreams export`);
                return null;
            }

            return {
                id: provider.id,
                name: provider.name || provider.id,
                getStreams: providerModule.getStreams
            };
        })
        .filter(Boolean);
}

function getLocalIp() {
    const interfaces = os.networkInterfaces();
    for (const name of Object.keys(interfaces)) {
        for (const iface of interfaces[name]) {
            if (iface.family === 'IPv4' && !iface.internal) {
                return iface.address;
            }
        }
    }
    return 'localhost';
}

const providers = loadProviders();
const builder = new addonBuilder(manifest);

builder.defineStreamHandler(async ({ type, id }) => {
    if (!['movie', 'series'].includes(type)) {
        return { streams: [] };
    }

    const { mediaId, mediaType, season, episode } = parseMediaId(type, id);
    if (!mediaId) {
        return { streams: [] };
    }

    const streamsByProvider = await Promise.all(
        providers.map(async (provider) => {
            try {
                const result = await provider.getStreams(mediaId, mediaType, season, episode);
                if (!Array.isArray(result)) {
                    return [];
                }
                return result
                    .map((stream) => toStremioStream(provider.name, stream))
                    .filter(Boolean);
            } catch (error) {
                console.error(`[Addon] Provider "${provider.id}" failed: ${error.message}`);
                return [];
            }
        })
    );

    return { streams: streamsByProvider.flat() };
});

serveHTTP(builder.getInterface(), { port: PORT });
setTimeout(() => {
    const ip = getLocalIp();
    console.log(`\n🚀 Server running at: http://${ip}:${PORT}/`);
    console.log(`🧩 Addon Manifest:   http://${ip}:${PORT}/manifest.json`);
    console.log('Press Ctrl+C to stop\n');
}, 100);
