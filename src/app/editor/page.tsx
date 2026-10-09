/* This canvas editor hydrates URL data and synchronizes an imperative image surface. */
/* eslint-disable react-hooks/set-state-in-effect */
"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { useRouter } from "next/navigation";
import { starterTemplates } from "@/lib/starter-templates";

interface StepData {
  id: string;
  index: number;
  instruction: string;
  notes: string;
  actionType: string;
  screenshotUrl: string | null;
  screenshotDataUrl?: string | null;
  clickPosition?: { x: number; y: number; viewportWidth: number; viewportHeight: number } | null;
  annotations: Annotation[];
}

interface Annotation {
  id: string;
  type: "redact" | "highlight" | "arrow" | "click-marker";
  x: number;
  y: number;
  width: number;
  height: number;
  color: string;
}

export default function EditorPage() {
  const router = useRouter();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [version, setVersion] = useState<number | undefined>(undefined);
  const [editorError, setEditorError] = useState("");
  const [guideId, setGuideId] = useState<string | null>(null);
  const [title, setTitle] = useState("Untitled Guide");
  const [description, setDescription] = useState("");
  const [steps, setSteps] = useState<StepData[]>([]);
  const [selectedStep, setSelectedStep] = useState(0);
  const [currentTool, setCurrentTool] = useState("select");
  const [currentColor, setCurrentColor] = useState("#000000");
  const [isDrawing, setIsDrawing] = useState(false);
  const [drawStart, setDrawStart] = useState({ x: 0, y: 0 });
  const [drawCurrent, setDrawCurrent] = useState({ x: 0, y: 0 });
  const [saving, setSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<"saved" | "saving" | "unsaved" | "error">("saved");
  const [loadedImage, setLoadedImage] = useState<HTMLImageElement | null>(null);
  const [shareUrl, setShareUrl] = useState<string | null>(null);

  useEffect(() => {
    if (saveStatus !== "unsaved" && saveStatus !== "error") return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [saveStatus]);

  // Load guide from URL params or extension storage
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const from = params.get("from");
    const id = window.location.pathname.split("/editor/")[1];

    if (id) {
      loadGuide(id);
    } else if (from === "extension") {
      loadFromExtension();
    } else {
      const template = starterTemplates.find(t => t.id === params.get("template"));
      if (template) {
        setTitle(template.name); setDescription(template.description);
        setSteps(template.steps.map((instruction, i) => ({ ...createEmptyStep(i), instruction })));
      } else setSteps([createEmptyStep(0)]);
      setSaveStatus("unsaved");
    }
  }, []);

  async function loadGuide(id: string) {
    try {
      const res = await fetch(`/api/guides/${id}`);
      if (!res.ok) {
        router.push("/dashboard");
        return;
      }
      const data = await res.json();
      setGuideId(data.guide.id);
      setVersion(data.guide.version);
      setTitle(data.guide.title);
      setDescription(data.guide.description);
      setSteps(data.guide.steps.map((s: Omit<StepData, "annotations"> & { annotations: string; clickPositionX: number | null; clickPositionY: number | null; clickViewportWidth: number | null; clickViewportHeight: number | null }) => ({
        ...s,
        annotations: JSON.parse(s.annotations || "[]"),
        notes: s.notes || "",
        clickPosition: s.clickViewportWidth && s.clickViewportHeight ? { x: s.clickPositionX ?? 0, y: s.clickPositionY ?? 0, viewportWidth: s.clickViewportWidth, viewportHeight: s.clickViewportHeight } : null,
      })));
    } catch (err) {
      console.error("Failed to load guide:", err);
    }
  }

  async function loadFromExtension() {
    // Try to get data from Chrome extension storage via message
    // Fallback: check if data was posted via query params
    try {
      const res = await fetch("/api/guides/pending");
      if (res.ok) {
        const data = await res.json();
        if (data.guide) {
          setGuideId(data.guide.id);
          setTitle(data.guide.title);
          setSteps(data.guide.steps);
        }
      }
    } catch {
      // Not from extension, start fresh
      setSteps([createEmptyStep(0)]);
    }
  }

  function createEmptyStep(index: number): StepData {
    return {
      id: `step_${Date.now()}_${Math.random().toString(36).substr(2, 7)}`,
      index,
      instruction: "New step — click to edit",
      notes: "",
      actionType: "click",
      screenshotUrl: null,
      screenshotDataUrl: null,
      clickPosition: null,
      annotations: [],
    };
  }

  // Canvas rendering
  const renderCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const step = steps[selectedStep];
    if (!step) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Draw screenshot
    if (loadedImage) {
      ctx.drawImage(loadedImage, 0, 0, canvas.width, canvas.height);
    } else {
      ctx.fillStyle = "#1e1e2d";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = "#6b6b85";
      ctx.font = "15px Inter, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("No screenshot — drag an image here or click Replace", canvas.width / 2, canvas.height / 2);
    }

    // Draw click marker
    if (step.clickPosition && loadedImage) {
      const { x, y, viewportWidth, viewportHeight } = step.clickPosition;
      const sx = (x / viewportWidth) * canvas.width;
      const sy = (y / viewportHeight) * canvas.height;
      ctx.beginPath();
      ctx.arc(sx, sy, 18, 0, Math.PI * 2);
      ctx.strokeStyle = "rgba(99,102,241,0.8)";
      ctx.lineWidth = 3;
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(sx, sy, 4, 0, Math.PI * 2);
      ctx.fillStyle = "#6366f1";
      ctx.fill();
    }

    // Draw saved annotations
    for (const ann of step.annotations) {
      drawAnnotation(ctx, ann);
    }

    // Draw live preview
    if (isDrawing && currentTool !== "select") {
      drawAnnotation(ctx, {
        id: "preview",
        type: currentTool as Annotation["type"],
        x: Math.min(drawStart.x, drawCurrent.x),
        y: Math.min(drawStart.y, drawCurrent.y),
        width: Math.abs(drawCurrent.x - drawStart.x),
        height: Math.abs(drawCurrent.y - drawStart.y),
        color: currentColor,
      });
    }
  }, [steps, selectedStep, loadedImage, isDrawing, drawStart, drawCurrent, currentTool, currentColor]);

  useEffect(() => {
    renderCanvas();
  }, [renderCanvas]);

  // Load image when step changes
  useEffect(() => {
    const step = steps[selectedStep];
    if (!step) return;

    const imageUrl = step.screenshotDataUrl || step.screenshotUrl;
    if (imageUrl) {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = () => {
        setLoadedImage(img);
        const canvas = canvasRef.current;
        if (canvas) {
          const maxW = Math.min(img.width, 900);
          const scale = maxW / img.width;
          canvas.width = img.width * scale;
          canvas.height = img.height * scale;
        }
      };
      img.src = imageUrl;
    } else {
      setLoadedImage(null);
      const canvas = canvasRef.current;
      if (canvas) {
        canvas.width = 800;
        canvas.height = 450;
      }
    }
  }, [selectedStep, steps]);

  function drawAnnotation(ctx: CanvasRenderingContext2D, ann: Annotation) {
    switch (ann.type) {
      case "redact":
        ctx.fillStyle = ann.color || "#000";
        ctx.fillRect(ann.x, ann.y, ann.width, ann.height);
        break;
      case "highlight":
        ctx.fillStyle = (ann.color || "#f59e0b") + "40";
        ctx.fillRect(ann.x, ann.y, ann.width, ann.height);
        ctx.strokeStyle = ann.color || "#f59e0b";
        ctx.lineWidth = 2;
        ctx.strokeRect(ann.x, ann.y, ann.width, ann.height);
        break;
      case "arrow":
        const ex = ann.x + ann.width;
        const ey = ann.y + ann.height;
        ctx.beginPath();
        ctx.moveTo(ann.x, ann.y);
        ctx.lineTo(ex, ey);
        ctx.strokeStyle = ann.color || "#ef4444";
        ctx.lineWidth = 3;
        ctx.stroke();
        const angle = Math.atan2(ey - ann.y, ex - ann.x);
        ctx.beginPath();
        ctx.moveTo(ex, ey);
        ctx.lineTo(ex - 12 * Math.cos(angle - Math.PI / 6), ey - 12 * Math.sin(angle - Math.PI / 6));
        ctx.lineTo(ex - 12 * Math.cos(angle + Math.PI / 6), ey - 12 * Math.sin(angle + Math.PI / 6));
        ctx.closePath();
        ctx.fillStyle = ann.color || "#ef4444";
        ctx.fill();
        break;
      case "click-marker":
        const cx = ann.x + ann.width / 2;
        const cy = ann.y + ann.height / 2;
        ctx.beginPath();
        ctx.arc(cx, cy, 18, 0, Math.PI * 2);
        ctx.strokeStyle = ann.color || "#6366f1";
        ctx.lineWidth = 3;
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(cx, cy, 4, 0, Math.PI * 2);
        ctx.fillStyle = ann.color || "#6366f1";
        ctx.fill();
        break;
    }
  }

  // Canvas mouse handlers
  function getCanvasCoords(e: React.MouseEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    return {
      x: ((e.clientX - rect.left) / rect.width) * canvas.width,
      y: ((e.clientY - rect.top) / rect.height) * canvas.height,
    };
  }

  function handleCanvasMouseDown(e: React.MouseEvent<HTMLCanvasElement>) {
    if (currentTool === "select") return;
    const coords = getCanvasCoords(e);
    setIsDrawing(true);
    setDrawStart(coords);
    setDrawCurrent(coords);
  }

  function handleCanvasMouseMove(e: React.MouseEvent<HTMLCanvasElement>) {
    if (!isDrawing) return;
    setDrawCurrent(getCanvasCoords(e));
  }

  function handleCanvasMouseUp() {
    if (!isDrawing) return;
    setIsDrawing(false);

    const w = Math.abs(drawCurrent.x - drawStart.x);
    const h = Math.abs(drawCurrent.y - drawStart.y);
    if (w < 5 && h < 5) return;

    const newAnn: Annotation = {
      id: `ann_${Date.now()}`,
      type: currentTool as Annotation["type"],
      x: Math.min(drawStart.x, drawCurrent.x),
      y: Math.min(drawStart.y, drawCurrent.y),
      width: w,
      height: h,
      color: currentColor,
    };

    setSteps(prev => {
      const updated = [...prev];
      updated[selectedStep] = {
        ...updated[selectedStep],
        annotations: [...updated[selectedStep].annotations, newAnn],
      };
      return updated;
    });
    setSaveStatus("unsaved");
  }

  // Step operations
  function addStep() {
    const newStep = createEmptyStep(steps.length);
    setSteps(prev => [...prev, newStep]);
    setSelectedStep(steps.length);
    setSaveStatus("unsaved");
  }

  function deleteStep(index: number) {
    if (steps.length <= 1) return;
    setSteps(prev => prev.filter((_, i) => i !== index).map((s, i) => ({ ...s, index: i })));
    if (selectedStep >= steps.length - 1) setSelectedStep(Math.max(0, steps.length - 2));
    setSaveStatus("unsaved");
  }

  function moveStep(from: number, to: number) {
    if (to < 0 || to >= steps.length) return;
    setSteps(prev => {
      const updated = [...prev];
      const [moved] = updated.splice(from, 1);
      updated.splice(to, 0, moved);
      return updated.map((s, i) => ({ ...s, index: i }));
    });
    setSelectedStep(to);
    setSaveStatus("unsaved");
  }

  function updateStepInstruction(value: string) {
    setSteps(prev => {
      const updated = [...prev];
      updated[selectedStep] = { ...updated[selectedStep], instruction: value };
      return updated;
    });
    setSaveStatus("unsaved");
  }

  function updateStepNotes(value: string) {
    setSteps(prev => {
      const updated = [...prev];
      updated[selectedStep] = { ...updated[selectedStep], notes: value };
      return updated;
    });
    setSaveStatus("unsaved");
  }

  function handleReplaceScreenshot() {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";
    input.onchange = (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (ev) => {
        setSteps(prev => {
          const updated = [...prev];
          updated[selectedStep] = { ...updated[selectedStep], screenshotDataUrl: ev.target?.result as string };
          return updated;
        });
        setSaveStatus("unsaved");
      };
      reader.readAsDataURL(file);
    };
    input.click();
  }

  function undoAnnotation() {
    setSteps(prev => {
      const updated = [...prev];
      const anns = [...updated[selectedStep].annotations];
      anns.pop();
      updated[selectedStep] = { ...updated[selectedStep], annotations: anns };
      return updated;
    });
    setSaveStatus("unsaved");
  }

  // Save guide
  async function saveGuide(): Promise<string | null> {
    setEditorError("");
    setSaving(true);
    setSaveStatus("saving");

    try {
      const method = guideId ? "PATCH" : "POST";
      const url = guideId ? `/api/guides/${guideId}` : "/api/guides";

      const body = {
        expectedVersion: version,
        title,
        description,
        steps: steps.map((s) => ({
          id: s.id,
          instruction: s.instruction,
          notes: s.notes,
          actionType: s.actionType,
          screenshotDataUrl: s.screenshotDataUrl || undefined,
          clickPosition: s.clickPosition,
          annotations: JSON.stringify(s.annotations),
        })),
      };


      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (res.status === 401) {
        setEditorError("Please sign in in another tab, then save again. Your edits are still here.");
        setSaveStatus("error");
        return null;
      }

      const data = await res.json();
      if (!res.ok || !data.guide) throw new Error(data.error || "Could not save your guide.");
      setGuideId(data.guide.id);
      setVersion(data.guide.version);
      setSteps(data.guide.steps.map((s: Omit<StepData, "annotations"> & { annotations: string }) => ({ ...s, annotations: JSON.parse(s.annotations || "[]"), clickPosition: steps.find(previous => previous.id === body.steps[s.index]?.id)?.clickPosition || null })));
      setSaveStatus("saved");
      if (!guideId) window.history.replaceState(null, "", `/editor/${data.guide.id}`);
      return data.guide.id;
    } catch (err) {
      console.error("Save failed:", err);
      setSaveStatus("error");
      setEditorError(err instanceof Error ? err.message : "Could not save your guide.");
      return null;
    } finally {
      setSaving(false);
    }
  }

  // Publish
  async function publishGuide() {
    const savedId = await saveGuide();
    if (!savedId) return;
    setSaving(true);
    try {
      const response = await fetch(`/api/guides/${savedId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: "published" }) });
      const published = await response.json();
      if (!response.ok) throw new Error(published.error || "Could not publish guide.");
      setVersion(published.guide.version);
      const shareRes = await fetch(`/api/guides/${savedId}/share`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ accessMode: "unlisted" }) });
      const data = await shareRes.json();
      if (!shareRes.ok) throw new Error(data.error || "Could not create share link.");
      const url = new URL(`/view/${data.shareLink.token}`, window.location.origin).href;
      setShareUrl(url);
      try { await navigator.clipboard.writeText(url); } catch { /* Visible link remains available. */ }
    } catch (err) { setEditorError(err instanceof Error ? err.message : "Publish failed."); }
    finally { setSaving(false); }
  }

  function escapeHtml(value: string) { return value.replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!)); }

  // Preview
  function openPreview() {
    const w = window.open("", "_blank");
    if (!w) return;

    w.document.write(`<!DOCTYPE html><html><head><title>${escapeHtml(title)}</title>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
    <style>
      body{font-family:Inter,sans-serif;max-width:800px;margin:0 auto;padding:40px 20px;background:#fafafa;color:#1a1a2e;}
      h1{font-size:28px;margin-bottom:32px;}
      .step{margin:24px 0;background:white;border-radius:12px;padding:24px;box-shadow:0 1px 3px rgba(0,0,0,0.1);}
      .sh{display:flex;align-items:center;gap:12px;margin-bottom:16px;}
      .sn{width:32px;height:32px;border-radius:50%;background:#6366f1;color:white;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:14px;flex-shrink:0;}
      .si{font-size:16px;font-weight:600;}
      .ss{width:100%;border-radius:8px;border:1px solid #e5e7eb;}
      .sno{margin-top:12px;font-size:14px;color:#6b7280;background:#f9fafb;padding:12px;border-radius:8px;}
      @media print{body{padding:20px;}.step{box-shadow:none;border:1px solid #e5e7eb;page-break-inside:avoid;}}
    </style></head><body><h1>${escapeHtml(title)}</h1><p style="color:#6b7280;margin-bottom:32px;">${steps.length} steps</p>`);

    steps.forEach((step, i) => {
      const imgSrc = step.screenshotDataUrl || step.screenshotUrl;
      w.document.write(`<div class="step"><div class="sh"><div class="sn">${i + 1}</div><div class="si">${escapeHtml(step.instruction)}</div></div>
        ${imgSrc ? `<img class="ss" src="${escapeHtml(imgSrc)}" alt="Step ${i + 1}">` : ""}
        ${step.notes ? `<div class="sno">${escapeHtml(step.notes)}</div>` : ""}
      </div>`);
    });

    w.document.write("</body></html>");
    w.document.close();
  }

  const currentStep = steps[selectedStep];
  const statusColors = { saved: "#22c55e", saving: "#f59e0b", unsaved: "#6b6b85", error: "#ef4444" };
  const statusLabels = { saved: "Saved", saving: "Saving...", unsaved: "Unsaved changes", error: "Save failed" };

  const toolBtnStyle = (tool: string): React.CSSProperties => ({
    width: 36, height: 36, border: "none", borderRadius: 7,
    background: currentTool === tool ? "var(--accent-primary)" : "transparent",
    color: currentTool === tool ? "white" : "var(--text-secondary)",
    cursor: "pointer", fontSize: 16, display: "flex", alignItems: "center", justifyContent: "center",
    transition: "all 150ms",
  });

  return (
    <div className="gf-editor" inert={saving} aria-busy={saving} style={{ height: "100vh", display: "grid", gridTemplateColumns: "320px 1fr", gridTemplateRows: "56px 1fr", background: "var(--bg-primary)", overflow: "hidden" }}>
      {/* Top Bar */}
      <div style={{ gridColumn: "1 / -1", background: "var(--bg-secondary)", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", padding: "0 16px", gap: 12 }}>
        <button onClick={() => { if (saveStatus === "saved" || window.confirm("Leave without saving your changes?")) router.push("/dashboard"); }} aria-label="Back to guide library" style={{ background: "transparent", border: "none", color: "var(--text-muted)", cursor: "pointer", fontSize: 18, padding: "4px 8px" }}>←</button>
        <div style={{ width: 28, height: 28, borderRadius: 6, background: "linear-gradient(135deg, #6366f1, #8b5cf6)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14 }}>📋</div>
        <input aria-label="Guide title" value={title} onChange={e => { setTitle(e.target.value); setSaveStatus("unsaved"); }} style={{ flex: 1, background: "transparent", border: "1px solid transparent", color: "var(--text-primary)", fontFamily: "inherit", fontSize: 15, fontWeight: 600, padding: "6px 10px", borderRadius: 6, maxWidth: 400 }} placeholder="Guide title..." />

        <div style={{ display: "flex", alignItems: "center", gap: 6, marginLeft: "auto" }}>
          <span style={{ width: 8, height: 8, borderRadius: "50%", background: statusColors[saveStatus] }} />
          <span style={{ fontSize: 12, color: "var(--text-muted)" }}>{statusLabels[saveStatus]}</span>
        </div>

        <button onClick={openPreview} style={{ padding: "7px 14px", borderRadius: 8, border: "1px solid var(--border)", background: "transparent", color: "var(--text-secondary)", fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>👁 Preview</button>
        <button onClick={saveGuide} disabled={saving} style={{ padding: "7px 14px", borderRadius: 8, border: "1px solid var(--border)", background: "var(--bg-card)", color: "var(--text-primary)", fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>💾 Save</button>
        <button onClick={publishGuide} style={{ padding: "7px 14px", borderRadius: 8, border: "none", background: "linear-gradient(135deg, #6366f1, #8b5cf6)", color: "white", fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit", boxShadow: "0 2px 8px rgba(99,102,241,0.25)" }}>🔗 Publish & Share</button>
      </div>

      {/* Step Panel */}
      <div style={{ background: "var(--bg-secondary)", borderRight: "1px solid var(--border)", display: "flex", flexDirection: "column", overflow: "hidden" }}>
        <div style={{ padding: "14px 14px 10px", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <span style={{ fontSize: 12, fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.5, color: "var(--text-muted)" }}>Steps</span>
          <span style={{ fontSize: 11, background: "var(--bg-card)", padding: "2px 8px", borderRadius: 10, color: "var(--text-secondary)" }}>{steps.length}</span>
        </div>

        <div style={{ flex: 1, overflowY: "auto", padding: 8 }}>
          {steps.map((step, i) => (
            <div key={step.id} onClick={() => setSelectedStep(i)} style={{
              display: "flex", gap: 8, padding: "10px 10px", borderRadius: 8, cursor: "pointer",
              marginBottom: 4, border: i === selectedStep ? "1px solid rgba(99,102,241,0.3)" : "1px solid transparent",
              background: i === selectedStep ? "rgba(99,102,241,0.1)" : "transparent",
              transition: "all 150ms",
            }}>
              <div style={{
                width: 22, height: 22, borderRadius: "50%", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 10, fontWeight: 700,
                background: i === selectedStep ? "linear-gradient(135deg, #6366f1, #8b5cf6)" : "var(--bg-card)",
                color: i === selectedStep ? "white" : "var(--accent-primary)",
              }}>
                {i + 1}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12, fontWeight: 500, lineHeight: 1.4, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{step.instruction}</div>
                <div style={{ fontSize: 10, color: "var(--text-muted)", marginTop: 2, display: "flex", gap: 6 }}>
                  <span>{step.actionType}</span>
                  {step.annotations.length > 0 && <span>· {step.annotations.length} ann.</span>}
                </div>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 2, opacity: i === selectedStep ? 1 : 0, transition: "opacity 150ms" }}>
                <button onClick={(e) => { e.stopPropagation(); moveStep(i, i - 1); }} style={{ width: 18, height: 18, border: "none", background: "transparent", cursor: "pointer", fontSize: 10, color: "var(--text-muted)", borderRadius: 3 }}>▲</button>
                <button onClick={(e) => { e.stopPropagation(); deleteStep(i); }} style={{ width: 18, height: 18, border: "none", background: "transparent", cursor: "pointer", fontSize: 10, color: "var(--danger)", borderRadius: 3 }}>✕</button>
                <button onClick={(e) => { e.stopPropagation(); moveStep(i, i + 1); }} style={{ width: 18, height: 18, border: "none", background: "transparent", cursor: "pointer", fontSize: 10, color: "var(--text-muted)", borderRadius: 3 }}>▼</button>
              </div>
            </div>
          ))}
        </div>

        <div style={{ padding: "10px 14px", borderTop: "1px solid var(--border)" }}>
          <button onClick={addStep} style={{ width: "100%", padding: "8px 0", borderRadius: 8, border: "1px solid var(--border)", background: "transparent", color: "var(--text-secondary)", fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>+ Add Step</button>
        </div>
      </div>

      {/* Editor Area */}
      <div style={{ display: "flex", flexDirection: "column", overflow: "hidden" }}>
        {/* Toolbar */}
        <div style={{ padding: "10px 16px", borderBottom: "1px solid var(--border)", background: "var(--bg-secondary)", display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{ display: "flex", gap: 2, padding: 2, background: "var(--bg-card)", borderRadius: 8 }}>
            <button onClick={() => setCurrentTool("select")} style={toolBtnStyle("select")} title="Select">🔲</button>
            <button onClick={() => setCurrentTool("redact")} style={toolBtnStyle("redact")} title="Redact">⬛</button>
            <button onClick={() => setCurrentTool("highlight")} style={toolBtnStyle("highlight")} title="Highlight">🟡</button>
            <button onClick={() => setCurrentTool("arrow")} style={toolBtnStyle("arrow")} title="Arrow">➡️</button>
            <button onClick={() => setCurrentTool("click-marker")} style={toolBtnStyle("click-marker")} title="Marker">🎯</button>
          </div>

          <div style={{ width: 1, height: 24, background: "var(--border)", margin: "0 4px" }} />

          <div style={{ display: "flex", gap: 4 }}>
            {["#000000", "#ef4444", "#f59e0b", "#22c55e", "#6366f1"].map(c => (
              <button key={c} onClick={() => setCurrentColor(c)} style={{ width: 22, height: 22, borderRadius: 4, background: c, border: currentColor === c ? "2px solid var(--text-primary)" : "2px solid transparent", cursor: "pointer" }} />
            ))}
          </div>

          <div style={{ flex: 1 }} />

          <button onClick={undoAnnotation} style={{ padding: "5px 10px", borderRadius: 6, border: "1px solid var(--border)", background: "transparent", color: "var(--text-secondary)", fontSize: 12, cursor: "pointer", fontFamily: "inherit" }}>↩ Undo</button>
          <button onClick={handleReplaceScreenshot} style={{ padding: "5px 10px", borderRadius: 6, border: "1px solid var(--border)", background: "var(--bg-card)", color: "var(--text-primary)", fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>🔄 Replace</button>
        </div>

        {/* Canvas + Step Editor */}
        <div style={{ flex: 1, overflow: "auto", display: "flex", flexDirection: "column", alignItems: "center", padding: 24, background: "radial-gradient(circle at 50% 50%, rgba(99,102,241,0.03) 0%, transparent 70%)" }}>
          {editorError && <div role="alert" style={{ padding: 16, color: "#fca5a5" }}>{editorError} <a href="/auth/login" target="_blank" rel="noopener noreferrer">Sign in</a></div>}
          {/* Share URL Banner */}
          {shareUrl && (
            <div style={{ width: "100%", maxWidth: 800, marginBottom: 16, padding: "12px 16px", borderRadius: 10, background: "var(--success-bg)", border: "1px solid rgba(34,197,94,0.2)", display: "flex", alignItems: "center", gap: 10, fontSize: 13 }}>
              <span style={{ color: "var(--success)", fontWeight: 600 }}>✓ Published!</span>
              <span style={{ color: "var(--text-secondary)" }}>Share link:</span>
              <a href={shareUrl} target="_blank" style={{ color: "var(--accent-primary)", wordBreak: "break-all" }}>{shareUrl}</a>
            </div>
          )}

          <div style={{ boxShadow: "0 8px 32px rgba(0,0,0,0.4)", borderRadius: 8, overflow: "hidden", maxWidth: "100%" }}>
            <canvas
              ref={canvasRef}
              width={800}
              height={450}
              style={{ display: "block", maxWidth: "100%", height: "auto", cursor: currentTool === "select" ? "default" : "crosshair" }}
              onMouseDown={handleCanvasMouseDown}
              onMouseMove={handleCanvasMouseMove}
              onMouseUp={handleCanvasMouseUp}
              onMouseLeave={() => { if (isDrawing) setIsDrawing(false); }}
            />
          </div>

          {currentStep && (
            <div style={{ width: "100%", maxWidth: 800, marginTop: 20, padding: 20, background: "var(--bg-secondary)", borderRadius: 14, border: "1px solid var(--border)" }}>
              <div style={{ marginBottom: 14 }}>
                <label style={{ display: "block", fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.5, color: "var(--text-muted)", marginBottom: 6 }}>Step {selectedStep + 1} Instruction</label>
                <input aria-label="Step instruction" type="text" value={currentStep.instruction} onChange={e => updateStepInstruction(e.target.value)} style={{ width: "100%", padding: "10px 14px", borderRadius: 8, border: "1px solid var(--border)", background: "var(--bg-card)", color: "var(--text-primary)", fontSize: 14, fontFamily: "inherit", outline: "none" }} />
              </div>
              <div>
                <label style={{ display: "block", fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.5, color: "var(--text-muted)", marginBottom: 6 }}>Notes (optional)</label>
                <textarea aria-label="Step notes" value={currentStep.notes} onChange={e => updateStepNotes(e.target.value)} placeholder="Add tips or context..." style={{ width: "100%", padding: "10px 14px", borderRadius: 8, border: "1px solid var(--border)", background: "var(--bg-card)", color: "var(--text-primary)", fontSize: 14, fontFamily: "inherit", outline: "none", minHeight: 60, resize: "vertical" }} />
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
