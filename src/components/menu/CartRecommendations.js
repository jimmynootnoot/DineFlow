import { useEffect, useState } from 'react';
import { getRecommendations } from '../../services/recommendationService';

export default function CartRecommendations({ cart, menu, onAdd }) {
  const [items, setItems] = useState([]);
  const [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    if (!cart.length) { setItems([]); return undefined; }
    setItems([]); setError('');
    getRecommendations(cart).then((result) => { if (active) setItems(result); })
      .catch(() => { if (active) setError('Suggestions are temporarily unavailable. You can continue ordering.'); });
    return () => { active = false; };
  }, [cart, menu]);
  if (error) return <p className="session-note" role="status">{error}</p>;
  if (!items.length) return null;
  return (
    <div className="cart-recs">
      <div className="cart-recs__head"><span>You may also like</span><small>pairings & top sellers</small></div>
      {items.map((item) => (
        <button key={item.id} onClick={() => item.items.forEach(dish => { const current = menu.find(row => row.id === dish.id); if (current) onAdd(current); })}>
          <span><strong>{item.items.map(dish => dish.name).join(' + ')}</strong><small>{item.reason}{item.source === 'simulated' ? ' · simulated validation data' : ''}</small></span>
          <b>+ ₱{item.items.reduce((sum,dish) => sum + Number(dish.price),0).toFixed(2)}</b>
        </button>
      ))}
    </div>
  );
}
