import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react';

interface RouteContextValue {
  path: string;
  navigate: (path: string) => void;
}

const RouteContext = createContext<RouteContextValue | null>(null);

function getHashPath(): string {
  const hash = window.location.hash.replace(/^#/, '');
  return hash || '/';
}

export function RouteProvider({ children }: { children: ReactNode }) {
  const [path, setPath] = useState<string>(getHashPath());

  useEffect(() => {
    const onHashChange = () => {
      setPath(getHashPath());
      window.scrollTo(0, 0);
    };
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  const navigate = useCallback((newPath: string) => {
    window.location.hash = newPath;
  }, []);

  return (
    <RouteContext.Provider value={{ path, navigate }}>
      {children}
    </RouteContext.Provider>
  );
}

export function useRoute() {
  const ctx = useContext(RouteContext);
  if (!ctx) throw new Error('useRoute must be used within RouteProvider');
  return ctx;
}
