import { createContext, useContext, useState, useCallback, type ReactNode } from 'react';

interface WishlistContextValue {
  items: string[];
  toggle: (id: string) => void;
  remove: (id: string) => void;
  has: (id: string) => boolean;
  clear: () => void;
}

const WishlistContext = createContext<WishlistContextValue | null>(null);

export function WishlistProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<string[]>([]);

  const toggle = useCallback((id: string) => {
    setItems((prev) => (prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]));
  }, []);

  const remove = useCallback((id: string) => {
    setItems((prev) => prev.filter((i) => i !== id));
  }, []);

  const has = useCallback((id: string) => items.includes(id), [items]);

  const clear = useCallback(() => setItems([]), []);

  return (
    <WishlistContext.Provider value={{ items, toggle, remove, has, clear }}>
      {children}
    </WishlistContext.Provider>
  );
}

export function useWishlist() {
  const ctx = useContext(WishlistContext);
  if (!ctx) throw new Error('useWishlist must be used within WishlistProvider');
  return ctx;
}
