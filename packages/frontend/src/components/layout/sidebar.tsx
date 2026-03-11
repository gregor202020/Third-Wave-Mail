'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LogOut } from 'lucide-react';
import { cn } from '@/lib/utils';
import { navItems, bottomNavItems } from './nav-config';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

export function Sidebar() {
  const pathname = usePathname();

  return (
    <TooltipProvider delay={0}>
      <aside className="w-[68px] bg-tw-black flex flex-col items-center py-4 gap-1.5 shrink-0 border-r border-white/5">
        {/* Logo */}
        <Link href="/dashboard" className="mb-4">
          <div className="w-10 h-10 bg-gradient-to-br from-tw-red to-tw-red-dark rounded-xl flex items-center justify-center text-white text-sm font-extrabold shadow-lg shadow-tw-red/30">
            TW
          </div>
        </Link>

        {/* Main nav */}
        {navItems.map((item) => {
          const isActive = pathname.startsWith(item.href);
          return (
            <Tooltip key={item.href}>
              <TooltipTrigger
                render={<Link href={item.href} aria-label={item.label} />}
                className={cn(
                  'relative w-10 h-10 rounded-[10px] flex items-center justify-center transition-colors',
                  isActive
                    ? 'bg-tw-blue-tint text-tw-blue'
                    : 'text-white/30 hover:text-white/60 hover:bg-white/5'
                )}
              >
                {isActive && (
                  <div className="absolute left-0 top-0 bottom-0 w-[3px] bg-tw-blue rounded-r" />
                )}
                <item.icon className="w-[18px] h-[18px]" strokeWidth={2} />
              </TooltipTrigger>
              <TooltipContent side="right" className="text-xs">
                {item.label}
              </TooltipContent>
            </Tooltip>
          );
        })}

        <div className="mt-auto flex flex-col items-center gap-1.5">
          {bottomNavItems.map((item) => {
            const isActive = pathname.startsWith(item.href);
            return (
              <Tooltip key={item.href}>
                <TooltipTrigger
                  render={<Link href={item.href} aria-label={item.label} />}
                  className={cn(
                    'w-10 h-10 rounded-[10px] flex items-center justify-center transition-colors',
                    isActive
                      ? 'bg-tw-blue-tint text-tw-blue'
                      : 'text-white/30 hover:text-white/60 hover:bg-white/5'
                  )}
                >
                  <item.icon className="w-[18px] h-[18px]" strokeWidth={2} />
                </TooltipTrigger>
                <TooltipContent side="right" className="text-xs">
                  {item.label}
                </TooltipContent>
              </Tooltip>
            );
          })}

          {/* User avatar */}
          <DropdownMenu>
            <DropdownMenuTrigger className="w-7 h-7 bg-white/10 rounded-full flex items-center justify-center text-[11px] text-white/60 font-semibold hover:bg-white/20 transition-colors">
              G
            </DropdownMenuTrigger>
            <DropdownMenuContent side="right" align="end" className="w-40">
              <DropdownMenuItem render={<Link href="/settings" />}>
                Profile
              </DropdownMenuItem>
              <DropdownMenuItem className="text-status-danger">
                <LogOut className="w-4 h-4 mr-2" />
                Log out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </aside>
    </TooltipProvider>
  );
}
