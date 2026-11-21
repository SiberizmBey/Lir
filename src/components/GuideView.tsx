import { motion } from "motion/react";
import { ShieldCheck, Sliders, HelpCircle } from "lucide-react";

export function GuideView() {
    const ease = [0.22, 1, 0.36, 1] as const;

    return (
        <div className="flex-1 flex flex-col gap-6 w-full">
            {/* Page Header */}
            <div className="flex items-center gap-3.5">
                <div className="w-11 h-11 ui-inner bg-[var(--accent-subtle)] border border-[var(--accent-border)] text-[var(--accent-text)] flex items-center justify-center shrink-0">
                    <HelpCircle className="w-5 h-5" />
                </div>
                <div>
                    <div className="flex items-center gap-2.5">
                        <h1 className="text-lg font-bold text-[var(--text-primary)] tracking-tight">
                            Dokümantasyon &amp; Kurulum
                        </h1>
                        <span className="text-xs font-mono border border-[var(--accent-border)] bg-[var(--accent-subtle)] text-[var(--accent-text)] px-2.5 py-0.5 ui-control font-semibold">
                            DOCS
                        </span>
                    </div>
                    <p className="text-xs sm:text-[13px] text-[var(--text-secondary)] mt-0.5">
                        Lir&apos;i masaüstünde çalıştırma ve oyunlarda Soundpad gibi kullanma adımları.
                    </p>
                </div>
            </div>

            {/* Architecture Deep Dive */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.22, delay: 0.04, ease }}
                    whileHover={{ y: -2 }}
                    className="app-card ui-card p-5 border border-[var(--border-card)] flex flex-col gap-2.5"
                >
                    <div className="flex items-center gap-2.5 text-sm font-semibold text-[var(--text-primary)]">
                        <ShieldCheck className="w-4 h-4 text-[var(--accent-text)]" />
                        <span>Global Shortcuts (Arka Plan Kancası)</span>
                    </div>
                    <p className="text-xs sm:text-[13px] text-[var(--text-secondary)] leading-relaxed">
                        Electron{" "}
                        <code className="font-mono text-[var(--accent-text)] bg-[var(--bg-inner)] px-1.5 py-0.5 rounded">
                            globalShortcut
                        </code>{" "}
                        modülü sayesinde pencere odakta olmasa dahi işletim sistemi düzeyinde klavye basışlarını yakalar.
                    </p>
                </motion.div>

                <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.22, delay: 0.08, ease }}
                    whileHover={{ y: -2 }}
                    className="app-card ui-card p-5 border border-[var(--border-card)] flex flex-col gap-2.5"
                >
                    <div className="flex items-center gap-2.5 text-sm font-semibold text-[var(--text-primary)]">
                        <Sliders className="w-4 h-4 text-[var(--accent-text)]" />
                        <span>Sanal Ses Kablosu &amp; Dual Output</span>
                    </div>
                    <p className="text-xs sm:text-[13px] text-[var(--text-secondary)] leading-relaxed">
                        Sesi hem sanal mikrofona (
                        <code className="font-mono text-[var(--accent-text)] bg-[var(--bg-inner)] px-1.5 py-0.5 rounded">
                            CABLE Input
                        </code>
                        ) hem kendi kulaklığınıza (
                        <code className="font-mono text-[var(--accent-text)] bg-[var(--bg-inner)] px-1.5 py-0.5 rounded">
                            Speakers
                        </code>
                        ) gecikmesiz olarak yönlendirir.
                    </p>
                </motion.div>
            </div>

            {/* Discord / Game Setup Steps */}
            <motion.div
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.24, delay: 0.12, ease }}
                className="app-card ui-card p-5 sm:p-6 border border-[var(--border-card)] flex flex-col gap-4"
            >
                <h2 className="text-sm font-semibold text-[var(--text-primary)]">
                    Discord &amp; Oyun Ayarları
                </h2>
                <div className="grid grid-cols-1 gap-3 text-xs sm:text-[13px] text-[var(--text-secondary)]">
                    <div className="flex items-start gap-3 p-3.5 ui-inner bg-[var(--bg-inner)] border border-[var(--border-subtle)]">
                        <span className="font-mono font-bold text-[var(--accent-text)]">01.</span>
                        <div>
                            <strong className="text-[var(--text-primary)]">
                                Discord Giriş Aygıtı:
                            </strong>{" "}
                            Kullanıcı Ayarları &gt; Ses ve Görüntü &gt; Giriş Aygıtı olarak{" "}
                            <span className="text-[var(--accent-text)] font-mono">
                                CABLE Output
                            </span>{" "}
                            seçin.
                        </div>
                    </div>
                    <div className="flex items-start gap-3 p-3.5 ui-inner bg-[var(--bg-inner)] border border-[var(--border-subtle)]">
                        <span className="font-mono font-bold text-[var(--accent-text)]">02.</span>
                        <div>
                            <strong className="text-[var(--text-primary)]">
                                Oyun İçi Mikrofon:
                            </strong>{" "}
                            Windows varsayılan kayıt aygıtını &quot;CABLE Output&quot; yaptığınızda veya oyun içi mikrofon ayarını &quot;CABLE Output&quot; seçtiğinizde tuşa basınca ses yayına gider.
                        </div>
                    </div>
                    <div className="flex items-start gap-3 p-3.5 ui-inner bg-[var(--bg-inner)] border border-[var(--border-subtle)]">
                        <span className="font-mono font-bold text-[var(--accent-text)]">03.</span>
                        <div>
                            <strong className="text-[var(--text-primary)]">
                                Dual Output:
                            </strong>{" "}
                            Lir uygulamasında &quot;Çift Çıkış&quot; açık olduğu sürece kendi bastığınız sesleri siz de kulaklığınızdan gecikmesiz duyarsınız.
                        </div>
                    </div>
                    <div className="flex items-start gap-3 p-3.5 ui-inner bg-[var(--bg-inner)] border border-[var(--border-subtle)]">
                        <span className="font-mono font-bold text-[var(--accent-text)]">04.</span>
                        <div>
                            <strong className="text-[var(--text-primary)]">
                                Discord Rich Presence (RPC):
                            </strong>{" "}
                            Discord profilinizde ne çaldığınız ve aktif sesler otomatik olarak görüntülenir.
                        </div>
                    </div>
                    <div className="flex items-start gap-3 p-3.5 ui-inner bg-[var(--bg-inner)] border border-[var(--border-subtle)]">
                        <span className="font-mono font-bold text-[var(--accent-text)]">05.</span>
                        <div>
                            <strong className="text-[var(--text-primary)]">
                                Tüm Sesleri Durdur:
                            </strong>{" "}
                            Üst çubuktaki durdur düğmesine basarak çalan tüm sesleri anında kesebilir veya Ayarlar’dan bir durdurma kısayolu atayabilirsiniz.
                        </div>
                    </div>
                </div>
            </motion.div>
        </div>
    );
}
