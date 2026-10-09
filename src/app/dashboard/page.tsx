/* The initial effect fetches workspace data; state updates follow the network response. */
/* eslint-disable react-hooks/set-state-in-effect */
"use client";
import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Brand } from "@/components/brand";
import { starterTemplates } from "@/lib/starter-templates";
interface Guide {
    id: string;
    title: string;
    description: string;
    status: string;
    updatedAt: string;
    steps: {
        id: string;
        instruction: string;
        screenshotUrl: string | null;
    }[];
    author: {
        name: string | null;
    };
}
export default function DashboardPage() {
    const router = useRouter();
    const [guides, setGuides] = useState<Guide[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [notice, setNotice] = useState("");
    const [query, setQuery] = useState("");
    const [filter, setFilter] = useState("all");
    const [sort, setSort] = useState("recent");
    const [busy, setBusy] = useState<string | null>(null);
    const load = useCallback(async () => {
        try {
            const res = await fetch("/api/guides");
            if (res.status === 401) {
                router.replace("/auth/login");
                return;
            }
            if (!res.ok)
                throw new Error("We couldn't load your guides. Please try again.");
            setGuides((await res.json()).guides);
        }
        catch (e) {
            setError(e instanceof Error ? e.message : "Connection failed.");
        }
        finally {
            setLoading(false);
        }
    }, [router]);
    useEffect(() => { void load(); }, [load]);
    async function action(guide: Guide, type: "share" | "archive" | "restore" | "delete") {
        if (type === "delete" && !window.confirm(`Permanently delete “${guide.title}”? This cannot be undone.`))
            return;
        setBusy(guide.id);
        setError("");
        setNotice("");
        try {
            const res = await fetch(`/api/guides/${guide.id}${type === "share" ? "/share" : ""}`, {
                method: type === "share" ? "POST" : type === "delete" ? "DELETE" : "PATCH",
                headers: { "Content-Type": "application/json" },
                ...(type !== "delete" && { body: JSON.stringify(type === "share" ? { accessMode: "unlisted" } : { status: type === "restore" ? "draft" : "archived" }) }),
            });
            const data = await res.json();
            if (!res.ok)
                throw new Error(data.error || "That didn't work. Please try again.");
            if (type === "share") {
                const url = new URL(`/view/${data.shareLink.token}`, window.location.origin).href;
                try {
                    await navigator.clipboard.writeText(url);
                    setNotice("Share link copied. Anyone with the link can read this guide.");
                }
                catch {
                    setNotice(`Your share link: ${url}`);
                }
            }
            else {
                setGuides(prev => type === "delete" ? prev.filter(g => g.id !== guide.id) : prev.map(g => g.id === guide.id ? { ...g, status: type === "restore" ? "draft" : "archived" } : g));
                setNotice(type === "delete" ? "Guide deleted." : type === "restore" ? "Guide restored to drafts." : "Guide archived. You can restore it from Archived.");
            }
        }
        catch (e) {
            setError(e instanceof Error ? e.message : "Connection failed.");
        }
        finally {
            setBusy(null);
        }
    }
    const normalized = query.trim().toLowerCase();
    const visible = guides.filter(g => (filter === "all" ? g.status !== "archived" : g.status === filter) && [g.title, g.description, ...g.steps.map(s => s.instruction)].some(s => s.toLowerCase().includes(normalized))).sort((a, b) => sort === "title" ? a.title.localeCompare(b.title) : Date.parse(b.updatedAt) - Date.parse(a.updatedAt));
    return <div className="gf-site gf-workspace"><nav className="gf-nav"><Brand /><span className="gf-workspace-label">YOUR WORKSPACE</span><Link className="gf-button gf-small" href="/editor">+ Create guide</Link></nav><main className="gf-workspace-main">
    <div className="gf-workspace-header"><div><span className="gf-eyebrow">A LITTLE GUIDANCE GOES A LONG WAY</span><h1>Your team’s know-how.<br /><em>All right here.</em></h1><p>Create it once. Find it fast. Share it with anyone who needs a hand.</p></div><div className="gf-workspace-stats"><strong>{guides.filter(g => g.status !== "archived").length}</strong><span>guides in your library</span><hr /><strong>{guides.reduce((sum, g) => sum + (g.status === "archived" ? 0 : g.steps.length), 0)}</strong><span>steps made clearer</span></div></div>
    <section className="gf-quick-start"><div><span className="gf-eyebrow">START SOMETHING USEFUL</span><h2>Skip the blank page.</h2></div>{starterTemplates.map((t, i) => <Link href={`/editor?template=${t.id}`} key={t.id}><span>{["◎", "☏", "▤"][i]}</span><strong>{t.name}</strong><span>↗</span></Link>)}</section>
    <section aria-label="Guide library"><div className="gf-library-heading"><h2>Your guides <span>{guides.length}</span></h2><label className="gf-sort">Sort by <select value={sort} onChange={e => setSort(e.target.value)}><option value="recent">Recently updated</option><option value="title">Name A–Z</option></select></label></div><div className="gf-library-tools"><div className="gf-tabs">{["all", "draft", "published", "archived"].map(f => <button key={f} onClick={() => setFilter(f)} aria-pressed={filter === f}>{f === "all" ? "All guides" : f}</button>)}</div><input className="gf-search" type="search" aria-label="Search guides and steps" placeholder="Search guides, descriptions, or steps…" value={query} onChange={e => setQuery(e.target.value)}/></div>
    {error && <div className="gf-message gf-error" role="alert">{error} <button onClick={() => { setLoading(true); setError(""); void load(); }}>Retry loading</button></div>}{notice && <div className="gf-message" role="status">{notice}<button onClick={() => setNotice("")} aria-label="Dismiss notification">×</button></div>}
    {loading ? <div className="gf-empty" role="status">Loading your library…</div> : visible.length ? <div className="gf-guide-grid">{visible.map((g, i) => <article className="gf-guide-card" key={g.id}><Link href={`/editor/${g.id}`} className={`gf-guide-cover gf-art-${i % 3}`} tabIndex={-1} aria-hidden="true">{g.steps[0]?.screenshotUrl ? <img src={g.steps[0].screenshotUrl} alt=""/> : <span>▤</span>}<span className="gf-pill">{g.steps.length} steps</span></Link><div className="gf-guide-content"><span className={`gf-status gf-status-${g.status}`}>{g.status}</span><h3><Link href={`/editor/${g.id}`}>{g.title}</Link></h3><p>{g.description || "A little guidance for the next person."}</p><span className="gf-guide-meta">Updated {new Date(g.updatedAt).toLocaleDateString("en", { month: "short", day: "numeric" })} · {g.author.name || "Your team"}</span><div className="gf-guide-actions"><Link href={`/editor/${g.id}`}>Edit guide ↗</Link><button disabled={busy !== null} onClick={() => action(g, "share")}>Share</button><button disabled={busy !== null} onClick={() => action(g, g.status === "archived" ? "restore" : "archive")}>{g.status === "archived" ? "Restore" : "Archive"}</button>{g.status === "archived" && <button disabled={busy !== null} onClick={() => action(g, "delete")}>Delete</button>}</div></div></article>)}</div> : !error && <div className="gf-empty"><span>✦</span><h3>{normalized || filter !== "all" ? "No guides match just yet." : "Your next great guide starts here."}</h3><p>{normalized || filter !== "all" ? "Try another search or browse all your guides." : "Choose a starter above, or capture something your team asks you about often."}</p>{normalized || filter !== "all" ? <button className="gf-button" onClick={() => { setQuery(""); setFilter("all"); }}>Clear filters</button> : <Link className="gf-button" href="/editor">Create your first guide ↗</Link>}</div>}
    </section></main><footer className="gf-footer"><span>Small guides. A big difference.</span><Link href="/">Explore GuideFlow ↗</Link></footer></div>;
}
