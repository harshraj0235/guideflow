// GuideFlow — Multi-Format Export Engine
// Export guides to Markdown, HTML, print-optimized PDF, and JSON

import { Guide, Step } from '@prisma/client';

export type ExportFormat = 'markdown' | 'html' | 'json' | 'notion' | 'confluence';

interface ExportOptions {
  format: ExportFormat;
  includeBranding?: boolean;
  includeScreenshots?: boolean;
  includeNotes?: boolean;
  includeMetadata?: boolean;
  customCSS?: string;
  brandName?: string;
  brandColor?: string;
  brandLogo?: string;
}

interface GuideWithSteps extends Guide {
  steps: Step[];
  author?: { name: string | null; email: string };
}

// ─── Markdown Export ──────────────────────────────────────────────

export function exportToMarkdown(guide: GuideWithSteps, options: ExportOptions): string {
  const lines: string[] = [];

  lines.push(`# ${guide.title}`);
  lines.push('');

  if (guide.description) {
    lines.push(`> ${guide.description}`);
    lines.push('');
  }

  if (options.includeMetadata) {
    lines.push(`**Created**: ${new Date(guide.createdAt).toLocaleDateString()}`);
    if (guide.author?.name) lines.push(`**Author**: ${guide.author.name}`);
    lines.push(`**Steps**: ${guide.steps.length}`);
    lines.push('');
    lines.push('---');
    lines.push('');
  }

  guide.steps.forEach((step, i) => {
    lines.push(`## Step ${i + 1}: ${step.instruction}`);
    lines.push('');

    if (options.includeScreenshots && step.screenshotUrl) {
      lines.push(`![Step ${i + 1} screenshot](${step.screenshotUrl})`);
      lines.push('');
    }

    if (options.includeNotes && step.notes) {
      lines.push(`> 💡 **Note**: ${step.notes}`);
      lines.push('');
    }

    lines.push('---');
    lines.push('');
  });

  if (options.includeBranding) {
    lines.push(`*Created with [${options.brandName || 'GuideFlow'}](https://guideflow.io)*`);
  }

  return lines.join('\n');
}

// ─── HTML Export (Print-optimized) ────────────────────────────────

