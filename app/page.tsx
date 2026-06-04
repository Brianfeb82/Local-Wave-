"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Album,
  Disc3,
  FolderUp,
  Heart,
  ListMusic,
  Music2,
  Pause,
  Play,
  Plus,
  Search,
  Shuffle,
  SkipBack,
  SkipForward,
  Trash2,
  Upload,
  Volume2,
  X
} from "lucide-react";
import clsx from "clsx";

type Track = {
  id: string;
  title: string;
  artist: string;
  album: string;
  genre: string;
  coverArtUrl?: string;
  duration: number;
  fileName: string;
  fileType: string;
  size: number;
  addedAt: number;
  liked: boolean;
};

type Playlist = {
  id: string;
  name: string;
  trackIds: string[];
};

type StoredTrack = Track & {
  blob: Blob;
};

type ParsedMetadata = {
  title?: string;
  artist?: string;
  album?: string;
  genre?: string;
  coverArtUrl?: string;
};

const DB_NAME = "offline-music-library";
const DB_VERSION = 1;
const TRACK_STORE = "tracks";
const PLAYLIST_KEY = "offline-music-playlists";
const AUDIO_TYPES = [".mp3", ".m4a", ".aac", ".wav", ".ogg", ".flac", ".webm"];
const textDecoder = new TextDecoder();

