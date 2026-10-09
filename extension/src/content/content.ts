// GuideFlow Content Script
// Injected into web pages to detect meaningful user interactions
// Communicates with the background service worker via chrome.runtime messages

interface ElementInfo {
  tagName: string;
  type: string;
  text: string;
  label: string;
  placeholder: string;
  ariaLabel: string;
  role: string;
  href: string;
  selector: string;
  isInteractive: boolean;
  boundingRect: { x: number; y: number; width: number; height: number } | null;
}

type ActionType = 'click' | 'input' | 'select' | 'checkbox' | 'navigation' | 'scroll';

// ─── State ───────────────────────────────────────────────────────────

let isRecording = false;
let lastInputTarget: Element | null = null;
let inputDebounceTimer: ReturnType<typeof setTimeout> | null = null;
let highlightOverlay: HTMLElement | null = null;

// ─── Element Analysis ────────────────────────────────────────────────

/** Build a CSS selector path for an element */
function buildSelector(el: Element): string {
  if (el.id) return `#${CSS.escape(el.id)}`;

  const path: string[] = [];
  let current: Element | null = el;

  while (current && current !== document.body) {
    let segment = current.tagName.toLowerCase();

    if (current.id) {
      segment = `#${CSS.escape(current.id)}`;
      path.unshift(segment);
      break;
    }

    // Add class names for specificity (up to 2)
    const classes = Array.from(current.classList)
      .filter(c => !c.startsWith('guideflow-'))
      .slice(0, 2);
    if (classes.length > 0) {
      segment += '.' + classes.map(c => CSS.escape(c)).join('.');
    }

    // Add nth-child if siblings exist
    const parent = current.parentElement;
    if (parent) {
      const siblings = Array.from(parent.children).filter(
        (s) => s.tagName === current!.tagName
      );
      if (siblings.length > 1) {
        const index = siblings.indexOf(current) + 1;
        segment += `:nth-of-type(${index})`;
      }
    }

    path.unshift(segment);
    current = current.parentElement;
  }

  return path.join(' > ');
}

/** Get the associated label text for a form element */
function getFormLabel(el: Element): string {
  // Check for explicit label via 'for' attribute
  const id = el.id;
  if (id) {
    const label = document.querySelector(`label[for="${CSS.escape(id)}"]`);
    if (label?.textContent) return label.textContent.trim();
  }

  // Check for wrapping label
  const parentLabel = el.closest('label');
  if (parentLabel?.textContent) {
    // Remove the input's own value from the label text
    const inputValue = (el as HTMLInputElement).value || '';
    return parentLabel.textContent.replace(inputValue, '').trim();
  }

  return '';
}

/** Get the visible text content of an element (limited depth) */
function getVisibleText(el: Element, maxLength: number = 100): string {
  // For inputs, don't return the value
  if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
    return '';
  }

  const text = el.textContent?.trim() || '';
  return text.substring(0, maxLength);
}

/** Find the nearest interactive/actionable ancestor */
function findActionableElement(el: Element): Element {
  const interactiveTags = ['A', 'BUTTON', 'INPUT', 'SELECT', 'TEXTAREA'];
  const interactiveRoles = ['button', 'link', 'tab', 'menuitem', 'checkbox', 'radio', 'switch'];

  let current: Element | null = el;
  while (current && current !== document.body) {
    if (interactiveTags.includes(current.tagName)) return current;
    const role = current.getAttribute('role');
    if (role && interactiveRoles.includes(role)) return current;
    if (current.hasAttribute('onclick') || current.hasAttribute('tabindex')) return current;
    current = current.parentElement;
  }

  return el;
}

/** Extract comprehensive information about an element */
function getElementInfo(el: Element): ElementInfo {
  const actionable = findActionableElement(el);
  const rect = actionable.getBoundingClientRect();

  return {
    tagName: actionable.tagName.toLowerCase(),
    type: (actionable as HTMLInputElement).type || '',
    text: getVisibleText(actionable),
    label: getFormLabel(actionable),
    placeholder: (actionable as HTMLInputElement).placeholder || '',
    ariaLabel: actionable.getAttribute('aria-label') || '',
    role: actionable.getAttribute('role') || '',
    href: (actionable as HTMLAnchorElement).href || '',
    selector: buildSelector(actionable),
    isInteractive: true,
    boundingRect: {
      x: rect.x,
      y: rect.y,
      width: rect.width,
      height: rect.height,
    },
  };
}

