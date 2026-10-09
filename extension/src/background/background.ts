// GuideFlow Background Service Worker (Manifest V3)
// Coordinates recording state, screenshot capture, and storage
// Must persist state to chrome.storage since service workers can be terminated

// ─── Types (inline for service worker bundling) ──────────────────────

type RecordingState = 'idle' | 'recording' | 'paused' | 'reviewing' | 'uploading' | 'saved' | 'interrupted';
type ActionType = 'click' | 'input' | 'select' | 'checkbox' | 'navigation' | 'scroll';

interface CapturedStep {
  id: string;
  index: number;
  actionType: ActionType;
  instruction: string;
  elementSelector: string;
  elementText: string;
  elementRole: string;
  url: string;
  pageTitle: string;
  timestamp: number;
  screenshotDataUrl: string | null;
  screenshotStatus: 'pending' | 'captured' | 'failed' | 'replaced';
  clickPosition: {
    x: number;
    y: number;
    viewportWidth: number;
    viewportHeight: number;
  } | null;
  metadata: Record<string, string>;
}

interface RecordingSession {
  id: string;
  state: RecordingState;
  steps: CapturedStep[];
  tabId: number | null;
  tabUrl: string;
  startedAt: number;
  updatedAt: number;
  title: string;
}

// ─── State Management ────────────────────────────────────────────────

let currentSession: RecordingSession | null = null;
const screenshotQueue: Array<{ stepId: string; tabId: number }> = [];
let isCapturing = false;

const MAX_LABEL_LENGTH = 80;

function truncate(text: string, maxLength: number = MAX_LABEL_LENGTH): string {
  const cleaned = text.replace(/\s+/g, ' ').trim();
  if (cleaned.length <= maxLength) return cleaned;
  return cleaned.substring(0, maxLength - 3) + '...';
}

/** Generate a unique ID */
function generateId(prefix: string = 'id'): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

/** Persist current session to chrome.storage.local */
async function persistSession(): Promise<void> {
  if (!currentSession) {
    await chrome.storage.local.remove('currentSession');
    return;
  }
  currentSession.updatedAt = Date.now();
  await chrome.storage.local.set({ currentSession });
}

/** Restore session from chrome.storage.local (after service worker restart) */
async function restoreSession(): Promise<void> {
  const data = await chrome.storage.local.get('currentSession');
  if (data.currentSession) {
    currentSession = data.currentSession;
    // Mark as interrupted if it was actively recording
    if (currentSession && (currentSession.state === 'recording' || currentSession.state === 'paused')) {
      // Don't mark as interrupted automatically - let the user decide
      console.log('[GuideFlow] Restored session:', currentSession.id, 'State:', currentSession.state);
    }
  }
}

// ─── Instruction Generation ──────────────────────────────────────────

function getBestLabel(info: Record<string, string>): string {
  if (info.label) return truncate(info.label);
  if (info.ariaLabel) return truncate(info.ariaLabel);
  if (info.text) return truncate(info.text);
  if (info.placeholder) return truncate(info.placeholder);

  const tagFallbacks: Record<string, string> = {
    button: 'the button', a: 'the link', input: 'the input field',
    select: 'the dropdown', textarea: 'the text area',
  };

  if (info.tagName === 'input' && info.type) {
    const inputFallbacks: Record<string, string> = {
      text: 'the text field', email: 'the email field',
      password: 'the password field', number: 'the number field',
      search: 'the search field', checkbox: 'the checkbox',
      radio: 'the radio button', submit: 'the submit button',
    };
    return inputFallbacks[info.type] || 'the input field';
  }

  return tagFallbacks[info.tagName] || 'the highlighted element';
}

