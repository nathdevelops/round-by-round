import { planProject, type ProjectPlan } from '@rbr/engine';
import { createContext, useContext, useDeferredValue, useMemo, type ReactNode } from 'react';
import { useEditor } from './editor';

/**
 * The pattern plan for the project: every piece, seam, pair of eyes and assembly step.
 * Fused pieces take a moment to measure, so the plan follows edits a beat behind.
 */
const Ctx = createContext<ProjectPlan | null>(null);

export function PlanProvider({ children }: { children: ReactNode }) {
  const project = useDeferredValue(useEditor().project);
  const plan = useMemo(() => planProject(project), [project]);
  return <Ctx.Provider value={plan}>{children}</Ctx.Provider>;
}

export function usePlan(): ProjectPlan {
  const p = useContext(Ctx);
  if (!p) throw new Error('usePlan outside PlanProvider');
  return p;
}
