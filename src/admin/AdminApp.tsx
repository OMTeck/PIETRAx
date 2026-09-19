import { useMemo } from 'react';
import { LayoutDashboard, Layers, Boxes, FolderKanban, Tags, ScanLine, Images, Users, ClipboardList, ShieldCheck, Settings, LogOut, ExternalLink, KeyRound } from 'lucide-react';
import { useRoute } from '@/context/RouteContext';
import { useAdminAuth } from '@/context/AdminAuthContext';
import { can, PERM, ROLE_LABELS } from '@/admin/permissions';
import { cx } from '@/admin/ui';
import type { Role } from '@/admin/types';
import { LoginPage, LoginSplash } from '@/admin/LoginPage';
import { DashboardPage } from '@/admin/pages/DashboardPage';
import { MaterialsListPage, MaterialsEditorPage } from '@/admin/pages/MaterialsPages';
import { CollectionsListPage, CollectionsEditorPage } from '@/admin/pages/CollectionsPages';
import { ProjectsListPage, ProjectsEditorPage } from '@/admin/pages/ProjectsPages';
import { TaxonomyPage } from '@/admin/pages/TaxonomyPage';
import { VisualizerPage } from '@/admin/pages/VisualizerPage';
import { MediaPage } from '@/admin/pages/MediaPage';
import { CustomersPage } from '@/admin/pages/CustomersPage';
import { UsersPage } from '@/admin/pages/UsersPage';
import { AuditPage } from '@/admin/pages/AuditPage';
import { SettingsPage } from '@/admin/pages/SettingsPage';
import { AccountPage } from '@/admin/pages/AccountPage';

interface NavItem {
  path: string;
  label: string;
  icon: typeof LayoutDashboard;
  permKey?: keyof typeof PERM;
}

const NAV: NavItem[] = [
  { path: '', label: 'Dashboard', icon: LayoutDashboard, permKey: 'dashboardView' },
  { path: 'materials', label: 'Materials', icon: Layers, permKey: 'materialsView' },
  { path: 'collections', label: 'Collections', icon: Boxes, permKey: 'collectionsView' },
  { path: 'projects', label: 'Projects', icon: FolderKanban, permKey: 'projectsView' },
  { path: 'taxonomy', label: 'Taxonomy', icon: Tags, permKey: 'taxonomyManage' },
  { path: 'visualizer', label: 'Visualizer', icon: ScanLine, permKey: 'visualizerManage' },
  { path: 'media', label: 'Media Library', icon: Images, permKey: 'mediaUpload' },
  { path: 'customers', label: 'Customers', icon: Users, permKey: 'customersView' },
  { path: 'audit', label: 'Audit Log', icon: ShieldCheck, permKey: 'auditView' },
  { path: 'settings', label: 'Content & Settings', icon: Settings, permKey: 'contentManage' },
  { path: 'users', label: 'Team', icon: ClipboardList, permKey: 'usersManage' },
  { path: 'account', label: 'My Account', icon: KeyRound },
];

function visibleNav(role: Role): NavItem[] {
  return NAV.filter((item) => !item.permKey || can(role, PERM[item.permKey]));
}

function stripAdmin(path: string): string {
  const base = path.split('?')[0];
  if (base === '/admin') return '';
  if (base.startsWith('/admin/')) return base.slice('/admin/'.length);
  return base.replace(/^\/+/, '');
}

function AdminErrorBoundary({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}

export function AdminApp() {
  const { path, navigate } = useRoute();
  const { status, user, logout } = useAdminAuth();

  const route = useMemo(() => stripAdmin(path), [path]);

  if (status.kind === 'loading') return <LoginSplash />;
  if (status.kind === 'anonymous' || status.kind === 'mfa-step') return <LoginPage />;
  if (!user) return <LoginSplash />;

  const role = user.role;
  const nav = visibleNav(role);
  const current = nav.find((n) => n.path === route || route.startsWith(`${n.path}/`));

  let content: React.ReactNode;
  if (route === '' || route === 'dashboard') {
    content = <DashboardPage />;
  } else if (route === 'materials') {
    content = <MaterialsListPage />;
  } else if (route.startsWith('materials/')) {
    const id = route.slice('materials/'.length);
    content = <MaterialsEditorPage id={id} />;
  } else if (route === 'collections') {
    content = <CollectionsListPage />;
  } else if (route.startsWith('collections/')) {
    content = <CollectionsEditorPage id={route.slice('collections/'.length)} />;
  } else if (route === 'projects') {
    content = <ProjectsListPage />;
  } else if (route.startsWith('projects/')) {
    content = <ProjectsEditorPage id={route.slice('projects/'.length)} />;
  } else if (route === 'taxonomy') {
    content = <TaxonomyPage />;
  } else if (route === 'visualizer') {
    content = <VisualizerPage />;
  } else if (route === 'media') {
    content = <MediaPage />;
  } else if (route === 'customers') {
    content = <CustomersPage />;
  } else if (route === 'users') {
    content = <UsersPage />;
  } else if (route === 'audit') {
    content = <AuditPage />;
  } else if (route === 'settings') {
    content = <SettingsPage />;
  } else if (route === 'account') {
    content = <AccountPage />;
  } else {
    content = <DashboardPage />;
  }

  return (
    <AdminErrorBoundary>
      <div className="flex min-h-screen bg-stone-100" dir="ltr">
        {/* Sidebar */}
        <aside className="sticky top-0 flex h-screen w-60 shrink-0 flex-col border-r border-stone-200 bg-stone-900 text-stone-300">
          <div className="flex h-16 items-center gap-2 border-b border-stone-800 px-5">
            <span className="text-lg font-semibold tracking-tight text-ivory">PIETRA</span>
            <span className="rounded bg-stone-800 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-stone-400">
              Admin
            </span>
          </div>
          <nav className="flex-1 overflow-y-auto px-3 py-4">
            {nav.map((item) => {
              const Icon = item.icon;
              const active = item.path === current?.path;
              return (
                <button
                  key={item.path}
                  onClick={() => navigate(`/admin/${item.path}`)}
                  className={cx(
                    'mb-0.5 flex w-full items-center gap-3 rounded px-3 py-2 text-left text-sm transition-colors',
                    active ? 'bg-stone-800 text-ivory' : 'text-stone-400 hover:bg-stone-800/60 hover:text-stone-200',
                  )}
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  <span className="truncate">{item.label}</span>
                </button>
              );
            })}
          </nav>
          <div className="border-t border-stone-800 p-4 text-xs text-stone-500">
            <div className="truncate font-medium text-stone-300">{user.name}</div>
            <div className="mt-0.5 flex items-center justify-between gap-2">
              <span className="truncate text-stone-500">{ROLE_LABELS[role]}</span>
              <div className="flex items-center gap-1">
                <a href="#/" title="View site" className="rounded p-1 hover:bg-stone-800 hover:text-stone-200">
                  <ExternalLink className="h-3.5 w-3.5" />
                </a>
                <button onClick={() => void logout()} title="Sign out" className="rounded p-1 hover:bg-stone-800 hover:text-red-300">
                  <LogOut className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          </div>
        </aside>

        {/* Content */}
        <main className="flex-1 overflow-x-hidden">
          <div className="mx-auto max-w-6xl px-6 py-8">{content}</div>
        </main>
      </div>
    </AdminErrorBoundary>
  );
}