function generateInstruction(actionType: ActionType, info: Record<string, string>, metadata?: Record<string, string>): string {
  const label = getBestLabel(info);

  switch (actionType) {
    case 'click':
      if (info.tagName === 'button' || info.type === 'submit') return `Click "${label}"`;
      if (info.tagName === 'a') return `Click "${label}"`;
      if (info.role === 'tab' || info.role === 'menuitem') return `Select "${label}"`;
      return `Click "${label}"`;
    case 'input':
      if (info.type === 'password') return `Enter your password in ${label}`;
      return `Enter the required information in "${label}"`;
    case 'select':
      if (metadata?.selectedValue) return `Select "${truncate(metadata.selectedValue)}" from "${label}"`;
      return `Choose an option from "${label}"`;
    case 'checkbox':
      return `Toggle ${label}`;
    case 'navigation':
      if (metadata?.currentUrl) {
        try {
          const url = new URL(metadata.currentUrl);
          const pageName = url.pathname === '/' ? url.hostname : url.pathname.split('/').filter(Boolean).pop() || url.hostname;
          return `Navigate to "${pageName.replace(/[-_]/g, ' ')}"`;
        } catch { return 'Navigate to the page'; }
      }
      return 'Navigate to the new page';
    default:
      return `Interact with "${label}"`;
  }
}

// ─── Screenshot Capture ──────────────────────────────────────────────

/** Rate-limited screenshot capture (max 2/second per Chrome API limits) */
async function captureScreenshot(tabId: number): Promise<string | null> {
  try {
    // Verify the tab is still valid and active
    const tab = await chrome.tabs.get(tabId);
    if (!tab || !tab.active) {
      console.warn('[GuideFlow] Tab not active for screenshot:', tabId);
      return null;
    }

    // Capture the visible area
    const dataUrl = await chrome.tabs.captureVisibleTab(tab.windowId, {
      format: 'png',
      quality: 92,
    });

    return dataUrl;
  } catch (error) {
    console.error('[GuideFlow] Screenshot capture failed:', error);
    return null;
  }
}

/** Process the screenshot queue serially with rate limiting */
async function processScreenshotQueue(): Promise<void> {
  if (isCapturing || screenshotQueue.length === 0) return;

  isCapturing = true;

  while (screenshotQueue.length > 0) {
    const { stepId, tabId } = screenshotQueue.shift()!;

    const dataUrl = await captureScreenshot(tabId);

    if (currentSession) {
      const step = currentSession.steps.find(s => s.id === stepId);
      if (step) {
        step.screenshotDataUrl = dataUrl;
        step.screenshotStatus = dataUrl ? 'captured' : 'failed';
        await persistSession();
      }
    }

    // Rate limit: wait 500ms between captures (max 2/sec)
    await new Promise(resolve => setTimeout(resolve, 500));
  }

  isCapturing = false;
}

/** Should this event create a new step or update the last one? */
function shouldCreateNewStep(actionType: ActionType, selector: string): boolean {
  if (!currentSession || currentSession.steps.length === 0) return true;

  const lastStep = currentSession.steps[currentSession.steps.length - 1];

  // Always create for clicks and navigation
  if (actionType === 'click' || actionType === 'navigation') return true;

  // Group repeated input into the same field
  if (actionType === 'input' && lastStep.actionType === 'input' && selector === lastStep.elementSelector) {
    return false;
  }

  // Group repeated select on the same dropdown
  if (actionType === 'select' && lastStep.actionType === 'select' && selector === lastStep.elementSelector) {
    return false;
  }

  return true;
}

// ─── Recording Controls ──────────────────────────────────────────────

async function startRecording(tabId: number, tabUrl: string): Promise<void> {
  currentSession = {
    id: generateId('rec'),
    state: 'recording',
    steps: [],
    tabId,
    tabUrl,
    startedAt: Date.now(),
    updatedAt: Date.now(),
    title: '',
  };

  await persistSession();

  // Inject content script and start listening
  try {
    await chrome.tabs.sendMessage(tabId, { type: 'START_RECORDING' });
  } catch {
    // Content script might not be loaded yet, inject it
    await chrome.scripting.executeScript({
      target: { tabId },
      files: ['content.js'],
    });
    // Wait briefly then send the start message
    setTimeout(async () => {
      try {
        await chrome.tabs.sendMessage(tabId, { type: 'START_RECORDING' });
      } catch (err) {
        console.error('[GuideFlow] Failed to start recording on tab:', err);
      }
    }, 200);
  }

  // Update badge
  await chrome.action.setBadgeText({ text: 'REC' });
  await chrome.action.setBadgeBackgroundColor({ color: '#EF4444' });
}

