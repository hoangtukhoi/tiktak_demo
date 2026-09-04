import { useEffect, useRef } from 'react';
export default function useInfiniteScroll(onEndReached, hasMore) {
  const sentinelRef = useRef(null);
  useEffect(() => {
    if (!hasMore) return;
    const obs = new IntersectionObserver(([entry]) => { if (entry.isIntersecting) onEndReached(); }, { threshold: 0.1 });
    if (sentinelRef.current) obs.observe(sentinelRef.current);
    return () => obs.disconnect();
  }, [onEndReached, hasMore]);
  return sentinelRef;
}
