'use client';
import { Suspense } from 'react';
import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { Search } from 'lucide-react';
import { cn } from '@/lib/utils';
import { navItems, bottomNavItems, sectionTabs } from './nav-config';
import { Input } from '@/components/ui/input';

interface TopBarProps {
  action?: React.ReactNode;
}

function TopBarContent({ action }: TopBarProps) {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const allNavItems = [...navItems, ...bottomNavItems];
  const currentSection = allNavItems.find(item => pathname.startsWith(item.href));
  const sectionPath = currentSection?.href || pathname;
  const tabs = sectionTabs[sectionPath] || [];
  const title = currentSection?.label || 'TWMail';

  return (
    <header className="h-[52px] bg-white border-b border-card-border flex items-center px-7 shrink-0">
      <h1 className="text-sm font-semibold text-text-primary tracking-tight">{title}</h1>

      {tabs.length > 0 && (
        <nav className="flex items-center gap-5 ml-8">
          {tabs.map((tab) => {
            const isActive = pathname + (searchParams.toString() ? `?${searchParams.toString()}` : '') === tab.href
              || (tab.href === sectionPath && pathname === sectionPath && !searchParams.toString());
            return (
              <Link
                key={tab.href}
                href={tab.href}
                className={cn(
                  'text-xs transition-colors',
                  isActive
                    ? 'text-tw-blue font-medium bg-tw-blue-light px-2.5 py-0.5 rounded-full'
                    : 'text-text-muted hover:text-text-secondary'
                )}
              >
                {tab.label}
              </Link>
            );
          })}
        </nav>
      )}

      <div className="ml-auto flex items-center gap-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-text-muted" />
          <Input
            placeholder="Search..."
            className="w-48 h-8 pl-9 text-xs bg-surface border-card-border"
          />
        </div>
        {action}
      </div>
    </header>
  );
}

export function TopBar({ action }: TopBarProps) {
  return (
    <Suspense fallback={
      <header className="h-[52px] bg-white border-b border-card-border flex items-center px-7 shrink-0">
        <h1 className="text-sm font-semibold text-text-primary tracking-tight">TWMail</h1>
      </header>
    }>
      <TopBarContent action={action} />
    </Suspense>
  );
}
