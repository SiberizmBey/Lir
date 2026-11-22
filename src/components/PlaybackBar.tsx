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
  stopAllHotkey: string;
  onMasterVolumeChange: (volume: number) => void;
  onStopSound: (soundId: string) => void;
  onStopAll: () => void;
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
  stopAllHotkey,
  onMasterVolumeChange,
  onStopSound,
  onStopAll,
  onToggleLoop,
  backgroundImageEnabled,
  transparency,
  uiStyle,
}: PlaybackBarProps) {
  const { t } = useTranslation();
  const [now, setNow] = useState(() => Date.now());

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
              ? 'shrink-0 border-t border-[var(--border-subtle)] bg-[var(--bg-island)] px-4 py-2.5 z-30'
              : 'shrink-0 px-4 sm:px-6 pb-3 pt-1 z-30 pointer-events-none'
          }
        >
          <div
            style={barStyle}
            className={
              isWin10
                ? 'flex flex-col gap-2'
                : `pointer-events-auto relative overflow-hidden border border-[var(--accent-border)] backdrop-blur-xl px-4 py-2.5 flex flex-col gap-2 shadow-[0_-8px_30px_-12px_rgba(var(--accent-rgb),0.22)] ${
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

              {/* Right: Quick Controls & Stop All */}
              <div className="flex items-center gap-2 shrink-0">
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
                      className={`p-1.5 ui-control border transition-colors cursor-pointer ${
                        primarySound.loop
                          ? 'bg-[var(--accent-subtle)] border-[var(--accent-border)] text-[var(--accent-text)]'
                          : 'bg-[var(--bg-inner)] border-[var(--border-subtle)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                      }`}
                    >
                      <Repeat className="w-3.5 h-3.5" />
                    </motion.button>

                    <motion.button
                      type="button"
                      whileTap={{ scale: 0.92 }}
                      onClick={() => onStopSound(primarySound.id)}
                      title={t('soundCard.stop')}
                      className="flex items-center gap-1 px-2.5 py-1.5 ui-control bg-[var(--bg-inner)] hover:bg-rose-950/60 border border-[var(--border-subtle)] hover:border-rose-700 text-xs font-medium text-[var(--text-primary)] hover:text-rose-200 transition-colors cursor-pointer"
                    >
                      <Square className="w-3 h-3 fill-current" />
                      <span className="hidden sm:inline">{t('soundCard.stop')}</span>
                    </motion.button>
                  </>
                )}

                <div className="hidden md:flex items-center gap-1.5 px-2.5 py-1 ui-control bg-[var(--bg-inner)] border border-[var(--border-subtle)]">
                  <button
                    type="button"
                    onClick={() => onMasterVolumeChange(isMuted ? 0.85 : 0)}
                    className="text-[var(--text-secondary)] hover:text-[var(--text-primary)] cursor-pointer"
                    title={isMuted ? t('header.unmute') : t('header.mute')}
                  >
                    {isMuted ? (
                      <VolumeX className="w-3.5 h-3.5 text-rose-400" />
                    ) : (
                      <Volume2 className="w-3.5 h-3.5" />
                    )}
                  </button>
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.02"
                    value={masterVolume}
                    onChange={(e) =>
                      onMasterVolumeChange(parseFloat(e.target.value))
                    }
                    className="w-16 cursor-pointer"
                    aria-label={t('header.masterVolume')}
                  />
                  <span className="text-[11px] font-mono tabular-nums text-[var(--text-secondary)] w-8 text-right">
                    %{Math.round(masterVolume * 100)}
                  </span>
                </div>

                <motion.button
                  type="button"
                  whileHover={{ scale: 1.03 }}
                  whileTap={{ scale: 0.94 }}
                  onClick={onStopAll}
                  className="flex items-center gap-1.5 px-3 py-1.5 ui-control bg-rose-950/70 hover:bg-rose-900 border border-rose-700 text-rose-200 text-xs font-semibold transition-colors cursor-pointer"
                >
                  <Square className="w-3 h-3 fill-current" />
                  <span>{t('header.stopAll')}</span>
                  {stopAllHotkey && (
                    <kbd className="hidden xl:inline-block px-1.5 py-0.2 rounded bg-black/25 text-[10px] font-mono text-rose-200">
                      {stopAllHotkey}
                    </kbd>
                  )}
                </motion.button>
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
