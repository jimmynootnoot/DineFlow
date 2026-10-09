import { useCallback, useEffect, useRef, useState } from 'react';
import { subscribeMenu, getMenuItems } from '../services/menuService';
import { subscribeOrders } from '../services/orderService';

export const useMenu = (identity = null) => {
  const [menu, setMenu] = useState([]);
  const [loading, setLoading] = useState(true);
  const retryRef = useRef(null);
  const refreshRef = useRef(() => Promise.resolve([]));
  const refresh = useCallback(() => refreshRef.current(), []);

  useEffect(() => {
    setMenu([]);
    if (!identity) { setLoading(false); return; }
    let active = true;
    setLoading(true);

    const subscription = subscribeMenu((items) => {
      setMenu(items);
      setLoading(false);

      // A short retry covers newly-created Supabase projects while the
      // schema and seed transaction is finishing.
      if (items.length === 0) {
        clearTimeout(retryRef.current);
        retryRef.current = setTimeout(async () => {
          try {
            const fresh = await getMenuItems();
            if (active && fresh.length > 0) setMenu(fresh);
          } catch { /* ignore */ }
        }, 2500);
      } else {
        clearTimeout(retryRef.current);
      }
    });
    refreshRef.current = subscription.refresh;

    return () => {
      active = false;
      refreshRef.current = () => Promise.resolve([]);
      subscription.unsubscribe();
      clearTimeout(retryRef.current);
    };
  }, [identity]);

  return { menu, loading, refresh };
};

export const useOrders = (identity = null) => {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(false);
  const refreshRef = useRef(() => Promise.resolve([]));
  const refresh = useCallback(() => refreshRef.current(), []);

  useEffect(() => {
    setOrders([]);
    if (!identity) { setLoading(false); return; }
    setLoading(true);
    const subscription = subscribeOrders((list) => {
      setOrders(list);
      setLoading(false);
    });
    refreshRef.current = subscription.refresh;
    return () => {
      refreshRef.current = () => Promise.resolve([]);
      subscription.unsubscribe();
    };
  }, [identity]);

  return { orders, loading, refresh };
};