async function pauseRecording(): Promise<void> {
  if (!currentSession || currentSession.state !== 'recording') return;

  currentSession.state = 'paused';
  await persistSession();

  if (currentSession.tabId) {
    try {
      await chrome.tabs.sendMessage(currentSession.tabId, { type: 'PAUSE_RECORDING' });
    } catch {}
  }

  await chrome.action.setBadgeText({ text: '⏸' });
  await chrome.action.setBadgeBackgroundColor({ color: '#F59E0B' });
}

async function resumeRecording(): Promise<void> {
  if (!currentSession || currentSession.state !== 'paused') return;

  currentSession.state = 'recording';
  await persistSession();

  if (currentSession.tabId) {
    try {
      await chrome.tabs.sendMessage(currentSession.tabId, { type: 'RESUME_RECORDING' });
    } catch {}
  }

  await chrome.action.setBadgeText({ text: 'REC' });
  await chrome.action.setBadgeBackgroundColor({ color: '#EF4444' });
}

async function stopRecording(): Promise<void> {
  if (!currentSession) return;

  currentSession.state = 'reviewing';
  await persistSession();

  if (currentSession.tabId) {
    try {
      await chrome.tabs.sendMessage(currentSession.tabId, { type: 'STOP_RECORDING' });
    } catch {}
  }

  await chrome.action.setBadgeText({ text: '' });

  // Save completed recording to longer-term storage
  const recordings = (await chrome.storage.local.get('recordings'))?.recordings || [];
  recordings.push({ ...currentSession });
  await chrome.storage.local.set({ recordings });
}

async function discardRecording(): Promise<void> {
  if (currentSession?.tabId) {
    try {
      await chrome.tabs.sendMessage(currentSession.tabId, { type: 'STOP_RECORDING' });
    } catch {}
  }

  currentSession = null;
  await chrome.storage.local.remove('currentSession');
  await chrome.action.setBadgeText({ text: '' });
}

