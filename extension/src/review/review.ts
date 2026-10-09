// GuideFlow Review Page Controller
// Canvas-based image editor with redaction, highlighting, crop, and annotations

// ─── State ───────────────────────────────────────────────────────────

let currentRecording = null;
let selectedStepIndex = -1;
let currentTool = 'select';
let currentColor = '#000000';
const annotations = new Map(); // stepId -> Annotation[]
const undoStack = [];
let redoStack = [];

// Canvas state
let canvas = null;
let ctx = null;
let screenshotImage = null;
let isDrawing = false;
let drawStart = { x: 0, y: 0 };
let drawCurrent = { x: 0, y: 0 };

// ─── DOM Elements ────────────────────────────────────────────────────

const dom = {
  guideTitle: document.getElementById('guide-title'),
  stepList: document.getElementById('step-list'),
  panelStepCount: document.getElementById('panel-step-count'),
  editorToolbar: document.getElementById('editor-toolbar'),
  emptyEditor: document.getElementById('empty-editor'),
  editorContent: document.getElementById('editor-content'),
  canvas: document.getElementById('screenshot-canvas'),
  canvasWrapper: document.getElementById('canvas-wrapper'),
  editInstruction: document.getElementById('edit-instruction'),
  editNotes: document.getElementById('edit-notes'),
  btnAddStep: document.getElementById('btn-add-step'),
  btnUndo: document.getElementById('btn-undo'),
  btnRedo: document.getElementById('btn-redo'),
  btnReplaceScreenshot: document.getElementById('btn-replace-screenshot'),
  btnPreview: document.getElementById('btn-preview'),
  btnExportPdf: document.getElementById('btn-export-pdf'),
  btnSaveUpload: document.getElementById('btn-save-upload'),
  redactionColors: document.getElementById('redaction-colors'),
};

canvas = dom.canvas;
ctx = canvas.getContext('2d');

// ─── Load Recording ──────────────────────────────────────────────────

async function loadRecording() {
  try {
    const response = await chrome.runtime.sendMessage({ type: 'GET_CURRENT_SESSION' });
    if (response?.session) {
      currentRecording = response.session;
    } else {
      // Try saved recordings
      const saved = await chrome.runtime.sendMessage({ type: 'GET_RECORDING' });
      if (saved?.recordings?.length > 0) {
        currentRecording = saved.recordings[saved.recordings.length - 1];
      }
    }

    if (currentRecording) {
      // Set title
      if (currentRecording.title) {
        dom.guideTitle.value = currentRecording.title;
      } else {
        dom.guideTitle.value = suggestTitle(currentRecording);
      }

      // Initialize annotations
      currentRecording.steps.forEach(step => {
        if (!annotations.has(step.id)) {
          annotations.set(step.id, []);
        }
      });

      renderStepList();

      // Select first step
      if (currentRecording.steps.length > 0) {
        selectStep(0);
      }
    } else {
      showNoRecording();
    }
  } catch (err) {
    console.error('Failed to load recording:', err);
    showNoRecording();
  }
}

function showNoRecording() {
  document.getElementById('app').innerHTML = `
    <div class="no-recording">
      <div class="icon">📋</div>
      <h2>No Recording Found</h2>
      <p>Record a browser process first, then come back here to review and edit.</p>
      <button class="btn btn-primary" onclick="window.close()">Close</button>
    </div>
  `;
}

function suggestTitle(recording) {
  if (recording.steps.length === 0) return 'Untitled Guide';
  const first = recording.steps[0];
  if (first.pageTitle) return `How to: ${first.pageTitle.substring(0, 50)}`;
  return 'Untitled Guide';
}

// ─── Step List ───────────────────────────────────────────────────────