export default function Home() {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const folderInputRef = useRef<HTMLInputElement | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const urlRef = useRef<string | null>(null);

  const [tracks, setTracks] = useState<Track[]>([]);
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [activePlaylistId, setActivePlaylistId] = useState("library");
  const [query, setQuery] = useState("");
  const [selectedGenre, setSelectedGenre] = useState("All");
  const [currentTrackId, setCurrentTrackId] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [volume, setVolume] = useState(0.82);
  const [importing, setImporting] = useState(false);
  const [status, setStatus] = useState("Import folder musik lokal untuk mulai.");
  const [newPlaylistName, setNewPlaylistName] = useState("");
  const [debugLog, setDebugLog] = useState<string[]>([]);
const addLog = (msg: string) => setDebugLog(prev => [...prev, `${new Date().toLocaleTimeString()}: ${msg}`]);

  const currentTrack = tracks.find((track) => track.id === currentTrackId) || null;
  const genres = useMemo(
    () => ["All", ...Array.from(new Set(tracks.map((track) => track.genre))).sort()],
    [tracks]
  );

  const visibleTracks = useMemo(() => {
    const playlist = playlists.find((item) => item.id === activePlaylistId);
    const activeTrackIds =
      activePlaylistId === "library" || activePlaylistId === "liked"
        ? null
        : new Set(playlist?.trackIds || []);

    return tracks
      .filter((track) => activePlaylistId !== "liked" || track.liked)
      .filter((track) => !activeTrackIds || activeTrackIds.has(track.id))
      .filter((track) => selectedGenre === "All" || track.genre === selectedGenre)
      .filter((track) => {
        const haystack = `${track.title} ${track.artist} ${track.album}`.toLowerCase();
        return haystack.includes(query.trim().toLowerCase());
      })
      .sort((a, b) => b.addedAt - a.addedAt);
  }, [activePlaylistId, playlists, query, selectedGenre, tracks]);

  const libraryStats = useMemo(() => {
    const totalSeconds = tracks.reduce((sum, track) => sum + track.duration, 0);
    const artists = new Set(tracks.map((track) => track.artist)).size;
    const albums = new Set(tracks.map((track) => track.album)).size;
    return { totalSeconds, artists, albums };
  }, [tracks]);

  useEffect(() => {
    void loadLibrary();
    const savedPlaylists = window.localStorage.getItem(PLAYLIST_KEY);
    if (savedPlaylists) {
      setPlaylists(JSON.parse(savedPlaylists) as Playlist[]);
    }
  }, []);

  useEffect(() => {
    window.localStorage.setItem(PLAYLIST_KEY, JSON.stringify(playlists));
  }, [playlists]);

  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = volume;
    }
  }, [volume]);

  async function loadLibrary() {
  try {
    addLog(`Origin: ${window.location.origin} | Path: ${window.location.pathname}`);
    addLog("Opening IndexedDB...");
    const storedTracks = await getAllTracks();
    addLog(`Found ${storedTracks.length} tracks in DB`);
    
    if (storedTracks.length > 0) {
      addLog(`First track: ${storedTracks[0].fileName}, blob size: ${storedTracks[0].blob?.size ?? "NO BLOB"}`);
    }
    
    const upgradedTracks = await Promise.all(storedTracks.map(upgradeStoredTrackMetadata));
    setTracks(upgradedTracks.map((storedTrack) => stripBlob(storedTrack)));
    if (storedTracks.length) {
      setStatus(`${storedTracks.length} lagu siap diputar offline.`);
    }
    addLog("loadLibrary done!");
  } catch (err) {
    addLog(`ERROR in loadLibrary: ${String(err)}`);
  }
}

  async function importFiles(fileList: FileList | null) {
    if (!fileList?.length) return;

    const files = Array.from(fileList).filter((file) =>
      AUDIO_TYPES.some((ext) => file.name.toLowerCase().endsWith(ext))
    );

    if (!files.length) {
      setStatus("Tidak ada file audio yang cocok di pilihan itu.");
      return;
    }

    setImporting(true);
    setStatus(`Mengimpor ${files.length} file audio...`);

    const existing = new Map(tracks.map((track) => [`${track.fileName}-${track.size}`, track]));
    const imported: Track[] = [];

    for (const file of files) {
      const key = `${file.name}-${file.size}`;
      if (existing.has(key)) continue;

      const [duration, tagMetadata] = await Promise.all([
        readDuration(file),
        readMp3Metadata(file, file.name)
      ]);
      const fallbackMetadata = inferMetadata(file);
      const metadata = {
        title: tagMetadata.title || fallbackMetadata.title,
        artist: tagMetadata.artist || fallbackMetadata.artist,
        album: tagMetadata.album || fallbackMetadata.album,
        genre: tagMetadata.genre || fallbackMetadata.genre,
        coverArtUrl: tagMetadata.coverArtUrl
      };
      const track: Track = {
        id: crypto.randomUUID(),
        title: metadata.title,
        artist: metadata.artist,
        album: metadata.album,
        genre: metadata.genre,
        coverArtUrl: metadata.coverArtUrl,
        duration,
        fileName: file.name,
        fileType: file.type || "audio/*",
        size: file.size,
        addedAt: Date.now(),
        liked: false
      };

      await saveTrack({ ...track, blob: file });
      imported.push(track);
    }

    setTracks((items) => [...imported, ...items]);
    setImporting(false);
    setStatus(
      imported.length
        ? `${imported.length} lagu berhasil disimpan offline.`
        : "Semua file pilihan sudah ada di library."
    );
  }

  async function playTrack(trackId: string) {
  try {
    addLog(`playTrack called: ${trackId}`);
    const stored = await getTrack(trackId);
    addLog(`getTrack result: ${stored ? `found, blob size: ${stored.blob?.size ?? "NO BLOB"}` : "NULL"}`);
    if (!stored) return;

    if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    const url = URL.createObjectURL(stored.blob);
    urlRef.current = url;
    setCurrentTrackId(trackId);
    setProgress(0);

    if (audioRef.current) {
      audioRef.current.src = url;
      await audioRef.current.play();
      setIsPlaying(true);
      addLog("Playback started!");
    }
  } catch (err) {
    addLog(`ERROR in playTrack: ${String(err)}`);
  }
}

  async function togglePlayback() {
    if (!audioRef.current) return;
    if (!currentTrack && visibleTracks[0]) {
      await playTrack(visibleTracks[0].id);
      return;
    }

    if (audioRef.current.paused) {
      await audioRef.current.play();
      setIsPlaying(true);
    } else {
      audioRef.current.pause();
      setIsPlaying(false);
    }
  }

  function playRelative(direction: 1 | -1) {
    if (!visibleTracks.length) return;
    const index = visibleTracks.findIndex((track) => track.id === currentTrackId);
    const nextIndex = index < 0 ? 0 : (index + direction + visibleTracks.length) % visibleTracks.length;
    void playTrack(visibleTracks[nextIndex].id);
  }

  function playRandom() {
    if (!visibleTracks.length) return;
    const next = visibleTracks[Math.floor(Math.random() * visibleTracks.length)];
    void playTrack(next.id);
  }

  async function removeTrack(trackId: string) {
    await deleteTrack(trackId);
    setTracks((items) => items.filter((track) => track.id !== trackId));
    setPlaylists((items) =>
      items.map((playlist) => ({
        ...playlist,
        trackIds: playlist.trackIds.filter((id) => id !== trackId)
      }))
    );
    if (trackId === currentTrackId) {
      audioRef.current?.pause();
      setCurrentTrackId(null);
      setIsPlaying(false);
    }
  }

  async function toggleLike(track: Track) {
    const stored = await getTrack(track.id);
    if (!stored) return;
    const updated = { ...stored, liked: !track.liked };
    await saveTrack(updated);
    setTracks((items) =>
      items.map((item) => (item.id === track.id ? { ...item, liked: !item.liked } : item))
    );
  }

  function createPlaylist() {
    const name = newPlaylistName.trim();
    if (!name) return;
    const playlist = { id: crypto.randomUUID(), name, trackIds: [] };
    setPlaylists((items) => [playlist, ...items]);
    setNewPlaylistName("");
    setActivePlaylistId(playlist.id);
  }

  function addToPlaylist(playlistId: string, trackId: string) {
    setPlaylists((items) =>
      items.map((playlist) =>
        playlist.id === playlistId && !playlist.trackIds.includes(trackId)
          ? { ...playlist, trackIds: [...playlist.trackIds, trackId] }
          : playlist
      )
    );
  }

  function removePlaylist(playlistId: string) {
    setPlaylists((items) => items.filter((playlist) => playlist.id !== playlistId));
    if (activePlaylistId === playlistId) setActivePlaylistId("library");
  }

  return (
    <main className="min-h-dvh bg-[#f5f3ee] text-[#151514]">
      <section className="grid min-h-screen grid-cols-1 lg:grid-cols-[280px_1fr]">
        <aside className="border-b border-[#d8d2c5] bg-[#23211d] p-4 text-white lg:border-b-0 lg:border-r">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-[8px] bg-[#f1b24a] text-[#17130d]">
              <Disc3 size={23} />
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#f1b24a]">Offline</p>
              <h1 className="text-2xl font-bold tracking-normal">LocalWave</h1>
            </div>
          </div>

          <div className="mt-6 grid grid-cols-3 gap-2 text-center">
            <Stat value={tracks.length.toString()} label="Tracks" />
            <Stat value={libraryStats.artists.toString()} label="Artists" />
            <Stat value={libraryStats.albums.toString()} label="Albums" />
          </div>

          <div className="mt-6 space-y-2">
            <button
              onClick={() => setActivePlaylistId("library")}
              className={clsx(
                "flex h-11 w-full items-center gap-3 rounded-[8px] px-3 text-sm font-semibold transition",
                activePlaylistId === "library" ? "bg-white text-[#191713]" : "text-[#ddd6c8] hover:bg-white/10"
              )}
            >
              <Music2 size={18} />
              Library
            </button>
            <button
              onClick={() => setActivePlaylistId("liked")}
              className={clsx(
                "flex h-11 w-full items-center gap-3 rounded-[8px] px-3 text-sm font-semibold transition",
                activePlaylistId === "liked" ? "bg-white text-[#191713]" : "text-[#ddd6c8] hover:bg-white/10"
              )}
            >
              <Heart size={18} />
              Liked Songs
            </button>
          </div>

          <div className="mt-6">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#a9a094]">Playlists</p>
              <ListMusic size={16} className="text-[#a9a094]" />
            </div>
            <div className="mt-3 flex gap-2">
              <input
                value={newPlaylistName}
                onChange={(event) => setNewPlaylistName(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") createPlaylist();
                }}
                placeholder="New playlist"
                className="h-10 min-w-0 flex-1 rounded-[8px] border border-white/10 bg-white/10 px-3 text-sm text-white outline-none ring-[#f1b24a]/20 placeholder:text-[#a9a094] focus:ring-4"
              />
              <button
                onClick={createPlaylist}
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[8px] bg-[#f1b24a] text-[#17130d]"
                aria-label="Create playlist"
                title="Create playlist"
              >
                <Plus size={18} />
              </button>
            </div>
            <div className="mt-3 space-y-1">
              {playlists.map((playlist) => (
                <div key={playlist.id} className="flex items-center gap-1">
                  <button
                    onClick={() => setActivePlaylistId(playlist.id)}
                    className={clsx(
                      "flex h-10 min-w-0 flex-1 items-center justify-between rounded-[8px] px-3 text-left text-sm font-semibold transition",
                      activePlaylistId === playlist.id
                        ? "bg-white text-[#191713]"
                        : "text-[#ddd6c8] hover:bg-white/10"
                    )}
                  >
                    <span className="truncate">{playlist.name}</span>
                    <span className="text-xs opacity-70">{playlist.trackIds.length}</span>
                  </button>
                  <button
                    onClick={() => removePlaylist(playlist.id)}
                    className="flex h-10 w-9 items-center justify-center rounded-[8px] text-[#a9a094] hover:bg-white/10 hover:text-white"
                    aria-label="Remove playlist"
                    title="Remove playlist"
                  >
                    <X size={16} />
                  </button>
                </div>
              ))}
            </div>
          </div>
        </aside>

        <section className="flex min-w-0 flex-col pb-48 sm:pb-36 lg:pb-28">
          <header className="sticky top-0 z-20 border-b border-[#d8d2c5] bg-[#f5f3ee]/90 px-4 py-4 backdrop-blur lg:px-7">
            <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
              <div>
                <p className="text-sm font-semibold text-[#8f5c18]">{status}</p>
                <h2 className="text-3xl font-bold tracking-normal">
                  {activePlaylistId === "library"
                    ? "Music Library"
                    : activePlaylistId === "liked"
                      ? "Liked Songs"
                      : playlists.find((item) => item.id === activePlaylistId)?.name || "Playlist"}
                </h2>
              </div>
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-[#81786b]" size={18} />
                  <input
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder="Search title, artist, album"
                    className="h-11 w-full rounded-[8px] border border-[#d8d2c5] bg-white pl-10 pr-3 text-sm outline-none ring-[#e2a645]/25 focus:ring-4 sm:w-72"
                  />
                </div>
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  accept="audio/*,.flac"
                  className="hidden"
                  onChange={(event) => void importFiles(event.target.files)}
                />
                <input
                  ref={folderInputRef}
                  type="file"
                  multiple
                  // @ts-expect-error Chromium folder import attribute.
                  webkitdirectory=""
                  className="hidden"
                  onChange={(event) => void importFiles(event.target.files)}
                />
                <button
                  onClick={() => fileInputRef.current?.click()}
                  disabled={importing}
                  className="inline-flex h-11 items-center justify-center gap-2 rounded-[8px] border border-[#c8bda9] bg-white px-4 text-sm font-semibold transition hover:bg-[#fffaf0] disabled:opacity-60"
                >
                  <Upload size={18} />
                  Files
                </button>
                <button
                  onClick={() => folderInputRef.current?.click()}
                  disabled={importing}
                  className="inline-flex h-11 items-center justify-center gap-2 rounded-[8px] bg-[#191713] px-4 text-sm font-semibold text-white transition hover:bg-[#302d27] disabled:opacity-60"
                >
                  <FolderUp size={18} />
                  Folder
                </button>
              </div>
            </div>
          </header>

          <div className="grid gap-5 px-4 py-5 lg:grid-cols-[1fr_300px] lg:px-7">
            <section className="min-w-0">
              <div className="mb-4 flex gap-2 overflow-x-auto pb-1">
                {genres.map((genre) => (
                  <button
                    key={genre}
                    onClick={() => setSelectedGenre(genre)}
                    className={clsx(
                      "h-9 shrink-0 rounded-[8px] border px-3 text-sm font-semibold",
                      selectedGenre === genre
                        ? "border-[#191713] bg-[#191713] text-white"
                        : "border-[#d8d2c5] bg-white text-[#514b42]"
                    )}
                  >
                    {genre}
                  </button>
                ))}
              </div>

              <div className="overflow-hidden rounded-[8px] border border-[#d8d2c5] bg-white">
                <div className="grid grid-cols-[44px_1fr_160px_90px_130px] gap-3 border-b border-[#ece5d8] px-4 py-3 text-xs font-semibold uppercase tracking-[0.12em] text-[#81786b] max-md:hidden">
                  <span>#</span>
                  <span>Title</span>
                  <span>Album</span>
                  <span>Time</span>
                  <span>Actions</span>
                </div>
                {visibleTracks.length ? (
                  visibleTracks.map((track, index) => (
                    <TrackRow
                      key={track.id}
                      index={index}
                      track={track}
                      playlists={playlists}
                      active={track.id === currentTrackId}
                      onPlay={() => void playTrack(track.id)}
                      onLike={() => void toggleLike(track)}
                      onRemove={() => void removeTrack(track.id)}
                      onAddToPlaylist={addToPlaylist}
                    />
                  ))
                ) : (
                  <div className="flex min-h-[420px] flex-col items-center justify-center px-5 text-center">
                    <div className="flex h-16 w-16 items-center justify-center rounded-[8px] bg-[#f1b24a]/20 text-[#8f5c18]">
                      <Album size={30} />
                    </div>
                    <h3 className="mt-4 text-xl font-bold">Belum ada lagu di sini</h3>
                    <p className="mt-2 max-w-md text-sm leading-6 text-[#676056]">
                      Import file atau folder musik lokal. File audio disimpan di browser storage,
                      jadi library tetap bisa diputar offline setelah reload.
                    </p>
                  </div>
                )}
              </div>
            </section>

            <aside className="space-y-4">
              <div className="rounded-[8px] border border-[#d8d2c5] bg-white p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#81786b]">Now Playing</p>
                <div className="mt-4 flex aspect-square items-center justify-center rounded-[8px] bg-[#23211d] text-[#f1b24a]">
                  <CoverArt track={currentTrack} size="large" spinning={isPlaying} />
                </div>
                <h3 className="mt-4 truncate text-lg font-bold">{currentTrack?.title || "Nothing playing"}</h3>
                <p className="truncate text-sm text-[#676056]">{currentTrack?.artist || "Pick a track"}</p>
                <p className="mt-4 text-sm leading-6 text-[#676056]">
                  Total library: {formatDuration(libraryStats.totalSeconds)} dari {tracks.length} lagu.
                </p>
              </div>

              <div className="rounded-[8px] border border-[#d8d2c5] bg-white p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#81786b]">Offline Notes</p>
                <ul className="mt-3 space-y-2 text-sm leading-6 text-[#514b42]">
                  <li>Metadata dasar dibaca dari pola nama file seperti Artist - Title.</li>
                  <li>Playlist tersimpan lokal di browser.</li>
                  <li>Tidak mengambil audio dari Spotify atau layanan streaming.</li>
                </ul>
              </div>
            </aside>
          </div>
        </section>
      </section>

      <footer className="fixed inset-x-0 bottom-0 z-30 border-t border-[#d8d2c5] bg-[#fffaf0] px-4 pb-[calc(0.75rem+env(safe-area-inset-bottom))] pt-3 shadow-[0_-10px_30px_rgba(25,23,19,0.08)]">
        <div className="mx-auto grid max-w-7xl gap-3 lg:grid-cols-[1fr_420px_1fr] lg:items-center">
          <div className="min-w-0">
            <div className="flex min-w-0 items-center gap-3">
              <CoverArt track={currentTrack} size="small" />
              <div className="min-w-0">
                <p className="truncate font-semibold">{currentTrack?.title || "Ready to play"}</p>
                <p className="truncate text-sm text-[#676056]">
                  {currentTrack?.artist || "Import local music first"}
                </p>
              </div>
            </div>
          </div>

          <div>
            <div className="flex items-center justify-center gap-2">
              <button onClick={playRandom} className="player-button" aria-label="Shuffle" title="Shuffle">
                <Shuffle size={18} />
              </button>
              <button onClick={() => playRelative(-1)} className="player-button" aria-label="Previous" title="Previous">
                <SkipBack size={18} />
              </button>
              <button
                onClick={() => void togglePlayback()}
                className="flex h-11 w-11 items-center justify-center rounded-full bg-[#191713] text-white"
                aria-label={isPlaying ? "Pause" : "Play"}
                title={isPlaying ? "Pause" : "Play"}
              >
                {isPlaying ? <Pause size={20} /> : <Play size={20} className="ml-0.5" />}
              </button>
              <button onClick={() => playRelative(1)} className="player-button" aria-label="Next" title="Next">
                <SkipForward size={18} />
              </button>
            </div>
            <div className="mt-2 flex items-center gap-2 text-xs text-[#676056]">
              <span>{formatDuration(progress)}</span>
              <input
                type="range"
                min={0}
                max={currentTrack?.duration || 0}
                value={progress}
                onChange={(event) => {
                  const next = Number(event.target.value);
                  setProgress(next);
                  if (audioRef.current) audioRef.current.currentTime = next;
                }}
                className="h-2 flex-1 accent-[#f1b24a]"
              />
              <span>{formatDuration(currentTrack?.duration || 0)}</span>
            </div>
          </div>

          <div className="hidden items-center justify-start gap-2 sm:flex lg:justify-end">
            <Volume2 size={18} className="text-[#676056]" />
            <input
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={volume}
              onChange={(event) => setVolume(Number(event.target.value))}
              className="w-36 accent-[#f1b24a]"
              aria-label="Volume"
            />
          </div>
        </div>
      </footer>

      <audio
        ref={audioRef}
        onTimeUpdate={(event) => setProgress(event.currentTarget.currentTime)}
        onEnded={() => playRelative(1)}
        onPause={() => setIsPlaying(false)}
        onPlay={() => setIsPlaying(true)}
      />
      {debugLog.length > 0 && (
  <div className="fixed top-0 left-0 right-0 z-50 max-h-64 overflow-y-auto bg-black/90 p-3 text-xs text-green-400 font-mono">
    <button 
      onClick={() => setDebugLog([])} 
      className="mb-2 rounded bg-red-600 px-2 py-1 text-white text-xs"
    >
      Clear Log
    </button>
    {debugLog.map((log, i) => <div key={i}>{log}</div>)}
  </div>
)}
    </main>
  );
}

function TrackRow({
  index,
  track,
  playlists,
  active,
  onPlay,
  onLike,
  onRemove,
  onAddToPlaylist
}: {
  index: number;
  track: Track;
  playlists: Playlist[];
  active: boolean;
  onPlay: () => void;
  onLike: () => void;
  onRemove: () => void;
  onAddToPlaylist: (playlistId: string, trackId: string) => void;
}) {
  return (
    <div
      className={clsx(
        "grid gap-3 border-b border-[#f0eadf] px-4 py-3 last:border-b-0 md:grid-cols-[44px_1fr_160px_90px_130px] md:items-center",
        active ? "bg-[#fff3d7]" : "hover:bg-[#fbf8f1]"
      )}
    >
      <button
        onClick={onPlay}
        className="hidden h-9 w-9 items-center justify-center rounded-[8px] bg-[#191713] text-white md:flex"
        aria-label={`Play ${track.title}`}
        title={`Play ${track.title}`}
      >
        {active ? <Pause size={16} /> : <Play size={16} className="ml-0.5" />}
      </button>

      <div className="flex min-w-0 items-center gap-3">
        <button
          onClick={onPlay}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[8px] bg-[#191713] text-white md:hidden"
          aria-label={`Play ${track.title}`}
          title={`Play ${track.title}`}
        >
          <Play size={16} className="ml-0.5" />
        </button>
        <CoverArt track={track} size="row" />
        <div className="min-w-0">
          <p className="truncate font-semibold">{track.title}</p>
          <p className="truncate text-sm text-[#676056]">
            {index + 1}. {track.artist}
          </p>
        </div>
      </div>

      <p className="truncate text-sm text-[#676056]">{track.album}</p>
      <p className="text-sm text-[#676056]">{formatDuration(track.duration)}</p>

      <div className="flex items-center gap-1">
        <button
          onClick={onLike}
          className={clsx("icon-button", track.liked && "text-[#b5442f]")}
          aria-label="Like"
          title="Like"
        >
          <Heart size={17} fill={track.liked ? "currentColor" : "none"} />
        </button>
        <select
          onChange={(event) => {
            if (event.target.value) onAddToPlaylist(event.target.value, track.id);
            event.currentTarget.value = "";
          }}
          className="h-9 min-w-0 rounded-[8px] border border-[#d8d2c5] bg-white px-2 text-xs outline-none"
          aria-label="Add to playlist"
          defaultValue=""
        >
          <option value="">Playlist</option>
          {playlists.map((playlist) => (
            <option key={playlist.id} value={playlist.id}>
              {playlist.name}
            </option>
          ))}
        </select>
        <button onClick={onRemove} className="icon-button" aria-label="Remove" title="Remove">
          <Trash2 size={17} />
        </button>
      </div>
    </div>
  );
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div className="rounded-[8px] border border-white/10 bg-white/10 p-2">
      <p className="text-lg font-bold">{value}</p>
      <p className="text-xs text-[#cfc6b7]">{label}</p>
    </div>
  );
}

function CoverArt({
  track,
  size,
  spinning = false
}: {
  track: Pick<Track, "title" | "coverArtUrl"> | null;
  size: "small" | "row" | "large";
  spinning?: boolean;
}) {
  const classes = {
    small: "h-11 w-11",
    row: "h-11 w-11",
    large: "h-full w-full"
  };

  if (track?.coverArtUrl) {
    return (
      <div
        aria-label={track.title}
        className={clsx(classes[size], "shrink-0 rounded-[8px] bg-cover bg-center")}
        style={{ backgroundImage: `url(${track.coverArtUrl})` }}
      />
    );
  }

  return (
    <div
      className={clsx(
        classes[size],
        "flex shrink-0 items-center justify-center rounded-[8px] bg-[#23211d] text-[#f1b24a]"
      )}
    >
      <Disc3 className={clsx(spinning && "animate-spin")} size={size === "large" ? 86 : 22} />
    </div>
  );
}

function inferMetadata(file: File) {
  const path = "webkitRelativePath" in file ? String(file.webkitRelativePath || "") : "";
  const folders = path.split("/").filter(Boolean);
  const rawName = file.name.replace(/\.[^/.]+$/, "");
  const parts = rawName.split(" - ").map((part) => part.trim()).filter(Boolean);

  return {
    title: parts.length >= 2 ? parts.slice(1).join(" - ") : rawName,
    artist: parts.length >= 2 ? parts[0] : "Unknown Artist",
    album: folders.length >= 2 ? folders[folders.length - 2] : "Local Imports",
    genre: folders.length >= 3 ? folders[folders.length - 3] : "Unsorted"
  };
}

async function readMp3Metadata(file: Blob, fileName: string): Promise<ParsedMetadata> {
  if (!fileName.toLowerCase().endsWith(".mp3") && file.type !== "audio/mpeg") return {};

  const header = new Uint8Array(await file.slice(0, 10).arrayBuffer());
  if (header.length < 10 || textDecoder.decode(header.slice(0, 3)) !== "ID3") return {};

  const majorVersion = header[3];
  if (majorVersion < 2 || majorVersion > 4) return {};

  const tagSize = readSynchsafeInteger(header, 6);
  if (tagSize <= 0) return {};

  const tagBytes = new Uint8Array(await file.slice(10, 10 + tagSize).arrayBuffer());
  return parseId3Frames(tagBytes, majorVersion);
}

function parseId3Frames(bytes: Uint8Array, majorVersion: number): ParsedMetadata {
  const metadata: ParsedMetadata = {};
  let offset = 0;

  while (offset + 10 <= bytes.length) {
    const frameId = textDecoder.decode(bytes.slice(offset, offset + 4)).replace(/\0/g, "");
    if (!frameId.trim()) break;

    const size =
      majorVersion === 4
        ? readSynchsafeInteger(bytes, offset + 4)
        : readBigEndianInteger(bytes, offset + 4, 4);

    if (size <= 0 || offset + 10 + size > bytes.length) break;

    const frameData = bytes.slice(offset + 10, offset + 10 + size);
    if (frameId === "TIT2") metadata.title = readTextFrame(frameData);
    if (frameId === "TPE1") metadata.artist = readTextFrame(frameData);
    if (frameId === "TALB") metadata.album = readTextFrame(frameData);
    if (frameId === "TCON") metadata.genre = cleanGenre(readTextFrame(frameData));
    if (frameId === "APIC" && !metadata.coverArtUrl) {
      metadata.coverArtUrl = readPictureFrame(frameData);
    }

    offset += 10 + size;
  }

  return metadata;
}

function readTextFrame(frameData: Uint8Array) {
  if (!frameData.length) return undefined;
  const encoding = frameData[0];
  const content = frameData.slice(1);

  if (encoding === 1 || encoding === 2) {
    return decodeUtf16(content);
  }

  return textDecoder.decode(content).replace(/\0/g, "").trim() || undefined;
}

function readPictureFrame(frameData: Uint8Array) {
  if (frameData.length < 5) return undefined;
  const encoding = frameData[0];
  let cursor = 1;

  const mimeEnd = frameData.indexOf(0, cursor);
  if (mimeEnd < 0) return undefined;
  const mimeType = textDecoder.decode(frameData.slice(cursor, mimeEnd)) || "image/jpeg";
  cursor = mimeEnd + 2;

  const terminator = findTextTerminator(frameData, cursor, encoding);
  if (terminator < 0) return undefined;
  cursor = terminator + (encoding === 1 || encoding === 2 ? 2 : 1);

  const imageBytes = frameData.slice(cursor);
  if (!imageBytes.length) return undefined;
  return `data:${mimeType};base64,${bytesToBase64(imageBytes)}`;
}

function readSynchsafeInteger(bytes: Uint8Array, offset: number) {
  return (
    ((bytes[offset] & 0x7f) << 21) |
    ((bytes[offset + 1] & 0x7f) << 14) |
    ((bytes[offset + 2] & 0x7f) << 7) |
    (bytes[offset + 3] & 0x7f)
  );
}

function readBigEndianInteger(bytes: Uint8Array, offset: number, length: number) {
  let value = 0;
  for (let index = 0; index < length; index += 1) {
    value = (value << 8) + bytes[offset + index];
  }
  return value;
}

function decodeUtf16(bytes: Uint8Array) {
  if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe) {
    return new TextDecoder("utf-16le").decode(bytes.slice(2)).replace(/\0/g, "").trim() || undefined;
  }
  if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) {
    return new TextDecoder("utf-16be").decode(bytes.slice(2)).replace(/\0/g, "").trim() || undefined;
  }
  return new TextDecoder("utf-16").decode(bytes).replace(/\0/g, "").trim() || undefined;
}

