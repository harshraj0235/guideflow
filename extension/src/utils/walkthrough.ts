// GuideFlow — Interactive Walkthrough Engine
// Embeddable step-by-step overlay that guides users through a live page
// Far beyond Scribe — this turns guides into interactive tutorials

export interface WalkthroughStep {
  instruction: string;
  selector: string;
  action: 'click' | 'input' | 'observe' | 'scroll' | 'wait';
  position: 'top' | 'bottom' | 'left' | 'right' | 'auto';
  highlightPadding?: number;
  waitForElement?: boolean;
  optional?: boolean;
  hotkey?: string;
}

export interface WalkthroughConfig {
  steps: WalkthroughStep[];
  title: string;
  theme?: 'dark' | 'light';
  allowSkip?: boolean;
  showProgress?: boolean;
  onComplete?: () => void;
  onStepChange?: (step: number) => void;
  brandColor?: string;
  brandLogo?: string;
}

class InteractiveWalkthrough {
  private config: WalkthroughConfig;
  private currentStep = 0;
  private overlay: HTMLElement | null = null;
  private tooltip: HTMLElement | null = null;
  private spotlight: HTMLElement | null = null;
  private styleEl: HTMLElement | null = null;
  private isActive = false;
  private observer: MutationObserver | null = null;

  constructor(config: WalkthroughConfig) {
    this.config = {
      theme: 'dark',
      allowSkip: true,
      showProgress: true,
      brandColor: '#6366f1',
      ...config,
    };
  }

  start() {
    if (this.isActive) return;
    this.isActive = true;
    this.currentStep = 0;
    this.injectStyles();
    this.createOverlay();
    this.showStep(0);
    this.setupKeyboardNav();
    document.body.classList.add('guideflow-walkthrough-active');
  }

  stop() {
    this.isActive = false;
    this.cleanup();
    document.body.classList.remove('guideflow-walkthrough-active');
  }

  next() {
    if (this.currentStep < this.config.steps.length - 1) {
      this.showStep(this.currentStep + 1);
    } else {
      this.complete();
    }
  }

  prev() {
    if (this.currentStep > 0) {
      this.showStep(this.currentStep - 1);
    }
  }

  goTo(step: number) {
    if (step >= 0 && step < this.config.steps.length) {
      this.showStep(step);
    }
  }

  private complete() {
    this.config.onComplete?.();
    this.stop();
    this.showCompletionCard();
  }