function renderStepList() {
  if (!currentRecording) return;

  dom.panelStepCount.textContent = currentRecording.steps.length;

  dom.stepList.innerHTML = currentRecording.steps.map((step, i) => {
    const isSelected = i === selectedStepIndex;
    const hasScreenshot = step.screenshotDataUrl && step.screenshotStatus === 'captured';
    const annotationCount = annotations.get(step.id)?.length || 0;

    return `
      <div class="step-card ${isSelected ? 'selected' : ''}"
           data-index="${i}"
           data-step-id="${step.id}"
           draggable="true">
        <div class="step-card-number">${i + 1}</div>
        <div class="step-card-content">
          <div class="step-card-instruction">${escapeHtml(step.instruction)}</div>
          <div class="step-card-meta">
            ${getActionIcon(step.actionType)} ${step.actionType}
            ${annotationCount > 0 ? ` · ${annotationCount} annotation${annotationCount > 1 ? 's' : ''}` : ''}
          </div>
        </div>
        ${hasScreenshot ? `<img class="step-card-thumb" src="${step.screenshotDataUrl}" alt="Step ${i + 1}">` : ''}
        <div class="step-card-actions">
          <button class="step-action-btn" onclick="event.stopPropagation(); duplicateStep(${i})" title="Duplicate">📋</button>
          <button class="step-action-btn" onclick="event.stopPropagation(); deleteStep(${i})" title="Delete">🗑️</button>
        </div>
      </div>
    `;
  }).join('');

  // Attach click handlers
  dom.stepList.querySelectorAll('.step-card').forEach(card => {
    card.addEventListener('click', () => {
      selectStep(parseInt(card.dataset.index));
    });
  });

  // Drag-and-drop
  setupDragAndDrop();
}

function selectStep(index) {
  if (!currentRecording || index < 0 || index >= currentRecording.steps.length) return;

  selectedStepIndex = index;
  const step = currentRecording.steps[index];

  // Update UI
  dom.emptyEditor.style.display = 'none';
  dom.editorContent.style.display = 'block';
  dom.editorToolbar.style.display = 'flex';

  // Update form
  dom.editInstruction.value = step.instruction;
  dom.editNotes.value = step.metadata?.notes || '';

  // Load screenshot into canvas
  if (step.screenshotDataUrl) {
    loadImageToCanvas(step.screenshotDataUrl);
  } else {
    // Show placeholder
    canvas.width = 800;
    canvas.height = 450;
    ctx.fillStyle = '#242432';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#6b6b80';
    ctx.font = '16px Inter, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('Screenshot not captured', canvas.width / 2, canvas.height / 2 - 10);
    ctx.font = '13px Inter, sans-serif';
    ctx.fillText('Click "Replace" to add a screenshot manually', canvas.width / 2, canvas.height / 2 + 15);
  }

  // Update step list selection
  renderStepList();
}

// ─── Canvas / Image Editor ───────────────────────────────────────────

function loadImageToCanvas(dataUrl) {
  const img = new Image();
  img.onload = () => {
    screenshotImage = img;

    // Scale to fit while maintaining aspect ratio
    const maxWidth = Math.min(img.width, 900);
    const scale = maxWidth / img.width;
    canvas.width = img.width * scale;
    canvas.height = img.height * scale;

    redrawCanvas();
  };
  img.src = dataUrl;
}

