# LocalWave

LocalWave is a Spotify-like offline music library for your own local audio files.

## Features

- Import MP3/audio files or a full local music folder
- Store tracks offline in browser IndexedDB
- Read MP3 ID3 metadata for title, artist, album, genre, duration, and album art
- Search and filter by genre
- Like songs
- Create local playlists
- Play/pause, skip, shuffle, seek, and adjust volume

## Local Setup

```bash
npm install
npm run dev
```

Then open `http://localhost:3000`.

## Installable PWA

LocalWave includes a web app manifest and service worker, so it can be installed from mobile browsers after deployment.

## GitHub Pages Deploy

This project is configured for static export and GitHub Pages.

If your repo URL will be `https://brianfeb82.github.io/Local-Wave/`, keep this workflow value:

```yaml
NEXT_PUBLIC_BASE_PATH: /Local-Wave
```

If your repo name is different, update `.github/workflows/deploy-pages.yml` to match:

```yaml
NEXT_PUBLIC_BASE_PATH: /your-repo-name
```

Deploy steps:

1. Push this folder to GitHub.
2. In the repository, open **Settings > Pages**.
3. Set **Build and deployment > Source** to **GitHub Actions**.
4. Push to `main` or run the workflow manually.
5. Open the deployed URL on your phone.
4. Use the browser menu and choose **Add to Home Screen** or **Install App**.

## Notes

LocalWave does not scrape or download music from streaming platforms. It only imports files you already have on your device and keeps them in local browser storage.

If you deploy this app, your music files still do not automatically sync between devices. Import songs again on each device where you want offline playback.
