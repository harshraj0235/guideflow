/* Browser storage is read after hydration to keep server HTML deterministic. */
/* eslint-disable react-hooks/set-state-in-effect */
"use client";
import { useEffect, useState } from "react";
import { Brand } from "@/components/brand";
interface ReaderGuide {
    id: string;
    version: number;
    title: string;
    description: string;
    authorName: string;
    steps: {
        id: string;
        instruction: string;
        notes: string;
        screenshotUrl: string | null;
    }[];
}
export function GuideReader({ guide }: {
    guide: ReaderGuide;
}) {
    const [completed, setCompleted] = useState<string[]>([]);
    const [ready, setReady] = useState(false);
    const [storageAvailable, setStorageAvailable] = useState(true);
    const key = `guideflow:progress:${guide.id}:v${guide.version}`;
    useEffect(() => {
        try {
            const stored: unknown = JSON.parse(localStorage.getItem(key) || "[]");
            if (Array.isArray(stored))
                setCompleted([...new Set(stored.filter((id): id is string => typeof id === "string" && guide.steps.some(s => s.id === id)))]);
        }
        catch {
            setStorageAvailable(false);
        }
        setReady(true);
    }, [key, guide.steps]);
    function update(next: string[]) {
        setCompleted(next);
        try {
            localStorage.setItem(key, JSON.stringify(next));
        }
        catch {
            setStorageAvailable(false);
        }
    }
    const done = completed.length;
    return <div className="gf-site"><nav className="gf-nav gf-reader-nav"><Brand /><button className="gf-button gf-secondary gf-small" onClick={() => window.print()}>Print / save PDF ↗</button></nav><main className="gf-reader"><span className="gf-eyebrow">A CLEARER WAY TO GET THERE</span><h1>{guide.title}</h1><p>{guide.description}</p><div className="gf-reader-meta">{guide.steps.length} steps · By {guide.authorName} · Version {guide.version}</div><div className="gf-reader-layout"><aside className="gf-reader-sidebar"><h2>Your progress</h2><p aria-live="polite">{done} of {guide.steps.length} completed</p><progress value={done} max={Math.max(guide.steps.length, 1)} aria-label="Guide completion"/><p style={{ fontSize: 11, marginTop: 10 }}>{storageAvailable ? "Saved on this browser. Come back anytime." : "Progress is available for this visit only."}</p>{guide.steps.map((s, i) => <a href={`#step-${s.id}`} key={s.id}>{completed.includes(s.id) ? "✓" : `${i + 1}.`} {s.instruction}</a>)}<button disabled={!ready || !done} onClick={() => update([])}>Reset progress</button></aside><div>{guide.steps.map((s, i) => <article className="gf-reader-step" id={`step-${s.id}`} key={s.id} data-complete={completed.includes(s.id)}><label><input type="checkbox" disabled={!ready} checked={completed.includes(s.id)} onChange={e => update(e.target.checked ? [...completed, s.id] : completed.filter(id => id !== s.id))}/><span>{i + 1}. {s.instruction}</span></label>{s.notes && <p>{s.notes}</p>}{s.screenshotUrl && <img src={s.screenshotUrl} alt={`Step ${i + 1}: ${s.instruction}`}/>}</article>)}{guide.steps.length > 0 && done === guide.steps.length && <div className="gf-reader-success" role="status"><h3>Nicely done. You’re all set.</h3><p>Every step completed. Keep this guide handy for next time.</p></div>}{!guide.steps.length && <p>This guide doesn’t have any steps yet.</p>}</div></div></main></div>;
}
