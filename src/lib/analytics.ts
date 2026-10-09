// GuideFlow — Guide Analytics Engine
// Tracks views, completion rates, engagement, and generates insights
// Scribe charges premium for analytics — we include it free

import prisma from './prisma';

export interface AnalyticsEvent {
  guideId: string;
  event: AnalyticsEventType;
  stepIndex?: number;
  metadata?: Record<string, unknown>;
  visitorId: string;
  sessionId: string;
  referrer?: string;
  userAgent?: string;
  country?: string;
  timestamp: Date;
}

export type AnalyticsEventType =
  | 'guide_view'
  | 'guide_complete'
  | 'step_view'
  | 'step_click'
  | 'guide_share'
  | 'guide_export'
  | 'guide_print'
  | 'guide_embed_view'
  | 'walkthrough_start'
  | 'walkthrough_complete'
  | 'walkthrough_abandon'
  | 'feedback_positive'
  | 'feedback_negative';

// ─── Track Event ─────────────────────────────────────────────────

export async function trackEvent(event: AnalyticsEvent) {
  try {
    await prisma.analyticsEvent.create({
      data: {
        guideId: event.guideId,
        event: event.event,
        stepIndex: event.stepIndex,
        metadata: JSON.stringify(event.metadata || {}),
        visitorId: event.visitorId,
        sessionId: event.sessionId,
        referrer: event.referrer || '',
        userAgent: event.userAgent || '',
        timestamp: event.timestamp,
      },
    });
  } catch (error) {
    console.error('Analytics tracking error:', error);
  }
}

// ─── Guide Analytics Aggregation ─────────────────────────────────

export interface GuideAnalytics {
  totalViews: number;
  uniqueVisitors: number;
  completionRate: number;
  avgStepsViewed: number;
  totalCompletions: number;
  totalExports: number;
  totalShares: number;
  engagementScore: number;
  viewsByDay: Array<{ date: string; views: number }>;
  dropoffByStep: Array<{ step: number; viewCount: number; dropoffRate: number }>;
  topReferrers: Array<{ referrer: string; count: number }>;
  recentActivity: Array<{ event: string; timestamp: string; visitorId: string }>;
}

export async function getGuideAnalytics(
  guideId: string,
  days: number = 30
): Promise<GuideAnalytics> {
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  const events = await prisma.analyticsEvent.findMany({
    where: {
      guideId,
      timestamp: { gte: since },
    },
    orderBy: { timestamp: 'desc' },
  });

  const views = events.filter(e => e.event === 'guide_view');
  const completions = events.filter(e => e.event === 'guide_complete');
  const exports = events.filter(e => e.event === 'guide_export');
  const shares = events.filter(e => e.event === 'guide_share');
  const stepViews = events.filter(e => e.event === 'step_view');

  const uniqueVisitors = new Set(views.map(v => v.visitorId)).size;

  // Views by day
  const viewsByDayMap = new Map<string, number>();
  views.forEach(v => {
    const day = v.timestamp.toISOString().split('T')[0];
    viewsByDayMap.set(day, (viewsByDayMap.get(day) || 0) + 1);
  });
  const viewsByDay = Array.from(viewsByDayMap.entries())
    .map(([date, viewCount]) => ({ date, views: viewCount }))
    .sort((a, b) => a.date.localeCompare(b.date));

  // Dropoff by step
  const stepViewCounts = new Map<number, number>();
  stepViews.forEach(sv => {
    if (sv.stepIndex !== null) {
      stepViewCounts.set(sv.stepIndex, (stepViewCounts.get(sv.stepIndex) || 0) + 1);
    }
  });
  const maxStep = Math.max(0, ...Array.from(stepViewCounts.keys()));
  const dropoffByStep: Array<{ step: number; viewCount: number; dropoffRate: number }> = [];
  for (let i = 0; i <= maxStep; i++) {
    const count = stepViewCounts.get(i) || 0;
    const prevCount = i === 0 ? views.length : (dropoffByStep[i - 1]?.viewCount || views.length);
    dropoffByStep.push({
      step: i,
      viewCount: count,
      dropoffRate: prevCount > 0 ? ((prevCount - count) / prevCount) * 100 : 0,
    });
  }

  // Top referrers
  const referrerMap = new Map<string, number>();
  views.forEach(v => {
    const ref = v.referrer || 'Direct';
    referrerMap.set(ref, (referrerMap.get(ref) || 0) + 1);
  });
  const topReferrers = Array.from(referrerMap.entries())
    .map(([referrer, count]) => ({ referrer, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  // Engagement score (0-100)
  const completionRate = views.length > 0 ? (completions.length / views.length) * 100 : 0;
  const avgStepsViewed = views.length > 0
    ? stepViews.length / views.length
    : 0;
  const engagementScore = Math.min(100, Math.round(
    completionRate * 0.4 +
    Math.min(avgStepsViewed * 10, 40) +
    Math.min((exports.length + shares.length) * 5, 20)
  ));

  return {
    totalViews: views.length,
    uniqueVisitors,
    completionRate: Math.round(completionRate * 10) / 10,
    avgStepsViewed: Math.round(avgStepsViewed * 10) / 10,
    totalCompletions: completions.length,
    totalExports: exports.length,
    totalShares: shares.length,
    engagementScore,
    viewsByDay,
    dropoffByStep,
    topReferrers,
    recentActivity: events.slice(0, 20).map(e => ({
      event: e.event,
      timestamp: e.timestamp.toISOString(),
      visitorId: e.visitorId,
    })),
  };
}

// ─── Workspace Analytics ─────────────────────────────────────────

export interface WorkspaceAnalytics {
  totalGuides: number;
  totalViews: number;
  totalCompletions: number;
  topGuides: Array<{ guideId: string; title: string; views: number }>;
  recentGuides: Array<{ guideId: string; title: string; createdAt: string }>;
  usageTrend: Array<{ date: string; guides: number; views: number }>;
}

export async function getWorkspaceAnalytics(
  workspaceId: string,
  days: number = 30
): Promise<WorkspaceAnalytics> {
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  const guides = await prisma.guide.findMany({
    where: { workspaceId },
    select: { id: true, title: true, createdAt: true },
    orderBy: { createdAt: 'desc' },
  });

  const guideIds = guides.map(g => g.id);

  const events = await prisma.analyticsEvent.findMany({
    where: {
      guideId: { in: guideIds },
      timestamp: { gte: since },
    },
  });

  const views = events.filter(e => e.event === 'guide_view');
  const completions = events.filter(e => e.event === 'guide_complete');

  // Top guides by views
  const viewsByGuide = new Map<string, number>();
  views.forEach(v => {
    viewsByGuide.set(v.guideId, (viewsByGuide.get(v.guideId) || 0) + 1);
  });

  const topGuides = Array.from(viewsByGuide.entries())
    .map(([guideId, viewCount]) => ({
      guideId,
      title: guides.find(g => g.id === guideId)?.title || 'Unknown',
      views: viewCount,
    }))
    .sort((a, b) => b.views - a.views)
    .slice(0, 10);

  return {
    totalGuides: guides.length,
    totalViews: views.length,
    totalCompletions: completions.length,
    topGuides,
    recentGuides: guides.slice(0, 5).map(g => ({
      guideId: g.id,
      title: g.title,
      createdAt: g.createdAt.toISOString(),
    })),
    usageTrend: [],
  };
}
