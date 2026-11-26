import { useState, useRef } from 'react';
import { motion } from 'motion/react';
import {
  Upload,
  X,
  FileAudio,
  FolderOpen,
} from 'lucide-react';
import { SoundCategory, SoundItem } from '../types/sound';
import { useTranslation } from '../i18n';
import { offloadDataUrlSync } from '../utils/audioAssetStorage';

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
  existingSoundCount = 8,
}: AddSoundModalProps) {
  const { t } = useTranslation();
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState<SoundCategory>('Meme & Eğlence');
  const [hotkey, setHotkey] = useState(`F${(existingSoundCount % 12) + 1}`);
  const [dataUrl, setDataUrl] = useState<string | undefined>(undefined);
  const [fileName, setFileName] = useState('');
  const [duration, setDuration] = useState(2.0);
  const [synthPreset, setSynthPreset] = useState<string | undefined>(undefined);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const categories: SoundCategory[] = [
    'Meme & Eğlence',
    'Oyun SFX',
    'Reaksiyon',
    'Anime & Dizi',
    'Müzik',
    'Özel',
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

  const handleFileProcess = (file: File) => {
    if (!file) return;
    setFileName(file.name);
    if (!title) {
      setTitle(file.name.replace(/\.[^/.]+$/, ''));
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      const result = e.target?.result as string;
      const persistedRef = offloadDataUrlSync(result) || result;
      setDataUrl(persistedRef);
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

  const handleSelectPreset = (p: (typeof presetCatalog)[0]) => {
    setTitle(p.name);
    setCategory(p.cat);
    setDuration(p.dur);
    setSynthPreset(p.preset);
    setDataUrl(undefined);
    setFileName(`Dahili: ${p.name}`);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;

    onAddSound({
      title: title.trim(),
      category,
      hotkey: hotkey.toUpperCase() || 'F9',
      duration,
      volume: 1.0,
      isFavorite: false,
      loop: false,
      playMode: 'overlap',
      dataUrl,
      synthPreset,
    });
    onClose();
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.16 }}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 backdrop-blur-sm"
      style={{ backgroundColor: 'var(--modal-backdrop)' }}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.94, y: 14 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 10 }}
        transition={{ type: 'spring', stiffness: 420, damping: 30 }}
        className="w-full max-w-xl bg-[var(--bg-modal)] border border-[var(--border-card)] ui-modal p-6 flex flex-col gap-5 max-h-[90vh] overflow-y-auto"
      >
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-[var(--border-subtle)]">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 ui-input bg-[var(--accent-subtle)] border border-[var(--accent-border)] text-[var(--accent-text)] flex items-center justify-center">
              <FileAudio className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-[var(--text-primary)]">
                {t('addSoundModal.title')}
              </h2>
              <p className="text-xs text-[var(--text-secondary)]">
                {t('addSoundModal.subtitle')}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label={t('common.close')}
            className="p-1.5 ui-control text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-card-hover)] transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          {/* File Drag and Drop */}
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setIsDragging(true);
            }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            className={`border-2 border-dashed ui-inner p-6 flex flex-col items-center justify-center text-center cursor-pointer transition-all ${
              isDragging
                ? 'border-[var(--accent)] bg-[var(--accent-subtle)]'
                : 'border-[var(--border-input)] bg-[var(--bg-inner)] hover:border-[var(--border-hover)]'
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
            <Upload className="w-6 h-6 text-[var(--accent-text)] mb-2" />
            <p className="text-sm font-medium text-[var(--text-primary)] mb-1">
              {fileName || t('addSoundModal.dropzoneTitle')}
            </p>
            <p className="text-xs text-[var(--text-secondary)]">
              {t('addSoundModal.dropzoneFormats')}
            </p>
          </div>

          {isElectron && onOpenElectronFilePicker && (
            <button
              type="button"
              onClick={() => void onOpenElectronFilePicker()}
              className="flex items-center justify-center gap-2 py-2 px-4 ui-input bg-[var(--bg-inner)] border border-[var(--border-subtle)] hover:border-[var(--border-hover)] text-xs font-medium text-[var(--text-primary)] transition-colors cursor-pointer"
            >
              <FolderOpen className="w-4 h-4 text-[var(--accent-text)]" />
              <span>{t('addSoundModal.browseComputer')}</span>
            </button>
          )}

          {/* Title & Hotkey Inputs */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-[var(--text-secondary)]">
                {t('addSoundModal.soundTitle')}
              </label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder={t('addSoundModal.soundTitlePlaceholder')}
                required
                className="px-3.5 py-2.5 ui-input bg-[var(--bg-input)] border border-[var(--border-input)] text-sm text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-none focus:border-[var(--accent)]"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-[var(--text-secondary)]">
                {t('addSoundModal.hotkey')}
              </label>
              <input
                type="text"
                value={hotkey}
                onChange={(e) => setHotkey(e.target.value.toUpperCase())}
                placeholder={t('addSoundModal.hotkeyPlaceholder')}
                required
                className="px-3.5 py-2.5 ui-input bg-[var(--bg-input)] border border-[var(--border-input)] text-sm font-mono text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-none focus:border-[var(--accent)] uppercase"
              />
            </div>
          </div>

          {/* Category selection */}
          <div className="flex flex-col gap-2">
            <label className="text-xs font-semibold text-[var(--text-secondary)]">
              {t('addSoundModal.category')}
            </label>
            <div className="flex flex-wrap gap-1.5">
              {categories.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setCategory(c)}
                  className={`px-3 py-1.5 ui-control text-xs font-medium border transition-colors cursor-pointer ${
                    category === c
                      ? 'bg-[var(--accent-subtle)] border-[var(--accent-border)] text-[var(--accent-text)] font-semibold'
                      : 'bg-[var(--bg-inner)] border-[var(--border-subtle)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                  }`}
                >
                  {t(`categories.${c}`) || c}
                </button>
              ))}
            </div>
          </div>

          {/* Built-in Presets */}
          <div className="flex flex-col gap-2 pt-3 border-t border-[var(--border-subtle)]">
            <label className="text-xs font-semibold text-[var(--text-secondary)]">
              {t('addSoundModal.orPreset')}
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {presetCatalog.map((p) => (
                <button
                  key={p.preset}
                  type="button"
                  onClick={() => handleSelectPreset(p)}
                  className={`p-2.5 ui-input border text-left transition-colors cursor-pointer ${
                    synthPreset === p.preset
                      ? 'bg-[var(--accent-subtle)] border-[var(--accent-border)] text-[var(--text-primary)]'
                      : 'bg-[var(--bg-inner)] border-[var(--border-subtle)] text-[var(--text-secondary)] hover:border-[var(--border-hover)] hover:text-[var(--text-primary)]'
                  }`}
                >
                  <p className="text-xs font-medium truncate">{p.name}</p>
                  <p className="text-[11px] font-mono text-[var(--text-muted)] mt-0.5">
                    {p.dur}s
                  </p>
                </button>
              ))}
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-[var(--border-subtle)]">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 ui-control text-xs font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-card-hover)] transition-colors cursor-pointer"
            >
              {t('common.cancel')}
            </button>
            <button
              type="submit"
              disabled={!title.trim()}
              className="btn-accent px-5 py-2 ui-control disabled:opacity-50 text-xs font-semibold transition-colors cursor-pointer"
            >
              {t('addSoundModal.saveButton')}
            </button>
          </div>
        </form>
      </motion.div>
    </motion.div>
  );
}