  private injectStyles() {
    this.styleEl = document.createElement('style');
    const bc = this.config.brandColor || '#6366f1';
    this.styleEl.textContent = `
      .guideflow-walkthrough-active { overflow: hidden !important; }

      .gf-overlay {
        position: fixed; inset: 0; z-index: 2147483640;
        pointer-events: none;
      }

      .gf-spotlight {
        position: fixed; z-index: 2147483641;
        box-shadow: 0 0 0 9999px rgba(0,0,0,0.65);
        border-radius: 8px;
        transition: all 0.4s cubic-bezier(0.4, 0, 0.2, 1);
        pointer-events: none;
      }

      .gf-spotlight::after {
        content: '';
        position: absolute; inset: -4px;
        border: 2px solid ${bc};
        border-radius: 12px;
        animation: gf-pulse-ring 2s ease-in-out infinite;
      }

      @keyframes gf-pulse-ring {
        0%, 100% { opacity: 1; transform: scale(1); }
        50% { opacity: 0.5; transform: scale(1.02); }
      }

      .gf-tooltip {
        position: fixed; z-index: 2147483642;
        max-width: 380px; min-width: 280px;
        background: ${this.config.theme === 'dark' ? '#1a1a26' : '#ffffff'};
        color: ${this.config.theme === 'dark' ? '#f0f0f5' : '#1a1a2e'};
        border-radius: 14px;
        box-shadow: 0 20px 60px rgba(0,0,0,0.4), 0 0 0 1px ${this.config.theme === 'dark' ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)'};
        font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
        pointer-events: all;
        animation: gf-tooltip-in 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
        overflow: hidden;
      }

      @keyframes gf-tooltip-in {
        from { opacity: 0; transform: translateY(8px) scale(0.96); }
        to { opacity: 1; transform: translateY(0) scale(1); }
      }

      .gf-tooltip-header {
        padding: 16px 20px 12px;
        display: flex; align-items: center; gap: 10px;
        border-bottom: 1px solid ${this.config.theme === 'dark' ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)'};
      }

      .gf-tooltip-step-badge {
        width: 28px; height: 28px; border-radius: 50%;
        background: linear-gradient(135deg, ${bc}, ${bc}dd);
        color: white; display: flex; align-items: center; justify-content: center;
        font-size: 12px; font-weight: 700; flex-shrink: 0;
      }

      .gf-tooltip-title {
        font-size: 11px; font-weight: 600; text-transform: uppercase;
        letter-spacing: 0.5px;
        color: ${this.config.theme === 'dark' ? '#6b6b85' : '#9ca3af'};
      }

      .gf-tooltip-close {
        margin-left: auto; width: 24px; height: 24px;
        border: none; background: transparent; cursor: pointer;
        color: ${this.config.theme === 'dark' ? '#6b6b85' : '#9ca3af'};
        font-size: 16px; border-radius: 4px;
        display: flex; align-items: center; justify-content: center;
      }

      .gf-tooltip-close:hover {
        background: ${this.config.theme === 'dark' ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)'};
      }

      .gf-tooltip-body {
        padding: 16px 20px;
      }

      .gf-tooltip-instruction {
        font-size: 15px; font-weight: 500; line-height: 1.5; margin-bottom: 4px;
      }

      .gf-tooltip-hotkey {
        margin-top: 8px; font-size: 12px;
        color: ${this.config.theme === 'dark' ? '#6b6b85' : '#9ca3af'};
      }

      .gf-tooltip-hotkey kbd {
        display: inline-block; padding: 2px 6px; border-radius: 4px;
        background: ${this.config.theme === 'dark' ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)'};
        font-family: monospace; font-size: 11px; margin: 0 2px;
      }

      .gf-tooltip-footer {
        padding: 12px 20px;
        border-top: 1px solid ${this.config.theme === 'dark' ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)'};
        display: flex; align-items: center; gap: 8px;
      }

      .gf-tooltip-progress {
        flex: 1; display: flex; align-items: center; gap: 6px;
      }

      .gf-progress-bar {
        flex: 1; height: 3px; border-radius: 2px;
        background: ${this.config.theme === 'dark' ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)'};
        overflow: hidden;
      }

      .gf-progress-fill {
        height: 100%; border-radius: 2px;
        background: linear-gradient(90deg, ${bc}, ${bc}cc);
        transition: width 0.4s ease;
      }

      .gf-progress-text {
        font-size: 11px; font-weight: 600;
        color: ${this.config.theme === 'dark' ? '#6b6b85' : '#9ca3af'};
        white-space: nowrap;
      }

      .gf-btn {
        padding: 7px 14px; border-radius: 8px; border: none;
        font-family: inherit; font-size: 13px; font-weight: 600;
        cursor: pointer; transition: all 0.15s;
      }

      .gf-btn-primary {
        background: linear-gradient(135deg, ${bc}, ${bc}dd);
        color: white; box-shadow: 0 2px 8px ${bc}40;
      }

      .gf-btn-primary:hover { filter: brightness(1.1); }

      .gf-btn-secondary {
        background: ${this.config.theme === 'dark' ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)'};
        color: ${this.config.theme === 'dark' ? '#a0a0b8' : '#6b7280'};
      }

      .gf-btn-secondary:hover {
        background: ${this.config.theme === 'dark' ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.08)'};
      }

      .gf-completion {
        position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%);
        z-index: 2147483645; text-align: center; padding: 40px;
        background: ${this.config.theme === 'dark' ? '#1a1a26' : '#ffffff'};
        color: ${this.config.theme === 'dark' ? '#f0f0f5' : '#1a1a2e'};
        border-radius: 20px;
        box-shadow: 0 20px 60px rgba(0,0,0,0.5);
        animation: gf-tooltip-in 0.4s cubic-bezier(0.34, 1.56, 0.64, 1);
        font-family: 'Inter', -apple-system, sans-serif;
      }

      .gf-completion-backdrop {
        position: fixed; inset: 0; z-index: 2147483644;
        background: rgba(0,0,0,0.6); backdrop-filter: blur(4px);
        animation: gf-fade-in 0.3s ease;
      }

      @keyframes gf-fade-in { from { opacity: 0; } to { opacity: 1; } }
    `;
    document.head.appendChild(this.styleEl);
  }

