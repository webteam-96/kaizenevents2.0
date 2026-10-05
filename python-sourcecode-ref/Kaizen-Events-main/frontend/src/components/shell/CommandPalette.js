import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import {
  CommandDialog, CommandInput, CommandList, CommandEmpty, CommandGroup, CommandItem,
} from '../ui/command';
import { getNavGroups } from '../../config/navConfig';

/**
 * Global command palette — press Ctrl/Cmd+K anywhere in the admin app to jump to
 * any destination the current user can reach. Pure navigation accelerator; no
 * data is mutated. `open`/`onOpenChange` are controlled by the shell.
 */
export default function CommandPalette({ open, onOpenChange }) {
  const navigate = useNavigate();
  const auth = useAuth();
  const groups = getNavGroups(auth);

  const go = (path) => {
    onOpenChange(false);
    navigate(path);
  };

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange}>
      <CommandInput placeholder="Jump to… (type a page name)" />
      <CommandList>
        <CommandEmpty>No matches.</CommandEmpty>
        {groups.map((group) => (
          <CommandGroup key={group.label} heading={group.label}>
            {group.items.map((item) => {
              const Icon = item.icon;
              return (
                <CommandItem
                  key={item.path}
                  value={`${group.label} ${item.label}`}
                  onSelect={() => go(item.path)}
                  className="gap-2"
                >
                  {Icon ? <Icon className="h-4 w-4 text-muted-foreground" /> : null}
                  <span>{item.label}</span>
                </CommandItem>
              );
            })}
          </CommandGroup>
        ))}
      </CommandList>
    </CommandDialog>
  );
}