function findTextTerminator(bytes: Uint8Array, start: number, encoding: number) {
  if (encoding === 1 || encoding === 2) {
    for (let index = start; index + 1 < bytes.length; index += 2) {
      if (bytes[index] === 0 && bytes[index + 1] === 0) return index;
    }
    return -1;
  }
  return bytes.indexOf(0, start);
}

function cleanGenre(genre?: string) {
  return genre?.replace(/^\((\d+)\)/, "").trim() || undefined;
}

function bytesToBase64(bytes: Uint8Array) {
  let binary = "";
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    const chunk = bytes.slice(offset, offset + chunkSize);
    binary += String.fromCharCode(...chunk);
  }
  return btoa(binary);
}

function readDuration(file: Blob) {
  return new Promise<number>((resolve) => {
    const audio = document.createElement("audio");
    const url = URL.createObjectURL(file);
    audio.preload = "metadata";
    audio.src = url;
    audio.onloadedmetadata = () => {
      URL.revokeObjectURL(url);
      resolve(Number.isFinite(audio.duration) ? audio.duration : 0);
    };
    audio.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(0);
    };
  });
}

function formatDuration(seconds: number) {
  if (!Number.isFinite(seconds) || seconds <= 0) return "0:00";
  const rounded = Math.floor(seconds);
  const minutes = Math.floor(rounded / 60);
  const remainder = String(rounded % 60).padStart(2, "0");
  return `${minutes}:${remainder}`;
}

