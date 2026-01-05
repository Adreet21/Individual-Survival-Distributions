import { useEffect, useRef, useState } from "react";
import { searchUsers } from "../lib/users";

export type UserSuggestion = {
  id: number;
  username: string;
  email: string;
};

type UserSearchInputProps = {
  value: string;
  onValueChange: (value: string) => void;
  onSelect: (user: UserSuggestion) => void;
  placeholder?: string;
  disabled?: boolean;
  autoFocus?: boolean;
};

export function UserSearchInput({
  value,
  onValueChange,
  onSelect,
  placeholder,
  disabled,
  autoFocus,
}: UserSearchInputProps) {
  const [suggestions, setSuggestions] = useState<UserSuggestion[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);

  // Search users with debounce
  useEffect(() => {
    if (!value || value.trim().length < 2) {
      setSuggestions([]);
      setOpen(false);
      return;
    }

    const handle = window.setTimeout(async () => {
      try {
        setIsSearching(true);
        const res = await searchUsers(value.trim(), 8);
        setSuggestions(res.map(u => ({ ...u, email: u.email || '' })));
        setOpen(true);
      } catch (err: any) {
        console.error("User search failed", err);
        setSuggestions([]);
        setOpen(false);
      } finally {
        setIsSearching(false);
      }
    }, 250);

    return () => {
      clearTimeout(handle);
    };
  }, [value]);

  // Close dropdown when clicking outside
  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (!containerRef.current) return;
      if (!containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  return (
    <div ref={containerRef} className="relative w-full">
      <input
        value={value}
        onChange={(e) => {
          setOpen(true);
          onValueChange(e.target.value);
        }}
        onFocus={() => {
          if (suggestions.length > 0) setOpen(true);
        }}
        placeholder={placeholder ?? "Search username"}
        disabled={disabled}
        autoFocus={autoFocus}
        className="w-full rounded-md border px-2 py-1 text-sm outline-none focus:border-neutral-400 focus:ring-2 focus:ring-neutral-200 disabled:bg-neutral-100"
      />
      {open && (
        <div className="absolute left-0 top-full z-30 mt-1 w-full overflow-hidden rounded-md border bg-white shadow-lg">
          {isSearching ? (
            <div className="px-3 py-2 text-xs text-neutral-500">Searching…</div>
          ) : suggestions.length === 0 ? (
            <div className="px-3 py-2 text-xs text-neutral-500">
              No matches found
            </div>
          ) : (
            suggestions.map((user) => (
              <button
                key={user.id}
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  onSelect(user);
                  setOpen(false);
                }}
                className="flex w-full flex-col items-start gap-0.5 px-3 py-2 text-left text-sm hover:bg-neutral-100"
              >
                <span className="font-medium">{user.username}</span>
                <span className="text-xs text-neutral-500">{user.email}</span>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
