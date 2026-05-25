# Nuvio Providers → Stremio Addon

This repository now runs as a **Stremio addon** and reuses provider modules that expose:

```js
module.exports = { getStreams }
```

## Run locally

```bash
npm ci
npm start
```

Manifest URL:

```text
http://localhost:3000/manifest.json
```

Add this URL in Stremio to test locally.

## Provider registry

Enabled providers are listed in `./providers.json`.

Each enabled entry must point to a file that exports:

```js
async function getStreams(mediaId, mediaType, season, episode) {
  return [
    {
      name: "Provider Name",
      title: "1080p",
      url: "https://...",
      quality: "1080p",
      headers: {
        Referer: "https://source.site"
      }
    }
  ];
}
```

The addon maps these into Stremio stream objects.

## Build source providers

```bash
# Build all source providers from src/<provider>/ to providers/<provider>.js
npm run build

# Build one provider
node build.js <provider-name>
```
