import { createContext, useContext, useState, useEffect, useCallback, useMemo, type ReactNode } from 'react';
import {
  publicApi,
  type PubMaterial,
  type PubCollection,
  type PubProject,
  type PubVisualizer,
  type SiteSettings,
} from '@/lib/public';

interface CatalogValue {
  loading: boolean;
  error: string | null;
  materials: PubMaterial[];
  collections: PubCollection[];
  projects: PubProject[];
  visualizer: PubVisualizer | null;
  settings: SiteSettings | null;
  refresh: () => void;
  materialBySlug: (slug: string) => PubMaterial | undefined;
  projectBySlug: (slug: string) => PubProject | undefined;
}

const CatalogContext = createContext<CatalogValue | null>(null);

export function CatalogProvider({ children }: { children: ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [materials, setMaterials] = useState<PubMaterial[]>([]);
  const [collections, setCollections] = useState<PubCollection[]>([]);
  const [projects, setProjects] = useState<PubProject[]>([]);
  const [visualizer, setVisualizer] = useState<PubVisualizer | null>(null);
  const [settings, setSettings] = useState<SiteSettings | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    const [materialsRes, collectionsRes, projectsRes, visualizerRes, siteRes] = await Promise.allSettled([
      publicApi.materials(),
      publicApi.collections(),
      publicApi.projects(),
      publicApi.visualizer(),
      publicApi.site(),
    ]);
    if (materialsRes.status === 'fulfilled') setMaterials(materialsRes.value);
    if (collectionsRes.status === 'fulfilled') setCollections(collectionsRes.value);
    if (projectsRes.status === 'fulfilled') setProjects(projectsRes.value);
    if (visualizerRes.status === 'fulfilled') setVisualizer(visualizerRes.value);
    if (siteRes.status === 'fulfilled') setSettings(siteRes.value);
    const failed = [materialsRes, collectionsRes, projectsRes, visualizerRes, siteRes].filter(
      (r): r is PromiseRejectedResult => r.status === 'rejected',
    );
    if (failed.length > 0 && materials.length === 0) {
      const first = failed[0];
      if (first) setError(first.reason instanceof Error ? first.reason.message : 'Failed to load catalog.');
    }
    setLoading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const materialBySlug = useMemo(() => {
    const map = new Map(materials.map((m) => [m.slug, m]));
    return (slug: string) => map.get(slug);
  }, [materials]);

  const projectBySlug = useMemo(() => {
    const map = new Map(projects.map((p) => [p.slug, p]));
    return (slug: string) => map.get(slug);
  }, [projects]);

  return (
    <CatalogContext.Provider
      value={{ loading, error, materials, collections, projects, visualizer, settings, refresh, materialBySlug, projectBySlug }}
    >
      {children}
    </CatalogContext.Provider>
  );
}

export function useCatalog() {
  const ctx = useContext(CatalogContext);
  if (!ctx) throw new Error('useCatalog must be used within CatalogProvider');
  return ctx;
}