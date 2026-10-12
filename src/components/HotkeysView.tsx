import { useState } from 'react';
import { Keyboard, Play, Edit2, AlertCircle, Search } from 'lucide-react';
import { SoundItem } from '../types/sound';

interface HotkeysViewProps {
  sounds: SoundItem[];
  onOpenHotkeyModal: (sound: SoundItem) => void;
  onPlaySound: (sound: SoundItem) => void;
  isElectron: boolean;
}

export function HotkeysView({
  sounds,
  onOpenHotkeyModal,
  onPlaySound,
  isElectron
}: HotkeysViewProps) {
  const [filterQuery, setFilterQuery] = useState('');

  const assignedSounds = sounds.filter(s => s.hotkey.trim() !== '');

  const hotkeyCounts: Record<string, number> = {};
  sounds.forEach(s => {
    if (s.hotkey) {
      const k = s.hotkey.toUpperCase();
      hotkeyCounts[k] = (hotkeyCounts[k] || 0) + 1;
    }
  });

  const filteredSounds = sounds.filter(s => 
    s.title.toLowerCase().includes(filterQuery.toLowerCase()) ||
    s.hotkey.toLowerCase().includes(filterQuery.toLowerCase())
  );

  return (
    <div className="flex-1 flex flex-col gap-5 p-6 overflow-y-auto max-w-5xl mx-auto w-full">
      {/* Title */}
      <div className="flex flex-col gap-1">
        <div className="flex items-center gap-2">
          <h1 className="text-base font-semibold text-white tracking-tight">Kısayol Matrisi</h1>
          <span className="text-[11px] font-mono border border-zinc-800 bg-zinc-950 text-zinc-400 px-1.5 py-0.2 rounded">
            {assignedSounds.length} Tuş Aktif
          </span>
        </div>
        <p className="text-xs text-zinc-400">
          {isElectron
            ? 'Electron arka plan servisi ile oyun ve Discord arkasındayken sistem genelinde dinlenir.'
            : 'Web önizlemesinde bu sekme etkinken klavye tuşlarınızla anında test edebilirsiniz.'}
        </p>
      </div>

      {/* Search toolbar */}
      <div className="flex items-center justify-between gap-3">
        <div className="relative max-w-xs w-full">
          <Search className="w-3.5 h-3.5 text-zinc-500 absolute left-2.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={filterQuery}
            onChange={(e) => setFilterQuery(e.target.value)}
            placeholder="Kısayol veya ses ara..."
            className="w-full pl-8 pr-3 py-1.5 rounded-md bg-zinc-950 text-xs text-zinc-200 border border-zinc-800 focus:outline-none focus:border-zinc-600"
          />
        </div>

        <span className="text-[11px] font-mono text-zinc-500">
          {filteredSounds.length} kayıt listelendi
        </span>
      </div>

      {/* Flat Vercel Table */}
      <div className="app-card rounded-xl bg-[#0a0a0a] border border-zinc-800/80 overflow-hidden">
        <div className="px-4 py-2.5 border-b border-zinc-800/80 flex items-center justify-between text-[11px] font-mono uppercase text-zinc-500">
          <span>Kısayol Tuşu & Ses Dosyası</span>
          <span>İşlemler</span>
        </div>

        <div className="divide-y divide-zinc-800/60">
          {filteredSounds.map((sound) => {
            const isDuplicate = sound.hotkey && hotkeyCounts[sound.hotkey.toUpperCase()] > 1;

            return (
              <div
                key={sound.id}
                className="px-4 py-3 flex items-center justify-between gap-4 hover:bg-zinc-900/40 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => onOpenHotkeyModal(sound)}
                    className={`min-w-[70px] text-center px-2 py-0.5 rounded text-xs font-mono font-medium border transition-colors cursor-pointer ${
                      sound.hotkey
                        ? isDuplicate
                          ? 'bg-amber-950/40 border-amber-800 text-amber-300'
                          : 'bg-zinc-900 border-zinc-700 text-zinc-200 hover:border-zinc-500'
                        : 'bg-zinc-950 border-dashed border-zinc-800 text-zinc-600 hover:text-zinc-400'
                    }`}
                  >
                    {sound.hotkey || '+ Ata'}
                  </button>

                  <div className="flex flex-col">
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs font-medium text-zinc-200">{sound.title}</span>
                      {(sound.category === 'Spotify' || sound.spotifyUri) && (
                        <span className="text-[10px] font-mono text-[#1db954] bg-[#1db954]/10 border border-[#1db954]/30 px-1 py-0.2 rounded">
                          Spotify
                        </span>
                      )}
                    </div>
                    <span className="text-[11px] text-zinc-500">
                      {sound.spotifyArtist || sound.category} · {sound.duration.toFixed(0)}s
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  {isDuplicate && (
                    <div className="flex items-center gap-1 text-[11px] text-amber-400">
                      <AlertCircle className="w-3.5 h-3.5" />
                      <span>Çakışma</span>
                    </div>
                  )}

                  <button
                    onClick={() => onPlaySound(sound)}
                    className="p-1.5 rounded hover:bg-zinc-800 text-zinc-400 hover:text-white transition-colors"
                    title="Test Et"
                  >
                    <Play className="w-3.5 h-3.5 fill-current" />
                  </button>

                  <button
                    onClick={() => onOpenHotkeyModal(sound)}
                    className="p-1.5 rounded hover:bg-zinc-800 text-zinc-400 hover:text-white transition-colors"
                    title="Düzenle"
                  >
                    <Edit2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