// ─── Message Handling ────────────────────────────────────────────────

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const handleAsync = async () => {
    switch (message.type) {
      case 'START_RECORDING': {
        const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
        const tab = tabs[0];
        if (tab?.id && tab?.url) {
          await startRecording(tab.id, tab.url);
          return { success: true, sessionId: currentSession?.id };
        }
        return { success: false, error: 'No active tab found' };
      }

      case 'STOP_RECORDING': {
        await stopRecording();
        return { success: true, session: currentSession };
      }

      case 'PAUSE_RECORDING': {
        await pauseRecording();
        return { success: true };
      }

      case 'RESUME_RECORDING': {
        await resumeRecording();
        return { success: true };
      }

      case 'DISCARD_RECORDING': {
        await discardRecording();
        return { success: true };
      }

      case 'CAPTURE_EVENT': {
        if (!currentSession || currentSession.state !== 'recording') {
          return { success: false, error: 'Not recording' };
        }

        const { actionType, elementInfo, url, pageTitle, clickPosition, timestamp, metadata } = message.payload;

        if (shouldCreateNewStep(actionType, elementInfo.selector)) {
          const instruction = generateInstruction(actionType, elementInfo, metadata);

          const step: CapturedStep = {
            id: generateId('step'),
            index: currentSession.steps.length,
            actionType,
            instruction,
            elementSelector: elementInfo.selector,
            elementText: elementInfo.text?.substring(0, 200) || '',
            elementRole: elementInfo.role || '',
            url,
            pageTitle,
            timestamp,
            screenshotDataUrl: null,
            screenshotStatus: 'pending',
            clickPosition,
            metadata: metadata || {},
          };

          currentSession.steps.push(step);
          await persistSession();

          // Queue screenshot capture
          if (currentSession.tabId) {
            screenshotQueue.push({ stepId: step.id, tabId: currentSession.tabId });
            processScreenshotQueue(); // Fire and forget
          }

          // Notify popup of new step
          chrome.runtime.sendMessage({
            type: 'STATE_UPDATE',
            payload: { state: currentSession.state, stepCount: currentSession.steps.length, latestStep: step },
          }).catch(() => {}); // Popup may not be open

          return { success: true, stepId: step.id };
        } else {
          // Update last step's timestamp
          const lastStep = currentSession.steps[currentSession.steps.length - 1];
          lastStep.timestamp = timestamp;
          await persistSession();
          return { success: true, updated: true };
        }
      }

      case 'GET_STATE': {
        return {
          state: currentSession?.state || 'idle',
          sessionId: currentSession?.id || null,
          stepCount: currentSession?.steps?.length || 0,
          tabId: currentSession?.tabId || null,
        };
      }

      case 'GET_RECORDING': {
        const recordings = (await chrome.storage.local.get('recordings'))?.recordings || [];
        if (message.payload?.id) {
          const recording = recordings.find((r: RecordingSession) => r.id === message.payload.id);
          return { success: true, recording };
        }
        return { success: true, recordings };
      }

      case 'GET_CURRENT_SESSION': {
        return { success: true, session: currentSession };
      }

      case 'DELETE_STEP': {
        if (!currentSession || !message.payload?.stepId) {
          return { success: false };
        }
        currentSession.steps = currentSession.steps.filter(s => s.id !== message.payload.stepId);
        // Reindex
        currentSession.steps.forEach((s, i) => s.index = i);
        await persistSession();
        return { success: true };
      }

      case 'REORDER_STEPS': {
        if (!currentSession || !message.payload?.stepIds) {
          return { success: false };
        }
        const orderedSteps: CapturedStep[] = [];
        for (const id of message.payload.stepIds) {
          const step = currentSession.steps.find(s => s.id === id);
          if (step) orderedSteps.push(step);
        }
        orderedSteps.forEach((s, i) => s.index = i);
        currentSession.steps = orderedSteps;
        await persistSession();
        return { success: true };
      }

      case 'UPDATE_STEP': {
        if (!currentSession || !message.payload?.stepId) {
          return { success: false };
        }
        const step = currentSession.steps.find(s => s.id === message.payload.stepId);
        if (step && message.payload.updates) {
          Object.assign(step, message.payload.updates);
          await persistSession();
        }
        return { success: true };
      }

      case 'OPEN_REVIEW': {
        // Open the review page in a new tab
        chrome.tabs.create({
          url: chrome.runtime.getURL('review.html'),
        });
        return { success: true };
      }

      default:
        return { error: 'Unknown message type' };
    }
  };

  handleAsync().then(sendResponse).catch((err) => {
    console.error('[GuideFlow] Message handler error:', err);
    sendResponse({ error: err.message });
  });

  return true; // Keep channel open for async response
});

// ─── Service Worker Lifecycle ────────────────────────────────────────

// Restore state when service worker starts
restoreSession().then(() => {
  console.log('[GuideFlow] Service worker initialized. Session:', currentSession?.id || 'none');

  // Restore badge if recording
  if (currentSession?.state === 'recording') {
    chrome.action.setBadgeText({ text: 'REC' });
    chrome.action.setBadgeBackgroundColor({ color: '#EF4444' });
  } else if (currentSession?.state === 'paused') {
    chrome.action.setBadgeText({ text: '⏸' });
    chrome.action.setBadgeBackgroundColor({ color: '#F59E0B' });
  }
});

// Handle tab updates to track navigation
chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (!currentSession || currentSession.state !== 'recording') return;
  if (tabId !== currentSession.tabId) return;

  if (changeInfo.status === 'complete' && tab.url) {
    // Re-inject content script after navigation
    try {
      await chrome.scripting.executeScript({
        target: { tabId },
        files: ['content.js'],
      });
      await chrome.tabs.sendMessage(tabId, { type: 'START_RECORDING' });
    } catch (err) {
      console.warn('[GuideFlow] Could not re-inject after navigation:', err);
    }
  }
});

// Handle tab closure
chrome.tabs.onRemoved.addListener(async (tabId) => {
  if (currentSession && currentSession.tabId === tabId) {
    currentSession.state = 'interrupted';
    await persistSession();
    await chrome.action.setBadgeText({ text: '!' });
    await chrome.action.setBadgeBackgroundColor({ color: '#F59E0B' });
  }
});

console.log('[GuideFlow] Background service worker loaded');
