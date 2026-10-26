import { useEffect, useRef } from 'react';

/** Gọi onEndReached khi phần tử sentinel lọt vào viewport (root = container cuộn nếu truyền vào) */
export default function useInfiniteScroll(onEndReached, hasMore, rootRef) {
  const sentinelRef = useRef(null);
  useEffect(() => {
    if (!hasMore || !sentinelRef.current) return;
    const obs = new IntersectionObserver(([e]) => e.isIntersecting && onEndReached(), {
      root: rootRef?.current || null,
      rootMargin: '200% 0px',
    });
    obs.observe(sentinelRef.current);
    return () => obs.disconnect();
  }, [onEndReached, hasMore, rootRef]);
  return sentinelRef;
}
