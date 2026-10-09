// GuideFlow — Embeddable Widget SDK
// Drop-in script that renders a guide inline or as a floating widget
// Usage: <script src="guideflow.io/embed.js" data-guide="TOKEN"></script>

(function() {
  'use strict';

  const WIDGET_ID = 'guideflow-widget';
  const API_BASE = document.currentScript?.getAttribute('data-api') || 'https://app.guideflow.io';
  const GUIDE_TOKEN = document.currentScript?.getAttribute('data-guide') || '';
  const MODE = document.currentScript?.getAttribute('data-mode') || 'floating'; // floating, inline, sidebar
  const THEME = document.currentScript?.getAttribute('data-theme') || 'light';
  const BRAND_COLOR = document.currentScript?.getAttribute('data-color') || '#6366f1';
  const POSITION = document.currentScript?.getAttribute('data-position') || 'bottom-right';
  const AUTO_OPEN = document.currentScript?.getAttribute('data-auto') === 'true';
  const CONTAINER_ID = document.currentScript?.getAttribute('data-container') || '';

  interface EmbedStep {
    index: number;
    instruction: string;
    notes: string;
    screenshotUrl: string | null;
  }

  interface EmbedGuide {
    title: string;
    description: string;
    steps: EmbedStep[];
    authorName: string;
    stepCount: number;
  }

  let guide: EmbedGuide | null = null;
  let currentStep = 0;
  let isOpen = false;

  // ─── Styles ──────────────────────────────────────────────────

  function injectStyles() {
    const isDark = THEME === 'dark';
    const style = document.createElement('style');
    style.textContent = `
      #${WIDGET_ID}-trigger {
        position: fixed;
        ${POSITION.includes('bottom') ? 'bottom: 24px;' : 'top: 24px;'}
        ${POSITION.includes('right') ? 'right: 24px;' : 'left: 24px;'}
        width: 56px; height: 56px; border-radius: 50%;
        background: linear-gradient(135deg, ${BRAND_COLOR}, ${BRAND_COLOR}cc);
        color: white; border: none; cursor: pointer;
        box-shadow: 0 4px 20px ${BRAND_COLOR}40;
        display: flex; align-items: center; justify-content: center;
        font-size: 24px; z-index: 2147483630;
        transition: transform 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
        font-family: -apple-system, sans-serif;
      }
      #${WIDGET_ID}-trigger:hover { transform: scale(1.1); }
      #${WIDGET_ID}-trigger.open { transform: rotate(45deg); }

      #${WIDGET_ID}-panel {
        position: fixed;
        ${POSITION.includes('bottom') ? 'bottom: 96px;' : 'top: 96px;'}
        ${POSITION.includes('right') ? 'right: 24px;' : 'left: 24px;'}
        width: 400px; max-height: 600px;
        background: ${isDark ? '#1a1a26' : '#ffffff'};
        color: ${isDark ? '#f0f0f5' : '#1a1a2e'};
        border-radius: 16px;
        box-shadow: 0 20px 60px rgba(0,0,0,${isDark ? '0.5' : '0.15'}), 0 0 0 1px ${isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)'};
        z-index: 2147483631;
        display: none; flex-direction: column;
        font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
        overflow: hidden;
        animation: gf-widget-in 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
      }
      #${WIDGET_ID}-panel.visible { display: flex; }

      @keyframes gf-widget-in {
        from { opacity: 0; transform: translateY(16px) scale(0.95); }
        to { opacity: 1; transform: translateY(0) scale(1); }
      }

      .gf-w-header {
        padding: 16px 20px;
        border-bottom: 1px solid ${isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)'};
        display: flex; align-items: center; gap: 10px;
      }
      .gf-w-icon {
        width: 32px; height: 32px; border-radius: 8px;
        background: linear-gradient(135deg, ${BRAND_COLOR}, ${BRAND_COLOR}cc);
        display: flex; align-items: center; justify-content: center;
        font-size: 16px; flex-shrink: 0;
      }
      .gf-w-title { font-size: 14px; font-weight: 700; flex: 1; }
      .gf-w-subtitle { font-size: 11px; color: ${isDark ? '#6b6b85' : '#9ca3af'}; }
      .gf-w-close {
        width: 28px; height: 28px; border: none; border-radius: 6px;
        background: transparent; cursor: pointer; font-size: 14px;
        color: ${isDark ? '#6b6b85' : '#9ca3af'};
        display: flex; align-items: center; justify-content: center;
      }
      .gf-w-close:hover { background: ${isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)'}; }

      .gf-w-body { flex: 1; overflow-y: auto; }

      .gf-w-step {
        padding: 16px 20px;
        border-bottom: 1px solid ${isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.04)'};
        cursor: pointer;
        transition: background 0.15s;
        display: flex; gap: 12px; align-items: flex-start;
      }
      .gf-w-step:hover { background: ${isDark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.02)'}; }
      .gf-w-step.active { background: ${BRAND_COLOR}10; border-left: 3px solid ${BRAND_COLOR}; }

      .gf-w-step-num {
        width: 24px; height: 24px; border-radius: 50%; flex-shrink: 0;
        display: flex; align-items: center; justify-content: center;
        font-size: 11px; font-weight: 700;
        background: ${isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)'};
        color: ${isDark ? '#a0a0b8' : '#6b7280'};
      }
      .gf-w-step.active .gf-w-step-num {
        background: ${BRAND_COLOR};
        color: white;
      }

      .gf-w-step-text { font-size: 13px; font-weight: 500; line-height: 1.4; }
      .gf-w-step-note {
        font-size: 11px; color: ${isDark ? '#6b6b85' : '#9ca3af'};
        margin-top: 4px;
      }

      .gf-w-screenshot {
        width: 100%; border-radius: 6px; margin-top: 8px;
        border: 1px solid ${isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)'};
      }

      .gf-w-footer {
        padding: 12px 20px;
        border-top: 1px solid ${isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)'};
        display: flex; align-items: center; gap: 8px;
      }
      .gf-w-progress {
        flex: 1; height: 3px; border-radius: 2px;
        background: ${isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)'};
        overflow: hidden;
      }
      .gf-w-progress-fill {
        height: 100%; border-radius: 2px;
        background: linear-gradient(90deg, ${BRAND_COLOR}, ${BRAND_COLOR}cc);
        transition: width 0.3s ease;
      }
      .gf-w-progress-text {
        font-size: 11px; font-weight: 600;
        color: ${isDark ? '#6b6b85' : '#9ca3af'};
        white-space: nowrap;
      }
      .gf-w-nav-btn {
        padding: 6px 12px; border-radius: 6px; border: none;
        font-size: 12px; font-weight: 600; cursor: pointer;
        font-family: inherit; transition: all 0.15s;
      }
      .gf-w-nav-prev {
        background: ${isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)'};
        color: ${isDark ? '#a0a0b8' : '#6b7280'};
      }
      .gf-w-nav-next {
        background: linear-gradient(135deg, ${BRAND_COLOR}, ${BRAND_COLOR}cc);
        color: white;
      }
      .gf-w-brand {
        text-align: center; padding: 8px;
        font-size: 10px; color: ${isDark ? '#3a3a4d' : '#d1d5db'};
      }
      .gf-w-brand a { color: ${BRAND_COLOR}80; text-decoration: none; }

      /* Inline mode */
      .gf-w-inline {
        border-radius: 16px; overflow: hidden;
        border: 1px solid ${isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)'};
        box-shadow: 0 4px 16px rgba(0,0,0,${isDark ? '0.3' : '0.08'});
      }

      @media (max-width: 480px) {
        #${WIDGET_ID}-panel {
          width: calc(100vw - 32px);
          ${POSITION.includes('right') ? 'right: 16px;' : 'left: 16px;'}
          max-height: 70vh;
        }
      }
    `;
    document.head.appendChild(style);
  }

  // ─── Fetch Guide Data ──────────────────────────────────────────

  async function fetchGuide() {
    try {
      const res = await fetch(`${API_BASE}/api/embed/${GUIDE_TOKEN}`);
      if (!res.ok) throw new Error('Failed to fetch guide');
      const data = await res.json();
      guide = data.guide;
      trackEmbedView();
    } catch (err) {
      console.error('[GuideFlow] Failed to load guide:', err);
    }
  }

  // ─── Render Widget ─────────────────────────────────────────────

  function renderWidget() {
    if (!guide) return;

    if (MODE === 'inline') {
      renderInline();
      return;
    }

    // Floating trigger button
    const trigger = document.createElement('button');
    trigger.id = `${WIDGET_ID}-trigger`;
    trigger.innerHTML = '📋';
    trigger.title = `Open: ${guide.title}`;
    trigger.addEventListener('click', toggle);
    document.body.appendChild(trigger);

    // Panel
    const panel = document.createElement('div');
    panel.id = `${WIDGET_ID}-panel`;
    panel.innerHTML = buildPanelHTML();
    document.body.appendChild(panel);

    attachPanelEvents(panel, trigger);

    if (AUTO_OPEN) setTimeout(() => open(panel, trigger), 1500);
  }

  function renderInline() {
    if (!guide) return;
    const container = CONTAINER_ID
      ? document.getElementById(CONTAINER_ID)
      : document.currentScript?.parentElement;
    if (!container) return;

    const wrapper = document.createElement('div');
    wrapper.className = 'gf-w-inline';
    wrapper.innerHTML = buildPanelHTML();
    container.appendChild(wrapper);
  }

  function buildPanelHTML(): string {
    if (!guide) return '';
    const progress = ((currentStep + 1) / guide.steps.length) * 100;

    return `
      <div class="gf-w-header">
        <div class="gf-w-icon">📋</div>
        <div>
          <div class="gf-w-title">${escapeHtml(guide.title)}</div>
          <div class="gf-w-subtitle">${guide.stepCount} steps</div>
        </div>
        <button class="gf-w-close" id="gf-w-close">✕</button>
      </div>
      <div class="gf-w-body">
        ${guide.steps.map((step, i) => `
          <div class="gf-w-step ${i === currentStep ? 'active' : ''}" data-step="${i}">
            <div class="gf-w-step-num">${i + 1}</div>
            <div>
              <div class="gf-w-step-text">${escapeHtml(step.instruction)}</div>
              ${step.notes ? `<div class="gf-w-step-note">💡 ${escapeHtml(step.notes)}</div>` : ''}
              ${step.screenshotUrl && i === currentStep ? `<img class="gf-w-screenshot" src="${step.screenshotUrl}" alt="Step ${i + 1}" loading="lazy">` : ''}
            </div>
          </div>
        `).join('')}
      </div>
      <div class="gf-w-footer">
        <div class="gf-w-progress"><div class="gf-w-progress-fill" style="width:${progress}%"></div></div>
        <span class="gf-w-progress-text">${currentStep + 1}/${guide.steps.length}</span>
        ${currentStep > 0 ? '<button class="gf-w-nav-btn gf-w-nav-prev" id="gf-w-prev">← Back</button>' : ''}
        <button class="gf-w-nav-btn gf-w-nav-next" id="gf-w-next">${currentStep === guide.steps.length - 1 ? '✓ Done' : 'Next →'}</button>
      </div>
      <div class="gf-w-brand">Powered by <a href="https://guideflow.io" target="_blank">GuideFlow</a></div>
    `;
  }

  function attachPanelEvents(panel: HTMLElement, trigger: HTMLElement) {
    panel.querySelector('#gf-w-close')?.addEventListener('click', () => close(panel, trigger));
    panel.querySelector('#gf-w-prev')?.addEventListener('click', () => { currentStep--; refreshPanel(panel); });
    panel.querySelector('#gf-w-next')?.addEventListener('click', () => {
      if (guide && currentStep < guide.steps.length - 1) { currentStep++; refreshPanel(panel); }
      else close(panel, trigger);
    });
    panel.querySelectorAll('.gf-w-step').forEach(el => {
      el.addEventListener('click', () => { currentStep = parseInt(el.getAttribute('data-step') || '0'); refreshPanel(panel); });
    });
  }

  function refreshPanel(panel: HTMLElement) {
    panel.innerHTML = buildPanelHTML();
    const trigger = document.getElementById(`${WIDGET_ID}-trigger`);
    if (trigger) attachPanelEvents(panel, trigger);
  }

  function toggle() {
    const panel = document.getElementById(`${WIDGET_ID}-panel`);
    const trigger = document.getElementById(`${WIDGET_ID}-trigger`);
    if (!panel || !trigger) return;
    isOpen ? close(panel, trigger) : open(panel, trigger);
  }

  function open(panel: HTMLElement, trigger: HTMLElement) {
    panel.classList.add('visible');
    trigger.classList.add('open');
    trigger.innerHTML = '✕';
    isOpen = true;
  }

  function close(panel: HTMLElement, trigger: HTMLElement) {
    panel.classList.remove('visible');
    trigger.classList.remove('open');
    trigger.innerHTML = '📋';
    isOpen = false;
  }

  function trackEmbedView() {
    try {
      const img = new Image();
      img.src = `${API_BASE}/api/analytics/pixel?guide=${GUIDE_TOKEN}&event=guide_embed_view&r=${encodeURIComponent(document.referrer)}`;
    } catch {}
  }

  function escapeHtml(str: string): string {
    const d = document.createElement('div');
    d.textContent = str;
    return d.innerHTML;
  }

  // ─── Initialize ────────────────────────────────────────────────

  async function init() {
    if (!GUIDE_TOKEN) {
      console.warn('[GuideFlow] No guide token provided. Add data-guide="YOUR_TOKEN" to the script tag.');
      return;
    }
    injectStyles();
    await fetchGuide();
    if (guide) renderWidget();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
