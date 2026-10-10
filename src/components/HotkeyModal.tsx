import { useState, useEffect } from 'react';
import { Keyboard, X, Check, AlertCircle } from 'lucide-react';
import { SoundItem } from '../types/sound';

interface HotkeyModalProps {
  sound: SoundItem | null;
  allSounds: SoundItem[];
  onClose: () => void;
  onSaveHotkey: (soundId: string, newHotkey: string) => void;
}

export function HotkeyModal({
  sound,
  allSounds,
  onClose,
  onSaveHotkey
}: HotkeyModalProps) {
  const [currentHotkey, setCurrentHotkey] = useState(sound?.hotkey || '');
  const [conflictSound, setConflictSound] = useState<SoundItem | null>(null);

  useEffect(() => {
    if (sound) {
      setCurrentHotkey(sound.hotkey);
    }
  }, [sound]);

  useEffect(() => {
    if (!currentHotkey || !sound) {
      setConflictSound(null);
      return;
    }

    const conflict = allSounds.find(
      (s) => s.id !== sound.id && s.hotkey.toUpperCase() === currentHotkey.toUpperCase()
    );
    setConflictSound(conflict || null);
  }, [currentHotkey, sound, allSounds]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();

      if (e.key === 'Escape' && !e.ctrlKey && !e.altKey && !e.shiftKey) {
        onClose();
        return;
      }

      const modifiers: string[] = [];
      if (e.ctrlKey) modifiers.push('CTRL');
      if (e.altKey) modifiers.push('ALT');
      if (e.shiftKey) modifiers.push('SHIFT');

      let mainKey = e.key.toUpperCase();

      if (e.code.startsWith('F') && !isNaN(parseInt(e.code.slice(1)))) {
        mainKey = e.code;
      } else if (e.code.startsWith('Numpad')) {
        mainKey = e.code.toUpperCase();
      } else if (mainKey === ' ' || e.code === 'Space') {
        mainKey = 'SPACE';
      } else if (['CONTROL', 'ALT', 'SHIFT', 'META'].includes(mainKey)) {
        return;
      }

      const combined = modifiers.length > 0 ? `${modifiers.join('+')}+${mainKey}` : mainKey;
      setCurrentHotkey(combined);
    };

    window.addEventListener('keydown', handleKeyDown, true);
    return () => {
      window.removeEventListener('keydown', handleKeyDown, true);
    };
  }, [onClose]);

  if (!sound) return null;

  const handleSave = () => {
    onSaveHotkey(sound.id, currentHotkey);
    onClose();
  };

  const commonPresets = ['F1', 'F2', 'F3', 'F4', 'F5', 'F6', 'F7', 'F8', 'F9', 'F10', 'NUMPAD 1', 'NUMPAD 2'];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
      <div className="w-full max-w-md bg-[#0a0a0a] border border-zinc-800 rounded-xl p-5 flex flex-col gap-4">
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-zinc-800/80">
          <div className="flex items-center gap-2">
            <Keyboard className="w-4 h-4 text-zinc-400" />
            <h2 className="text-xs font-semibold text-white">Kısayol Tuşu Ata</h2>
            <span className="text-zinc-500">/</span>
            <span className="text-xs text-zinc-400 truncate max-w-[200px]">{sound.title}</span>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded text-zinc-500 hover:text-white transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Listening Box */}
        <div className="flex flex-col items-center justify-center py-6 px-4 rounded-lg bg-zinc-950 border border-zinc-800 text-center gap-2">
          <span className="text-xs text-zinc-400">Herhangi bir tuşa veya tuş kombinasyonuna basın:</span>
          <div className="px-4 py-2 rounded-md bg-zinc-900 border border-zinc-700 text-white text-lg font-mono font-medium tracking-wide">
            {currentHotkey || 'Bir Tuşa Basın...'}
          </div>
          <span className="text-[11px] text-zinc-600 font-mono">
            F1-F12 · Numpad · CTRL / ALT Kombinasyonları
          </span>
        </div>

        {/* Conflict Warning */}
        {conflictSound && (
          <div className="flex items-start gap-2 p-2.5 rounded-lg bg-amber-950/30 border border-amber-800/60 text-amber-300 text-xs">
            <AlertCircle className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" />
            <div>
              <strong>Çakışma:</strong> Bu kısayol <span className="underline">{conflictSound.title}</span> için
              kullanılıyor. Kaydedilirse bu sese atanacak.
            </div>
          </div>
        )}

        {/* Presets */}
        <div className="flex flex-col gap-1.5">
          <span className="text-[11px] text-zinc-500 font-medium">Hızlı Seçim:</span>
          <div className="flex flex-wrap gap-1">
            {commonPresets.map((preset) => (
              <button
                key={preset}
                onClick={() => setCurrentHotkey(preset)}
                className={`px-2 py-0.5 rounded text-[11px] font-mono transition-colors ${
                  currentHotkey === preset
                    ? 'bg-white text-black font-medium'
                    : 'bg-zinc-900 text-zinc-400 hover:text-white border border-zinc-800'
                }`}
              >
                {preset}
              </button>
            ))}
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center justify-end gap-2 pt-2 border-t border-zinc-800/80">
          <button
            onClick={() => setCurrentHotkey('')}
            className="px-2.5 py-1.5 rounded-md text-xs text-zinc-400 hover:text-white transition-colors"
          >
            Kaldır
          </button>
          <button
            onClick={onClose}
            className="px-3 py-1.5 rounded-md text-xs text-zinc-300 hover:bg-zinc-900 transition-colors"
          >
            İptal
          </button>
          <button
            onClick={handleSave}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-white hover:bg-zinc-200 text-black text-xs font-medium transition-colors"
          >
            <Check className="w-3.5 h-3.5" />
            <span>Kaydet</span>
          </button>
        </div>
      </div>
    </div>
  );
}
