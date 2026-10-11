import { useState, useRef, useEffect } from 'react';
import { 
  Upload, 
  X, 
  FolderOpen, 
  Check, 
  Keyboard, 
  Tag, 
  FileAudio,
  Music2,
  Search,
  Play,
  Square,
  Sparkles,
  ExternalLink,
  Plus
} from 'lucide-react';
import { SoundCategory, SoundItem, SpotifyTrack } from '../types/sound';
import { spotifyService } from '../utils/spotifyService';

interface AddSoundModalProps {
  onClose: () => void;
  onAddSound: (newSound: Omit<SoundItem, 'id' | 'addedAt'>) => void;
  isElectron: boolean;
  onOpenElectronFilePicker?: () => Promise<void>;
  existingSoundCount?: number;
}

export function AddSoundModal({
  onClose,
  onAddSound,
  isElectron,
  onOpenElectronFilePicker,
  existingSoundCount = 8
}: AddSoundModalProps) {
  const [activeTab, setActiveTab] = useState<'local' | 'spotify'>('local');

  // Local Sound State
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState<SoundCategory>('Meme & Eğlence');
  const [hotkey, setHotkey] = useState(`F${(existingSoundCount % 12) + 1}`);
  const [dataUrl, setDataUrl] = useState<string | undefined>(undefined);
  const [fileName, setFileName] = useState('');
  const [duration, setDuration] = useState(2.0);
  const [synthPreset, setSynthPreset] = useState<string | undefined>(undefined);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Spotify Search State
  const [spotifySearchQuery, setSpotifySearchQuery] = useState('');
  const [spotifyResults, setSpotifyResults] = useState<SpotifyTrack[]>([]);
  const [isSearchingSpotify, setIsSearchingSpotify] = useState(false);
  const [spotifySearchError, setSpotifySearchError] = useState<string | null>(null);
  const [previewTrackId, setPreviewTrackId] = useState<string | null>(null);
  const [spotifyCustomUrl, setSpotifyCustomUrl] = useState('');
  const [spotifyCustomTitle, setSpotifyCustomTitle] = useState('');
  const [spotifyCustomHotkey, setSpotifyCustomHotkey] = useState(`F${(existingSoundCount % 12) + 1}`);

  const previewAudioRef = useRef<HTMLAudioElement | null>(null);

  const spotifyState = spotifyService.getState();

  const categories: SoundCategory[] = [
    'Meme & Eğlence',
    'Oyun SFX',
    'Reaksiyon',
    'Anime & Dizi',
    'Özel',
    'Spotify'
  ];

  const presetCatalog = [
    { name: 'MLG Airhorn', preset: 'airhorn', dur: 1.4, cat: 'Meme & Eğlence' as SoundCategory },
    { name: 'Hitmarker COD', preset: 'hitmarker', dur: 0.2, cat: 'Oyun SFX' as SoundCategory },
    { name: '808 Sub Boom', preset: '808boom', dur: 2.4, cat: 'Reaksiyon' as SoundCategory },
    { name: 'Level Up', preset: 'levelup', dur: 1.1, cat: 'Oyun SFX' as SoundCategory },
    { name: 'Bruh Effect', preset: 'bruh', dur: 0.9, cat: 'Meme & Eğlence' as SoundCategory },
    { name: 'Sci-Fi Laser', preset: 'laser', dur: 0.5, cat: 'Oyun SFX' as SoundCategory },
    { name: 'Coin Chime', preset: 'coin', dur: 0.6, cat: 'Oyun SFX' as SoundCategory },
    { name: 'Stadyum Alkış', preset: 'applause', dur: 2.0, cat: 'Reaksiyon' as SoundCategory },
  ];

  useEffect(() => {
    return () => {
      if (previewAudioRef.current) {
        previewAudioRef.current.pause();
      }
    };
  }, []);

  const handleFileProcess = (file: File) => {
    if (!file) return;
    setFileName(file.name);
    if (!title) {
      setTitle(file.name.replace(/\.[^/.]+$/, ''));
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      const result = e.target?.result as string;
      setDataUrl(result);
      setSynthPreset(undefined);

      const audio = new Audio(result);
      audio.onloadedmetadata = () => {
        setDuration(Math.max(0.5, audio.duration || 2.0));
      };
    };
    reader.readAsDataURL(file);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFileProcess(e.dataTransfer.files[0]);
    }
  };

  const handleSelectPreset = (p: typeof presetCatalog[0]) => {
    setTitle(p.name);
    setCategory(p.cat);
    setDuration(p.dur);
    setSynthPreset(p.preset);
    setDataUrl(undefined);
    setFileName(`Dahili: ${p.name}`);
  };

  const handleLocalSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title) return;

    onAddSound({
      title,
      category,
      hotkey: hotkey.toUpperCase() || 'F9',
      duration,
      volume: 1.0,
      isFavorite: false,
      loop: false,
      playMode: 'overlap',
      dataUrl,
      synthPreset
    });
    onClose();
  };

  // Spotify Search Handler
  const handleSearchSpotify = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!spotifySearchQuery.trim()) return;

    setIsSearchingSpotify(true);
    setSpotifySearchError(null);
    try {
      const tracks = await spotifyService.searchTracks(spotifySearchQuery);
      setSpotifyResults(tracks);
      if (tracks.length === 0) {
        setSpotifySearchError('Aramanızla eşleşen Spotify şarkısı bulunamadı.');
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setSpotifySearchError(msg);
    } finally {
      setIsSearchingSpotify(false);
    }
  };

  const handleTogglePreview = (track: SpotifyTrack) => {
    if (previewTrackId === track.id) {
      if (previewAudioRef.current) {
        previewAudioRef.current.pause();
      }
      setPreviewTrackId(null);
      return;
    }

    if (previewAudioRef.current) {
      previewAudioRef.current.pause();
    }

    if (track.preview_url) {
      previewAudioRef.current = new Audio(track.preview_url);
      previewAudioRef.current.onended = () => setPreviewTrackId(null);
      previewAudioRef.current.play();
      setPreviewTrackId(track.id);
    } else {
      // Open in Spotify web if no 30s preview
      window.open(track.uri, '_blank');
    }
  };

  const handleAddSpotifyTrack = (track: SpotifyTrack) => {
    const artists = track.artists.map((a) => a.name).join(', ');
    const albumCover = track.album.images?.[0]?.url;
    const durSec = Math.round(track.duration_ms / 1000);

    onAddSound({
      title: track.name,
      category: 'Spotify',
      hotkey: hotkey.toUpperCase() || 'F9',
      duration: durSec,
      volume: 1.0,
      isFavorite: false,
      loop: false,
      playMode: 'overlap',
      spotifyUri: track.uri,
      spotifyTrackId: track.id,
      spotifyArtist: artists,
      spotifyAlbumCover: albumCover,
      spotifyPreviewUrl: track.preview_url || undefined,
    });
    onClose();
  };

  const handleAddCustomSpotifyLink = (e: React.FormEvent) => {
    e.preventDefault();
    if (!spotifyCustomUrl.trim()) return;

    // Parse track ID or URI
    let trackUri = spotifyCustomUrl.trim();
    let trackId = '';
    if (trackUri.includes('open.spotify.com/track/')) {
      const match = trackUri.match(/track\/([a-zA-Z0-9]+)/);
      if (match && match[1]) {
        trackId = match[1];
        trackUri = `spotify:track:${trackId}`;
      }
    } else if (trackUri.startsWith('spotify:track:')) {
      trackId = trackUri.replace('spotify:track:', '');
    }

    onAddSound({
      title: spotifyCustomTitle.trim() || 'Spotify Şarkısı',
      category: 'Spotify',
      hotkey: spotifyCustomHotkey.toUpperCase() || 'F9',
      duration: 180,
      volume: 1.0,
      isFavorite: false,
      loop: false,
      playMode: 'overlap',
      spotifyUri: trackUri,
      spotifyTrackId: trackId || undefined,
      spotifyArtist: 'Spotify',
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
      <div className="w-full max-w-xl bg-[#0a0a0a] border border-zinc-800 rounded-xl p-5 flex flex-col gap-4 max-h-[90vh] overflow-y-auto shadow-2xl">
        {/* Header & Mode Switcher */}
        <div className="flex items-center justify-between pb-3 border-b border-zinc-800/80">
          <div className="flex items-center gap-1.5 p-0.5 rounded-lg bg-zinc-950 border border-zinc-800">
            <button
              onClick={() => setActiveTab('local')}
              className={`flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-medium transition-colors cursor-pointer ${
                activeTab === 'local'
                  ? 'bg-zinc-800 text-white shadow-sm'
                  : 'text-zinc-400 hover:text-white'
              }`}
            >
              <FileAudio className="w-3.5 h-3.5" />
              <span>Yerel Dosya & SFX</span>
            </button>
            <button
              onClick={() => setActiveTab('spotify')}
              className={`flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-semibold transition-colors cursor-pointer ${
                activeTab === 'spotify'
                  ? 'bg-[#1db954] text-black shadow-sm'
                  : 'text-zinc-400 hover:text-white'
              }`}
            >
              <Music2 className="w-3.5 h-3.5" />
              <span>Spotify&apos;dan Ekle</span>
            </button>
          </div>

          <button
            onClick={onClose}
            className="p-1 rounded-md text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* TAB 1: SPOTIFY TAB */}
        {activeTab === 'spotify' && (
          <div className="flex flex-col gap-4">
            {spotifyState.isConnected ? (
              <>
                {/* Search Bar */}
                <form onSubmit={handleSearchSpotify} className="flex gap-2">
                  <div className="relative flex-1">
                    <Search className="w-3.5 h-3.5 text-zinc-500 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      value={spotifySearchQuery}
                      onChange={(e) => setSpotifySearchQuery(e.target.value)}
                      placeholder="Spotify'da şarkı veya sanatçı ara (örn: Dua Lipa, Blinding Lights)..."
                      className="w-full bg-zinc-950 border border-zinc-800 rounded-lg pl-9 pr-3 py-2 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-[#1db954]"
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={isSearchingSpotify || !spotifySearchQuery.trim()}
                    className="px-4 py-2 rounded-lg bg-[#1db954] hover:bg-[#1ed760] disabled:opacity-50 text-black text-xs font-semibold transition-colors shrink-0 cursor-pointer"
                  >
                    {isSearchingSpotify ? 'Aranıyor...' : 'Ara'}
                  </button>
                </form>

                {/* Default Hotkey selector for added tracks */}
                <div className="flex items-center justify-between p-2.5 rounded-lg bg-zinc-950 border border-zinc-800 text-xs">
                  <span className="text-zinc-400">Atanacak Kısayol Tuşu:</span>
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      value={hotkey}
                      onChange={(e) => setHotkey(e.target.value.toUpperCase())}
                      placeholder="F9"
                      className="w-20 px-2 py-1 bg-zinc-900 border border-zinc-700 rounded text-xs font-mono text-center text-white focus:outline-none focus:border-[#1db954]"
                    />
                  </div>
                </div>

                {spotifySearchError && (
                  <p className="text-xs text-rose-400 bg-rose-950/30 border border-rose-800/80 p-2.5 rounded-lg">
                    {spotifySearchError}
                  </p>
                )}

                {/* Search Results list */}
                {spotifyResults.length > 0 && (
                  <div className="flex flex-col gap-1.5 max-h-72 overflow-y-auto pr-1">
                    {spotifyResults.map((track) => {
                      const isPreviewPlaying = previewTrackId === track.id;
                      const artists = track.artists.map((a) => a.name).join(', ');
                      const albumImg = track.album.images?.[0]?.url;
                      const minutes = Math.floor(track.duration_ms / 60000);
                      const seconds = Math.floor((track.duration_ms % 60000) / 1000)
                        .toString()
                        .padStart(2, '0');

                      return (
                        <div
                          key={track.id}
                          className="flex items-center justify-between gap-3 p-2 rounded-lg bg-zinc-950 border border-zinc-800/80 hover:border-zinc-700 transition-colors"
                        >
                          <div className="flex items-center gap-2.5 min-w-0">
                            {albumImg ? (
                              <img
                                src={albumImg}
                                alt={track.name}
                                className="w-10 h-10 rounded object-cover shrink-0 border border-zinc-800"
                              />
                            ) : (
                              <div className="w-10 h-10 rounded bg-zinc-800 flex items-center justify-center shrink-0">
                                <Music2 className="w-4 h-4 text-zinc-500" />
                              </div>
                            )}
                            <div className="min-w-0">
                              <p className="text-xs font-medium text-white truncate">
                                {track.name}
                              </p>
                              <p className="text-[11px] text-zinc-400 truncate">
                                {artists} · {minutes}:{seconds}
                              </p>
                            </div>
                          </div>

                          <div className="flex items-center gap-1.5 shrink-0">
                            {track.preview_url && (
                              <button
                                type="button"
                                onClick={() => handleTogglePreview(track)}
                                title={isPreviewPlaying ? 'Önizlemeyi Durdur' : '30s Önizleme Dinle'}
                                className={`p-1.5 rounded-md border text-xs transition-colors cursor-pointer ${
                                  isPreviewPlaying
                                    ? 'bg-rose-950 border-rose-700 text-rose-300'
                                    : 'bg-zinc-900 border-zinc-800 text-zinc-300 hover:text-white hover:bg-zinc-800'
                                }`}
                              >
                                {isPreviewPlaying ? (
                                  <Square className="w-3.5 h-3.5" />
                                ) : (
                                  <Play className="w-3.5 h-3.5 fill-current" />
                                )}
                              </button>
                            )}

                            <button
                              type="button"
                              onClick={() => handleAddSpotifyTrack(track)}
                              className="flex items-center gap-1 px-2.5 py-1.5 rounded-md bg-[#1db954] hover:bg-[#1ed760] text-black text-xs font-semibold transition-colors cursor-pointer"
                            >
                              <Plus className="w-3.5 h-3.5 stroke-[2.5]" />
                              <span>Ekle</span>
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </>
            ) : (
              /* Spotify is not connected yet prompt */
              <div className="flex flex-col gap-4 p-4 rounded-xl bg-zinc-950 border border-zinc-800/80">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-[#1db954]/10 border border-[#1db954]/30 flex items-center justify-center text-[#1db954] shrink-0">
                    <Music2 className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-xs font-semibold text-white">
                      Spotify Hesabınızı Henüz Bağlamadınız
                    </h3>
                    <p className="text-[11px] text-zinc-400">
                      Şarkıları doğrudan arayıp eklemek için Ayarlar sekmesinden Spotify bağlantısını kurabilirsiniz.
                    </p>
                  </div>
                </div>

                <div className="p-3 rounded-lg bg-zinc-900 border border-zinc-800 text-xs flex items-center justify-between">
                  <span>Client ID ayarlayıp 1 tıkla Spotify ile bağlanın:</span>
                  <button
                    onClick={() => {
                      onClose();
                      // Trigger settings tab
                      const settingsTabBtn = document.querySelector('[data-tab="settings"]') as HTMLButtonElement | null;
                      if (settingsTabBtn) settingsTabBtn.click();
                    }}
                    className="px-3 py-1.5 rounded-md bg-[#1db954] hover:bg-[#1ed760] text-black text-xs font-semibold transition-colors"
                  >
                    Ayarlar&apos;a Git
                  </button>
                </div>

                {/* Direct link paste fallback */}
                <div className="pt-3 border-t border-zinc-800/80 flex flex-col gap-2.5">
                  <span className="text-[11px] font-semibold text-zinc-300">
                    Veya Doğrudan Spotify Şarkı Linki / URI Yapıştırın:
                  </span>
                  <form onSubmit={handleAddCustomSpotifyLink} className="flex flex-col gap-2">
                    <input
                      type="text"
                      value={spotifyCustomUrl}
                      onChange={(e) => setSpotifyCustomUrl(e.target.value)}
                      placeholder="https://open.spotify.com/track/... veya spotify:track:..."
                      className="px-3 py-2 bg-zinc-900 border border-zinc-800 rounded-lg text-xs text-white placeholder-zinc-500 font-mono focus:outline-none focus:border-[#1db954]"
                    />
                    <div className="grid grid-cols-2 gap-2">
                      <input
                        type="text"
                        value={spotifyCustomTitle}
                        onChange={(e) => setSpotifyCustomTitle(e.target.value)}
                        placeholder="Şarkı Adı (örn: Sevilen Parça)"
                        className="px-3 py-1.5 bg-zinc-900 border border-zinc-800 rounded-lg text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-[#1db954]"
                      />
                      <input
                        type="text"
                        value={spotifyCustomHotkey}
                        onChange={(e) => setSpotifyCustomHotkey(e.target.value.toUpperCase())}
                        placeholder="Kısayol (örn: F9)"
                        className="px-3 py-1.5 bg-zinc-900 border border-zinc-800 rounded-lg text-xs text-white placeholder-zinc-500 font-mono text-center focus:outline-none focus:border-[#1db954]"
                      />
                    </div>
                    <button
                      type="submit"
                      disabled={!spotifyCustomUrl.trim()}
                      className="mt-1 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 disabled:opacity-50 text-white text-xs font-medium transition-colors"
                    >
                      Soundboard&apos;a Ekle
                    </button>
                  </form>
                </div>
              </div>
            )}
          </div>
        )}

        {/* TAB 2: LOCAL SOUND TAB */}
        {activeTab === 'local' && (
          <form onSubmit={handleLocalSubmit} className="flex flex-col gap-4">
            {/* File Drag and Drop */}
            <div
              onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              className={`border-2 border-dashed rounded-xl p-5 flex flex-col items-center justify-center text-center cursor-pointer transition-all ${
                isDragging
                  ? 'border-white bg-zinc-900/50'
                  : 'border-zinc-800 bg-zinc-950/50 hover:border-zinc-700 hover:bg-zinc-900/30'
              }`}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept="audio/*"
                className="hidden"
                onChange={(e) => {
                  if (e.target.files && e.target.files[0]) {
                    handleFileProcess(e.target.files[0]);
                  }
                }}
              />
              <Upload className="w-6 h-6 text-zinc-400 mb-2" />
              <p className="text-xs font-medium text-white mb-0.5">
                {fileName ? fileName : 'Ses dosyasını buraya sürükleyin'}
              </p>
              <p className="text-[11px] text-zinc-500">
                MP3, WAV, OGG, FLAC veya M4A desteklenir
              </p>
            </div>

            {/* Title & Hotkey Inputs */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium text-zinc-300">Ses Başlığı</label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Örn: Zafer Müziği"
                  required
                  className="px-3 py-2 rounded-lg bg-zinc-950 border border-zinc-800 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-zinc-600"
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium text-zinc-300">Kısayol Tuşu</label>
                <input
                  type="text"
                  value={hotkey}
                  onChange={(e) => setHotkey(e.target.value.toUpperCase())}
                  placeholder="F1, CTRL+1, NUMPAD 1"
                  required
                  className="px-3 py-2 rounded-lg bg-zinc-950 border border-zinc-800 text-xs font-mono text-white placeholder-zinc-500 focus:outline-none focus:border-zinc-600 uppercase"
                />
              </div>
            </div>

            {/* Category selection */}
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-zinc-300">Kategori</label>
              <div className="flex flex-wrap gap-1.5">
                {categories.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setCategory(c)}
                    className={`px-2.5 py-1 rounded-md text-xs font-medium border transition-colors cursor-pointer ${
                      category === c
                        ? 'bg-zinc-800 border-zinc-700 text-white'
                        : 'bg-zinc-950 border-zinc-800 text-zinc-400 hover:text-white'
                    }`}
                  >
                    {c}
                  </button>
                ))}
              </div>
            </div>

            {/* Built-in Presets */}
            <div className="flex flex-col gap-1.5 pt-2 border-t border-zinc-800/80">
              <label className="text-xs font-medium text-zinc-400">
                Veya Dahili SFX Seçin:
              </label>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
                {presetCatalog.map((p) => (
                  <button
                    key={p.preset}
                    type="button"
                    onClick={() => handleSelectPreset(p)}
                    className={`p-2 rounded-lg border text-left text-xs transition-colors cursor-pointer ${
                      synthPreset === p.preset
                        ? 'bg-zinc-800 border-zinc-600 text-white'
                        : 'bg-zinc-950 border-zinc-800/80 text-zinc-400 hover:bg-zinc-900 hover:text-zinc-200'
                    }`}
                  >
                    <p className="font-medium truncate">{p.name}</p>
                    <p className="text-[10px] text-zinc-500">{p.dur}s</p>
                  </button>
                ))}
              </div>
            </div>

            {/* Actions */}
            <div className="flex items-center justify-end gap-2 pt-3 border-t border-zinc-800/80">
              <button
                type="button"
                onClick={onClose}
                className="px-3 py-1.5 rounded-md text-xs text-zinc-400 hover:text-white transition-colors cursor-pointer"
              >
                Vazgeç
              </button>
              <button
                type="submit"
                disabled={!title}
                className="px-4 py-1.5 rounded-md bg-white hover:bg-zinc-200 disabled:opacity-50 text-black text-xs font-semibold transition-colors cursor-pointer"
              >
                Sesi Ekle
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
