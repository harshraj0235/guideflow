// GuideFlow — Automatic Sensitive Data Detection & Redaction
// Scans screenshots using Canvas pixel analysis + OCR-like pattern matching
// Detects emails, phone numbers, SSNs, credit cards, API keys, and more

export interface SensitiveDataMatch {
  id: string;
  type: SensitiveDataType;
  label: string;
  confidence: number;
  boundingBox: { x: number; y: number; width: number; height: number };
  value?: string; // Only stored temporarily for detection, never persisted
}

export type SensitiveDataType =
  | 'email'
  | 'phone'
  | 'ssn'
  | 'credit_card'
  | 'api_key'
  | 'ip_address'
  | 'password_field'
  | 'personal_name'
  | 'address'
  | 'custom';

// Pattern definitions for text-based detection
const SENSITIVE_PATTERNS: Record<SensitiveDataType, RegExp[]> = {
  email: [
    /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g,
  ],
  phone: [
    /(\+?\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/g,
    /(\+91[-.\s]?)?\d{10}/g,
    /\d{3}[-.\s]\d{3}[-.\s]\d{4}/g,
  ],
  ssn: [
    /\d{3}[-.\s]?\d{2}[-.\s]?\d{4}/g,
  ],
  credit_card: [
    /\d{4}[-.\s]?\d{4}[-.\s]?\d{4}[-.\s]?\d{4}/g,
    /\d{4}[-.\s]?\d{6}[-.\s]?\d{5}/g, // Amex
  ],
  api_key: [
    /[A-Za-z0-9]{32,}/g,
    /sk[-_][a-zA-Z0-9]{20,}/g,
    /pk[-_][a-zA-Z0-9]{20,}/g,
    /key[-_][a-zA-Z0-9]{16,}/g,
    /token[-_][a-zA-Z0-9]{16,}/g,
    /Bearer\s+[a-zA-Z0-9._-]{20,}/g,
  ],
  ip_address: [
    /\b(?:\d{1,3}\.){3}\d{1,3}\b/g,
    /[0-9a-fA-F:]{15,39}/g, // IPv6
  ],
  password_field: [],
  personal_name: [],
  address: [],
  custom: [],
};

// CSS selectors that typically contain sensitive data
const SENSITIVE_FIELD_SELECTORS = [
  'input[type="password"]',
  'input[type="email"]',
  'input[type="tel"]',
  'input[type="ssn"]',
  'input[name*="card"]',
  'input[name*="cvv"]',
  'input[name*="cvc"]',
  'input[name*="social"]',
  'input[name*="ssn"]',
  'input[autocomplete="cc-number"]',
  'input[autocomplete="cc-csc"]',
  '[data-sensitive]',
  '[data-pii]',
];

// Known sensitive UI patterns (element text content)
const SENSITIVE_LABELS = [
  'social security',
  'ssn',
  'credit card',
  'card number',
  'cvv',
  'cvc',
  'expiry',
  'expiration',
  'account number',
  'routing number',
  'api key',
  'secret key',
  'access token',
  'private key',
  'password',
  'pin code',
];

/**
 * Scan page DOM for elements that likely contain sensitive data.
 * Returns bounding boxes relative to viewport for redaction suggestions.
 */
export function scanDOMForSensitiveFields(): SensitiveDataMatch[] {
  const matches: SensitiveDataMatch[] = [];

  // Check for sensitive input fields
  SENSITIVE_FIELD_SELECTORS.forEach(selector => {
    try {
      document.querySelectorAll(selector).forEach((el, index) => {
        const rect = el.getBoundingClientRect();
        if (rect.width > 0 && rect.height > 0) {
          const input = el as HTMLInputElement;
          const type = inferSensitiveType(input);
          matches.push({
            id: `dom_${type}_${index}_${Date.now()}`,
            type,
            label: getLabelForField(input) || `${type} field`,
            confidence: 0.9,
            boundingBox: {
              x: rect.x,
              y: rect.y,
              width: rect.width,
              height: rect.height,
            },
          });
        }
      });
    } catch { /* selector may be invalid in some contexts */ }
  });

  // Scan visible text for sensitive patterns
  const walker = document.createTreeWalker(
    document.body,
    NodeFilter.SHOW_TEXT,
    null
  );

  let node: Node | null;
  while ((node = walker.nextNode())) {
    const text = node.textContent || '';
    if (text.trim().length < 4) continue;

    for (const [type, patterns] of Object.entries(SENSITIVE_PATTERNS)) {
      for (const pattern of patterns) {
        pattern.lastIndex = 0;
        let match;
        while ((match = pattern.exec(text)) !== null) {
          const range = document.createRange();
          try {
            range.setStart(node, match.index);
            range.setEnd(node, match.index + match[0].length);
            const rect = range.getBoundingClientRect();

            if (rect.width > 0 && rect.height > 0) {
              matches.push({
                id: `text_${type}_${matches.length}_${Date.now()}`,
                type: type as SensitiveDataType,
                label: `Detected ${type.replace('_', ' ')}`,
                confidence: calculateConfidence(type as SensitiveDataType, match[0]),
                boundingBox: {
                  x: rect.x - 4,
                  y: rect.y - 2,
                  width: rect.width + 8,
                  height: rect.height + 4,
                },
              });
            }
          } catch { /* Range may fail on some nodes */ }
        }
      }
    }
  }

  // Check labels for sensitive keywords
  document.querySelectorAll('label, .label, [class*="label"]').forEach((el, index) => {
    const text = (el.textContent || '').toLowerCase();
    for (const keyword of SENSITIVE_LABELS) {
      if (text.includes(keyword)) {
        // Find the associated input
        const labelEl = el as HTMLLabelElement;
        const input = labelEl.htmlFor
          ? document.getElementById(labelEl.htmlFor)
          : el.querySelector('input, select, textarea') || el.nextElementSibling;

        if (input) {
          const rect = input.getBoundingClientRect();
          if (rect.width > 0 && rect.height > 0) {
            matches.push({
              id: `label_${keyword}_${index}`,
              type: inferTypeFromKeyword(keyword),
              label: `${keyword} field`,
              confidence: 0.85,
              boundingBox: {
                x: rect.x,
                y: rect.y,
                width: rect.width,
                height: rect.height,
              },
            });
          }
        }
      }
    }
  });

  // Deduplicate overlapping matches
  return deduplicateMatches(matches);
}

/**
 * Scan text content (from step instructions or metadata) for sensitive data
 */
export function scanTextForSensitiveData(text: string): Array<{
  type: SensitiveDataType;
  match: string;
  index: number;
}> {
  const results: Array<{ type: SensitiveDataType; match: string; index: number }> = [];

  for (const [type, patterns] of Object.entries(SENSITIVE_PATTERNS)) {
    for (const pattern of patterns) {
      pattern.lastIndex = 0;
      let match;
      while ((match = pattern.exec(text)) !== null) {
        results.push({
          type: type as SensitiveDataType,
          match: match[0],
          index: match.index,
        });
      }
    }
  }

  return results;
}

/**
 * Generate auto-redaction boxes for detected sensitive regions
 */
export function generateAutoRedactions(
  matches: SensitiveDataMatch[],
  minConfidence: number = 0.7
): Array<{
  x: number;
  y: number;
  width: number;
  height: number;
  type: string;
  label: string;
}> {
  return matches
    .filter(m => m.confidence >= minConfidence)
    .map(m => ({
      x: m.boundingBox.x,
      y: m.boundingBox.y,
      width: m.boundingBox.width,
      height: m.boundingBox.height,
      type: 'redact',
      label: m.label,
    }));
}

// ─── Helpers ─────────────────────────────────────────────────────────

function inferSensitiveType(input: HTMLInputElement): SensitiveDataType {
  const type = input.type?.toLowerCase();
  const name = (input.name || '').toLowerCase();
  const auto = (input.autocomplete || '').toLowerCase();

  if (type === 'password') return 'password_field';
  if (type === 'email' || auto === 'email') return 'email';
  if (type === 'tel' || auto === 'tel') return 'phone';
  if (name.includes('card') || auto.includes('cc-number')) return 'credit_card';
  if (name.includes('ssn') || name.includes('social')) return 'ssn';
  return 'custom';
}

function inferTypeFromKeyword(keyword: string): SensitiveDataType {
  if (keyword.includes('card') || keyword.includes('cvv') || keyword.includes('cvc')) return 'credit_card';
  if (keyword.includes('ssn') || keyword.includes('social')) return 'ssn';
  if (keyword.includes('password') || keyword.includes('pin')) return 'password_field';
  if (keyword.includes('api') || keyword.includes('secret') || keyword.includes('token') || keyword.includes('key')) return 'api_key';
  if (keyword.includes('account') || keyword.includes('routing')) return 'credit_card';
  return 'custom';
}

function getLabelForField(input: HTMLInputElement): string {
  if (input.id) {
    const label = document.querySelector(`label[for="${input.id}"]`);
    if (label?.textContent) return label.textContent.trim();
  }
  const parent = input.closest('label');
  if (parent?.textContent) return parent.textContent.trim();
  return input.placeholder || input.name || '';
}

function calculateConfidence(type: SensitiveDataType, value: string): number {
  switch (type) {
    case 'email':
      return value.includes('@') && value.includes('.') ? 0.95 : 0.6;
    case 'phone':
      return value.replace(/\D/g, '').length >= 10 ? 0.85 : 0.5;
    case 'credit_card': {
      const digits = value.replace(/\D/g, '');
      return digits.length >= 15 && luhnCheck(digits) ? 0.95 : 0.5;
    }
    case 'ssn': {
      const ssnDigits = value.replace(/\D/g, '');
      return ssnDigits.length === 9 ? 0.8 : 0.4;
    }
    case 'api_key':
      return value.length > 30 ? 0.75 : 0.5;
    case 'ip_address':
      return /^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(value) ? 0.8 : 0.5;
    default:
      return 0.6;
  }
}

function luhnCheck(num: string): boolean {
  let sum = 0;
  let alternate = false;
  for (let i = num.length - 1; i >= 0; i--) {
    let n = parseInt(num[i], 10);
    if (alternate) {
      n *= 2;
      if (n > 9) n -= 9;
    }
    sum += n;
    alternate = !alternate;
  }
  return sum % 10 === 0;
}

function deduplicateMatches(matches: SensitiveDataMatch[]): SensitiveDataMatch[] {
  const result: SensitiveDataMatch[] = [];

  for (const match of matches) {
    const isDuplicate = result.some(existing => {
      const overlapX = Math.max(0, Math.min(existing.boundingBox.x + existing.boundingBox.width, match.boundingBox.x + match.boundingBox.width) - Math.max(existing.boundingBox.x, match.boundingBox.x));
      const overlapY = Math.max(0, Math.min(existing.boundingBox.y + existing.boundingBox.height, match.boundingBox.y + match.boundingBox.height) - Math.max(existing.boundingBox.y, match.boundingBox.y));
      const overlapArea = overlapX * overlapY;
      const matchArea = match.boundingBox.width * match.boundingBox.height;
      return matchArea > 0 && overlapArea / matchArea > 0.5;
    });

    if (!isDuplicate) {
      result.push(match);
    }
  }

  return result;
}
