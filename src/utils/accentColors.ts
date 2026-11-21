import { ResolvedTheme } from "../types/sound";

export interface AccentPreset {
    id: string;
    name: string;
    hex: string;
}

export const DEFAULT_ACCENT_COLOR = "#22c55e";

export const ACCENT_PRESETS: AccentPreset[] = [
    { id: "lir-green", name: "Lir Yeşili (Varsayılan)", hex: "#22c55e" },
    { id: "koru-purple", name: "Koru Moru", hex: "#982376" },
    { id: "violet", name: "Menekşe Moru", hex: "#9333ea" },
    { id: "indigo", name: "Çivit", hex: "#6366f1" },
    { id: "emerald", name: "Zümrüt", hex: "#10b981" },
    { id: "ocean", name: "Okyanus", hex: "#3b82f6" },
    { id: "rose", name: "Gül Pembesi", hex: "#e11d48" },
    { id: "amber", name: "Kehribar", hex: "#f59e0b" },
    { id: "cyan", name: "Turkuaz", hex: "#06b6d4" },
];

export function normalizeHexColor(value: string): string | null {
    const clean = value.trim();
    if (/^#[0-9a-fA-F]{6}$/.test(clean)) {
        return clean.toLowerCase();
    }
    return null;
}

function hexToRgb(hex: string): { r: number; g: number; b: number } {
    const valid = normalizeHexColor(hex) ?? DEFAULT_ACCENT_COLOR;
    const intVal = Number.parseInt(valid.slice(1), 16);
    return {
        r: (intVal >> 16) & 255,
        g: (intVal >> 8) & 255,
        b: intVal & 255,
    };
}

function rgbToHex(r: number, g: number, b: number): string {
    const clampByte = (v: number) => Math.max(0, Math.min(255, Math.round(v)));
    return (
        "#" +
        [clampByte(r), clampByte(g), clampByte(b)]
            .map((v) => v.toString(16).padStart(2, "0"))
            .join("")
    );
}

function mixRgb(
    a: { r: number; g: number; b: number },
    b: { r: number; g: number; b: number },
    amount: number,
): string {
    return rgbToHex(
        a.r + (b.r - a.r) * amount,
        a.g + (b.g - a.g) * amount,
        a.b + (b.b - a.b) * amount,
    );
}

function getRelativeLuminance({ r, g, b }: { r: number; g: number; b: number }) {
    const channel = (c: number) => {
        const s = c / 255;
        return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
    };
    return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

export function applyAccentColorToRoot(
    accentHex: string,
    resolvedTheme: ResolvedTheme,
) {
    const rootStyle = document.documentElement.style;
    const baseHex = normalizeHexColor(accentHex) ?? DEFAULT_ACCENT_COLOR;
    const baseRgb = hexToRgb(baseHex);
    const white = { r: 255, g: 255, b: 255 };
    const black = { r: 0, g: 0, b: 0 };
    const isLight = resolvedTheme === "light";

    const accent = isLight ? mixRgb(baseRgb, black, 0.14) : baseHex;
    const accentRgbObj = hexToRgb(accent);
    const accentHover = isLight
        ? mixRgb(accentRgbObj, black, 0.16)
        : mixRgb(accentRgbObj, black, 0.14);
    const accentActive = isLight
        ? mixRgb(accentRgbObj, black, 0.28)
        : mixRgb(accentRgbObj, black, 0.26);
    const accentText = isLight
        ? mixRgb(baseRgb, black, 0.22)
        : mixRgb(baseRgb, white, 0.34);

    const luminance = getRelativeLuminance(accentRgbObj);
    const btnPrimaryText = luminance > 0.36 ? "#05140b" : "#ffffff";
    const btnPrimaryHover =
        luminance > 0.36
            ? mixRgb(accentRgbObj, white, 0.16)
            : mixRgb(accentRgbObj, black, 0.15);

    const subtleAlpha = isLight ? 0.12 : 0.16;
    const borderAlpha = isLight ? 0.36 : 0.44;
    const rgbString = `${accentRgbObj.r}, ${accentRgbObj.g}, ${accentRgbObj.b}`;

    rootStyle.setProperty("--accent", accent);
    rootStyle.setProperty("--accent-rgb", rgbString);
    rootStyle.setProperty("--accent-hover", accentHover);
    rootStyle.setProperty("--accent-active", accentActive);
    rootStyle.setProperty(
        "--accent-subtle",
        `rgba(${rgbString}, ${subtleAlpha})`,
    );
    rootStyle.setProperty(
        "--accent-border",
        `rgba(${rgbString}, ${borderAlpha})`,
    );
    rootStyle.setProperty("--accent-text", accentText);
    rootStyle.setProperty("--btn-primary-bg", accent);
    rootStyle.setProperty("--btn-primary-text", btnPrimaryText);
    rootStyle.setProperty("--btn-primary-hover", btnPrimaryHover);
    rootStyle.setProperty(
        "--badge-bg",
        `rgba(${rgbString}, ${subtleAlpha})`,
    );
    rootStyle.setProperty(
        "--badge-border",
        `rgba(${rgbString}, ${borderAlpha})`,
    );
    rootStyle.setProperty("--badge-text", accentText);
    rootStyle.setProperty("--scrollbar-thumb-hover", accent);
    rootStyle.setProperty("--main-theme", accent);
    rootStyle.setProperty("--theme-alt", accentActive);
    rootStyle.setProperty("--s-main-theme", accentText);
}
