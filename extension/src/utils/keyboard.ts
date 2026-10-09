// GuideFlow — Keyboard Shortcut Detector
// Captures keyboard shortcuts during recording (Scribe doesn't do this!)

export interface KeyboardShortcut {
  key: string;
  modifiers: string[];
  displayString: string;
  timestamp: number;
}

const MODIFIER_KEYS = ['Control', 'Alt', 'Shift', 'Meta'];
const SPECIAL_KEY_NAMES: Record<string, string> = {
  ' ': 'Space', 'ArrowUp': '↑', 'ArrowDown': '↓', 'ArrowLeft': '←', 'ArrowRight': '→',
  'Enter': 'Enter', 'Escape': 'Esc', 'Tab': 'Tab', 'Backspace': 'Backspace',
  'Delete': 'Del', 'Home': 'Home', 'End': 'End', 'PageUp': 'PgUp', 'PageDown': 'PgDn',
  'Insert': 'Ins', 'F1': 'F1', 'F2': 'F2', 'F3': 'F3', 'F4': 'F4', 'F5': 'F5',
  'F6': 'F6', 'F7': 'F7', 'F8': 'F8', 'F9': 'F9', 'F10': 'F10', 'F11': 'F11', 'F12': 'F12',
};

/**
 * Detects if a keyboard event is a meaningful shortcut
 * (not just regular typing)
 */
export function isShortcut(e: KeyboardEvent): boolean {
  // Has a modifier key + non-modifier key
  if ((e.ctrlKey || e.metaKey || e.altKey) && !MODIFIER_KEYS.includes(e.key)) {
    return true;
  }
  // Function keys
  if (/^F\d{1,2}$/.test(e.key)) return true;
  // Special navigation keys with Shift
  if (e.shiftKey && ['Tab', 'Enter'].includes(e.key)) return true;
  // Escape is always meaningful
  if (e.key === 'Escape') return true;
  return false;
}

/**
 * Parse a keyboard event into a ShortcutInfo
 */
export function parseShortcut(e: KeyboardEvent): KeyboardShortcut {
  const modifiers: string[] = [];
  if (e.ctrlKey || e.metaKey) modifiers.push(navigator.platform.includes('Mac') ? '⌘' : 'Ctrl');
  if (e.altKey) modifiers.push(navigator.platform.includes('Mac') ? '⌥' : 'Alt');
  if (e.shiftKey) modifiers.push('Shift');

  const keyName = SPECIAL_KEY_NAMES[e.key] || e.key.toUpperCase();

  return {
    key: e.key,
    modifiers,
    displayString: [...modifiers, keyName].join(' + '),
    timestamp: Date.now(),
  };
}

/**
 * Generate a human-readable instruction for a keyboard shortcut
 */
export function shortcutInstruction(shortcut: KeyboardShortcut, context?: string): string {
  const target = context ? ` in ${context}` : '';
  return `Press ${shortcut.displayString}${target}`;
}

/**
 * Detect common application shortcuts and provide context
 */
export function identifyCommonShortcut(shortcut: KeyboardShortcut): string | null {
  const key = shortcut.key.toLowerCase();
  const hasCtrl = shortcut.modifiers.some(m => m === 'Ctrl' || m === '⌘');
  const hasShift = shortcut.modifiers.includes('Shift');
  const hasAlt = shortcut.modifiers.some(m => m === 'Alt' || m === '⌥');

  if (hasCtrl && !hasShift && !hasAlt) {
    const ctrlShortcuts: Record<string, string> = {
      'c': 'Copy', 's': 'Save', 'v': 'Paste', 'x': 'Cut', 'z': 'Undo',
      'a': 'Select All', 'f': 'Find', 'p': 'Print', 'n': 'New', 'o': 'Open',
      'w': 'Close Tab', 't': 'New Tab', 'r': 'Refresh', 'l': 'Focus Address Bar',
      'b': 'Toggle Bold', 'i': 'Toggle Italic', 'u': 'Toggle Underline',
      'd': 'Bookmark', 'h': 'History', 'j': 'Downloads', 'k': 'Insert Link',
    };
    if (ctrlShortcuts[key]) return ctrlShortcuts[key];
  }

  if (hasCtrl && hasShift && !hasAlt) {
    const ctrlShiftShortcuts: Record<string, string> = {
      'z': 'Redo', 'n': 'New Window (Incognito)', 't': 'Reopen Closed Tab',
      'i': 'Developer Tools', 'j': 'Console', 's': 'Save As',
      'v': 'Paste as Plain Text', 'k': 'Toggle Strikethrough',
    };
    if (ctrlShiftShortcuts[key]) return ctrlShiftShortcuts[key];
  }

  return null;
}
