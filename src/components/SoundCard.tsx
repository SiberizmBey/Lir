import { useState } from 'react';
import { 
  Play, 
  Square, 
  Repeat, 
  Heart, 
  Trash2, 
  Keyboard, 
  MoreHorizontal,
  Volume2
} from 'lucide-react';
import { SoundItem } from '../types/sound';

interface SoundCardProps {
  sound: SoundItem;
  isPlaying: boolean;
  onPlay: (sound: SoundItem) => void;
  onStop: (soundId: string) => void;
  onToggleFavorite: (soundId: string) => void;
  onToggleLoop: (soundId: string) => void;
  onVolumeChange: (soundId: string, volume: number) => void;
  onDelete: (soundId: string) => void;
  onOpenHotkeyModal: (sound: SoundItem) => void;
}

export function SoundCard({
  sound,
  isPlaying,
  onPlay,
  onStop,
  onToggleFavorite,
  onToggleLoop,
  onVolumeChange,
  onDelete,
  onOpenHotkeyModal
}: SoundCardProps) {
  const [showMenu, setShowMenu] = useState(false);

  const formatDuration = (seconds: number) => {
    if (!seconds || seconds <= 0) return '0:01';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
  };

  return (
    <div
      onMouseLeave={() => setShowMenu(false)}
      className={`group relative flex flex-col justify-between p-3.5 rounded-xl transition-colors border ${
        isPlaying
          ? 'bg-[#121212] border-zinc-600'
          : 'bg-[#0a0a0a] hover:bg-[#111111] border-zinc-800/80 hover:border-zinc-700'
      }`}
    >
      {/* Top row: Hotkey Badge & Quick Actions */}
      <div className="flex items-center justify-between gap-2 mb-2.5">
        {/* Hotkey Kbd badge */}
        <button
          onClick={() => onOpenHotkeyModal(sound)}
          title="Kısayolu Değiştir"
          className="flex items-center gap-1.5 px-2 py-0.5 rounded border border-zinc-700 bg-zinc-900 hover:border-zinc-500 hover:bg-zinc-850 text-zinc-300 text-[11px] font-mono font-medium transition-colors cursor-pointer"
        >
          <kbd>{sound.hotkey || 'Tuş Ata'}</kbd>
        </button>

        {/* Action icons */}
        <div className="flex items-center gap-0.5">
          <button
            onClick={() => onToggleFavorite(sound.id)}
            title={sound.isFavorite ? 'Favorilerden Kaldır' : 'Favorilere Ekle'}
            className={`p-1.5 rounded-md hover:bg-zinc-900 transition-colors ${
              sound.isFavorite ? 'text-rose-400' : 'text-zinc-500 hover:text-zinc-300'
            }`}
          >
            <Heart className={`w-3.5 h-3.5 ${sound.isFavorite ? 'fill-current' : ''}`} />
          </button>

          <button
            onClick={() => onToggleLoop(sound.id)}
            title={sound.loop ? 'Döngü Açık' : 'Döngü Kapalı'}
            className={`p-1.5 rounded-md hover:bg-zinc-900 transition-colors ${
              sound.loop ? 'text-white bg-zinc-900' : 'text-zinc-500 hover:text-zinc-300'
            }`}
          >
            <Repeat className="w-3.5 h-3.5" />
          </button>

          <div className="relative">
            <button
              onClick={() => setShowMenu(!showMenu)}
              className="p-1.5 rounded-md text-zinc-500 hover:text-zinc-300 hover:bg-zinc-900 transition-colors"
            >
              <MoreHorizontal className="w-3.5 h-3.5" />
            </button>

            {showMenu && (
              <div className="absolute right-0 top-full mt-1 w-32 py-1 bg-[#121212] border border-zinc-800 rounded-md z-30">
                <button
                  onClick={() => {
                    setShowMenu(false);
                    onOpenHotkeyModal(sound);
                  }}
                  className="w-full px-2.5 py-1.5 text-left text-xs text-zinc-300 hover:bg-zinc-800 flex items-center gap-2"
                >
                  <Keyboard className="w-3 h-3 text-zinc-400" />
                  <span>Kısayol Ata</span>
                </button>
                <button
                  onClick={() => {
                    setShowMenu(false);
                    onDelete(sound.id);
                  }}
                  className="w-full px-2.5 py-1.5 text-left text-xs text-rose-400 hover:bg-zinc-800 flex items-center gap-2"
                >
                  <Trash2 className="w-3 h-3" />
                  <span>Sesi Sil</span>
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Middle row: Title & Unboxed Metadata */}
      <div className="flex flex-col gap-1 mb-3">
        <h3
          className="text-xs font-medium text-zinc-200 truncate group-hover:text-white transition-colors"
          title={sound.title}
        >
          {sound.title}
        </h3>

        <div className="flex items-center gap-1.5 text-[11px] text-zinc-500">
          <span>{sound.category}</span>
          <span aria-hidden="true" className="text-zinc-700">·</span>
          <span className="font-mono tabular-nums">{formatDuration(sound.duration)}</span>
          {sound.loop && (
            <>
              <span aria-hidden="true" className="text-zinc-700">·</span>
              <span className="text-zinc-300">Döngü</span>
            </>
          )}
        </div>
      </div>

      {/* Bottom row: Play/Stop & Volume */}
      <div className="pt-2 border-t border-zinc-800/80 flex items-center justify-between gap-3">
        {/* Play/Stop Button */}
        <button
          onClick={() => (isPlaying ? onStop(sound.id) : onPlay(sound))}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors cursor-pointer ${
            isPlaying
              ? 'bg-rose-950/80 hover:bg-rose-900 border border-rose-700 text-rose-200'
              : 'bg-zinc-900 hover:bg-zinc-800 border border-zinc-700/80 text-white'
          }`}
        >
          {isPlaying ? (
            <>
              <Square className="w-3 h-3 fill-current" />
              <span>Durdur</span>
            </>
          ) : (
            <>
              <Play className="w-3 h-3 fill-current" />
              <span>Çal</span>
            </>
          )}
        </button>

        {/* Volume */}
        <div className="flex items-center gap-1.5">
          <Volume2 className="w-3 h-3 text-zinc-600" />
          <input
            type="range"
            min="0"
            max="1"
            step="0.05"
            value={sound.volume}
            onChange={(e) => onVolumeChange(sound.id, parseFloat(e.target.value))}
            className="w-14"
            title={`Ses Seviyesi: %${Math.round(sound.volume * 100)}`}
          />
          <span className="text-[10px] font-mono tabular-nums text-zinc-500 w-5 text-right">
            %{Math.round(sound.volume * 100)}
          </span>
        </div>
      </div>

      {/* Playing indicator bar */}
      {isPlaying && (
        <div className="absolute top-0 left-0 right-0 h-[2px] bg-white rounded-t-xl" />
      )}
    </div>
  );
}
