import { useEffect, useRef, useState } from 'react';
import { subscribeMenu, getMenuItems } from '../services/menuService';
import { subscribeOrders } from '../services/orderService';

export const useMenu = (identity = null) => {
  const [menu, setMenu] = useState([]);
  const [loading, setLoading] = useState(true);
  const retryRef = useRef(null);

  useEffect(() => {
    setMenu([]);
    if (!identity) { setLoading(false); return; }
    let active = true;
    setLoading(true);

    const unsub = subscribeMenu((items) => {
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

    return () => {
      active = false;
      unsub();
      clearTimeout(retryRef.current);
    };
  }, [identity]);

  return { menu, loading };
};

export const useOrders = (identity = null) => {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setOrders([]);
    if (!identity) { setLoading(false); return; }
    setLoading(true);
    const unsub = subscribeOrders((list) => {
      setOrders(list);
      setLoading(false);
    });
    return unsub;
  }, [identity]);

  return { orders, loading };
};
