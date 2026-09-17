import Icon from '../ui/Icon';
import { useModalFocus } from '../../hooks/useModalFocus';

const money = (value) => `₱${Number(value || 0).toFixed(2)}`;

export default function DishDetails({ item, onClose, onAdd }) {
  const dialogRef = useModalFocus(Boolean(item), onClose);
  if (!item) return null;
  return (
    <div className="dish-sheet-backdrop" onMouseDown={onClose}>
      <aside ref={dialogRef} className="dish-sheet" role="dialog" aria-modal="true" aria-labelledby="dish-detail-title" tabIndex={-1} onMouseDown={(event) => event.stopPropagation()}>
        <button className="dish-sheet__close" aria-label="Close dish details" onClick={onClose}><Icon name="x" /></button>
        <img className="dish-sheet__image" src={item.image} alt={item.name} />
        <div className="dish-sheet__content">
          <p className="dish-sheet__category">{item.category}</p>
          <div className="dish-sheet__title"><h2 id="dish-detail-title">{item.name}</h2><strong>{money(item.price)}</strong></div>
          <p className="dish-sheet__description">{item.description}</p>
          <dl className="dish-sheet__facts">
            <div><dt>Serving</dt><dd>{item.servingSize}</dd></div>
            <div><dt>Estimate</dt><dd>{item.prepMinutes} min</dd></div>
            <div><dt>Spice</dt><dd>{item.spiceLevel === 'none' ? 'Not spicy' : item.spiceLevel}</dd></div>
            <div><dt>Availability</dt><dd>{item.available && item.stock > 0 ? `${item.stock} in stock` : 'Sold out'}</dd></div>
          </dl>
          <div className="dish-sheet__section"><h3>Ingredients</h3><p>{item.ingredients?.length ? item.ingredients.join(', ') : 'Ask staff for the current ingredient list.'}</p></div>
          <div className="dish-sheet__section"><h3>Allergen notice</h3><p>{item.allergens?.length ? item.allergens.join(', ') : 'No listed allergens. Cross-contact may still occur; confirm severe allergies with staff.'}</p></div>
          <button className="pos-submit" disabled={!item.available || item.stock <= 0} onClick={() => { onAdd(item); onClose(); }}><Icon name="plus" /> Add to order</button>
        </div>
      </aside>
    </div>
  );
}
