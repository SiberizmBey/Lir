import { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Play,
  Square,
  Repeat,
  Heart,
  Trash2,
  Keyboard,
  MoreHorizontal,
  Volume2,
  AudioLines,
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
  onOpenHotkeyModal,
}: SoundCardProps) {
  const [showMenu, setShowMenu] = useState(false);

  const formatDuration = (seconds: number) => {
    if (!seconds || seconds <= 0) return '0:01';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
  };

  return (
    <motion.div
      layout
      initial={{ opacity: 0, scale: 0.95, y: 10 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.92, y: -6 }}
      whileHover={{ y: -2 }}
      transition={{ type: 'spring', stiffness: 380, damping: 28 }}
      onMouseLeave={() => setShowMenu(false)}
      className={`app-card ui-card card-ambient-glow group relative flex flex-col justify-between gap-3.5 p-4 transition-colors border ${
        isPlaying
          ? 'border-[var(--accent)] ring-1 ring-[var(--accent-border)]'
          : 'border-[var(--border-card)] hover:border-[var(--border-hover)]'
      }`}
    >
      {/* Top Row: Icon + Title + Actions */}
      <div className="flex items-start justify-between gap-2.5">
        <div className="flex items-center gap-3 min-w-0">
          <motion.div
            animate={isPlaying ? { scale: [1, 1.07, 1] } : { scale: 1 }}
            transition={
              isPlaying
                ? { repeat: Infinity, duration: 1.4, ease: 'easeInOut' }
                : { duration: 0.2 }
            }
            className={`w-10 h-10 ui-input border flex items-center justify-center shrink-0 transition-colors ${
              isPlaying
                ? 'bg-[var(--accent-subtle)] border-[var(--accent-border)] text-[var(--accent-text)]'
                : 'bg-[var(--bg-inner)] border-[var(--border-subtle)] text-[var(--text-secondary)] group-hover:text-[var(--accent-text)]'
            }`}
          >
            <AudioLines className="w-5 h-5" />
          </motion.div>

          <div className="min-w-0">
            <h3
              className="text-sm font-semibold text-[var(--text-primary)] truncate"
              title={sound.title}
            >
              {sound.title}
            </h3>
            <p className="text-xs text-[var(--text-secondary)] truncate mt-0.5">
              {sound.category}
            </p>
          </div>
        </div>

        {/* Quick Action Icons */}
        <div className="flex items-center gap-0.5 shrink-0">
          <motion.button
            type="button"
            whileTap={{ scale: 0.82 }}
            onClick={() => onToggleFavorite(sound.id)}
            title={sound.isFavorite ? 'Favorilerden Kaldır' : 'Favorilere Ekle'}
            className={`p-1.5 ui-control hover:bg-[var(--bg-card-hover)] transition-colors cursor-pointer ${
              sound.isFavorite
                ? 'text-rose-400'
                : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
            }`}
          >
            <Heart className={`w-4 h-4 ${sound.isFavorite ? 'fill-current' : ''}`} />
          </motion.button>

          <motion.button
            type="button"
            whileTap={{ scale: 0.82, rotate: 90 }}
            onClick={() => onToggleLoop(sound.id)}
            title={sound.loop ? 'Döngü Açık' : 'Döngü Kapalı'}
            className={`p-1.5 ui-control hover:bg-[var(--bg-card-hover)] transition-colors cursor-pointer ${
              sound.loop
                ? 'text-[var(--accent-text)] bg-[var(--accent-subtle)]'
                : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
            }`}
          >
            <Repeat className="w-4 h-4" />
          </motion.button>

          <div className="relative">
            <motion.button
              type="button"
              whileTap={{ scale: 0.85 }}
              onClick={() => setShowMenu(!showMenu)}
              aria-label="Ses menüsü"
              className="p-1.5 ui-control text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-card-hover)] transition-colors cursor-pointer"
            >
              <MoreHorizontal className="w-4 h-4" />
            </motion.button>

            <AnimatePresence>
              {showMenu && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.92, y: -4 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.92, y: -4 }}
                  transition={{ duration: 0.14, ease: [0.22, 1, 0.36, 1] }}
                  className="absolute right-0 top-full mt-1 w-40 py-1.5 bg-[var(--bg-modal)] border border-[var(--border-hover)] ui-inner z-30 origin-top-right"
                >
                  <button
                    type="button"
                    onClick={() => {
                      setShowMenu(false);
                      onOpenHotkeyModal(sound);
                    }}
                    className="w-full px-3 py-2 text-left text-xs text-[var(--text-primary)] hover:bg-[var(--bg-card-hover)] flex items-center gap-2 cursor-pointer"
                  >
                    <Keyboard className="w-3.5 h-3.5 text-[var(--text-secondary)]" />
                    <span>Kısayol Ata</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setShowMenu(false);
                      onDelete(sound.id);
                    }}
                    className="w-full px-3 py-2 text-left text-xs text-rose-400 hover:bg-[var(--bg-card-hover)] flex items-center gap-2 cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Sesi Sil</span>
                  </button>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>

      {/* Middle Inner Info Box */}
      <div className="ui-inner bg-[var(--bg-inner)] border border-[var(--border-subtle)] px-3.5 py-2.5 flex flex-col gap-2.5">
        <div className="flex items-center justify-between gap-2">
          <motion.button
            type="button"
            whileTap={{ scale: 0.94 }}
            onClick={() => onOpenHotkeyModal(sound)}
            title="Kısayolu Değiştir"
            className="inline-flex items-center gap-1.5 px-2.5 py-0.5 ui-control border border-[var(--accent-border)] bg-[var(--accent-subtle)] text-[var(--accent-text)] text-xs font-mono font-semibold hover:brightness-110 transition-all cursor-pointer"
          >
            <Keyboard className="w-3 h-3" />
            <kbd>{sound.hotkey || 'Tuş Ata'}</kbd>
          </motion.button>

          <div className="flex items-center gap-2 text-xs text-[var(--text-secondary)] font-mono tabular-nums">
            {sound.loop && (
              <span className="text-[11px] font-sans font-medium text-[var(--accent-text)]">
                Döngü
              </span>
            )}
            <span>{formatDuration(sound.duration)}</span>
          </div>
        </div>

        {/* Volume Slider */}
        <div className="flex items-center gap-2.5">
          <Volume2 className="w-3.5 h-3.5 text-[var(--text-muted)] shrink-0" />
          <input
            type="range"
            min="0"
            max="1"
            step="0.05"
            value={sound.volume}
            onChange={(e) => onVolumeChange(sound.id, parseFloat(e.target.value))}
            className="w-full"
            title={`Ses Seviyesi: %${Math.round(sound.volume * 100)}`}
          />
          <span className="text-xs font-mono tabular-nums text-[var(--text-secondary)] w-9 text-right shrink-0">
            %{Math.round(sound.volume * 100)}
          </span>
        </div>
      </div>

      {/* Bottom Footer Row: Status + Play/Stop Pill */}
      <div className="flex items-center justify-between gap-3 pt-0.5">
        <div className="flex items-center gap-1.5 text-xs font-medium">
          <span
            className={`w-2 h-2 rounded-full ${
              isPlaying
                ? 'bg-[var(--accent)] animate-pulse'
                : 'bg-[var(--accent)] opacity-60'
            }`}
          />
          <span
            className={
              isPlaying
                ? 'text-[var(--accent-text)] font-semibold'
                : 'text-[var(--text-secondary)]'
            }
          >
            {isPlaying ? 'Çalınıyor' : 'Hazır'}
          </span>
        </div>

        <motion.button
          type="button"
          whileHover={{ scale: 1.04 }}
          whileTap={{ scale: 0.92 }}
          transition={{ type: 'spring', stiffness: 460, damping: 28 }}
          onClick={() => (isPlaying ? onStop(sound.id) : onPlay(sound))}
          className={`flex items-center gap-1.5 px-4 py-1.5 ui-control text-xs font-semibold transition-colors cursor-pointer ${
            isPlaying
              ? 'bg-rose-950/80 hover:bg-rose-900 border border-rose-700 text-rose-200'
              : 'btn-accent'
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
        </motion.button>
      </div>
    </motion.div>
  );
}
