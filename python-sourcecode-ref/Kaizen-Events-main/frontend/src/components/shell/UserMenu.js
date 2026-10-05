import React from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { ChevronDown, KeyRound, LogOut, User } from 'lucide-react';
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent,
  DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator,
} from '../ui/dropdown-menu';

const ROLE_LABEL = {
  super_admin: 'Super Admin',
  org_admin: 'Org Admin',
  kiosk_volunteer: 'Kiosk Volunteer',
};

/**
 * Account menu anchored on the avatar chip. Gives the previously-orphaned
 * Change Password route a home and makes Logout a two-step action instead of a
 * one-tap target. Presentational — logout() behaviour is unchanged.
 */
export default function UserMenu() {
  const { user, logout } = useAuth();
  const name = user?.name || user?.email?.split('@')[0] || 'Account';
  const role = ROLE_LABEL[user?.role] || user?.role;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="flex items-center gap-2 rounded-full py-1 pl-1 pr-2 sm:pr-3 bg-muted hover:bg-accent-subtle transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          aria-label="Account menu"
        >
          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-primary-subtle">
            <User className="h-4 w-4 text-primary" />
          </span>
          <span className="hidden sm:block max-w-[10rem] truncate text-sm font-jakarta font-medium text-foreground">
            {name}
          </span>
          <ChevronDown className="hidden sm:block h-4 w-4 text-muted-foreground" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel className="flex flex-col gap-0.5">
          <span className="truncate text-sm font-semibold text-foreground">{name}</span>
          {user?.email ? <span className="truncate text-xs font-normal text-muted-foreground">{user.email}</span> : null}
          {role ? (
            <span className="mt-1 inline-flex w-fit items-center rounded-full bg-accent-subtle px-2 py-0.5 text-[11px] font-medium text-accent-foreground">
              {role}
            </span>
          ) : null}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link to="/change-password" className="cursor-pointer gap-2">
            <KeyRound className="h-4 w-4" /> Change Password
          </Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onClick={logout}
          className="cursor-pointer gap-2 text-destructive focus:text-destructive"
        >
          <LogOut className="h-4 w-4" /> Log out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