function redrawCanvas() {
  if (!ctx) return;

  // Clear
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // Draw screenshot
  if (screenshotImage) {
    ctx.drawImage(screenshotImage, 0, 0, canvas.width, canvas.height);
  }

  // Draw click position marker
  const step = currentRecording?.steps[selectedStepIndex];
  if (step?.clickPosition) {
    const { x, y, viewportWidth, viewportHeight } = step.clickPosition;
    const scaleX = canvas.width / viewportWidth;
    const scaleY = canvas.height / viewportHeight;
    const cx = x * scaleX;
    const cy = y * scaleY;

    // Outer ring
    ctx.beginPath();
    ctx.arc(cx, cy, 20, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(99, 102, 241, 0.8)';
    ctx.lineWidth = 3;
    ctx.stroke();

    // Inner dot
    ctx.beginPath();
    ctx.arc(cx, cy, 5, 0, Math.PI * 2);
    ctx.fillStyle = '#6366f1';
    ctx.fill();
  }

  // Draw annotations
  const stepAnnotations = annotations.get(step?.id) || [];
  for (const ann of stepAnnotations) {
    drawAnnotation(ann);
  }

  // Draw current drawing preview
  if (isDrawing && currentTool !== 'select') {
    const previewAnn = {
      type: currentTool,
      x: Math.min(drawStart.x, drawCurrent.x),
      y: Math.min(drawStart.y, drawCurrent.y),
      width: Math.abs(drawCurrent.x - drawStart.x),
      height: Math.abs(drawCurrent.y - drawStart.y),
      color: currentColor,
    };
    drawAnnotation(previewAnn);
  }
}

function drawAnnotation(ann) {
  if (!ctx) return;

  switch (ann.type) {
    case 'redact':
      // Opaque redaction box - completely covers content
      ctx.fillStyle = ann.color || '#000000';
      ctx.fillRect(ann.x, ann.y, ann.width, ann.height);
      break;

    case 'highlight':
      // Semi-transparent highlight
      ctx.fillStyle = (ann.color || '#f59e0b') + '40';
      ctx.fillRect(ann.x, ann.y, ann.width, ann.height);
      ctx.strokeStyle = ann.color || '#f59e0b';
      ctx.lineWidth = 2;
      ctx.strokeRect(ann.x, ann.y, ann.width, ann.height);
      break;

    case 'crop':
      // Show crop overlay
      ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
      // Top
      ctx.fillRect(0, 0, canvas.width, ann.y);
      // Bottom
      ctx.fillRect(0, ann.y + ann.height, canvas.width, canvas.height - ann.y - ann.height);
      // Left
      ctx.fillRect(0, ann.y, ann.x, ann.height);
      // Right
      ctx.fillRect(ann.x + ann.width, ann.y, canvas.width - ann.x - ann.width, ann.height);
      // Border
      ctx.strokeStyle = '#6366f1';
      ctx.lineWidth = 2;
      ctx.setLineDash([5, 5]);
      ctx.strokeRect(ann.x, ann.y, ann.width, ann.height);
      ctx.setLineDash([]);
      break;

    case 'click-marker':
      const cx = ann.x + ann.width / 2;
      const cy = ann.y + ann.height / 2;
      ctx.beginPath();
      ctx.arc(cx, cy, 18, 0, Math.PI * 2);
      ctx.strokeStyle = ann.color || '#6366f1';
      ctx.lineWidth = 3;
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(cx, cy, 4, 0, Math.PI * 2);
      ctx.fillStyle = ann.color || '#6366f1';
      ctx.fill();
      break;

    case 'arrow':
      const startX = ann.x;
      const startY = ann.y;
      const endX = ann.x + ann.width;
      const endY = ann.y + ann.height;
      ctx.beginPath();
      ctx.moveTo(startX, startY);
      ctx.lineTo(endX, endY);
      ctx.strokeStyle = ann.color || '#ef4444';
      ctx.lineWidth = 3;
      ctx.stroke();
      // Arrowhead
      const angle = Math.atan2(endY - startY, endX - startX);
      ctx.beginPath();
      ctx.moveTo(endX, endY);
      ctx.lineTo(endX - 12 * Math.cos(angle - Math.PI / 6), endY - 12 * Math.sin(angle - Math.PI / 6));
      ctx.lineTo(endX - 12 * Math.cos(angle + Math.PI / 6), endY - 12 * Math.sin(angle + Math.PI / 6));
      ctx.closePath();
      ctx.fillStyle = ann.color || '#ef4444';
      ctx.fill();
      break;

    case 'text':
      ctx.font = 'bold 14px Inter, sans-serif';
      ctx.fillStyle = ann.color || '#ffffff';
      ctx.fillText(ann.text || 'Text', ann.x, ann.y + 16);
      break;
  }
}

// ─── Canvas Event Handlers ───────────────────────────────────────────

function getCanvasCoords(e) {
  const rect = canvas.getBoundingClientRect();
  const scaleX = canvas.width / rect.width;
  const scaleY = canvas.height / rect.height;
  return {
    x: (e.clientX - rect.left) * scaleX,
    y: (e.clientY - rect.top) * scaleY,
  };
}

canvas.addEventListener('mousedown', (e) => {
  if (currentTool === 'select') return;

  const coords = getCanvasCoords(e);
  isDrawing = true;
  drawStart = coords;
  drawCurrent = coords;
});

canvas.addEventListener('mousemove', (e) => {
  if (!isDrawing) return;
  drawCurrent = getCanvasCoords(e);
  redrawCanvas();
});

canvas.addEventListener('mouseup', (e) => {
  if (!isDrawing) return;
  isDrawing = false;

  const step = currentRecording?.steps[selectedStepIndex];
  if (!step) return;

  const width = Math.abs(drawCurrent.x - drawStart.x);
  const height = Math.abs(drawCurrent.y - drawStart.y);

  // Minimum size check
  if (width < 5 && height < 5) return;

  const annotation = {
    id: `ann_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
    type: currentTool,
    x: Math.min(drawStart.x, drawCurrent.x),
    y: Math.min(drawStart.y, drawCurrent.y),
    width,
    height,
    color: currentColor,
  };

  // Save to undo stack
  undoStack.push({
    stepId: step.id,
    action: 'add',
    annotation,
  });
  redoStack = [];

  // Add annotation
  const stepAnnotations = annotations.get(step.id) || [];
  stepAnnotations.push(annotation);
  annotations.set(step.id, stepAnnotations);

  redrawCanvas();
  renderStepList();
});

// ─── Tool Selection ──────────────────────────────────────────────────

document.querySelectorAll('.tool-btn[data-tool]').forEach(btn => {
  btn.addEventListener('click', () => {
    currentTool = btn.dataset.tool;
    document.querySelectorAll('.tool-btn[data-tool]').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');

    // Update cursor
    canvas.style.cursor = currentTool === 'select' ? 'default' : 'crosshair';
  });
});

// Color selection
dom.redactionColors.querySelectorAll('.color-swatch').forEach(swatch => {
  swatch.addEventListener('click', () => {
    currentColor = swatch.dataset.color;
    dom.redactionColors.querySelectorAll('.color-swatch').forEach(s => s.classList.remove('active'));
    swatch.classList.add('active');
  });
});

// ─── Undo / Redo ─────────────────────────────────────────────────────

dom.btnUndo.addEventListener('click', () => {
  if (undoStack.length === 0) return;

  const action = undoStack.pop();
  redoStack.push(action);

  const stepAnns = annotations.get(action.stepId) || [];
  if (action.action === 'add') {
    const idx = stepAnns.findIndex(a => a.id === action.annotation.id);
    if (idx >= 0) stepAnns.splice(idx, 1);
  }
  annotations.set(action.stepId, stepAnns);
  redrawCanvas();
});

dom.btnRedo.addEventListener('click', () => {
  if (redoStack.length === 0) return;

  const action = redoStack.pop();
  undoStack.push(action);

  const stepAnns = annotations.get(action.stepId) || [];
  if (action.action === 'add') {
    stepAnns.push(action.annotation);
  }
  annotations.set(action.stepId, stepAnns);
  redrawCanvas();
});

// ─── Step Editing ────────────────────────────────────────────────────

dom.editInstruction.addEventListener('input', () => {
  if (!currentRecording || selectedStepIndex < 0) return;
  const step = currentRecording.steps[selectedStepIndex];
  step.instruction = dom.editInstruction.value;

  // Update in background
  chrome.runtime.sendMessage({
    type: 'UPDATE_STEP',
    payload: { stepId: step.id, updates: { instruction: step.instruction } },
  });

  renderStepList();
});

dom.editNotes.addEventListener('input', () => {
  if (!currentRecording || selectedStepIndex < 0) return;
  const step = currentRecording.steps[selectedStepIndex];
  step.metadata = step.metadata || {};
  step.metadata.notes = dom.editNotes.value;
});

// ─── Step Operations ─────────────────────────────────────────────────

function deleteStep(index) {
  if (!currentRecording || !confirm('Delete this step?')) return;

  const step = currentRecording.steps[index];
  currentRecording.steps.splice(index, 1);

  // Reindex
  currentRecording.steps.forEach((s, i) => s.index = i);

  chrome.runtime.sendMessage({
    type: 'DELETE_STEP',
    payload: { stepId: step.id },
  });

  if (selectedStepIndex >= currentRecording.steps.length) {
    selectedStepIndex = currentRecording.steps.length - 1;
  }

  renderStepList();
  if (selectedStepIndex >= 0) {
    selectStep(selectedStepIndex);
  } else {
    dom.emptyEditor.style.display = 'block';
    dom.editorContent.style.display = 'none';
    dom.editorToolbar.style.display = 'none';
  }
}

// Expose globally for inline onclick
window.deleteStep = deleteStep;

function duplicateStep(index) {
  if (!currentRecording) return;

  const original = currentRecording.steps[index];
  const duplicate = {
    ...JSON.parse(JSON.stringify(original)),
    id: `step_${Date.now()}_${Math.random().toString(36).substr(2, 7)}`,
    index: index + 1,
  };

  currentRecording.steps.splice(index + 1, 0, duplicate);
  currentRecording.steps.forEach((s, i) => s.index = i);

  renderStepList();
  selectStep(index + 1);
}

window.duplicateStep = duplicateStep;

// Add text-only step
dom.btnAddStep.addEventListener('click', () => {
  if (!currentRecording) return;

  const newStep = {
    id: `step_${Date.now()}_${Math.random().toString(36).substr(2, 7)}`,
    index: currentRecording.steps.length,
    actionType: 'click',
    instruction: 'New step — edit this instruction',
    elementSelector: '',
    elementText: '',
    elementRole: '',
    url: '',
    pageTitle: '',
    timestamp: Date.now(),
    screenshotDataUrl: null,
    screenshotStatus: 'pending',
    clickPosition: null,
    metadata: {},
  };

  currentRecording.steps.push(newStep);
  annotations.set(newStep.id, []);

  renderStepList();
  selectStep(currentRecording.steps.length - 1);
});

// Replace screenshot
dom.btnReplaceScreenshot.addEventListener('click', () => {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'image/*';
  input.onchange = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (ev) => {
      const step = currentRecording?.steps[selectedStepIndex];
      if (step) {
        step.screenshotDataUrl = ev.target.result;
        step.screenshotStatus = 'replaced';
        loadImageToCanvas(step.screenshotDataUrl);
        renderStepList();
      }
    };
    reader.readAsDataURL(file);
  };
  input.click();
});

// ─── Drag and Drop Reordering ────────────────────────────────────────

function setupDragAndDrop() {
  let dragIndex = -1;

  dom.stepList.querySelectorAll('.step-card').forEach(card => {
    card.addEventListener('dragstart', (e) => {
      dragIndex = parseInt(card.dataset.index);
      card.classList.add('dragging');
      e.dataTransfer.effectAllowed = 'move';
    });

    card.addEventListener('dragend', () => {
      card.classList.remove('dragging');
      document.querySelectorAll('.step-card.drag-over').forEach(c => c.classList.remove('drag-over'));
    });

    card.addEventListener('dragover', (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      card.classList.add('drag-over');
    });

    card.addEventListener('dragleave', () => {
      card.classList.remove('drag-over');
    });

    card.addEventListener('drop', (e) => {
      e.preventDefault();
      card.classList.remove('drag-over');

      const dropIndex = parseInt(card.dataset.index);
      if (dragIndex === dropIndex) return;

      // Reorder steps
      const [movedStep] = currentRecording.steps.splice(dragIndex, 1);
      currentRecording.steps.splice(dropIndex, 0, movedStep);
      currentRecording.steps.forEach((s, i) => s.index = i);

      // Update background
      chrome.runtime.sendMessage({
        type: 'REORDER_STEPS',
        payload: { stepIds: currentRecording.steps.map(s => s.id) },
      });

      selectedStepIndex = dropIndex;
      renderStepList();
      selectStep(dropIndex);
    });
  });
}

// ─── Export Functions ─────────────────────────────────────────────────

/** Generate a flattened image (annotations baked in) for a step */
function generateFlattenedImage(step) {
  const tempCanvas = document.createElement('canvas');
  const tempCtx = tempCanvas.getContext('2d');

  if (step.screenshotDataUrl) {
    const img = new Image();
    return new Promise((resolve) => {
      img.onload = () => {
        tempCanvas.width = img.width;
        tempCanvas.height = img.height;
        tempCtx.drawImage(img, 0, 0);

        // Bake in annotations
        const stepAnns = annotations.get(step.id) || [];
        for (const ann of stepAnns) {
          // Scale annotations to original image size
          const scaleX = img.width / canvas.width;
          const scaleY = img.height / canvas.height;
          const scaledAnn = {
            ...ann,
            x: ann.x * scaleX,
            y: ann.y * scaleY,
            width: ann.width * scaleX,
            height: ann.height * scaleY,
          };

          // Draw annotation on temp canvas
          if (ann.type === 'redact') {
            tempCtx.fillStyle = ann.color || '#000000';
            tempCtx.fillRect(scaledAnn.x, scaledAnn.y, scaledAnn.width, scaledAnn.height);
          } else if (ann.type === 'highlight') {
            tempCtx.fillStyle = (ann.color || '#f59e0b') + '40';
            tempCtx.fillRect(scaledAnn.x, scaledAnn.y, scaledAnn.width, scaledAnn.height);
            tempCtx.strokeStyle = ann.color || '#f59e0b';
            tempCtx.lineWidth = 3;
            tempCtx.strokeRect(scaledAnn.x, scaledAnn.y, scaledAnn.width, scaledAnn.height);
          }
        }

        resolve(tempCanvas.toDataURL('image/png'));
      };
      img.src = step.screenshotDataUrl;
    });
  }
  return Promise.resolve(null);
}

// Preview
dom.btnPreview.addEventListener('click', async () => {
  if (!currentRecording) return;

  const previewWindow = window.open('', '_blank');
  previewWindow.document.write(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>${escapeHtml(dom.guideTitle.value || 'Guide Preview')}</title>
      <style>
        body { font-family: Inter, -apple-system, sans-serif; max-width: 800px; margin: 0 auto; padding: 40px 20px; background: #fafafa; color: #1a1a2e; }
        h1 { font-size: 28px; margin-bottom: 8px; }
        .step { margin: 24px 0; background: white; border-radius: 12px; padding: 24px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
        .step-header { display: flex; align-items: center; gap: 12px; margin-bottom: 16px; }
        .step-num { width: 32px; height: 32px; border-radius: 50%; background: #6366f1; color: white; display: flex; align-items: center; justify-content: center; font-weight: 700; font-size: 14px; }
        .step-instruction { font-size: 16px; font-weight: 600; }
        .step-screenshot { width: 100%; border-radius: 8px; border: 1px solid #e5e7eb; }
        .step-notes { margin-top: 12px; font-size: 14px; color: #6b7280; background: #f9fafb; padding: 12px; border-radius: 8px; }
        @media print { body { padding: 20px; } .step { box-shadow: none; border: 1px solid #e5e7eb; } }
      </style>
    </head>
    <body>
      <h1>${escapeHtml(dom.guideTitle.value || 'Untitled Guide')}</h1>
      <p style="color:#6b7280;margin-bottom:32px;">${currentRecording.steps.length} steps</p>
  `);

  for (let i = 0; i < currentRecording.steps.length; i++) {
    const step = currentRecording.steps[i];
    const flatImage = await generateFlattenedImage(step);

    previewWindow.document.write(`
      <div class="step">
        <div class="step-header">
          <div class="step-num">${i + 1}</div>
          <div class="step-instruction">${escapeHtml(step.instruction)}</div>
        </div>
        ${flatImage ? `<img class="step-screenshot" src="${flatImage}" alt="Step ${i + 1}">` : ''}
        ${step.metadata?.notes ? `<div class="step-notes">${escapeHtml(step.metadata.notes)}</div>` : ''}
      </div>
    `);
  }

  previewWindow.document.write('</body></html>');
  previewWindow.document.close();
});

// Export PDF (print-friendly)
dom.btnExportPdf.addEventListener('click', async () => {
  // Open preview and trigger print
  dom.btnPreview.click();
  // The user can use browser print to PDF
});

// Save & Upload to web app
dom.btnSaveUpload.addEventListener('click', async () => {
  if (!currentRecording) return;

  // Prepare guide data with flattened images
  const guideData = {
    title: dom.guideTitle.value || 'Untitled Guide',
    steps: [],
  };

  for (const step of currentRecording.steps) {
    const flatImage = await generateFlattenedImage(step);
    guideData.steps.push({
      instruction: step.instruction,
      screenshotDataUrl: flatImage,
      actionType: step.actionType,
      notes: step.metadata?.notes || '',
      clickPosition: step.clickPosition,
    });
  }

  // Store for web app pickup
  try {
    await chrome.storage.local.set({ pendingUpload: guideData });
    chrome.tabs.create({ url: 'http://localhost:3000/editor?from=extension' });
    window.close();
  } catch (err) {
    alert('Failed to prepare upload. Please try again.');
    console.error(err);
  }
});

// ─── Helpers ─────────────────────────────────────────────────────────

function getActionIcon(actionType) {
  return { click: '🖱️', input: '⌨️', select: '📋', checkbox: '☑️', navigation: '🔗', scroll: '📜' }[actionType] || '·';
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text || '';
  return div.innerHTML;
}

// ─── Keyboard Shortcuts ──────────────────────────────────────────────

document.addEventListener('keydown', (e) => {
  // Ctrl+Z: Undo
  if (e.ctrlKey && e.key === 'z' && !e.shiftKey) {
    e.preventDefault();
    dom.btnUndo.click();
  }
  // Ctrl+Shift+Z or Ctrl+Y: Redo
  if ((e.ctrlKey && e.shiftKey && e.key === 'z') || (e.ctrlKey && e.key === 'y')) {
    e.preventDefault();
    dom.btnRedo.click();
  }
  // Delete: delete selected step
  if (e.key === 'Delete' && selectedStepIndex >= 0) {
    const activeEl = document.activeElement;
    if (activeEl.tagName !== 'INPUT' && activeEl.tagName !== 'TEXTAREA') {
      deleteStep(selectedStepIndex);
    }
  }
  // Arrow keys: navigate steps
  if (e.key === 'ArrowUp' && selectedStepIndex > 0) {
    const activeEl = document.activeElement;
    if (activeEl.tagName !== 'INPUT' && activeEl.tagName !== 'TEXTAREA') {
      e.preventDefault();
      selectStep(selectedStepIndex - 1);
    }
  }
  if (e.key === 'ArrowDown' && selectedStepIndex < (currentRecording?.steps?.length || 0) - 1) {
    const activeEl = document.activeElement;
    if (activeEl.tagName !== 'INPUT' && activeEl.tagName !== 'TEXTAREA') {
      e.preventDefault();
      selectStep(selectedStepIndex + 1);
    }
  }
});

// ─── Title auto-save ─────────────────────────────────────────────────

dom.guideTitle.addEventListener('input', () => {
  if (currentRecording) {
    currentRecording.title = dom.guideTitle.value;
  }
});

// ─── Initialize ──────────────────────────────────────────────────────

loadRecording();
