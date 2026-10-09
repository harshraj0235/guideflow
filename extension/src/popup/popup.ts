// GuideFlow Popup Controller
// Manages the popup UI state and communicates with the background service worker

// ─── DOM Elements ────────────────────────────────────────────────────

const views = {
  idle: document.getElementById('idle-view'),
  recording: document.getElementById('recording-view'),
  paused: document.getElementById('paused-view'),
  review: document.getElementById('review-view'),
  interrupted: document.getElementById('interrupted-view'),
};

const elements = {
  // Idle
  btnStart: document.getElementById('btn-start'),
  savedGuides: document.getElementById('saved-guides'),
  guidesList: document.getElementById('guides-list'),

  // Recording
  recordingDot: document.getElementById('recording-dot'),
  recordingLabel: document.getElementById('recording-label'),
  timer: document.getElementById('timer'),
  stepCount: document.getElementById('step-count'),
  stepsContainer: document.getElementById('steps-container'),
  btnPause: document.getElementById('btn-pause'),
  btnStop: document.getElementById('btn-stop'),

  // Paused
  pausedTimer: document.getElementById('paused-timer'),
  pausedStepCount: document.getElementById('paused-step-count'),
  pausedStepsList: document.getElementById('paused-steps-list'),
  btnResume: document.getElementById('btn-resume'),
  btnStopPaused: document.getElementById('btn-stop-paused'),
  btnDiscard: document.getElementById('btn-discard'),

  // Review
  reviewSummary: document.getElementById('review-summary'),
  btnReview: document.getElementById('btn-review'),
  btnOpenWebapp: document.getElementById('btn-open-webapp'),
  btnDiscardReview: document.getElementById('btn-discard-review'),

  // Interrupted
  interruptedInfo: document.getElementById('interrupted-info'),
  btnRecover: document.getElementById('btn-recover'),
  btnDiscardInterrupted: document.getElementById('btn-discard-interrupted'),

  // Footer
  linkDashboard: document.getElementById('link-dashboard'),
};

// ─── State ───────────────────────────────────────────────────────────

let timerInterval = null;
let recordingStartTime = 0;
let elapsed = 0;

// ─── View Management ─────────────────────────────────────────────────

function showView(viewName) {
  Object.entries(views).forEach(([name, el]) => {
    el.classList.toggle('active', name === viewName);
  });
}

// ─── Timer ───────────────────────────────────────────────────────────

