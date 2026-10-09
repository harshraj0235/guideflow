// GuideFlow Type Definitions

/** Recording states following the state machine design */
export type RecordingState =
  | 'idle'
  | 'recording'
  | 'paused'
  | 'reviewing'
  | 'uploading'
  | 'saved'
  | 'interrupted';

/** Types of user interactions we capture */
export type ActionType =
  | 'click'
  | 'input'
  | 'select'
  | 'checkbox'
  | 'navigation'
  | 'scroll';

/** A single captured step in the recording */
export interface CapturedStep {
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

/** A complete recording session */
export interface Recording {
  id: string;
  title: string;
  description: string;
  steps: CapturedStep[];
  state: RecordingState;
  startedAt: number;
  updatedAt: number;
  completedAt: number | null;
  tabId: number | null;
  tabUrl: string;
  totalDuration: number;
}

/** Element information extracted from the DOM */
export interface ElementInfo {
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
  boundingRect: DOMRect | null;
}

/** Messages between content script and background service worker */
export type MessageType =
  | 'START_RECORDING'
  | 'STOP_RECORDING'
  | 'PAUSE_RECORDING'
  | 'RESUME_RECORDING'
  | 'CAPTURE_EVENT'
  | 'CAPTURE_SCREENSHOT'
  | 'SCREENSHOT_CAPTURED'
  | 'GET_STATE'
  | 'STATE_UPDATE'
  | 'RECORDING_COMPLETE'
  | 'OPEN_REVIEW';

export interface ExtensionMessage {
  type: MessageType;
  payload?: unknown;
}

/** Redaction annotation on a screenshot */
export interface RedactionBox {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  type: 'opaque' | 'highlight' | 'crop';
  color: string;
}

/** Guide ready for sharing/publishing */
export interface Guide {
  id: string;
  title: string;
  description: string;
  steps: GuideStep[];
  createdAt: string;
  updatedAt: string;
  publishedAt: string | null;
  version: number;
  status: 'draft' | 'published' | 'archived';
  shareToken: string | null;
  workspaceId: string;
  authorId: string;
}

export interface GuideStep {
  id: string;
  index: number;
  instruction: string;
  screenshotUrl: string | null;
  annotations: RedactionBox[];
  actionType: ActionType;
  metadata: Record<string, string>;
}

/** Share link configuration */
export interface ShareLink {
  id: string;
  guideId: string;
  token: string;
  expiresAt: string | null;
  isRevoked: boolean;
  accessMode: 'private' | 'unlisted' | 'public';
  createdAt: string;
}