// ─── Visual Feedback ─────────────────────────────────────────────────

/** Show a brief highlight around the clicked element */
function showClickHighlight(rect: { x: number; y: number; width: number; height: number }) {
  if (highlightOverlay) {
    highlightOverlay.remove();
  }

  highlightOverlay = document.createElement('div');
  highlightOverlay.className = 'guideflow-highlight';
  Object.assign(highlightOverlay.style, {
    position: 'fixed',
    left: `${rect.x - 4}px`,
    top: `${rect.y - 4}px`,
    width: `${rect.width + 8}px`,
    height: `${rect.height + 8}px`,
    border: '3px solid #6366f1',
    borderRadius: '6px',
    pointerEvents: 'none',
    zIndex: '2147483647',
    boxShadow: '0 0 0 4px rgba(99, 102, 241, 0.2)',
    transition: 'opacity 0.5s ease-out',
    opacity: '1',
  });

  document.body.appendChild(highlightOverlay);

  setTimeout(() => {
    if (highlightOverlay) {
      highlightOverlay.style.opacity = '0';
      setTimeout(() => {
        highlightOverlay?.remove();
        highlightOverlay = null;
      }, 500);
    }
  }, 1500);
}

/** Show the recording indicator badge */
function showRecordingIndicator() {
  let indicator = document.getElementById('guideflow-recording-indicator');
  if (indicator) return;

  indicator = document.createElement('div');
  indicator.id = 'guideflow-recording-indicator';
  Object.assign(indicator.style, {
    position: 'fixed',
    top: '12px',
    right: '12px',
    padding: '8px 16px',
    backgroundColor: 'rgba(239, 68, 68, 0.95)',
    color: '#fff',
    borderRadius: '24px',
    fontSize: '13px',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    fontWeight: '600',
    zIndex: '2147483647',
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
    cursor: 'default',
    userSelect: 'none',
    pointerEvents: 'none',
  });

  // Pulsing red dot
  const dot = document.createElement('span');
  Object.assign(dot.style, {
    width: '8px',
    height: '8px',
    borderRadius: '50%',
    backgroundColor: '#fff',
    animation: 'guideflow-pulse 1.5s ease-in-out infinite',
  });

  // Add animation keyframes
  const style = document.createElement('style');
  style.textContent = `
    @keyframes guideflow-pulse {
      0%, 100% { opacity: 1; transform: scale(1); }
      50% { opacity: 0.5; transform: scale(0.8); }
    }
  `;
  document.head.appendChild(style);

  indicator.appendChild(dot);
  indicator.appendChild(document.createTextNode('GuideFlow Recording'));
  document.body.appendChild(indicator);
}

/** Remove the recording indicator */
function hideRecordingIndicator() {
  const indicator = document.getElementById('guideflow-recording-indicator');
  if (indicator) indicator.remove();
}

// ─── Event Handlers ──────────────────────────────────────────────────

/** Handle click events */
function handleClick(event: MouseEvent) {
  if (!isRecording) return;

  const target = event.target as Element;
  if (!target || target.closest('.guideflow-highlight, #guideflow-recording-indicator')) return;

  const info = getElementInfo(target);

  // Skip non-interactive elements with no meaningful text
  if (!info.isInteractive && !info.text && !info.label && !info.ariaLabel) return;

  // Determine action type
  let actionType: ActionType = 'click';
  if (info.tagName === 'input' && (info.type === 'checkbox' || info.type === 'radio')) {
    actionType = 'checkbox';
  }

  // Show visual feedback
  if (info.boundingRect) {
    showClickHighlight(info.boundingRect);
  }

  // Send to background
  chrome.runtime.sendMessage({
    type: 'CAPTURE_EVENT',
    payload: {
      actionType,
      elementInfo: info,
      url: window.location.href,
      pageTitle: document.title,
      clickPosition: {
        x: event.clientX,
        y: event.clientY,
        viewportWidth: window.innerWidth,
        viewportHeight: window.innerHeight,
      },
      timestamp: Date.now(),
    },
  });
}

/** Handle input field interactions (debounced - groups repeated typing) */
function handleInput(event: Event) {
  if (!isRecording) return;

  const target = event.target as Element;
  if (!target) return;

  // If same field as last input, extend the debounce
  if (target === lastInputTarget && inputDebounceTimer) {
    clearTimeout(inputDebounceTimer);
  }

  lastInputTarget = target;

  inputDebounceTimer = setTimeout(() => {
    const info = getElementInfo(target);

    chrome.runtime.sendMessage({
      type: 'CAPTURE_EVENT',
      payload: {
        actionType: 'input' as ActionType,
        elementInfo: info,
        url: window.location.href,
        pageTitle: document.title,
        clickPosition: null,
        timestamp: Date.now(),
      },
    });

    lastInputTarget = null;
  }, 800); // Wait 800ms after last keystroke
}

