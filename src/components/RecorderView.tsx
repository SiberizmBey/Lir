import { useState, useRef, useEffect } from 'react';
import { Mic, Square, Play, Check, AlertCircle } from 'lucide-react';
import { SoundItem } from '../types/sound';

interface RecorderViewProps {
  onAddRecordedSound: (sound: Omit<SoundItem, 'id' | 'addedAt'>) => void;
}

export function RecorderView({ onAddRecordedSound }: RecorderViewProps) {
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [soundTitle, setSoundTitle] = useState('Mikrofon Kaydı ' + new Date().toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' }));
  const [suggestedHotkey, setSuggestedHotkey] = useState('F9');
  const [isPlayingPreview, setIsPlayingPreview] = useState(false);
  const [micError, setMicError] = useState<string | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<number | null>(null);
  const audioPreviewRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  const startRecording = async () => {
    setMicError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        const reader = new FileReader();
        reader.onloadend = () => {
          setAudioUrl(reader.result as string);
        };
        reader.readAsDataURL(audioBlob);

        stream.getTracks().forEach(track => track.stop());
      };

      mediaRecorder.start(100);
      setIsRecording(true);
      setRecordingTime(0);
      setAudioUrl(null);

      timerRef.current = window.setInterval(() => {
        setRecordingTime(prev => prev + 0.1);
      }, 100);
    } catch (err) {
      console.error('Mikrofon erişim hatası:', err);
      setMicError('Mikrofona erişilemedi. Lütfen tarayıcı ve sistem mikrofon izinlerini kontrol edin.');
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    }
  };

  const handlePlayPreview = () => {
    if (!audioUrl) return;
    if (isPlayingPreview && audioPreviewRef.current) {
      audioPreviewRef.current.pause();
      setIsPlayingPreview(false);
      return;
    }

    const audio = new Audio(audioUrl);
    audioPreviewRef.current = audio;
    setIsPlayingPreview(true);
    audio.play();
    audio.onended = () => setIsPlayingPreview(false);
  };

  const handleSaveToSoundboard = () => {
    if (!audioUrl) return;

    onAddRecordedSound({
      title: soundTitle.trim() || 'Mikrofon Kaydı',
      category: 'Özel',
      hotkey: suggestedHotkey.toUpperCase() || 'F9',
      duration: Math.max(0.5, recordingTime),
      volume: 1.0,
      isFavorite: false,
      loop: false,
      playMode: 'overlap',
      dataUrl: audioUrl
    });

    setAudioUrl(null);
    setRecordingTime(0);
    setSoundTitle('Yeni Kayıt ' + new Date().toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' }));
  };

  return (
    <div className="flex-1 flex flex-col gap-5 p-6 overflow-y-auto max-w-4xl mx-auto w-full">
      {/* Title */}
      <div className="flex flex-col gap-1">
        <div className="flex items-center gap-2">
          <h1 className="text-base font-semibold text-white tracking-tight">Mikrofon Kaydedici</h1>
          <span className="text-[11px] font-mono border border-zinc-800 bg-zinc-950 text-zinc-400 px-1.5 py-0.2 rounded">
            MIC IN
          </span>
        </div>
        <p className="text-xs text-zinc-400">
          Mikrofonunuzdan anlık ses kaydedip kısayol tuşu atayarak soundboard'a ekleyin.
        </p>
      </div>

      {/* Error Banner */}
      {micError && (
        <div className="p-3 rounded-lg bg-rose-950/40 border border-rose-800/80 text-rose-300 text-xs flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
            <span>{micError}</span>
          </div>
          <button
            onClick={() => setMicError(null)}
            className="text-rose-400 hover:text-white text-xs px-2 py-0.5 rounded bg-rose-900/50 hover:bg-rose-900 transition-colors"
          >
            Kapat
          </button>
        </div>
      )}

      {/* Recording Box */}
      <div className="app-card p-8 rounded-xl bg-[#0a0a0a] border border-zinc-800/80 flex flex-col items-center justify-center gap-5">
        <div className="flex flex-col items-center gap-1">
          <span className="font-mono text-4xl font-semibold tracking-tight text-white tabular-nums">
            {recordingTime.toFixed(1)}s
          </span>
          <span className="text-xs text-zinc-500 font-mono">
            {isRecording ? 'KAYIT YAPILIYOR...' : audioUrl ? 'KAYIT TAMAMLANDI' : 'HAZIR'}
          </span>
        </div>

        {/* Action Button */}
        <div>
          {!isRecording ? (
            <button
              onClick={startRecording}
              className="flex items-center gap-2 px-5 py-2.5 rounded-lg bg-white hover:bg-zinc-200 text-black text-xs font-medium transition-colors cursor-pointer"
            >
              <Mic className="w-4 h-4" />
              <span>Kaydı Başlat</span>
            </button>
          ) : (
            <button
              onClick={stopRecording}
              className="flex items-center gap-2 px-5 py-2.5 rounded-lg bg-rose-600 hover:bg-rose-500 text-white text-xs font-medium transition-colors cursor-pointer animate-pulse"
            >
              <Square className="w-4 h-4 fill-current" />
              <span>Kaydı Durdur</span>
            </button>
          )}
        </div>

        {/* Preview Details */}
        {audioUrl && !isRecording && (
          <div className="w-full max-w-md p-4 rounded-lg bg-zinc-950 border border-zinc-800 flex flex-col gap-3">
            <div className="flex items-center justify-between pb-2 border-b border-zinc-800/80">
              <span className="text-xs font-medium text-white">Kayıt Önizleme</span>
              <button
                onClick={handlePlayPreview}
                className="flex items-center gap-1 px-2.5 py-1 rounded bg-zinc-900 hover:bg-zinc-800 text-zinc-200 text-xs font-mono border border-zinc-700 transition-colors"
              >
                <Play className="w-3 h-3 fill-current" />
                <span>{isPlayingPreview ? 'Durdur' : 'Dinle'}</span>
              </button>
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-[11px] text-zinc-500">Ses Başlığı</label>
              <input
                type="text"
                value={soundTitle}
                onChange={(e) => setSoundTitle(e.target.value)}
                className="px-2.5 py-1.5 rounded-md bg-zinc-900 border border-zinc-800 text-xs text-white focus:outline-none focus:border-zinc-600"
              />
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-[11px] text-zinc-500">Kısayol Tuşu</label>
              <input
                type="text"
                value={suggestedHotkey}
                onChange={(e) => setSuggestedHotkey(e.target.value.toUpperCase())}
                placeholder="Örn: F9"
                className="px-2.5 py-1.5 rounded-md bg-zinc-900 border border-zinc-800 text-xs font-mono text-white focus:outline-none focus:border-zinc-600"
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-zinc-800/80">
              <button
                onClick={() => setAudioUrl(null)}
                className="px-2.5 py-1 rounded-md text-xs text-zinc-500 hover:text-white"
              >
                İptal
              </button>
              <button
                onClick={handleSaveToSoundboard}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-white hover:bg-zinc-200 text-black text-xs font-medium transition-colors cursor-pointer"
              >
                <Check className="w-3.5 h-3.5" />
                <span>Soundboard'a Ekle</span>
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