function stripBlob({ blob, ...track }: StoredTrack) {
  void blob;
  return track;
}

async function upgradeStoredTrackMetadata(track: StoredTrack) {
  const tagMetadata = await readMp3Metadata(track.blob, track.fileName);
  const duration = track.duration || (await readDuration(track.blob));
  const upgradedTrack = {
    ...track,
    title: tagMetadata.title || track.title,
    artist: tagMetadata.artist || track.artist,
    album: tagMetadata.album || track.album,
    genre: tagMetadata.genre || track.genre,
    coverArtUrl: tagMetadata.coverArtUrl || track.coverArtUrl,
    duration
  };

  if (
    upgradedTrack.title !== track.title ||
    upgradedTrack.artist !== track.artist ||
    upgradedTrack.album !== track.album ||
    upgradedTrack.genre !== track.genre ||
    upgradedTrack.coverArtUrl !== track.coverArtUrl ||
    upgradedTrack.duration !== track.duration
  ) {
    await saveTrack(upgradedTrack);
  }

  return upgradedTrack;
}

function openDb() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(TRACK_STORE)) {
        db.createObjectStore(TRACK_STORE, { keyPath: "id" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function saveTrack(track: StoredTrack) {
  const db = await openDb();
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction(TRACK_STORE, "readwrite");
    tx.objectStore(TRACK_STORE).put(track);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function getTrack(id: string) {
  const db = await openDb();
  return new Promise<StoredTrack | null>((resolve, reject) => {
    const tx = db.transaction(TRACK_STORE, "readonly");
    const request = tx.objectStore(TRACK_STORE).get(id);
    request.onsuccess = () => resolve((request.result as StoredTrack | undefined) || null);
    request.onerror = () => reject(request.error);
  });
}

async function getAllTracks() {
  const db = await openDb();
  return new Promise<StoredTrack[]>((resolve, reject) => {
    const tx = db.transaction(TRACK_STORE, "readonly");
    const request = tx.objectStore(TRACK_STORE).getAll();
    request.onsuccess = () => resolve(request.result as StoredTrack[]);
    request.onerror = () => reject(request.error);
  });
}

async function deleteTrack(id: string) {
  const db = await openDb();
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction(TRACK_STORE, "readwrite");
    tx.objectStore(TRACK_STORE).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}
