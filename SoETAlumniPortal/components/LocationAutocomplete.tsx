'use client';

import { useEffect, useRef, useState } from 'react';
import { LoaderCircle, MapPin } from 'lucide-react';

type LocationKind = 'city' | 'state' | 'country';

interface LocationSuggestion {
  value: string;
  label: string;
}

interface LocationAutocompleteProps {
  kind: LocationKind;
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
}

export default function LocationAutocomplete({
  kind,
  label,
  value,
  onChange,
  placeholder,
}: LocationAutocompleteProps) {
  const [suggestions, setSuggestions] = useState<LocationSuggestion[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [lookupFailed, setLookupFailed] = useState(false);
  const selectedValueRef = useRef<string | null>(null);

  useEffect(() => {
    const query = value.trim();

    if (selectedValueRef.current === query) {
      selectedValueRef.current = null;
      setSuggestions([]);
      setLoading(false);
      setLookupFailed(false);
      setOpen(false);
      return;
    }

    if (query.length < 2) {
      setSuggestions([]);
      setLoading(false);
      setLookupFailed(false);
      setOpen(false);
      return;
    }

    const controller = new AbortController();
    const timeoutId = window.setTimeout(async () => {
      setLoading(true);
      setLookupFailed(false);

      try {
        const params = new URLSearchParams({ type: kind, q: query });
        const response = await fetch(`/api/location-suggestions?${params.toString()}`, {
          method: 'GET',
          signal: controller.signal,
          headers: { Accept: 'application/json' },
        });

        if (!response.ok) {
          throw new Error('Location suggestions are currently unavailable.');
        }

        const result = (await response.json()) as { suggestions?: LocationSuggestion[] };
        setSuggestions(Array.isArray(result.suggestions) ? result.suggestions : []);
        setOpen(true);
      } catch (error) {
        if (error instanceof Error && error.name === 'AbortError') return;
        setSuggestions([]);
        setLookupFailed(true);
        setOpen(true);
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, 350);

    return () => {
      window.clearTimeout(timeoutId);
      controller.abort();
    };
  }, [kind, value]);

  const handleSelect = (suggestion: LocationSuggestion) => {
    selectedValueRef.current = suggestion.value;
    onChange(suggestion.value);
    setSuggestions([]);
    setOpen(false);
    setLookupFailed(false);
  };

  return (
    <div
      className="relative min-w-0"
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
          setOpen(false);
        }
      }}
    >
      <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-[#4A3832]">
        {label}
      </label>
      <div className="relative">
        <input
          type="text"
          value={value}
          autoComplete="off"
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={open && (suggestions.length > 0 || lookupFailed)}
          onFocus={() => {
            if (value.trim().length >= 2) setOpen(true);
          }}
          onChange={(event) => {
            onChange(event.target.value);
            setOpen(true);
          }}
          placeholder={placeholder}
          className="w-full rounded-xl border border-[#DDD7D2] bg-[#FBFAF8] px-3.5 py-2.5 pr-9 text-sm text-[#222222] outline-none transition focus:border-[#F28C38] focus:bg-white focus:ring-2 focus:ring-[#F28C38]"
        />
        <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-[#9A8E85]">
          {loading ? (
            <LoaderCircle className="h-4 w-4 animate-spin" />
          ) : (
            <MapPin className="h-4 w-4" />
          )}
        </span>
      </div>

      {open && value.trim().length >= 2 && (suggestions.length > 0 || lookupFailed || (!loading && suggestions.length === 0)) && (
        <div
          role="listbox"
          className="absolute left-0 right-0 top-full z-50 mt-1 max-h-56 overflow-y-auto rounded-xl border border-[#E5DDD5] bg-white py-1 shadow-xl shadow-[#4A3832]/10"
        >
          {suggestions.length > 0 ? (
            suggestions.map((suggestion, index) => (
              <button
                key={`${suggestion.value}-${index}`}
                type="button"
                role="option"
                aria-selected={false}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => handleSelect(suggestion)}
                className="flex w-full flex-col px-3.5 py-2 text-left transition hover:bg-[#FFF4EA] focus:bg-[#FFF4EA] focus:outline-none"
              >
                <span className="text-sm font-semibold text-[#4A3832]">{suggestion.value}</span>
                {suggestion.label !== suggestion.value && (
                  <span className="mt-0.5 text-[10px] text-[#8A7B70]">{suggestion.label}</span>
                )}
              </button>
            ))
          ) : lookupFailed ? (
            <p className="px-3.5 py-3 text-xs text-[#8A7B70]">
              Suggestions are temporarily unavailable. You can still enter this location manually.
            </p>
          ) : !loading ? (
            <p className="px-3.5 py-3 text-xs text-[#8A7B70]">
              No matching suggestions. You can still enter this location manually.
            </p>
          ) : null}
        </div>
      )}
    </div>
  );
}
