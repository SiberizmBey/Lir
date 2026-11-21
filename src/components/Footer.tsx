import { FlaskConical, History, Github, Instagram } from "lucide-react";

const ANTIC_VALLEY_ASSETS = "https://labs.anticvalley.com.tr/assets/img";
const ANTIC_VALLEY_PROJECTS = [
    {
        name: "Koza",
        description: "Güvenli kasa ve parola yönetimi",
        image: "koza.png",
    },
    {
        name: "Kirpi",
        description: "ERP & MES Platformu",
        image: "kirpi.png",
    },
    {
        name: "Kirpi: SG",
        description: "Endüstriyel Akıllı Üretim",
        image: "kirpifab.png",
    },
    {
        name: "Yonga (Eski Adıyla: MFGI)",
        description: "Operasyonel Altyapı",
        image: "mfgi.png",
    },
];

export function Footer() {
    return (
        <footer className="app-card ui-card mt-auto border border-[var(--border-card)] p-5 sm:p-6">
            <div className="flex flex-col gap-5">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                    <a
                        href="https://labs.anticvalley.com.tr/"
                        target="_blank"
                        rel="noreferrer"
                        className="flex items-center gap-3 group"
                    >
                        <span className="flex h-10 w-10 items-center justify-center ui-input border border-[var(--border-subtle)] bg-[var(--bg-inner)] p-2">
                            <img
                                src={`${ANTIC_VALLEY_ASSETS}/anticvalley.png`}
                                alt="Antic Valley"
                                className="h-full w-full object-contain"
                            />
                        </span>
                        <span>
                            <span className="block text-sm font-semibold text-[var(--text-primary)] group-hover:text-[var(--accent-text)] transition-colors">
                                Antic Valley
                            </span>
                            <span className="block text-xs text-[var(--text-secondary)]">
                                Antic Valley tarafından geliştirildi.
                            </span>
                        </span>
                    </a>

                    <div className="flex flex-wrap items-center gap-2">
                        <a
                            href="https://labs.anticvalley.com.tr/"
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-2 ui-control border border-[var(--border-subtle)] bg-[var(--bg-inner)] px-3.5 py-2 text-xs text-[var(--text-secondary)] transition-colors hover:border-[var(--border-hover)] hover:text-[var(--text-primary)]"
                        >
                            <FlaskConical className="h-3.5 w-3.5" />
                            Projeler
                        </a>
                        <a
                            href="https://labs.anticvalley.com.tr/"
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-2 ui-control border border-[var(--border-subtle)] bg-[var(--bg-inner)] px-3.5 py-2 text-xs text-[var(--text-secondary)] transition-colors hover:border-[var(--border-hover)] hover:text-[var(--text-primary)]"
                        >
                            <History className="h-3.5 w-3.5" />
                            Günlük gelişmeler
                        </a>
                        <a
                            href="https://github.com/SiberizmBey"
                            target="_blank"
                            rel="noreferrer"
                            aria-label="Antic Valley GitHub"
                            className="inline-flex h-9 w-9 items-center justify-center ui-control border border-[var(--border-subtle)] bg-[var(--bg-inner)] text-[var(--text-secondary)] transition-colors hover:border-[var(--border-hover)] hover:text-[var(--text-primary)]"
                        >
                            <Github className="h-4 w-4" />
                        </a>
                        <a
                            href="https://instagram.com/ahmetinzmsec"
                            target="_blank"
                            rel="noreferrer"
                            aria-label="Antic Valley Instagram"
                            className="inline-flex h-9 w-9 items-center justify-center ui-control border border-[var(--border-subtle)] bg-[var(--bg-inner)] text-[var(--text-secondary)] transition-colors hover:border-[var(--border-hover)] hover:text-[var(--text-primary)]"
                        >
                            <Instagram className="h-4 w-4" />
                        </a>
                    </div>
                </div>

                <div>
                    <h3 className="mb-2.5 text-[11px] font-semibold tracking-wider text-[var(--text-muted)] uppercase">
                        Ekosistemimizle Tanışın
                    </h3>
                    <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 xl:grid-cols-4">
                        {ANTIC_VALLEY_PROJECTS.map((project) => (
                            <a
                                key={project.name}
                                href="https://labs.anticvalley.com.tr/"
                                target="_blank"
                                rel="noreferrer"
                                className="flex min-w-0 items-center gap-3 ui-inner border border-[var(--border-subtle)] bg-[var(--bg-inner)] p-3 transition-colors hover:border-[var(--border-hover)] hover:bg-[var(--bg-card-hover)]"
                            >
                                <span className="flex h-10 w-10 shrink-0 items-center justify-center ui-input border border-[var(--border-subtle)] bg-[var(--bg-card)] p-2">
                                    <img
                                        src={`${ANTIC_VALLEY_ASSETS}/${project.image}`}
                                        alt=""
                                        className="h-full w-full object-contain"
                                        loading="lazy"
                                    />
                                </span>
                                <span className="min-w-0">
                                    <span className="block truncate text-xs font-semibold text-[var(--text-primary)]">
                                        {project.name}
                                    </span>
                                    <span className="mt-0.5 block truncate text-[11px] text-[var(--text-secondary)]">
                                        {project.description}
                                    </span>
                                </span>
                            </a>
                        ))}
                    </div>
                </div>

                <p className="text-center text-xs text-[var(--text-muted)] pt-1 border-t border-[var(--border-subtle)]">
                    © {new Date().getFullYear()} Antic Valley · Lir Açık Kaynak Soundpad (MIT Lisans)
                </p>
            </div>
        </footer>
    );
}
