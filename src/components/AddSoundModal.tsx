import { useState, useRef } from 'react';
import { 
  Upload, 
  X, 
  FolderOpen, 
  Check, 
  Keyboard, 
  Tag, 
  FileAudio
} from 'lucide-react';
import { SoundCategory, SoundItem } from '../types/sound';

interface AddSoundModalProps {
  onClose: () => void;
  onAddSound: (newSound: Omit<SoundItem, 'id' | 'addedAt'>) => void;
  isElectron: boolean;
  onOpenElectronFilePicker?: () => Promise<void>;
}

export function AddSoundModal({
  onClose,
  onAddSound,
  isElectron,
  onOpenElectronFilePicker
}: AddSoundModalProps) {
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState<SoundCategory>('Meme & Eğlence');
  const [hotkey, setHotkey] = useState('');
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
    'Özel'
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

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title) return;

    onAddSound({
      title,
      category,
      hotkey: hotkey || 'F9',
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

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
      <div className="w-full max-w-md bg-[#0a0a0a] border border-zinc-800 rounded-xl p-5 flex flex-col gap-4 max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-zinc-800/80">
          <div className="flex items-center gap-2">
            <Upload className="w-4 h-4 text-zinc-400" />
            <h2 className="text-xs font-semibold text-white">Ses Dosyası Ekle</h2>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded text-zinc-500 hover:text-white transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Upload Dropzone */}
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setIsDragging(true);
          }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={handleDrop}
          onClick={() => {
            if (isElectron && onOpenElectronFilePicker) {
              onOpenElectronFilePicker();
            } else {
              fileInputRef.current?.click();
            }
          }}
          className={`flex flex-col items-center justify-center p-5 rounded-lg border border-dashed cursor-pointer transition-colors ${
            isDragging
              ? 'border-zinc-500 bg-zinc-900'
              : fileName
              ? 'border-zinc-700 bg-zinc-950'
              : 'border-zinc-800 hover:border-zinc-700 bg-zinc-950'
          }`}
        >
          <input
            type="file"
            ref={fileInputRef}
            onChange={(e) => {
              if (e.target.files && e.target.files[0]) {
                handleFileProcess(e.target.files[0]);
              }
            }}
            accept="audio/mp3,audio/wav,audio/ogg,audio/flac,audio/aac,audio/m4a,.mp3,.wav,.ogg,.flac"
            className="hidden"
          />

          {fileName ? (
            <div className="flex items-center gap-2.5 text-zinc-200">
              <FileAudio className="w-5 h-5 text-zinc-400" />
              <div className="flex flex-col text-left">
                <span className="text-xs font-medium text-white truncate max-w-[240px]">{fileName}</span>
                <span className="text-[11px] font-mono text-zinc-500">{duration.toFixed(1)}s yüklendi</span>
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-1.5 text-center">
              <FolderOpen className="w-5 h-5 text-zinc-400" />
              <span className="text-xs text-zinc-300">
                Dosyayı sürükleyin veya tıklayın
              </span>
              <span className="text-[11px] text-zinc-600 font-mono">
                MP3 · WAV · OGG · FLAC
              </span>
            </div>
          )}
        </div>

        {/* Starter Presets */}
        <div className="flex flex-col gap-1.5">
          <span className="text-[11px] text-zinc-500 font-medium">Hazır Şablonlar:</span>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
            {presetCatalog.map((p) => (
              <button
                key={p.name}
                type="button"
                onClick={() => handleSelectPreset(p)}
                className={`p-1.5 rounded-md text-left border text-xs transition-colors ${
                  synthPreset === p.preset
                    ? 'bg-zinc-800 border-zinc-600 text-white'
                    : 'bg-zinc-950 border-zinc-800/80 text-zinc-400 hover:text-white hover:border-zinc-700'
                }`}
              >
                <div className="font-medium truncate">{p.name}</div>
                <div className="text-[10px] text-zinc-600 font-mono">{p.dur}s</div>
              </button>
            ))}
          </div>
        </div>

        {/* Form Inputs */}
        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <div className="flex flex-col gap-1">
            <label className="text-[11px] text-zinc-400 font-medium">Ses Başlığı</label>
            <input
              type="text"
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Örn: MLG Airhorn, CS2 Flashbang..."
              className="px-2.5 py-1.5 rounded-md bg-zinc-950 border border-zinc-800 text-xs text-white placeholder-zinc-600 focus:outline-none focus:border-zinc-600"
            />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div className="flex flex-col gap-1">
              <label className="text-[11px] text-zinc-400 font-medium flex items-center gap-1">
                <Tag className="w-3 h-3 text-zinc-500" />
                <span>Kategori</span>
              </label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value as SoundCategory)}
                className="px-2 py-1.5 rounded-md bg-zinc-950 border border-zinc-800 text-xs text-zinc-300 focus:outline-none focus:border-zinc-600"
              >
                {categories.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-[11px] text-zinc-400 font-medium flex items-center gap-1">
                <Keyboard className="w-3 h-3 text-zinc-500" />
                <span>Kısayol</span>
              </label>
              <input
                type="text"
                value={hotkey}
                onChange={(e) => setHotkey(e.target.value.toUpperCase())}
                placeholder="Örn: F9"
                className="px-2.5 py-1.5 rounded-md bg-zinc-950 border border-zinc-800 text-xs font-mono text-white placeholder-zinc-600 focus:outline-none focus:border-zinc-600"
              />
            </div>
          </div>

          {/* Action buttons */}
          <div className="flex items-center justify-end gap-2 pt-2 border-t border-zinc-800/80">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1.5 rounded-md text-xs text-zinc-400 hover:text-white transition-colors"
            >
              İptal
            </button>
            <button
              type="submit"
              disabled={!title}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-white hover:bg-zinc-200 disabled:opacity-40 text-black text-xs font-medium transition-colors cursor-pointer"
            >
              <Check className="w-3.5 h-3.5" />
              <span>Ekle</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
