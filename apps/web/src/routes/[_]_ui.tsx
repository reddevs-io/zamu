import { createFileRoute, notFound } from '@tanstack/react-router';
import { useEffect } from 'react';
import { cn, UIProvider } from '~/ui';
import { UIGallery } from '~/ui/gallery/UIGallery';

// The UI kit gallery. File name escapes the leading underscore ("[_]_ui") so the URL is /__ui;
// a plain "__ui.tsx" would be a pathless layout route. Development only: production builds answer 404.

type Theme = 'light' | 'dark';

export const Route = createFileRoute('/__ui')({
  validateSearch: (search: Record<string, unknown>): { theme?: Theme } =>
    search.theme === 'light' || search.theme === 'dark' ? { theme: search.theme } : {},
  beforeLoad: () => {
    if (!import.meta.env.DEV) throw notFound();
  },
  head: () => ({ meta: [{ title: 'UI kit · Zamu' }] }),
  component: GalleryPage,
});

function GalleryPage() {
  const { theme } = Route.useSearch();
  // Popovers and tooltips render in a portal under <body>: put the forced theme on <html> too, as the app does.
  useEffect(() => {
    if (!theme) return;
    const root = document.documentElement;
    root.classList.add(theme);
    return () => root.classList.remove(theme);
  }, [theme]);
  return (
    <UIProvider>
      {/* ?theme=light|dark forces a theme; without it the gallery follows prefers-color-scheme. */}
      <div className={cn(theme, 'min-h-dvh bg-bg')}>
        <UIGallery />
      </div>
    </UIProvider>
  );
}
