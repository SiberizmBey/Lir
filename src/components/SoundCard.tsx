import { useEffect, useState } from 'react';
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
  Scissors,
} from 'lucide-react';
import { PlaybackTrackInfo, SoundItem } from '../types/sound';
import { useTranslation } from '../i18n';

interface SoundCardProps {
  sound: SoundItem;
  isPlaying: boolean;
  playbackTrack?: PlaybackTrackInfo;
  onPlay: (sound: SoundItem) => void;
  onStop: (soundId: string) => void;
  onToggleFavorite: (soundId: string) => void;
  onToggleLoop: (soundId: string) => void;
  onVolumeChange: (soundId: string, volume: number) => void;
  onDelete: (soundId: string) => void;
  onOpenHotkeyModal: (sound: SoundItem) => void;
  onOpenInMaker?: (sound: SoundItem) => void;
}

export function SoundCard({
  sound,
  isPlaying,
  playbackTrack,
  onPlay,
  onStop,
  onToggleFavorite,
  onToggleLoop,
  onVolumeChange,
  onDelete,
  onOpenHotkeyModal,
  onOpenInMaker,
}: SoundCardProps) {
  const { t } = useTranslation();
  const [showMenu, setShowMenu] = useState(false);
  const [progressPct, setProgressPct] = useState(0);

  useEffect(() => {
    if (!isPlaying || !playbackTrack) {
      setProgressPct(0);
      return;
    }

    const updateProgress = () => {
      const dur = Math.max(0.4, playbackTrack.duration || sound.duration || 1);
      const rawElapsed = Math.max(0, (Date.now() - playbackTrack.startedAt) / 1000);
      const elapsed = playbackTrack.loop ? rawElapsed % dur : Math.min(dur, rawElapsed);
      setProgressPct(Math.min(100, Math.max(0, (elapsed / dur) * 100)));
    };

    updateProgress();
    const timer = window.setInterval(updateProgress, 60);
    return () => window.clearInterval(timer);
  }, [isPlaying, playbackTrack, sound.duration]);

  const formatDuration = (seconds: number) => {
    if (!seconds || seconds <= 0) return '0:01';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
  };

  const categoryLabel = t(`categories.${sound.category}`) || sound.category;

  return (
    <motion.div
      layout
      initial={{ opacity: 0, scale: 0.95, y: 10 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.92, y: -6 }}
      whileHover={{ y: -2 }}
      transition={{ type: 'spring', stiffness: 380, damping: 28 }}
      onMouseLeave={() => setShowMenu(false)}
      className={`app-card ui-card ${
        isPlaying ? '' : 'card-ambient-glow'
      } group relative overflow-hidden flex flex-col justify-between gap-3.5 p-4 transition-all border ${
        isPlaying
          ? 'border-[var(--accent)] ring-1 ring-[var(--accent-border)]'
          : 'border-[var(--border-card)] hover:border-[var(--border-hover)]'
      }`}
    >
      {/* Dramatic Spotlight Layers behind Playing Card */}
      <AnimatePresence>
        {isPlaying && (
          <motion.div
            aria-hidden="true"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25 }}
            className="pointer-events-none absolute inset-0 z-0 overflow-hidden"
          >
            {/* Top-right angled spotlight cone */}
            <motion.div
              animate={{ opacity: [0.82, 1, 0.86] }}
              transition={{ repeat: Infinity, duration: 2.2, ease: 'easeInOut' }}
              className="absolute inset-0 card-spotlight-beam"
            />
            {/* Floor illumination pool behind center controls */}
            <div className="absolute inset-0 card-spotlight-floor" />
            {/* Focused emitter lens hotspot at upper right corner */}
            <div
              className="absolute -top-6 right-5 w-24 h-24 rounded-full blur-2xl"
              style={{ backgroundColor: 'rgba(var(--accent-rgb), 0.36)' }}
            />
            {/* Crisp illuminated top rim */}
            <div className="absolute top-0 left-0 right-0 h-[1.5px] card-spotlight-rim" />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Top Row: Icon + Title + Actions */}
      <div className="relative z-30 flex items-start justify-between gap-2.5">
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
              {categoryLabel}
            </p>
          </div>
        </div>

        {/* Quick Action Icons */}
        <div className="flex items-center gap-0.5 shrink-0">
          <motion.button
            type="button"
            whileTap={{ scale: 0.82 }}
            onClick={() => onToggleFavorite(sound.id)}
            title={sound.isFavorite ? t('soundCard.removeFavorite') : t('soundCard.addFavorite')}
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
            title={sound.loop ? t('soundCard.loopOn') : t('soundCard.loopOff')}
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
              aria-label={t('soundCard.soundMenu')}
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
                  className="absolute right-0 top-full mt-1 w-40 py-1.5 bg-[var(--bg-modal)] border border-[var(--border-hover)] ui-inner z-40 origin-top-right"
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
                    <span>{t('soundCard.assignHotkey')}</span>
                  </button>

                  {onOpenInMaker && (
                    <button
                      type="button"
                      onClick={() => {
                        setShowMenu(false);
                        onOpenInMaker(sound);
                      }}
                      className="w-full px-3 py-2 text-left text-xs text-[var(--text-primary)] hover:bg-[var(--bg-card-hover)] flex items-center gap-2 cursor-pointer"
                    >
                      <Scissors className="w-3.5 h-3.5 text-[var(--accent-text)]" />
                      <span>{t('soundCard.trimInMaker')}</span>
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={() => {
                      setShowMenu(false);
                      onDelete(sound.id);
                    }}
                    className="w-full px-3 py-2 text-left text-xs text-rose-400 hover:bg-[var(--bg-card-hover)] flex items-center gap-2 cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>{t('soundCard.deleteSound')}</span>
                  </button>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>

      {/* Middle Inner Info Box */}
      <div className="relative z-10 ui-inner bg-[var(--bg-inner)]/90 border border-[var(--border-subtle)] px-3.5 py-2.5 flex flex-col gap-2.5">
        <div className="flex items-center justify-between gap-2">
          <motion.button
            type="button"
            whileTap={{ scale: 0.94 }}
            onClick={() => onOpenHotkeyModal(sound)}
            title={t('soundCard.changeHotkey')}
            className="inline-flex items-center gap-1.5 px-2.5 py-0.5 ui-control border border-[var(--accent-border)] bg-[var(--accent-subtle)] text-[var(--accent-text)] text-xs font-mono font-semibold hover:brightness-110 transition-all cursor-pointer"
          >
            <Keyboard className="w-3 h-3" />
            <kbd>{sound.hotkey || t('soundCard.pressKey')}</kbd>
          </motion.button>

          <div className="flex items-center gap-2 text-xs text-[var(--text-secondary)] font-mono tabular-nums">
            {(sound.segments && sound.segments.length > 0) ||
            (sound.trimStart !== undefined && sound.trimStart > 0) ||
            sound.trimEnd !== undefined ? (
              <span
                title={
                  sound.segments && sound.segments.length > 1
                    ? t('soundCard.slicesBadge', { count: sound.segments.length })
                    : t('soundCard.trimmedBadge')
                }
                className="inline-flex items-center gap-0.5 text-[var(--accent-text)]"
              >
                <Scissors className="w-3 h-3" />
                {sound.segments && sound.segments.length > 1 && (
                  <span className="text-[10px] font-bold leading-none">
                    {sound.segments.length}
                  </span>
                )}
              </span>
            ) : null}
            {sound.loop && (
              <span className="text-[11px] font-sans font-medium text-[var(--accent-text)]">
                {t('soundCard.loopBadge')}
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
            title={t('soundCard.volumeLevel', { percent: Math.round(sound.volume * 100) })}
          />
          <span className="text-xs font-mono tabular-nums text-[var(--text-secondary)] w-9 text-right shrink-0">
            %{Math.round(sound.volume * 100)}
          </span>
        </div>
      </div>

      {/* Bottom Footer Row: Status + Play/Stop Pill */}
      <div className="relative z-10 flex items-center justify-between gap-3 pt-0.5">
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
            {isPlaying ? t('soundCard.statusPlaying') : t('soundCard.statusReady')}
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
              <span>{t('soundCard.stop')}</span>
            </>
          ) : (
            <>
              <Play className="w-3 h-3 fill-current" />
              <span>{t('soundCard.play')}</span>
            </>
          )}
        </motion.button>
      </div>

      {/* Subtle Bottom Progress Edge when Playing */}
      {isPlaying && (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute bottom-0 left-0 right-0 h-[2.5px] bg-black/25 z-20"
        >
          <div
            className="h-full bg-[var(--accent)] transition-[width] duration-75"
            style={{ width: `${progressPct}%` }}
          />
        </div>
      )}
    </motion.div>
  );
}