/** Handle select/dropdown changes */
function handleChange(event: Event) {
  if (!isRecording) return;

  const target = event.target as HTMLSelectElement;
  if (!target || target.tagName !== 'SELECT') return;

  const info = getElementInfo(target);
  const selectedOption = target.options[target.selectedIndex];

  chrome.runtime.sendMessage({
    type: 'CAPTURE_EVENT',
    payload: {
      actionType: 'select' as ActionType,
      elementInfo: info,
      url: window.location.href,
      pageTitle: document.title,
      clickPosition: null,
      timestamp: Date.now(),
      metadata: {
        selectedValue: selectedOption?.text || '',
      },
    },
  });
}

/** Track navigation events */
let lastUrl = window.location.href;

function checkNavigation() {
  if (!isRecording) return;

  const currentUrl = window.location.href;
  if (currentUrl !== lastUrl) {
    chrome.runtime.sendMessage({
      type: 'CAPTURE_EVENT',
      payload: {
        actionType: 'navigation' as ActionType,
        elementInfo: {
          tagName: 'navigation',
          type: '',
          text: document.title,
          label: '',
          placeholder: '',
          ariaLabel: '',
          role: '',
          href: currentUrl,
          selector: '',
          isInteractive: false,
          boundingRect: null,
        },
        url: currentUrl,
        pageTitle: document.title,
        clickPosition: null,
        timestamp: Date.now(),
        metadata: {
          previousUrl: lastUrl,
          currentUrl,
        },
      },
    });

    lastUrl = currentUrl;
  }
}

// ─── Event Registration ──────────────────────────────────────────────

function startListening() {
  document.addEventListener('click', handleClick, true);
  document.addEventListener('input', handleInput, true);
  document.addEventListener('change', handleChange, true);

  // Monitor navigation via history API and popstate
  const originalPushState = history.pushState;
  const originalReplaceState = history.replaceState;

  history.pushState = function (...args) {
    originalPushState.apply(this, args);
    setTimeout(checkNavigation, 50);
  };

  history.replaceState = function (...args) {
    originalReplaceState.apply(this, args);
    setTimeout(checkNavigation, 50);
  };

  window.addEventListener('popstate', () => setTimeout(checkNavigation, 50));
  window.addEventListener('hashchange', () => setTimeout(checkNavigation, 50));

  showRecordingIndicator();
}

function stopListening() {
  document.removeEventListener('click', handleClick, true);
  document.removeEventListener('input', handleInput, true);
  document.removeEventListener('change', handleChange, true);
  hideRecordingIndicator();

  if (highlightOverlay) {
    highlightOverlay.remove();
    highlightOverlay = null;
  }

  if (inputDebounceTimer) {
    clearTimeout(inputDebounceTimer);
    inputDebounceTimer = null;
  }
}

// ─── Message Handling ────────────────────────────────────────────────

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  switch (message.type) {
    case 'START_RECORDING':
      isRecording = true;
      lastUrl = window.location.href;
      startListening();
      sendResponse({ success: true });
      break;

    case 'STOP_RECORDING':
      isRecording = false;
      stopListening();
      sendResponse({ success: true });
      break;

    case 'PAUSE_RECORDING':
      isRecording = false;
      hideRecordingIndicator();
      sendResponse({ success: true });
      break;

    case 'RESUME_RECORDING':
      isRecording = true;
      showRecordingIndicator();
      sendResponse({ success: true });
      break;

    case 'GET_STATE':
      sendResponse({ isRecording });
      break;

    default:
      sendResponse({ error: 'Unknown message type' });
  }

  return true; // Keep channel open for async response
});

// ─── Initialization ─────────────────────────────────────────────────

// Check if we should already be recording (e.g., after page navigation)
chrome.runtime.sendMessage({ type: 'GET_STATE' }, (response) => {
  if (chrome.runtime.lastError) return; // Extension context may be invalid

  if (response?.state === 'recording') {
    isRecording = true;
    lastUrl = window.location.href;
    startListening();
  }
});

console.log('[GuideFlow] Content script loaded');
