// Instruction Generator for GuideFlow
// Produces human-readable instructions from captured DOM events
// No AI required - uses element metadata to create clear descriptions

import type { ElementInfo, ActionType, CapturedStep } from '../types';

/** Maximum label length before truncation */
const MAX_LABEL_LENGTH = 80;

/** Generate a unique step ID */
export function generateStepId(): string {
  return `step_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

/** Generate a unique recording ID */
export function generateRecordingId(): string {
  return `rec_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

/** Truncate text to a maximum length, adding ellipsis if needed */
function truncate(text: string, maxLength: number = MAX_LABEL_LENGTH): string {
  const cleaned = text.replace(/\s+/g, ' ').trim();
  if (cleaned.length <= maxLength) return cleaned;
  return cleaned.substring(0, maxLength - 3) + '...';
}

/**
 * Get the best human-readable label for an element.
 * Priority order follows accessibility best practices:
 * 1. Associated form label
 * 2. Accessible name (aria-label)
 * 3. Button/link text content
 * 4. Placeholder text
 * 5. Generic fallback
 */
export function getBestLabel(info: ElementInfo): string {
  if (info.label) return truncate(info.label);
  if (info.ariaLabel) return truncate(info.ariaLabel);
  if (info.text) return truncate(info.text);
  if (info.placeholder) return truncate(info.placeholder);

  // Fallback based on element type
  const tagFallbacks: Record<string, string> = {
    button: 'the button',
    a: 'the link',
    input: 'the input field',
    select: 'the dropdown',
    textarea: 'the text area',
    checkbox: 'the checkbox',
  };

  const inputType = info.type?.toLowerCase();
  if (info.tagName === 'input' && inputType) {
    const inputFallbacks: Record<string, string> = {
      text: 'the text field',
      email: 'the email field',
      password: 'the password field',
      number: 'the number field',
      search: 'the search field',
      tel: 'the phone field',
      url: 'the URL field',
      checkbox: 'the checkbox',
      radio: 'the radio button',
      submit: 'the submit button',
      file: 'the file upload',
    };
    return inputFallbacks[inputType] || 'the input field';
  }

  return tagFallbacks[info.tagName?.toLowerCase()] || 'the highlighted element';
}

/**
 * Generate a human-readable instruction for a captured action.
 * These are functional without AI but can be improved later.
 */
export function generateInstruction(
  actionType: ActionType,
  info: ElementInfo,
  context?: { previousUrl?: string; currentUrl?: string; selectedValue?: string }
): string {
  const label = getBestLabel(info);

  switch (actionType) {
    case 'click': {
      // Button clicks
      if (info.tagName === 'button' || info.type === 'submit') {
        return `Click "${label}"`;
      }
      // Link clicks
      if (info.tagName === 'a') {
        return `Click "${label}"`;
      }
      // Tab/menu items
      if (info.role === 'tab' || info.role === 'menuitem') {
        return `Select "${label}"`;
      }
      // Generic clickable
      return `Click "${label}"`;
    }

    case 'input': {
      // Password fields - never mention the value
      if (info.type === 'password') {
        return `Enter your password in ${label}`;
      }
      // Other text fields - record field name, not value
      return `Enter the required information in "${label}"`;
    }

    case 'select': {
      if (context?.selectedValue) {
        return `Select "${truncate(context.selectedValue)}" from "${label}"`;
      }
      return `Choose an option from "${label}"`;
    }

    case 'checkbox': {
      return `Toggle ${label}`;
    }

    case 'navigation': {
      if (context?.currentUrl) {
        try {
          const url = new URL(context.currentUrl);
          const pageName = url.pathname === '/'
            ? url.hostname
            : url.pathname.split('/').filter(Boolean).pop() || url.hostname;
          return `Navigate to "${pageName.replace(/[-_]/g, ' ')}"`;
        } catch {
          return `Navigate to the page`;
        }
      }
      return `Navigate to the new page`;
    }

    case 'scroll':
      return `Scroll to view the content`;

    default:
      return `Interact with "${label}"`;
  }
}

/**
 * Determine if an event should create a new step or update an existing one.
 * Groups repeated interactions with the same field.
 */
export function shouldCreateNewStep(
  newAction: { actionType: ActionType; selector: string },
  lastStep: CapturedStep | null
): boolean {
  if (!lastStep) return true;

  // Always create new steps for clicks and navigation
  if (newAction.actionType === 'click' || newAction.actionType === 'navigation') {
    return true;
  }

  // Group repeated input into the same field
  if (
    newAction.actionType === 'input' &&
    lastStep.actionType === 'input' &&
    newAction.selector === lastStep.elementSelector
  ) {
    return false;
  }

  // Group repeated select on the same dropdown
  if (
    newAction.actionType === 'select' &&
    lastStep.actionType === 'select' &&
    newAction.selector === lastStep.elementSelector
  ) {
    return false;
  }

  return true;
}

/**
 * Extract a title suggestion from the recording's first steps
 */
export function suggestGuideTitle(steps: CapturedStep[]): string {
  if (steps.length === 0) return 'Untitled Guide';

  // Try to use the first page title
  const firstPageTitle = steps[0]?.pageTitle;
  if (firstPageTitle) {
    return `How to: ${truncate(firstPageTitle, 50)}`;
  }

  // Use the first meaningful action
  const firstAction = steps.find(s => s.actionType !== 'navigation');
  if (firstAction) {
    return `Guide: ${firstAction.instruction}`;
  }

  return 'Untitled Guide';
}