  private createOverlay() {
    this.overlay = document.createElement('div');
    this.overlay.className = 'gf-overlay';
    document.body.appendChild(this.overlay);

    this.spotlight = document.createElement('div');
    this.spotlight.className = 'gf-spotlight';
    document.body.appendChild(this.spotlight);

    this.tooltip = document.createElement('div');
    this.tooltip.className = 'gf-tooltip';
    document.body.appendChild(this.tooltip);
  }

  private showStep(index: number) {
    this.currentStep = index;
    const step = this.config.steps[index];
    if (!step) return;

    this.config.onStepChange?.(index);

    const target = document.querySelector(step.selector);
    if (!target) {
      if (step.waitForElement) {
        this.waitForElement(step.selector, () => this.showStep(index));
        return;
      }
      if (step.optional) { this.next(); return; }
      this.positionTooltipCenter();
    } else {
      this.positionSpotlight(target as HTMLElement, step.highlightPadding || 8);
      this.positionTooltip(target as HTMLElement, step.position);
      (target as HTMLElement).scrollIntoView({ behavior: 'smooth', block: 'center' });
    }

    this.renderTooltipContent(step, index);
  }

  private positionSpotlight(el: HTMLElement, padding: number) {
    if (!this.spotlight) return;
    const rect = el.getBoundingClientRect();
    Object.assign(this.spotlight.style, {
      left: `${rect.left - padding}px`,
      top: `${rect.top - padding}px`,
      width: `${rect.width + padding * 2}px`,
      height: `${rect.height + padding * 2}px`,
    });
  }

  private positionTooltip(el: HTMLElement, position: string) {
    if (!this.tooltip) return;
    const rect = el.getBoundingClientRect();
    const tt = this.tooltip.getBoundingClientRect();
    const gap = 16;

    let pos = position;
    if (pos === 'auto') {
      const spaceBelow = window.innerHeight - rect.bottom;
      const spaceAbove = rect.top;
      pos = spaceBelow > 200 ? 'bottom' : spaceAbove > 200 ? 'top' : 'right';
    }

    let left = 0, top = 0;
    switch (pos) {
      case 'bottom':
        left = rect.left + rect.width / 2 - tt.width / 2;
        top = rect.bottom + gap;
        break;
      case 'top':
        left = rect.left + rect.width / 2 - tt.width / 2;
        top = rect.top - tt.height - gap;
        break;
      case 'right':
        left = rect.right + gap;
        top = rect.top + rect.height / 2 - tt.height / 2;
        break;
      case 'left':
        left = rect.left - tt.width - gap;
        top = rect.top + rect.height / 2 - tt.height / 2;
        break;
    }

    left = Math.max(16, Math.min(left, window.innerWidth - tt.width - 16));
    top = Math.max(16, Math.min(top, window.innerHeight - tt.height - 16));

    Object.assign(this.tooltip.style, { left: `${left}px`, top: `${top}px` });
  }

  private positionTooltipCenter() {
    if (!this.tooltip || !this.spotlight) return;
    this.spotlight.style.display = 'none';
    const tt = this.tooltip.getBoundingClientRect();
    Object.assign(this.tooltip.style, {
      left: `${window.innerWidth / 2 - tt.width / 2}px`,
      top: `${window.innerHeight / 2 - tt.height / 2}px`,
    });
  }

