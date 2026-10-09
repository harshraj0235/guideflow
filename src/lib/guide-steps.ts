import { mkdir, writeFile } from "node:fs/promises";
import { randomBytes } from "node:crypto";
import { join } from "node:path";
export interface StepInput {
    id?: string;
    instruction: string;
    notes?: string;
    actionType?: string;
    screenshotDataUrl?: string | null;
    annotations?: string;
    clickPosition?: {
        x: number;
        y: number;
        viewportWidth: number;
        viewportHeight: number;
    } | null;
}
export function validateSteps(value: unknown): value is StepInput[] {
    return Array.isArray(value) && value.length <= 500 && value.every(s => s && typeof s === "object" && typeof s.instruction === "string" && s.instruction.length <= 10000 && (s.notes === undefined || typeof s.notes === "string") && (s.actionType === undefined || typeof s.actionType === "string") && (s.id === undefined || typeof s.id === "string") && (s.annotations === undefined || (typeof s.annotations === "string" && validAnnotations(s.annotations))) && (s.screenshotDataUrl == null || (typeof s.screenshotDataUrl === "string" && /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(s.screenshotDataUrl) && s.screenshotDataUrl.length <= 14000000)) && (s.clickPosition == null || (typeof s.clickPosition === "object" && [s.clickPosition.x, s.clickPosition.y, s.clickPosition.viewportWidth, s.clickPosition.viewportHeight].every(n => typeof n === "number" && Number.isFinite(n)) && s.clickPosition.viewportWidth > 0 && s.clickPosition.viewportHeight > 0)));
}
function validAnnotations(value: string) { try {
    return Array.isArray(JSON.parse(value));
}
catch {
    return false;
} }
export async function prepareStep(step: StepInput, index: number, previous?: {
    screenshotKey: string | null;
    screenshotUrl: string | null;
}) {
    let screenshotKey = previous?.screenshotKey ?? null;
    let screenshotUrl = previous?.screenshotUrl ?? null;
    if (step.screenshotDataUrl) {
        const match = step.screenshotDataUrl.match(/^data:image\/(png|jpeg|webp);base64,(.+)$/)!;
        const dir = join(/* turbopackIgnore: true */ process.cwd(), process.env.UPLOAD_DIR || "uploads");
        await mkdir(dir, { recursive: true });
        screenshotKey = `${randomBytes(16).toString("hex")}.${match[1] === "jpeg" ? "jpg" : match[1]}`;
        await writeFile(join(/* turbopackIgnore: true */ dir, screenshotKey), Buffer.from(match[2], "base64"));
        screenshotUrl = `/api/uploads/${screenshotKey}`;
    }
    return { index, instruction: step.instruction, notes: step.notes || "", actionType: step.actionType || "click", annotations: step.annotations || "[]", screenshotKey, screenshotUrl, clickPositionX: step.clickPosition?.x ?? null, clickPositionY: step.clickPosition?.y ?? null, clickViewportWidth: step.clickPosition?.viewportWidth ?? null, clickViewportHeight: step.clickPosition?.viewportHeight ?? null };
}
