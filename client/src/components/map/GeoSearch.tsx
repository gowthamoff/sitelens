import { useState, useRef, useEffect, useCallback } from 'react';
import { Search, MapPin, X, Navigation, Building2, Route } from 'lucide-react';

interface GeoResult {
  name: string;
  place_type: string | null;
  category: 'poi' | 'area' | 'road';
  lat: number;
  lng: number;
  score?: number;
  geojson?: any;
}

interface GeoSearchProps {
  onSelect: (lat: number, lng: number, name: string, geojson?: any) => void;
  isMobile: boolean;
}

const CATEGORY_ICON = {
  area: Building2,
  road: Route,
  poi: MapPin,
};

const CATEGORY_COLOR = {
  area: '#7ee787',
  road: '#ffa657',
  poi: '#4f9cf9',
};

function useDebounce<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

export function GeoSearch({ onSelect, isMobile }: GeoSearchProps) {
  const [open, setOpen] = useState(false);
  const [isFocused, setIsFocused] = useState(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<GeoResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const debouncedQuery = useDebounce(query, 300);

  // Auto-focus input when panel opens on mobile
  useEffect(() => {
    if (isMobile && open && inputRef.current) inputRef.current.focus();
  }, [open, isMobile]);

  // Fetch on debounced query change
  useEffect(() => {
    if (!debouncedQuery || debouncedQuery.trim().length < 2) {
      setResults([]);
      setError(null);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);

    const encodedQuery = encodeURIComponent(debouncedQuery.trim());

    // OpenStreetMap Nominatim online geocoding (with GeoJSON boundaries)
    fetch(`https://nominatim.openstreetmap.org/search?q=${encodedQuery}&format=json&limit=8&polygon_geojson=1`)
      .then(r => {
        if (!r.ok) throw new Error('Nominatim search failed');
        return r.json();
      })
      .then((nomRes) => {
        if (cancelled) return;

        const mapped: GeoResult[] = (Array.isArray(nomRes) ? nomRes : []).map((item: any) => {
          let category: 'poi' | 'area' | 'road' = 'poi';
          if (item.class === 'highway') category = 'road';
          if (item.class === 'boundary' || item.class === 'building') category = 'area';

          return {
            name: `${item.display_name}`,
            place_type: item.type,
            category,
            lat: parseFloat(item.lat),
            lng: parseFloat(item.lon),
            geojson: item.geojson
          };
        });

        if (mapped.length === 0) {
          setError('No places found');
        } else {
          setResults(mapped.slice(0, 8));
        }
      })
      .catch(() => {
        if (!cancelled) setError('Search services unreachable');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  }, [debouncedQuery]);

  const handleSelect = useCallback((r: GeoResult) => {
    onSelect(r.lat, r.lng, r.name, r.geojson);
    setQuery(r.name);
    setResults([]);
    setOpen(false);
    inputRef.current?.blur();
  }, [onSelect]);

  const handleClear = () => {
    setQuery('');
    setResults([]);
    setError(null);
    inputRef.current?.focus();
  };

  const isDesktopExpanded = !isMobile && (isFocused || !!query);

  return (
    <div style={{ position: 'relative' }}>
      {/* Mobile Toggle Button */}
      {isMobile && !open ? (
        <div style={{
          background: 'rgba(22, 27, 34, 0.65)', 
          backdropFilter: 'blur(24px)',
          WebkitBackdropFilter: 'blur(24px)',
          padding: '5px', 
          borderRadius: '13px',
          border: '1px solid var(--glass-border)', 
          boxShadow: 'var(--shadow)',
        }}>
          <button
            onClick={() => setOpen(true)}
            title="Search places"
            style={{
              width: isMobile ? '34px' : '36px',
              height: isMobile ? '34px' : '36px',
              borderRadius: isMobile ? '8px' : '10px',
              border: 'none',
              cursor: 'pointer',
              background: 'transparent',
              color: 'var(--text-dim)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              transition: 'all 0.15s',
            }}
            onMouseEnter={e => {
              e.currentTarget.style.background = 'rgba(79,156,249,0.12)';
              e.currentTarget.style.color = 'var(--accent)';
            }}
            onMouseLeave={e => {
              e.currentTarget.style.background = 'transparent';
              e.currentTarget.style.color = 'var(--text-dim)';
            }}
          >
            <Search size={isMobile ? 16 : 18} />
          </button>
        </div>
      ) : (
        /* Elastic Search Panel (Desktop) / Full Panel (Mobile) */
        <div style={{
          position: isMobile ? 'absolute' : 'relative',
          top: 0,
          left: 0,
          width: isMobile ? '260px' : (isDesktopExpanded ? '360px' : '160px'),
          background: 'var(--glass-bg)',
          backdropFilter: 'var(--glass-blur)',
          WebkitBackdropFilter: 'var(--glass-blur)',
          border: '1px solid var(--glass-border)',
          borderRadius: '24px',
          boxShadow: 'var(--shadow)',
          overflow: 'hidden',
          zIndex: 200,
          transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
        }}>
          {/* Search input row */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: '8px',
            padding: '10px 12px',
            borderBottom: results.length > 0 || error ? '1px solid var(--border)' : 'none',
          }}>
            {loading
              ? <span style={{ width: '16px', height: '16px', borderRadius: '50%', border: '2px solid var(--border)', borderTopColor: 'var(--accent)', animation: 'spin 0.6s linear infinite', flexShrink: 0 }} />
              : <Search size={15} color={isFocused ? 'var(--accent)' : 'var(--text-dim)'} style={{ flexShrink: 0, transition: 'color 0.2s' }} />
            }
            <input
              ref={inputRef}
              value={query}
              onFocus={() => setIsFocused(true)}
              onBlur={() => setIsFocused(false)}
              onChange={e => setQuery(e.target.value)}
              onKeyDown={e => e.key === 'Escape' && (isMobile ? setOpen(false) : inputRef.current?.blur())}
              placeholder={!isDesktopExpanded && !isMobile ? "Search..." : "Search places, roads, areas…"}
              style={{
                flex: 1,
                background: 'none', border: 'none', outline: 'none',
                fontSize: '13px', color: 'var(--text)',
                fontFamily: '"Inter", sans-serif',
                width: '100%',
              }}
            />
            {query && (
              <button onClick={handleClear} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-dim)', display: 'flex', padding: '2px' }}>
                <X size={14} />
              </button>
            )}
            {isMobile && (
              <button onClick={() => { setOpen(false); setQuery(''); setResults([]); }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-dim)', display: 'flex', padding: '2px' }}>
                <X size={16} />
              </button>
            )}
          </div>

          {/* Results list */}
          {error && !loading && (
            <div style={{ padding: '12px 16px', fontSize: '12px', color: 'var(--text-dim)', textAlign: 'center' }}>
              {error}
            </div>
          )}

          {results.length > 0 && (
            <div style={{ maxHeight: '260px', overflowY: 'auto' }}>
              <style>{`
                .geo-result-item:hover { background: rgba(79,156,249,0.08) !important; }
                @keyframes spin { to { transform: rotate(360deg); } }
              `}</style>
              {results.map((r, i) => {
                const Icon = CATEGORY_ICON[r.category] || MapPin;
                const color = CATEGORY_COLOR[r.category] || '#4f9cf9';
                return (
                  <button
                    key={i}
                    className="geo-result-item"
                    onClick={() => handleSelect(r)}
                    style={{
                      width: '100%', background: 'none', border: 'none',
                      cursor: 'pointer', padding: '10px 14px',
                      display: 'flex', alignItems: 'center', gap: '10px',
                      borderBottom: i < results.length - 1 ? '1px solid rgba(255,255,255,0.04)' : 'none',
                      textAlign: 'left', transition: 'background 0.15s',
                    }}
                  >
                    <div style={{
                      width: '28px', height: '28px', borderRadius: '8px', flexShrink: 0,
                      background: `${color}18`, display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                      <Icon size={14} color={color} />
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {r.name}
                      </div>
                      {r.place_type && (
                        <div style={{ fontSize: '11px', color: 'var(--text-dim)', marginTop: '1px', textTransform: 'capitalize' }}>
                          {r.place_type.replace(/_/g, ' ')} · {r.category}
                        </div>
                      )}
                    </div>
                    <Navigation size={12} color="var(--text-dim)" style={{ flexShrink: 0 }} />
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
