import { useState } from 'react';
import { 
  Terminal, 
  Check, 
  Copy, 
  ShieldCheck, 
  Sliders
} from 'lucide-react';

export function GuideView() {
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);

  const copyToClipboard = (text: string, index: number) => {
    navigator.clipboard.writeText(text);
    setCopiedIndex(index);
    setTimeout(() => setCopiedIndex(null), 2000);
  };

  const codeSnippets = [
    {
      title: '1. Bağımlılıkları Yükle',
      cmd: 'npm install --legacy-peer-deps'
    },
    {
      title: '2. Doğrudan Masaüstünde Çalıştır (Önerilen)',
      cmd: 'npm run electron:start'
    },
    {
      title: '3. Canlı Değişiklikler İçin (Vite + Electron)',
      cmd: 'npm run dev  (ve başka terminalde: npm run electron:dev)'
    },
    {
      title: '4. Windows Setup .exe Derle',
      cmd: 'npm run electron:build'
    }
  ];

  return (
    <div className="flex-1 flex flex-col gap-5 p-6 overflow-y-auto max-w-5xl mx-auto w-full">
      {/* Title */}
      <div className="flex flex-col gap-1">
        <div className="flex items-center gap-2">
          <h1 className="text-base font-semibold text-white tracking-tight">Dokümantasyon & Kurulum</h1>
          <span className="text-[11px] font-mono border border-zinc-800 bg-zinc-950 text-zinc-400 px-1.5 py-0.2 rounded">
            DOCS
          </span>
        </div>
        <p className="text-xs text-zinc-400">
          Lir'i masaüstünde çalıştırma ve oyunlarda Soundpad gibi kullanma adımları.
        </p>
      </div>

      {/* Terminal Commands Card */}
      <div className="p-4 rounded-xl bg-[#0a0a0a] border border-zinc-800/80 flex flex-col gap-3">
        <div className="flex items-center gap-2 text-xs font-semibold text-white">
          <Terminal className="w-3.5 h-3.5 text-zinc-400" />
          <span>Terminal Komutları</span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
          {codeSnippets.map((item, idx) => (
            <div key={idx} className="p-2.5 rounded-lg bg-zinc-950 border border-zinc-850 flex flex-col gap-1.5">
              <span className="text-[11px] text-zinc-400 font-medium">{item.title}</span>
              <div className="flex items-center justify-between px-2.5 py-1.5 rounded bg-[#000000] border border-zinc-800 font-mono text-xs text-zinc-200">
                <code className="truncate mr-2">{item.cmd}</code>
                <button
                  onClick={() => copyToClipboard(item.cmd, idx)}
                  className="p-1 text-zinc-500 hover:text-white transition-colors shrink-0"
                  title="Kopyala"
                >
                  {copiedIndex === idx ? (
                    <Check className="w-3 h-3 text-emerald-400" />
                  ) : (
                    <Copy className="w-3 h-3" />
                  )}
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Architecture Deep Dive */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="p-4 rounded-xl bg-[#0a0a0a] border border-zinc-800/80 flex flex-col gap-2">
          <div className="flex items-center gap-2 text-xs font-semibold text-white">
            <ShieldCheck className="w-4 h-4 text-emerald-400" />
            <span>Global Shortcuts (Arka Plan Kancası)</span>
          </div>
          <p className="text-xs text-zinc-400 leading-relaxed">
            Electron <code className="font-mono text-zinc-200">globalShortcut</code> modülü sayesinde pencere odakta olmasa dahi işletim sistemi düzeyinde klavye basışlarını yakalar.
          </p>
        </div>

        <div className="p-4 rounded-xl bg-[#0a0a0a] border border-zinc-800/80 flex flex-col gap-2">
          <div className="flex items-center gap-2 text-xs font-semibold text-white">
            <Sliders className="w-4 h-4 text-zinc-400" />
            <span>Sanal Ses Kablosu & Dual Output</span>
          </div>
          <p className="text-xs text-zinc-400 leading-relaxed">
            Sesi hem sanal mikrofona (<code className="font-mono text-zinc-200">CABLE Input</code>) hem kendi kulaklığınıza (<code className="font-mono text-zinc-200">Speakers</code>) gecikmesiz olarak yönlendirir.
          </p>
        </div>
      </div>

      {/* Discord / Game Setup Steps */}
      <div className="p-4 rounded-xl bg-[#0a0a0a] border border-zinc-800/80 flex flex-col gap-3">
        <h2 className="text-xs font-semibold text-white">Discord & Oyun Ayarları</h2>
        <div className="space-y-2 text-xs text-zinc-400">
          <div className="flex items-start gap-2">
            <span className="font-mono text-zinc-600">01.</span>
            <div>
              <strong className="text-zinc-200">Discord Giriş Aygıtı:</strong> Kullanıcı Ayarları &gt; Ses ve Görüntü &gt; Giriş Aygıtı olarak <span className="text-zinc-200 font-mono">CABLE Output</span> seçin.
            </div>
          </div>
          <div className="flex items-start gap-2">
            <span className="font-mono text-zinc-600">02.</span>
            <div>
              <strong className="text-zinc-200">Oyun İçi Mikrofon:</strong> Windows varsayılan kayıt aygıtını "CABLE Output" yaptığınızda veya oyun içi mikrofon ayarını "CABLE Output" seçtiğinizde tuşa basınca ses yayına gider.
            </div>
          </div>
          <div className="flex items-start gap-2">
            <span className="font-mono text-zinc-600">03.</span>
            <div>
              <strong className="text-zinc-200">Dual Output:</strong> Lir uygulamasında "Çift Çıkış" açık olduğu sürece kendi bastığınız sesleri siz de kulaklığınızdan gecikmesiz duyarsınız.
            </div>
          </div>
          <div className="flex items-start gap-2">
            <span className="font-mono text-zinc-600">04.</span>
            <div>
              <strong className="text-zinc-200">Discord Rich Presence (RPC):</strong> Bot ID <span className="text-indigo-300 font-mono">1558769862053077114</span> ile Discord profilinizde ne çaldığınız ve aktif sesler otomatik olarak görüntülenir.
            </div>
          </div>
          <div className="flex items-start gap-2">
            <span className="font-mono text-zinc-600">05.</span>
            <div>
              <strong className="text-zinc-200">Acil Durdurma (ESC):</strong> Herhangi bir anda <kbd className="px-1.5 py-0.5 rounded bg-zinc-900 border border-zinc-700 text-zinc-300 font-mono text-[10px]">ESC</kbd> tuşuna bastığınızda çalan tüm sesler anında kesilir. Kısayol tuşuna ikinci kez bastığınızda ise o ses durdurulur (Toggle).
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
