import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Square,
  Repeat,
  AudioLines,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { PlaybackTrackInfo, SoundItem, UIStyle } from '../types/sound';
import { AudioVisualizer } from './AudioVisualizer';
import { useTranslation } from '../i18n';

interface PlaybackBarProps {
  sounds: SoundItem[];
  activeTracks: PlaybackTrackInfo[];
  masterVolume: number;
  onMasterVolumeChange: (volume: number) => void;
  onStopSound: (soundId: string) => void;
  onToggleLoop: (soundId: string) => void;
  backgroundImageEnabled: boolean;
  transparency: number;
  uiStyle: UIStyle;
}

function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return '0:00';
  const totalSecs = Math.floor(seconds);
  const mins = Math.floor(totalSecs / 60);
  const secs = totalSecs % 60;
  return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
}

export function PlaybackBar({
  sounds,
  activeTracks,
  masterVolume,
  onMasterVolumeChange,
  onStopSound,
  onToggleLoop,
  backgroundImageEnabled,
  transparency,
  uiStyle,
}: PlaybackBarProps) {
  const { t } = useTranslation();
  const [now, setNow] = useState(() => Date.now());
  const [isVolumeExpanded, setIsVolumeExpanded] = useState(false);

  useEffect(() => {
    if (activeTracks.length === 0) return;
    setNow(Date.now());
    const timer = window.setInterval(() => {
      setNow(Date.now());
    }, 50);
    return () => window.clearInterval(timer);
  }, [activeTracks.length]);

  const isWin10 = uiStyle === 'win10';
  const isWin11 = uiStyle === 'win11';
  const islandOpacity = backgroundImageEnabled ? 100 - transparency : 88;
  const barStyle = isWin10
    ? backgroundImageEnabled
      ? {
          backgroundColor: `color-mix(in srgb, var(--bg-island) ${100 - transparency}%, transparent)`,
        }
      : undefined
    : {
        backgroundColor: `color-mix(in srgb, var(--bg-island) ${islandOpacity}%, transparent)`,
      };

  const primaryTrack = activeTracks[0];
  const primarySound = primaryTrack
    ? sounds.find((s) => s.id === primaryTrack.soundId)
    : undefined;

  const isMuted = masterVolume === 0;

  return (
    <AnimatePresence>
      {activeTracks.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 20 }}
          transition={{ type: 'spring', stiffness: 420, damping: 32 }}
          className={
            isWin10
              ? 'pointer-events-auto shrink-0 border-t border-[var(--border-subtle)] bg-[var(--bg-island)] px-4 py-2.5 z-30'
              : 'shrink-0 px-4 sm:px-6 pb-3 pt-1 z-30 pointer-events-none'
          }
        >
          <div
            style={barStyle}
            className={
              isWin10
                ? 'flex flex-col gap-2'
                : `pointer-events-auto relative overflow-hidden border border-[var(--accent-border)] backdrop-blur-xl px-4 py-2.5 flex flex-col gap-2 ${
                    isWin11 ? 'rounded-xl' : 'rounded-2xl'
                  }`
            }
          >
            {/* Subtle Spotlight Sheen across Playback Bar */}
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-0 opacity-60"
              style={{
                background:
                  'radial-gradient(ellipse 55% 120% at 15% 0%, rgba(var(--accent-rgb), 0.14), transparent 70%)',
              }}
            />

            <div className="relative z-10 flex flex-wrap lg:flex-nowrap items-center justify-between gap-3">
              {/* Left: Visualizer + Now Playing Track Summary */}
              <div className="flex items-center gap-3 min-w-0 flex-1">
                <div className="w-9 h-9 ui-inner bg-[var(--accent-subtle)] border border-[var(--accent-border)] flex items-center justify-center shrink-0 text-[var(--accent-text)]">
                  <AudioLines className="w-4 h-4 animate-pulse" />
                </div>

                <div className="hidden sm:flex items-center shrink-0">
                  <AudioVisualizer isPlaying={true} height={20} />
                </div>

                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-[10px] font-mono uppercase tracking-wider px-1.5 py-0.5 ui-control bg-[var(--accent-subtle)] border border-[var(--accent-border)] text-[var(--accent-text)] font-semibold shrink-0">
                      {activeTracks.length > 1
                        ? t('playbackBar.playingCount', {
                            count: activeTracks.length,
                          })
                        : t('playbackBar.nowPlaying')}
                    </span>
                    <span className="text-xs sm:text-sm font-semibold text-[var(--text-primary)] truncate">
                      {primarySound?.title || primaryTrack.soundId}
                    </span>
                    {primarySound?.hotkey && (
                      <kbd className="hidden md:inline-block px-1.5 py-0.5 ui-control bg-[var(--bg-inner)] border border-[var(--border-subtle)] text-[10px] font-mono text-[var(--accent-text)] shrink-0">
                        {primarySound.hotkey}
                      </kbd>
                    )}
                  </div>

                  {/* Single Track Live Progress */}
                  {activeTracks.length === 1 && primaryTrack && (() => {
                    const dur = Math.max(0.5, primaryTrack.duration || primarySound?.duration || 1);
                    const rawElapsed = Math.max(0, (now - primaryTrack.startedAt) / 1000);
                    const elapsed = primaryTrack.loop
                      ? rawElapsed % dur
                      : Math.min(dur, rawElapsed);
                    const pct = Math.min(100, Math.max(0, (elapsed / dur) * 100));

                    return (
                      <div className="mt-1.5 flex items-center gap-2.5">
                        <span className="text-[11px] font-mono tabular-nums text-[var(--text-secondary)] shrink-0">
                          {formatTime(elapsed)}
                        </span>
                        <div className="flex-1 h-1.5 bg-[var(--bg-inner)] border border-[var(--border-subtle)] ui-control overflow-hidden">
                          <div
                            className="h-full bg-[var(--accent)] transition-[width] duration-75"
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                        <span className="text-[11px] font-mono tabular-nums text-[var(--text-muted)] shrink-0">
                          {formatTime(dur)}
                        </span>
                      </div>
                    );
                  })()}
                </div>
              </div>

              {/* Right: Quick Controls */}
              <div className="flex items-center gap-1.5 shrink-0">
                {activeTracks.length === 1 && primaryTrack && primarySound && (
                  <>
                    <motion.button
                      type="button"
                      whileTap={{ scale: 0.9 }}
                      onClick={() => onToggleLoop(primarySound.id)}
                      title={
                        primarySound.loop
                          ? t('soundCard.loopOn')
                          : t('soundCard.loopOff')
                      }
                      aria-label={
                        primarySound.loop
                          ? t('soundCard.loopOn')
                          : t('soundCard.loopOff')
                      }
                      className={`w-8 h-8 flex items-center justify-center ui-control border transition-colors cursor-pointer ${
                        primarySound.loop
                          ? 'bg-[var(--accent-subtle)] border-[var(--accent-border)] text-[var(--accent-text)]'
                          : 'bg-[var(--bg-inner)] border-[var(--border-subtle)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                      }`}
                    >
                      <Repeat className="w-3.5 h-3.5" />
                    </motion.button>

                    <motion.button
                      type="button"
                      whileTap={{ scale: 0.9 }}
                      onClick={() => onStopSound(primarySound.id)}
                      title={t('soundCard.stop')}
                      aria-label={t('soundCard.stop')}
                      className="w-8 h-8 flex items-center justify-center ui-control bg-[var(--bg-inner)] hover:bg-rose-950/60 border border-[var(--border-subtle)] hover:border-rose-700 text-[var(--text-primary)] hover:text-rose-200 transition-colors cursor-pointer"
                    >
                      <Square className="w-3.5 h-3.5 fill-current" />
                    </motion.button>
                  </>
                )}

                <motion.div
                  onMouseEnter={() => setIsVolumeExpanded(true)}
                  onMouseLeave={() => setIsVolumeExpanded(false)}
                  onFocus={() => setIsVolumeExpanded(true)}
                  onBlur={() => setIsVolumeExpanded(false)}
                  animate={{ width: isVolumeExpanded ? 148 : 32 }}
                  transition={{
                    type: 'spring',
                    stiffness: 420,
                    damping: 32,
                  }}
                  className="hidden md:flex h-8 items-center gap-2 overflow-hidden ui-control border border-[var(--border-subtle)] bg-[var(--bg-inner)] px-1.5"
                >
                  <motion.button
                    type="button"
                    whileTap={{ scale: 0.88 }}
                    onClick={() => onMasterVolumeChange(isMuted ? 0.85 : 0)}
                    className="flex h-5 w-5 shrink-0 items-center justify-center text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors cursor-pointer"
                    title={isMuted ? t('header.unmute') : t('header.mute')}
                    aria-label={isMuted ? t('header.unmute') : t('header.mute')}
                  >
                    {isMuted ? (
                      <VolumeX className="w-4 h-4 text-rose-400" />
                    ) : (
                      <Volume2 className="w-4 h-4" />
                    )}
                  </motion.button>
                  <motion.div
                    animate={{ opacity: isVolumeExpanded ? 1 : 0 }}
                    transition={{ duration: 0.16 }}
                    className="flex w-[104px] shrink-0 items-center gap-2"
                  >
                    <input
                      type="range"
                      min="0"
                      max="1.5"
                      step="0.05"
                      value={masterVolume}
                      onChange={(e) =>
                        onMasterVolumeChange(parseFloat(e.target.value))
                      }
                      className="w-16 shrink-0 cursor-pointer"
                      aria-label={t('header.masterVolume')}
                    />
                    <span className="w-10 shrink-0 text-right text-[11px] font-mono tabular-nums text-[var(--text-secondary)]">
                      %{Math.round(masterVolume * 100)}
                    </span>
                  </motion.div>
                </motion.div>
              </div>
            </div>

            {/* Multi-Track Chips when playing 2+ overlapping sounds */}
            {activeTracks.length > 1 && (
              <div className="relative z-10 flex items-center gap-2 overflow-x-auto pb-0.5 pt-1 border-t border-[var(--border-subtle)]">
                {activeTracks.map((track) => {
                  const s = sounds.find((item) => item.id === track.soundId);
                  const dur = Math.max(0.5, track.duration || s?.duration || 1);
                  const rawElapsed = Math.max(0, (now - track.startedAt) / 1000);
                  const elapsed = track.loop
                    ? rawElapsed % dur
                    : Math.min(dur, rawElapsed);
                  const pct = Math.min(100, Math.max(0, (elapsed / dur) * 100));

                  return (
                    <div
                      key={track.soundId}
                      className="min-w-[200px] max-w-[260px] shrink-0 px-2.5 py-1.5 ui-inner bg-[var(--bg-inner)] border border-[var(--border-subtle)] flex flex-col gap-1"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-medium text-[var(--text-primary)] truncate">
                          {s?.title || track.soundId}
                        </span>
                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            type="button"
                            onClick={() => onToggleLoop(track.soundId)}
                            className={`p-1 ui-control cursor-pointer ${
                              track.loop
                                ? 'text-[var(--accent-text)]'
                                : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
                            }`}
                            title={
                              track.loop
                                ? t('soundCard.loopOn')
                                : t('soundCard.loopOff')
                            }
                          >
                            <Repeat className="w-3 h-3" />
                          </button>
                          <button
                            type="button"
                            onClick={() => onStopSound(track.soundId)}
                            className="p-1 ui-control text-rose-300 hover:bg-rose-950/60 cursor-pointer"
                            title={t('soundCard.stop')}
                          >
                            <Square className="w-3 h-3 fill-current" />
                          </button>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="flex-1 h-1 bg-[var(--bg-card)] ui-control overflow-hidden">
                          <div
                            className="h-full bg-[var(--accent)] transition-[width] duration-75"
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                        <span className="text-[10px] font-mono tabular-nums text-[var(--text-muted)]">
                          {formatTime(elapsed)}/{formatTime(dur)}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