export function exportToHTML(guide: GuideWithSteps, options: ExportOptions): string {
  const brandColor = options.brandColor || '#6366f1';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(guide.title)} — Guide</title>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet">
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: 'Inter', -apple-system, sans-serif;
      max-width: 800px; margin: 0 auto; padding: 48px 24px;
      color: #1a1a2e; background: #ffffff; line-height: 1.6;
      -webkit-print-color-adjust: exact; print-color-adjust: exact;
    }
    .header { margin-bottom: 40px; border-bottom: 2px solid #f3f4f6; padding-bottom: 24px; }
    .header h1 { font-size: 2rem; font-weight: 800; letter-spacing: -0.02em; margin-bottom: 8px; }
    .header .desc { color: #6b7280; font-size: 1rem; }
    .meta { display: flex; gap: 16px; margin-top: 12px; font-size: 13px; color: #9ca3af; }
    .step { margin: 32px 0; background: #ffffff; border: 1px solid #e5e7eb; border-radius: 16px; overflow: hidden; }
    .step-header { padding: 20px 24px; display: flex; align-items: flex-start; gap: 16px; }
    .step-num {
      width: 40px; height: 40px; border-radius: 50%; flex-shrink: 0;
      background: ${brandColor}; color: white;
      display: flex; align-items: center; justify-content: center;
      font-weight: 700; font-size: 16px;
    }
    .step-instruction { font-size: 1.1rem; font-weight: 600; line-height: 1.4; }
    .step-notes {
      margin-top: 10px; font-size: 14px; color: #6b7280;
      background: #f9fafb; padding: 12px 16px; border-radius: 8px;
    }
    .step-screenshot { border-top: 1px solid #f3f4f6; padding: 16px 24px 20px; }
    .step-screenshot img {
      width: 100%; border-radius: 10px; border: 1px solid #e5e7eb;
      box-shadow: 0 2px 8px rgba(0,0,0,0.06);
    }
    .footer { margin-top: 48px; padding-top: 24px; border-top: 1px solid #f3f4f6; text-align: center; }
    .footer a { color: ${brandColor}; text-decoration: none; font-weight: 600; }
    .toc { margin: 24px 0 40px; padding: 20px 24px; background: #f9fafb; border-radius: 12px; }
    .toc h3 { font-size: 14px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; color: #6b7280; margin-bottom: 12px; }
    .toc ol { padding-left: 20px; }
    .toc li { padding: 4px 0; font-size: 14px; color: #374151; }
    .toc a { color: ${brandColor}; text-decoration: none; }
    @media print {
      body { padding: 20px; }
      .step { break-inside: avoid; box-shadow: none; }
      .no-print { display: none; }
    }
    ${options.customCSS || ''}
  </style>
</head>
<body>
  <div class="header">
    ${options.brandLogo ? `<img src="${options.brandLogo}" alt="" style="height:32px;margin-bottom:16px;">` : ''}
    <h1>${escapeHtml(guide.title)}</h1>
    ${guide.description ? `<p class="desc">${escapeHtml(guide.description)}</p>` : ''}
    ${options.includeMetadata ? `
      <div class="meta">
        <span>${guide.steps.length} steps</span>
        ${guide.author?.name ? `<span>By ${escapeHtml(guide.author.name)}</span>` : ''}
        <span>${new Date(guide.createdAt).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}</span>
      </div>
    ` : ''}
  </div>

  <div class="toc no-print">
    <h3>Table of Contents</h3>
    <ol>
      ${guide.steps.map((s, i) => `<li><a href="#step-${i + 1}">${escapeHtml(s.instruction)}</a></li>`).join('\n      ')}
    </ol>
  </div>

  ${guide.steps.map((step, i) => `
    <div class="step" id="step-${i + 1}">
      <div class="step-header">
        <div class="step-num">${i + 1}</div>
        <div>
          <div class="step-instruction">${escapeHtml(step.instruction)}</div>
          ${options.includeNotes && step.notes ? `<div class="step-notes">💡 ${escapeHtml(step.notes)}</div>` : ''}
        </div>
      </div>
      ${options.includeScreenshots && step.screenshotUrl ? `
        <div class="step-screenshot">
          <img src="${step.screenshotUrl}" alt="Step ${i + 1}: ${escapeHtml(step.instruction)}" loading="lazy">
        </div>
      ` : ''}
    </div>
  `).join('\n')}

  ${options.includeBranding ? `
    <div class="footer">
      <p style="font-size:13px;color:#9ca3af;">
        Created with <a href="https://guideflow.io">${options.brandName || 'GuideFlow'}</a>
      </p>
    </div>
  ` : ''}
</body>
</html>`;
}

// ─── JSON Export ──────────────────────────────────────────────────

export function exportToJSON(guide: GuideWithSteps, options: ExportOptions): string {
  return JSON.stringify({
    version: '1.0',
    exportedAt: new Date().toISOString(),
    exportedBy: options.brandName || 'GuideFlow',
    guide: {
      id: guide.id,
      title: guide.title,
      description: guide.description,
      status: guide.status,
      version: guide.version,
      createdAt: guide.createdAt,
      updatedAt: guide.updatedAt,
      author: guide.author,
      steps: guide.steps.map((step, i) => ({
        index: i,
        instruction: step.instruction,
        notes: step.notes,
        actionType: step.actionType,
        screenshotUrl: options.includeScreenshots ? step.screenshotUrl : null,
        clickPosition: step.clickPositionX ? {
          x: step.clickPositionX,
          y: step.clickPositionY,
          viewportWidth: step.clickViewportWidth,
          viewportHeight: step.clickViewportHeight,
        } : null,
        annotations: step.annotations,
      })),
    },
  }, null, 2);
}

// ─── Notion Export ────────────────────────────────────────────────

export function exportToNotion(guide: GuideWithSteps, options: ExportOptions): string {
  // Generates Notion-compatible markdown with callout blocks
  const lines: string[] = [];

  lines.push(`# ${guide.title}`);
  lines.push('');

  if (guide.description) {
    lines.push(`> ${guide.description}`);
    lines.push('');
  }

  guide.steps.forEach((step, i) => {
    lines.push(`### Step ${i + 1}`);
    lines.push(`${step.instruction}`);
    lines.push('');

    if (options.includeScreenshots && step.screenshotUrl) {
      lines.push(`![Step ${i + 1}](${step.screenshotUrl})`);
      lines.push('');
    }

    if (options.includeNotes && step.notes) {
      lines.push(`> 💡 ${step.notes}`);
      lines.push('');
    }

    lines.push('---');
    lines.push('');
  });

  return lines.join('\n');
}

// ─── Confluence Export ────────────────────────────────────────────

export function exportToConfluence(guide: GuideWithSteps, options: ExportOptions): string {
  const lines: string[] = [];

  lines.push(`<h1>${escapeHtml(guide.title)}</h1>`);

  if (guide.description) {
    lines.push(`<p>${escapeHtml(guide.description)}</p>`);
  }

  lines.push('<ac:structured-macro ac:name="toc" ac:schema-version="1"/>');

  guide.steps.forEach((step, i) => {
    lines.push(`<h2>Step ${i + 1}: ${escapeHtml(step.instruction)}</h2>`);

    if (options.includeScreenshots && step.screenshotUrl) {
      lines.push(`<p><ac:image><ri:url ri:value="${step.screenshotUrl}"/></ac:image></p>`);
    }

    if (options.includeNotes && step.notes) {
      lines.push(`<ac:structured-macro ac:name="info"><ac:rich-text-body><p>${escapeHtml(step.notes)}</p></ac:rich-text-body></ac:structured-macro>`);
    }
  });

  return lines.join('\n');
}

// ─── Unified Export Function ─────────────────────────────────────

export function exportGuide(guide: GuideWithSteps, options: ExportOptions): string {
  switch (options.format) {
    case 'markdown': return exportToMarkdown(guide, options);
    case 'html': return exportToHTML(guide, options);
    case 'json': return exportToJSON(guide, options);
    case 'notion': return exportToNotion(guide, options);
    case 'confluence': return exportToConfluence(guide, options);
    default: return exportToMarkdown(guide, options);
  }
}

function escapeHtml(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