function formatTime(seconds) {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

function startTimer() {
  recordingStartTime = Date.now();
  timerInterval = setInterval(() => {
    elapsed = Math.floor((Date.now() - recordingStartTime) / 1000);
    elements.timer.textContent = formatTime(elapsed);
  }, 1000);
}

function stopTimer() {
  if (timerInterval) {
    clearInterval(timerInterval);
    timerInterval = null;
  }
}

// ─── Step Rendering ──────────────────────────────────────────────────

function renderStep(step, index) {
  const screenshotClass = step.screenshotStatus || 'pending';
  const screenshotLabel = {
    captured: '📸',
    pending: '⏳',
    failed: '❌',
    replaced: '🔄',
  }[screenshotClass] || '⏳';

  return `
    <div class="step-item" data-step-id="${step.id}">
      <div class="step-number">${index + 1}</div>
      <div class="step-content">
        <div class="step-instruction">${escapeHtml(step.instruction)}</div>
        <div class="step-meta">
          <span class="step-screenshot-indicator ${screenshotClass}"></span>
          <span>${screenshotLabel}</span>
          <span>·</span>
          <span>${getActionIcon(step.actionType)} ${step.actionType}</span>
        </div>
      </div>
    </div>
  `;
}

function renderSteps(steps, container) {
  if (!steps || steps.length === 0) {
    container.innerHTML = `
      <div class="empty-steps">
        <div class="icon">👆</div>
        <div>Interact with the page to capture steps</div>
      </div>
    `;
    return;
  }

  container.innerHTML = steps.map((step, i) => renderStep(step, i)).join('');

  // Scroll to bottom
  container.scrollTop = container.scrollHeight;
}

function getActionIcon(actionType) {
  const icons = {
    click: '🖱️',
    input: '⌨️',
    select: '📋',
    checkbox: '☑️',
    navigation: '🔗',
    scroll: '📜',
  };
  return icons[actionType] || '·';
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// ─── Saved Guides ────────────────────────────────────────────────────

async function loadSavedGuides() {
  try {
    const response = await chrome.runtime.sendMessage({ type: 'GET_RECORDING' });
    const recordings = response?.recordings || [];

    if (recordings.length > 0) {
      elements.savedGuides.style.display = 'block';
      elements.guidesList.innerHTML = recordings.slice(-5).reverse().map(rec => {
        const stepCount = rec.steps?.length || 0;
        const date = new Date(rec.updatedAt).toLocaleDateString();
        const title = rec.title || `Recording (${stepCount} steps)`;
        return `
          <div class="guide-card" data-id="${rec.id}">
            <div class="guide-card-icon">📋</div>
            <div class="guide-card-info">
              <div class="guide-card-title">${escapeHtml(title)}</div>
              <div class="guide-card-meta">${stepCount} steps · ${date}</div>
            </div>
            <div class="guide-card-arrow">→</div>
          </div>
        `;
      }).join('');
    }
  } catch (err) {
    console.log('Could not load saved guides:', err);
  }
}

// ─── Event Handlers ──────────────────────────────────────────────────

// Start recording
elements.btnStart.addEventListener('click', async () => {
  const response = await chrome.runtime.sendMessage({ type: 'START_RECORDING' });
  if (response?.success) {
    showView('recording');
    startTimer();
    renderSteps([], elements.stepsContainer);
    elements.stepCount.textContent = '0 steps';
  } else {
    alert(response?.error || 'Could not start recording. Make sure you are on a supported page.');
  }
});

// Pause recording
elements.btnPause.addEventListener('click', async () => {
  await chrome.runtime.sendMessage({ type: 'PAUSE_RECORDING' });
  stopTimer();

  // Get current steps
  const session = await chrome.runtime.sendMessage({ type: 'GET_CURRENT_SESSION' });
  const steps = session?.session?.steps || [];

  showView('paused');
  elements.pausedTimer.textContent = formatTime(elapsed);
  elements.pausedStepCount.textContent = String(steps.length);
  renderSteps(steps, elements.pausedStepsList);
});

// Resume recording
elements.btnResume.addEventListener('click', async () => {
  await chrome.runtime.sendMessage({ type: 'RESUME_RECORDING' });
  showView('recording');
  startTimer();
});

// Stop recording
async function handleStop() {
  const session = await chrome.runtime.sendMessage({ type: 'GET_CURRENT_SESSION' });
  await chrome.runtime.sendMessage({ type: 'STOP_RECORDING' });
  stopTimer();

  const steps = session?.session?.steps || [];
  const stepCount = steps.length;

  showView('review');
  elements.reviewSummary.textContent =
    `${stepCount} step${stepCount !== 1 ? 's' : ''} captured with screenshots. Review and edit your guide before sharing.`;
}

elements.btnStop.addEventListener('click', handleStop);
elements.btnStopPaused.addEventListener('click', handleStop);

// Discard recording
async function handleDiscard() {
  if (confirm('Are you sure you want to discard this recording? This cannot be undone.')) {
    await chrome.runtime.sendMessage({ type: 'DISCARD_RECORDING' });
    stopTimer();
    elapsed = 0;
    showView('idle');
    loadSavedGuides();
  }
}

elements.btnDiscard.addEventListener('click', handleDiscard);
elements.btnDiscardReview.addEventListener('click', handleDiscard);
elements.btnDiscardInterrupted.addEventListener('click', handleDiscard);

// Review guide
elements.btnReview.addEventListener('click', async () => {
  await chrome.runtime.sendMessage({ type: 'OPEN_REVIEW' });
  window.close();
});

// Open web app
elements.btnOpenWebapp.addEventListener('click', () => {
  chrome.tabs.create({ url: 'http://localhost:3000/editor' });
  window.close();
});

// Recover interrupted
elements.btnRecover.addEventListener('click', async () => {
  await chrome.runtime.sendMessage({ type: 'OPEN_REVIEW' });
  window.close();
});

// Dashboard link
elements.linkDashboard.addEventListener('click', () => {
  chrome.tabs.create({ url: 'http://localhost:3000' });
  window.close();
});

// ─── Real-time Updates ───────────────────────────────────────────────

chrome.runtime.onMessage.addListener((message) => {
  if (message.type === 'STATE_UPDATE') {
    const { state, stepCount, latestStep } = message.payload;

    if (state === 'recording') {
      elements.stepCount.textContent = `${stepCount} step${stepCount !== 1 ? 's' : ''}`;

      // Add the new step to the list
      if (latestStep) {
        const container = elements.stepsContainer;
        // Remove empty state if present
        const emptyState = container.querySelector('.empty-steps');
        if (emptyState) emptyState.remove();

        container.insertAdjacentHTML('beforeend', renderStep(latestStep, stepCount - 1));
        container.scrollTop = container.scrollHeight;
      }
    }
  }
});

// ─── Initialization ─────────────────────────────────────────────────

async function init() {
  const state = await chrome.runtime.sendMessage({ type: 'GET_STATE' });

  switch (state?.state) {
    case 'recording':
      showView('recording');
      const session1 = await chrome.runtime.sendMessage({ type: 'GET_CURRENT_SESSION' });
      const steps1 = session1?.session?.steps || [];
      renderSteps(steps1, elements.stepsContainer);
      elements.stepCount.textContent = `${steps1.length} step${steps1.length !== 1 ? 's' : ''}`;
      startTimer();
      break;

    case 'paused':
      showView('paused');
      const session2 = await chrome.runtime.sendMessage({ type: 'GET_CURRENT_SESSION' });
      const steps2 = session2?.session?.steps || [];
      elements.pausedStepCount.textContent = String(steps2.length);
      renderSteps(steps2, elements.pausedStepsList);
      break;

    case 'reviewing':
      showView('review');
      const session3 = await chrome.runtime.sendMessage({ type: 'GET_CURRENT_SESSION' });
      const stepCount = session3?.session?.steps?.length || 0;
      elements.reviewSummary.textContent =
        `${stepCount} step${stepCount !== 1 ? 's' : ''} captured. Review and edit your guide before sharing.`;
      break;

    case 'interrupted':
      showView('interrupted');
      const session4 = await chrome.runtime.sendMessage({ type: 'GET_CURRENT_SESSION' });
      const intSteps = session4?.session?.steps?.length || 0;
      elements.interruptedInfo.textContent =
        `${intSteps} step${intSteps !== 1 ? 's were' : ' was'} captured before the interruption.`;
      break;

    default:
      showView('idle');
      loadSavedGuides();
      break;
  }
}

init();