  private renderTooltipContent(step: WalkthroughStep, index: number) {
    if (!this.tooltip) return;
    const total = this.config.steps.length;
    const progress = ((index + 1) / total) * 100;
    const isLast = index === total - 1;

    this.tooltip.innerHTML = `
      <div class="gf-tooltip-header">
        <div class="gf-tooltip-step-badge">${index + 1}</div>
        <div class="gf-tooltip-title">${this.config.title}</div>
        <button class="gf-tooltip-close" id="gf-close">✕</button>
      </div>
      <div class="gf-tooltip-body">
        <div class="gf-tooltip-instruction">${step.instruction}</div>
        ${step.hotkey ? `<div class="gf-tooltip-hotkey">Shortcut: <kbd>${step.hotkey}</kbd></div>` : ''}
      </div>
      <div class="gf-tooltip-footer">
        ${this.config.showProgress ? `
          <div class="gf-tooltip-progress">
            <div class="gf-progress-bar"><div class="gf-progress-fill" style="width:${progress}%"></div></div>
            <span class="gf-progress-text">${index + 1}/${total}</span>
          </div>
        ` : ''}
        ${index > 0 ? '<button class="gf-btn gf-btn-secondary" id="gf-prev">← Back</button>' : ''}
        ${this.config.allowSkip && !isLast ? '<button class="gf-btn gf-btn-secondary" id="gf-skip">Skip</button>' : ''}
        <button class="gf-btn gf-btn-primary" id="gf-next">${isLast ? '✓ Done' : 'Next →'}</button>
      </div>
    `;

    this.tooltip.querySelector('#gf-close')?.addEventListener('click', () => this.stop());
    this.tooltip.querySelector('#gf-prev')?.addEventListener('click', () => this.prev());
    this.tooltip.querySelector('#gf-skip')?.addEventListener('click', () => this.next());
    this.tooltip.querySelector('#gf-next')?.addEventListener('click', () => this.next());
  }

  private showCompletionCard() {
    const backdrop = document.createElement('div');
    backdrop.className = 'gf-completion-backdrop';
    document.body.appendChild(backdrop);

    const card = document.createElement('div');
    card.className = 'gf-completion';
    card.innerHTML = `
      <div style="font-size:48px;margin-bottom:16px;">🎉</div>
      <h2 style="font-size:24px;font-weight:800;margin-bottom:8px;">Walkthrough Complete!</h2>
      <p style="font-size:14px;color:#6b6b85;margin-bottom:24px;">You've completed all ${this.config.steps.length} steps.</p>
      <button class="gf-btn gf-btn-primary" id="gf-done" style="padding:10px 24px;font-size:14px;">Got it!</button>
    `;
    document.body.appendChild(card);

    const dismiss = () => { backdrop.remove(); card.remove(); };
    card.querySelector('#gf-done')?.addEventListener('click', dismiss);
    backdrop.addEventListener('click', dismiss);
    setTimeout(dismiss, 8000);
  }

  private waitForElement(selector: string, callback: () => void) {
    this.observer = new MutationObserver(() => {
      if (document.querySelector(selector)) {
        this.observer?.disconnect();
        callback();
      }
    });
    this.observer.observe(document.body, { childList: true, subtree: true });
    setTimeout(() => { this.observer?.disconnect(); this.next(); }, 10000);
  }

  private setupKeyboardNav() {
    const handler = (e: KeyboardEvent) => {
      if (!this.isActive) { document.removeEventListener('keydown', handler); return; }
      if (e.key === 'ArrowRight' || e.key === 'Enter') this.next();
      if (e.key === 'ArrowLeft') this.prev();
      if (e.key === 'Escape') this.stop();
    };
    document.addEventListener('keydown', handler);
  }

  private cleanup() {
    this.overlay?.remove();
    this.spotlight?.remove();
    this.tooltip?.remove();
    this.styleEl?.remove();
    this.observer?.disconnect();
    this.overlay = this.spotlight = this.tooltip = this.styleEl = null;
  }
}

export default InteractiveWalkthrough;

// Export factory for embedding
export function createWalkthrough(config: WalkthroughConfig): InteractiveWalkthrough {
  return new InteractiveWalkthrough(config);
}
