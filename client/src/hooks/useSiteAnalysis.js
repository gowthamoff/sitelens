import { useState } from 'react';
import { API_BASE } from '../config/constants';

export function useSiteAnalysis() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);

  async function analyze({ newSite, existingOutlets = [] }) {
    setLoading(true);
    try {
      const [mixRes, cannRes] = await Promise.all([
        fetch(`${API_BASE}/api/demand-mix?lat=${newSite.lat}&lng=${newSite.lng}&radius=500`)
          .then(r => r.json()),
        existingOutlets.length
          ? fetch(`${API_BASE}/api/cannibalization`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ newSite, existingOutlets }),
            }).then(r => r.json())
          : Promise.resolve(null),
      ]);
      setData({ mix: mixRes, cannibalization: cannRes });
    } finally {
      setLoading(false);
    }
  }

  return { data, loading, analyze };
}
