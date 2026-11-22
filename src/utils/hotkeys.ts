export function normalizeHotkey(hotkey: string): string {
  return hotkey
    .trim()
    .toUpperCase()
    .replace(/\bESCAPE\b/g, 'ESC')
    .replace(/\bNUMPAD\s+([0-9])\b/g, 'NUMPAD$1');
}

export function extractHotkeyFromKeyboardEvent(e: KeyboardEvent): string | null {
  const rawKey = e.key.toUpperCase();
  if (['CONTROL', 'ALT', 'SHIFT', 'META', 'ALTGRAPH', 'DEAD', 'PROCESS'].includes(rawKey)) {
    return null;
  }

  const modifiers: string[] = [];
  if (e.ctrlKey) modifiers.push('CTRL');
  if (e.altKey) modifiers.push('ALT');
  if (e.shiftKey) modifiers.push('SHIFT');

  let mainKey = rawKey;
  const code = e.code || '';

  if (/^F([1-9]|1[0-9]|2[0-4])$/i.test(code)) {
    mainKey = code.toUpperCase();
  } else if (/^Numpad/i.test(code)) {
    mainKey = code.toUpperCase();
  } else if (/^Digit([0-9])$/.test(code)) {
    mainKey = code.slice(5);
  } else if (/^Key([A-Z])$/.test(code)) {
    mainKey = code.slice(3).toUpperCase();
  } else if (mainKey === ' ' || code === 'Space') {
    mainKey = 'SPACE';
  } else if (mainKey === 'ESCAPE' || code === 'Escape') {
    mainKey = 'ESC';
  }

  const combined = modifiers.length > 0 ? `${modifiers.join('+')}+${mainKey}` : mainKey;
  return normalizeHotkey(combined);
}

const NON_TEXT_INPUT_TYPES = new Set([
  'range',
  'checkbox',
  'radio',
  'color',
  'button',
  'submit',
  'reset',
  'file',
  'image',
  'hidden',
]);

export function isTextEntryElement(target: EventTarget | null): boolean {
  if (!target || !(target instanceof HTMLElement)) return false;

  if (target.isContentEditable) return true;
  if (target.closest('[contenteditable="true"], [contenteditable=""]')) return true;

  const role = target.getAttribute('role')?.toLowerCase();
  if (role === 'textbox' || role === 'searchbox' || role === 'combobox') {
    return true;
  }

  const tag = target.tagName;
  if (tag === 'TEXTAREA' || tag === 'SELECT') return true;
  if (tag === 'INPUT') {
    const inputType = ((target as HTMLInputElement).type || 'text').toLowerCase();
    return !NON_TEXT_INPUT_TYPES.has(inputType);
  }

  return false;
}
