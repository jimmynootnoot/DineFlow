import { useEffect, useMemo, useRef, useState } from 'react';
import toast, { Toaster } from 'react-hot-toast';
import './App.css';
import { useAuth }      from './hooks/useAuth';
import { useMenu, useOrders }        from './hooks/useData';
import { addMenuItem, updateMenuItemAvailability, deleteMenuItem, updateMenuItem, uploadDishImage } from './services/menuService';
import { placeOrder, updateOrderStatus } from './services/orderService';
import { getDailySales, getBestSellers, getPeriodComparison, exportOrdersCSV } from './services/reportService';
import { seedMenuItems, resetAndReseed } from './services/seedService';
import { createSalesInsight } from './services/assistantService';
import MayaCheckout from './components/checkout/MayaCheckout';
import LoginPage    from './components/layout/LoginPage';
import Icon         from './components/ui/Icon';
import AssistantPanel from './components/assistant/AssistantPanel';
import DishDetails from './components/menu/DishDetails';
import CartRecommendations from './components/menu/CartRecommendations';
import ReceiptPanel from './components/orders/ReceiptPanel';
import StaffRequests from './components/staff/StaffRequests';
import ResearchReports from './components/panels/ResearchReports';
import TableSessions from './components/panels/TableSessions';
import AdminSettings from './components/panels/AdminSettings';
import BillingControls from './components/orders/BillingControls';
import { supabase } from './services/supabase';
import HostedMaya from './components/checkout/HostedMaya';
import { serverRequest } from './services/platformService';

const currency  = (v) => `₱${Number(v || 0).toFixed(2)}`;
const safeStatus = (s) => (s || 'pending').toLowerCase().replace('_', '-');
const fmtTime = (ts) => {
  if (!ts) return '--:--';
  try {
    const d = ts?.toDate ? ts.toDate() : new Date(ts);
    return d.toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit' });
  } catch { return '--:--'; }
};
const fmtDate = () => new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

const CATEGORIES = ['All', 'Chicken', 'Pork', 'Beef', 'Seafood', 'Noodles', 'Sides', 'Desserts', 'Beverages'];
const ORDER_STATUSES = ['confirmed', 'preparing', 'ready', 'served', 'completed', 'cancelled'];

// ── Nav items per role ────────────────────────────────────────
const NAV = {
  Admin:    [
    { id: 'dashboard',  icon: 'grid',    label: 'Dashboard' },
    { id: 'pos',        icon: 'bag',     label: 'POS System' },
    { id: 'orders',     icon: 'list',    label: 'Orders' },
    { id: 'menu',       icon: 'book',    label: 'Menu Items' },
    { id: 'requests',   icon: 'users',   label: 'Staff Requests' },
    { id: 'reports',    icon: 'chart',   label: 'Reports' },
  ],
  Cashier:  [
    { id: 'dashboard',  icon: 'grid',    label: 'Dashboard' },
    { id: 'pos',        icon: 'bag',     label: 'POS System' },
    { id: 'orders',     icon: 'list',    label: 'Orders' },
    { id: 'menu',       icon: 'book',    label: 'Menu Items' },
    { id: 'requests',   icon: 'users',   label: 'Staff Requests' },
    { id: 'reports',    icon: 'chart',   label: 'Reports' },
  ],
  Staff:    [
    { id: 'dashboard',  icon: 'grid',    label: 'Dashboard' },
    { id: 'pos',        icon: 'bag',     label: 'POS System' },
    { id: 'orders',     icon: 'list',    label: 'Orders' },
    { id: 'menu',       icon: 'book',    label: 'Menu Items' },
    { id: 'requests',   icon: 'users',   label: 'Staff Requests' },
    { id: 'reports',    icon: 'chart',   label: 'Reports' },
  ],
  Kitchen:  [
    { id: 'kitchen',    icon: 'flame',   label: 'Kitchen Queue' },
    { id: 'orders',     icon: 'list',    label: 'All Orders' },
  ],
  Customer: [
    { id: 'pos',        icon: 'bag',     label: 'Order Now' },
    { id: 'myorders',   icon: 'package', label: 'My Orders' },
  ],
};
NAV.Admin.push({id:'kitchen',icon:'flame',label:'Kitchen Queue'}, {id:'tables',icon:'grid',label:'Tables & QR'}, {id:'settings',icon:'users',label:'Administration'});
NAV.Management = NAV.Admin.filter(item => item.id !== 'settings');
for (const role of ['Staff','Cashier']) {
  NAV[role] = NAV[role].filter(item => !['reports','dashboard','menu'].includes(item.id));
  NAV[role].push({id:'tables',icon:'grid',label:'Tables & QR'});
}

// Elapsed minutes drive the ticket's timing colour on the kitchen rail.
const ticketAge = (ts) => {
  if (!ts) return 0;
  try {
    const d = ts?.toDate ? ts.toDate() : new Date(ts);
    return Math.max(0, Math.round((Date.now() - d.getTime()) / 60000));
  } catch { return 0; }
};
const timingClass = (m) => (m >= 20 ? 'kitchen-card--late' : m >= 10 ? 'kitchen-card--warn' : '');

function App() {
  const { user, loginForm, loginError, authNotice, handleLogout, handleLoginChange, handleAuthSubmit, authLoading } = useAuth();
  const identityRef = useRef(user?.id);
  const requestGeneration = useRef(0);
  identityRef.current = user?.id;

  // ── Active page ────────────────────────────────────────────
  const defaultPage = (role) => {
    if (role === 'Admin' || role === 'Management') return 'dashboard';
    if (role === 'Cashier' || role === 'Staff') return 'orders';
    if (role === 'Kitchen') return 'kitchen';
    if (role === 'Customer' && new URLSearchParams(window.location.search).has('mayaOrder')) return 'myorders';
    return 'pos';
  };
  const [activePage, setActivePage] = useState('dashboard');

  // ── State ──────────────────────────────────────────────────
  const [signUpModalOpen, setSignUpModalOpen] = useState(false);
  const [mayaOpen, setMayaOpen]               = useState(false);
  const [pendingOrderId, setPendingOrderId]   = useState(null);
  const [pendingOrderTotal, setPendingOrderTotal] = useState(0);
  const [pendingReceipt, setPendingReceipt]   = useState(null);
  const [receiptOrder, setReceiptOrder]       = useState(null);
  const [selectedDish, setSelectedDish]       = useState(null);
  const [hostedMayaEnabled,setHostedMayaEnabled] = useState(false);

  // Menu management
  const [menuCategory, setMenuCategory]     = useState('All');
  const [menuSearch, setMenuSearch]         = useState('');
  const emptyMenuForm = { name: '', description: '', category: 'Sides', price: '', image: '', stock: '', ingredients: '', allergens: '', spiceLevel: 'none', servingSize: '1 serving', prepMinutes: '15', featured: false };
  const [menuForm, setMenuForm]             = useState(emptyMenuForm);
  const [editingItem, setEditingItem]       = useState(null);
  const [showAddForm, setShowAddForm]       = useState(false);
  const [seeding, setSeeding]               = useState(false);
  const [uploadingImage,setUploadingImage] = useState(false);

  // Cart
  const [cart, setCart]                     = useState([]);
  const [orderCustomer, setOrderCustomer]   = useState('');
  const [tableSessionToken] = useState(() => new URLSearchParams(window.location.search).get('tableSession'));
  const [tableSessionError, setTableSessionError] = useState('');
  const [orderType, setOrderType]           = useState(() => new URLSearchParams(window.location.search).has('tableSession') ? 'dine-in' : 'takeout');
  const [orderTable, setOrderTable]         = useState('');
  const [orderNotes, setOrderNotes]         = useState('');
  const [placingOrder, setPlacingOrder]     = useState(false);
  const [catFilter, setCatFilter]           = useState('All');
  const [menuSearchOrder, setMenuSearchOrder] = useState('');

  // Orders panel
  const [filterStatus, setFilterStatus]     = useState('all');
  const [statusUpdatingId, setStatusUpdatingId] = useState(null);
  const [selectedOrder, setSelectedOrder]   = useState(null);

  // Dashboard stats
  const [dailyStats, setDailyStats]   = useState(null);
  const [bestSellers, setBestSellers] = useState([]);
  const [periodComparison, setPeriodComparison] = useState(null);

  // ── Data hooks ─────────────────────────────────────────────
  const { menu, loading: menuLoading } = useMenu(user?.id);
  const { orders } = useOrders(user?.id);

  // ── Side effects ────────────────────────────────────────────
  useEffect(() => {
    if (user) setActivePage(defaultPage(user.role));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.role]);

  useEffect(() => {
    if (user?.role === 'Customer' && user.name) setOrderCustomer(user.name);
  }, [user]);
  useEffect(()=>{
    let active=true;setHostedMayaEnabled(false);
    if(user?.role==='Customer')serverRequest('maya',{action:'configuration'}).then(result=>{if(active)setHostedMayaEnabled(result.enabled);}).catch(()=>{});
    return()=>{active=false;};
  },[user?.id,user?.role]);

  useEffect(() => {
    if (!user || !tableSessionToken) return;
    let active = true;
    supabase.rpc('resolve_table_session', {p_token:tableSessionToken}).then(({data,error}) => {
      if (!active) return;
      if (error || !data?.length) setTableSessionError('This table QR session is unavailable. Ask staff for a current code or choose takeout.');
      else { setOrderTable(data[0].table_number); setTableSessionError(''); }
    });
    return () => {active=false;};
  }, [user, tableSessionToken]);

  useEffect(() => {
    if (user && signUpModalOpen) setSignUpModalOpen(false);
  }, [user, signUpModalOpen]);

  useEffect(() => {
    if (!user || !['Admin','Management'].includes(user.role)) return;
    seedMenuItems().catch(() => {});
  }, [user]);

  useEffect(() => {
    // Staff reach the dashboard too (see NAV and defaultPage), so they
    // must load its figures or every KPI reads zero.
    if (!user || !['Admin', 'Management'].includes(user.role)) return;
    getDailySales().then(setDailyStats).catch(() => {});
    getBestSellers(5).then(setBestSellers).catch(() => {});
    getPeriodComparison(7).then(setPeriodComparison).catch(() => {});
  }, [user, orders]);

  // ── Logout ─────────────────────────────────────────────────
  const handleSecureLogout = () => {
    requestGeneration.current += 1;
    identityRef.current = null;
    handleLogout();
    setCart([]);
    setFilterStatus('all');
    setMayaOpen(false);
    setPendingOrderId(null);
    setPendingOrderTotal(0);
    setPlacingOrder(false);
    setPendingReceipt(null);
    setReceiptOrder(null);
    setSelectedOrder(null);
    setSelectedDish(null);
    setOrderCustomer('');
    setOrderNotes('');
    setDailyStats(null);
    setBestSellers([]);
    setPeriodComparison(null);
  };

  // ── Menu CRUD ──────────────────────────────────────────────
  const handleAddMenuItem = async (e) => {
    e.preventDefault();
    if (!menuForm.name.trim() || !menuForm.price) return;
    try {
      await addMenuItem({
        name: menuForm.name.trim(), description: menuForm.description.trim(),
        category: menuForm.category, price: parseFloat(menuForm.price),
        image: menuForm.image.trim(), stock: parseInt(menuForm.stock) || 0,
        ingredients: menuForm.ingredients.split(',').map(v => v.trim()).filter(Boolean),
        allergens: menuForm.allergens.split(',').map(v => v.trim()).filter(Boolean),
        spiceLevel: menuForm.spiceLevel, servingSize: menuForm.servingSize.trim(),
        prepMinutes: parseInt(menuForm.prepMinutes) || 15, featured: menuForm.featured,
        available: true,
      });
      setMenuForm(emptyMenuForm);
      setShowAddForm(false);
      toast.success('Menu item added!');
    } catch (err) { toast.error(err.message); }
  };

  const handleUpdateMenuItem = async (e) => {
    e.preventDefault();
    if (!editingItem) return;
    try {
      await updateMenuItem(editingItem.id, {
        name: menuForm.name.trim(), description: menuForm.description.trim(),
        category: menuForm.category, price: parseFloat(menuForm.price),
        image: menuForm.image.trim(), stock: parseInt(menuForm.stock) || 0,
        ingredients: menuForm.ingredients.split(',').map(v => v.trim()).filter(Boolean),
        allergens: menuForm.allergens.split(',').map(v => v.trim()).filter(Boolean),
        spiceLevel: menuForm.spiceLevel, servingSize: menuForm.servingSize.trim(),
        prepMinutes: parseInt(menuForm.prepMinutes) || 15, featured: menuForm.featured,
      });
      setEditingItem(null);
      setMenuForm(emptyMenuForm);
      toast.success('Item updated!');
    } catch (err) { toast.error(err.message); }
  };

  const startEdit = (item) => {
    setEditingItem(item);
    setMenuForm({ name: item.name, description: item.description || '', category: item.category || 'Sides', price: String(item.price), image: item.image || '', stock: String(item.stock || 0), ingredients: (item.ingredients || []).join(', '), allergens: (item.allergens || []).join(', '), spiceLevel: item.spiceLevel || 'none', servingSize: item.servingSize || '1 serving', prepMinutes: String(item.prepMinutes || 15), featured: Boolean(item.featured) });
    setShowAddForm(false);
  };

  const handleDeleteMenuItem = async (id) => {
    if (!window.confirm('Delete this menu item?')) return;
    try { await deleteMenuItem(id); toast.success('Item deleted.'); }
    catch (err) { toast.error(err.message); }
  };

  const toggleAvailability = async (id, available) => {
    try { await updateMenuItemAvailability(id, available); }
    catch (err) { toast.error(err.message); }
  };

  const handleSeed = async () => {
    setSeeding(true);
    try {
      const result = await seedMenuItems();
      toast(result.message);
    } catch (err) { toast.error(err.message); }
    setSeeding(false);
  };

  const handleReseed = async () => {
    if (!window.confirm('Restore every menu item to available with a stock level of 30? Existing dishes and order history will be preserved.')) return;
    setSeeding(true);
    try {
      const result = await resetAndReseed();
      toast.success(result.message);
    } catch (err) { toast.error(err.message); }
    setSeeding(false);
  };

  // ── Cart helpers ────────────────────────────────────────────
  const addToCart = (item) => {
    if (!item.available || (item.stock ?? 1) <= 0) return;
    setCart(prev => {
      const ex = prev.find(c => c.id === item.id);
      if (ex) return prev.map(c => c.id === item.id ? { ...c, quantity: c.quantity + 1 } : c);
      return [...prev, { ...item, quantity: 1, remarks: '' }];
    });
  };

  const removeFromCart = (id) => setCart(prev => prev.filter(c => c.id !== id));
  const updateQty = (id, qty) => {
    if (qty < 1) { removeFromCart(id); return; }
    setCart(prev => prev.map(c => c.id === id ? { ...c, quantity: qty } : c));
  };
  const updateRemarks = (id, remarks) => setCart(prev => prev.map(c => c.id === id ? { ...c, remarks } : c));

  const cartTotal = cart.reduce((s, c) => s + c.price * c.quantity, 0);
  const cartCount = cart.reduce((s, c) => s + c.quantity, 0);

  const handlePlaceOrder = async (e) => {
    e.preventDefault();
    const actorId = user.id;
    const generation = requestGeneration.current;
    if (!orderCustomer.trim() || cart.length === 0) {
      toast.error('Please add items and enter a customer name.');
      return;
    }
    if (orderType === 'dine-in' && !orderTable.trim()) {
      toast.error('Enter a table number for dine-in service.');
      return;
    }
    try {
      setPlacingOrder(true);
      const orderedItems = cart.map(item => ({ ...item }));
      const newOrder = await placeOrder({
        customerName:  orderCustomer.trim(),
        customerId:    user.id,
        orderType,
        tableNumber: orderType === 'dine-in' ? orderTable.trim() : null,
        tableSessionToken: orderType === 'dine-in' ? tableSessionToken : null,
        notes:         orderNotes.trim(),
        // Customers choose at checkout, so the method is not known yet;
        // settlement (or the cashier) overwrites this.
        paymentMethod: user.role === 'Customer' ? 'pending' : 'cash',
        items:         cart,
      });
      if (identityRef.current !== actorId || requestGeneration.current !== generation) return;
      const receipt = { ...newOrder, customerName: orderCustomer.trim(), orderType, tableNumber: orderType === 'dine-in' ? orderTable.trim() : null, notes: orderNotes.trim(), items: orderedItems, subtotal: newOrder.totalAmount, serviceFee: 0, paymentStatus: 'unpaid', status: 'confirmed', createdAt: new Date().toISOString() };
      setPendingReceipt(receipt);
      if (user.role === 'Customer') {
        setPendingOrderId(newOrder.id);
        setPendingOrderTotal(newOrder.totalAmount);
        if(hostedMayaEnabled){setActivePage('myorders');toast.success('Order placed. Open Maya sandbox from your order to pay.');}
        else setMayaOpen(true);
      } else {
        toast.success(`Order ${newOrder.orderNumber} placed!`);
        setReceiptOrder(receipt);
      }
      setCart([]);
      setOrderNotes('');
      if (user.role !== 'Customer') setOrderCustomer('');
    } catch (err) { if (identityRef.current === actorId && requestGeneration.current === generation) toast.error(err.message); }
    finally { if (identityRef.current === actorId && requestGeneration.current === generation) setPlacingOrder(false); }
  };

  const retryPayment = (order) => {
    setPendingOrderId(order.id);
    setPendingOrderTotal(order.totalAmount);
    setPendingReceipt(order);
    setMayaOpen(true);
  };

  const handleStatusChange = async (id, status) => {
    try {
      setStatusUpdatingId(id);
      await updateOrderStatus(id, status);
    } catch (err) { toast.error(err.message); }
    finally { setStatusUpdatingId(null); }
  };

  // ── Derived ─────────────────────────────────────────────────
  const availableMenu = useMemo(() => menu.filter(i => i.available), [menu]);
  const menuCategories = useMemo(() => ['All', ...new Set(menu.map(item => item.category).filter(Boolean))], [menu]);

  const filteredMenuItems = useMemo(() => availableMenu
    .filter(i => catFilter === 'All' || i.category === catFilter)
    .filter(i => !menuSearchOrder || i.name.toLowerCase().includes(menuSearchOrder.toLowerCase())),
    [availableMenu, catFilter, menuSearchOrder]);

  const displayedMenu = useMemo(() => menu
    .filter(i => menuCategory === 'All' || i.category === menuCategory)
    .filter(i => !menuSearch || i.name.toLowerCase().includes(menuSearch.toLowerCase())),
    [menu, menuCategory, menuSearch]);

  const myOrders = useMemo(() => {
    if (!user || user.role !== 'Customer') return [];
    return orders.filter(o => o.customerId === user.id);
  }, [orders, user]);

  const kitchenQueue = useMemo(() =>
    orders.filter(o => ['confirmed','preparing','ready'].includes(o.status)),
    [orders]);

  const filteredOrders = useMemo(() => {
    if (filterStatus === 'all') return orders;
    return orders.filter(o => o.status === filterStatus);
  }, [orders, filterStatus]);

  const statusCounts = useMemo(() => {
    const c = { all: orders.length };
    ORDER_STATUSES.forEach(s => { c[s] = orders.filter(o => o.status === s).length; });
    return c;
  }, [orders]);

  const completedOrders = useMemo(() => orders.filter(o => o.status === 'completed' && o.paymentStatus === 'paid'), [orders]);
  const revenue = useMemo(() => completedOrders.reduce((s, o) => s + (o.totalAmount || 0), 0), [completedOrders]);

  // ── Login screen ────────────────────────────────────────────
  if (!user) {
    return (
      <LoginPage
        loginForm={loginForm}
        loginError={loginError}
        authNotice={authNotice}
        authLoading={authLoading}
        onLoginChange={handleLoginChange}
        onSubmit={handleAuthSubmit}
        onOpenSignup={() => setSignUpModalOpen(true)}
        signUpModalOpen={signUpModalOpen}
        onCloseSignup={() => setSignUpModalOpen(false)}
      />
    );
  }

  const navItems = NAV[user.role] || NAV.Customer;
  const roleInitial = (user.name || 'U')[0].toUpperCase();
  const canManageMenu = ['Admin', 'Management'].includes(user.role);

  // ── Page renderers ───────────────────────────────────────────

  const renderDashboard = () => (
    <div className="page-content">
      <div className="page-hero">
        <div>
          <h2 className="page-title">Dashboard</h2>
          <p className="page-sub">Welcome back! Here's your canteen overview.</p>
        </div>
        <div className="hero-actions">
          {user.role === 'Admin' && (
            <button className="hero-btn hero-btn--outline" onClick={handleReseed} disabled={seeding}>
              <Icon name="refresh" /> Reset Menu
            </button>
          )}
          <span className="page-date">{fmtDate()}</span>
        </div>
      </div>

      {/* Stat cards */}
      <div className="dash-cards">
        {[
          { label: "Today's Orders",  val: dailyStats?.totalOrders ?? orders.length,       sub: 'total placed' },
          { label: "Today's Revenue", val: currency(dailyStats?.totalRevenue ?? revenue),  sub: 'from completed' },
          { label: 'Pending Orders',  val: kitchenQueue.length,                            sub: 'awaiting kitchen' },
          { label: 'Low Stock Items', val: menu.filter(i => (i.stock ?? 99) < 5).length,   sub: 'need restocking' },
        ].map(s => (
          <div key={s.label} className="dash-card">
            <div className="dash-card__label">{s.label}</div>
            <div className="dash-card__val">{s.val}</div>
            <div className="dash-card__sub">{s.sub}</div>
          </div>
        ))}
      </div>

      <div className="dash-grid">
        {/* Recent Orders table */}
        <div className="card card--wide">
          <div className="card-head">
            <h3 className="card-title">Recent Orders</h3>
            <button className="card-action" onClick={() => setActivePage('orders')}>View All</button>
          </div>
          <table className="orders-table">
            <thead>
              <tr>
                <th>Order</th><th>Customer</th><th className="num">Items</th><th className="num">Total</th><th>Status</th><th className="num">Time</th>
              </tr>
            </thead>
            <tbody>
              {orders.slice(0, 8).map(o => (
                <tr key={o.id}>
                  <td className="order-num">{o.orderNumber || `#${o.id.slice(-6).toUpperCase()}`}</td>
                  <td>{o.customerName || 'Guest'}</td>
                  <td className="num">{(o.items || []).length}</td>
                  <td className="num order-total">{currency(o.totalAmount)}</td>
                  <td><span className={`tag tag--${safeStatus(o.status)}`}>{o.status || 'pending'}</span></td>
                  <td className="num order-time">{fmtTime(o.createdAt)}</td>
                </tr>
              ))}
              {orders.length === 0 && (
                <tr><td colSpan={6} className="table-empty">No orders yet.</td></tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Low Stock / Top Sellers */}
        <div className="dash-side">
          <div className="card ai-insight">
            <div className="card-head"><div><p className="ai-insight__eyebrow">AI sales insight</p><h3 className="card-title">Performance brief</h3></div></div>
            <p>{createSalesInsight({ dailyStats, bestSellers, comparison: periodComparison })}</p>
            <small>Generated only from recorded DineFlow sales metrics.</small>
          </div>
          <div className="card">
            <div className="card-head">
              <h3 className="card-title">Low Stock</h3>
            </div>
            {menu.filter(i => (i.stock ?? 99) < 5).length === 0
              ? <div className="card-empty"><Icon name="check" size={22} /><p>All stock levels are healthy.</p></div>
              : menu.filter(i => (i.stock ?? 99) < 5).map(i => (
                  <div key={i.id} className="stock-row">
                    <span>{i.name}</span>
                    <span className="stock-badge">{i.stock ?? 0} left</span>
                  </div>
                ))
            }
          </div>

          {bestSellers.length > 0 && (
            <div className="card">
              <div className="card-head">
                <h3 className="card-title">Top Sellers</h3>
              </div>
              <ol className="top-sellers">
                {bestSellers.map((item, i) => (
                  <li key={i}>
                    <span className="ts-rank">{i + 1}</span>
                    <span className="ts-name">{item.name}</span>
                    <span className="ts-val">{item.quantity} sold</span>
                  </li>
                ))}
              </ol>
            </div>
          )}
        </div>
      </div>
    </div>
  );

  const renderPOS = () => (
    <div className="page-content">
      <div className="page-hero">
        <div>
          <h2 className="page-title">POS System</h2>
          <p className="page-sub">{user.role === 'Customer' ? 'Browse the menu and place your order' : 'Create a customer order'}</p>
        </div>
        {cartCount > 0 && (
          <div className="cart-pill">
            <Icon name="bag" /> <strong>{cartCount}</strong> item{cartCount !== 1 ? 's' : ''} · <strong>{currency(cartTotal)}</strong>
          </div>
        )}
      </div>

      <div className="pos-layout">
        {/* Menu side */}
        <div className="pos-menu">
          <div className="pos-filters">
            <div className="pos-search-wrap">
              <Icon name="search" />
              <input className="pos-search" placeholder="Search menu" value={menuSearchOrder} onChange={e => setMenuSearchOrder(e.target.value)} />
            </div>
            <div className="cat-strip">
              {menuCategories.map(c => (
                <button key={c} className={`cat-pill ${catFilter === c ? 'active' : ''}`} onClick={() => setCatFilter(c)}>{c}</button>
              ))}
            </div>
          </div>
          <div className="menu-cards">
            {filteredMenuItems.map(item => {
              const inCart = cart.find(c => c.id === item.id);
              return (
                <article key={item.id} className={`menu-card ${inCart ? 'in-cart' : ''}`}>
                  {item.image
                    ? <button type="button" className="menu-card__image-button" onClick={() => setSelectedDish(item)} aria-label={`View ${item.name} details`}><img src={item.image} alt={item.name} loading="lazy" onError={e => { e.target.style.display = 'none'; }} /></button>
                    : <div className="menu-card__img-ph">{item.name[0]}</div>
                  }
                  <div className="menu-card__body">
                    <p className="menu-card__cat">{item.category}</p>
                    <button type="button" className="menu-card__name" onClick={() => setSelectedDish(item)}><h4>{item.name}</h4></button>
                    <p className="menu-card__meta">{item.servingSize} · {item.prepMinutes} min</p>
                    <div className="menu-card__footer">
                      {inCart && <span className="qty-badge">×{inCart.quantity}</span>}
                      <span className="menu-card__price">{currency(item.price)}</span>
                      <button type="button" className="menu-card__add" onClick={() => addToCart(item)} aria-label={`Add ${item.name}`}><Icon name="plus" /></button>
                    </div>
                  </div>
                </article>
              );
            })}
            {filteredMenuItems.length === 0 && (
              menuLoading
                ? [...Array(6)].map((_, i) => (
                    <div key={i} className="menu-skeleton" aria-hidden="true">
                      <div className="sk-block sk-img" />
                      <div className="sk-block sk-line sk-line--short" />
                      <div className="sk-block sk-line" />
                    </div>
                  ))
                : <div className="pos-empty">
                    <p>No items match this filter.</p>
                    {canManageMenu && <button className="hero-btn" onClick={handleReseed} disabled={seeding}>
                      <Icon name="sprout" /> {seeding ? 'Seeding' : 'Seed Menu'}
                    </button>}
                    <p className="pos-hint">
                      {canManageMenu?'Add available dishes in Menu Items to begin service.':'Try another category or ask staff about today’s available dishes.'}
                    </p>
                  </div>
            )}
          </div>
        </div>

        {/* Order side */}
        <div className="pos-order">
          <div className="card">
            <div className="card-head"><h3 className="card-title">Order Details</h3></div>
            <div className="pos-form">
              <div className="pos-field">
                <label className="pos-label" htmlFor="pos-customer">Customer name</label>
                <input id="pos-customer" className="pos-input" placeholder="Enter customer name" value={orderCustomer}
                  readOnly={user.role === 'Customer'} onChange={e => setOrderCustomer(e.target.value)} />
              </div>
              <div className="pos-field">
                <label className="pos-label" htmlFor="pos-type">Order type</label>
                <select id="pos-type" className="pos-input" value={orderType} onChange={e => setOrderType(e.target.value)}>
                  <option value="dine-in">Dine-In</option>
                  <option value="takeout">Takeout</option>
                </select>
              </div>
              {orderType === 'dine-in' && (
                <div className="pos-field">
                  <label className="pos-label" htmlFor="pos-table">Table number</label>
                  <input id="pos-table" className="pos-input" placeholder={user.role==='Customer'?'Scan your table QR code':'Table number'} value={orderTable} readOnly={user.role==='Customer'} onChange={e => setOrderTable(e.target.value)} />
                  {tableSessionToken && !tableSessionError && orderTable && <small className="session-note">Verified table session loaded from QR link.</small>}
                  {(tableSessionError || (user.role==='Customer'&&!tableSessionToken)) && <small className="session-note" role="status">{tableSessionError || 'Scan the QR code on your table, or choose takeout.'}</small>}
                </div>
              )}
              <div className="pos-field">
                <label className="pos-label" htmlFor="pos-notes">Notes</label>
                <textarea id="pos-notes" className="pos-input pos-textarea" rows={2} placeholder="General order note"
                  value={orderNotes} onChange={e => setOrderNotes(e.target.value)} />
              </div>
            </div>

            {cart.length > 0 ? (
              <div className="pos-cart">
                <h4 className="pos-cart__title">Cart</h4>
                {cart.map(item => (
                  <div key={item.id} className="pos-cart__item">
                    <div className="pos-cart__row">
                    <span className="pos-cart__name">{item.name}</span>
                    <div className="pos-cart__qty">
                      <button aria-label={`Decrease ${item.name}`} onClick={() => updateQty(item.id, item.quantity - 1)}><Icon name="minus" size={13} /></button>
                      <span>{item.quantity}</span>
                      <button aria-label={`Increase ${item.name}`} onClick={() => updateQty(item.id, item.quantity + 1)}><Icon name="plus" size={13} /></button>
                    </div>
                    <span className="pos-cart__sub">{currency(item.price * item.quantity)}</span>
                    <button className="pos-cart__rm" aria-label={`Remove ${item.name}`} onClick={() => removeFromCart(item.id)}><Icon name="x" size={13} /></button>
                    </div>
                    <input className="pos-cart__remarks" aria-label={`Remarks for ${item.name}`} placeholder="Item remark, e.g. no onion" value={item.remarks || ''} onChange={e => updateRemarks(item.id, e.target.value)} />
                  </div>
                ))}
                <CartRecommendations cart={cart} menu={menu} onAdd={addToCart} />
                <div className="pos-cart__total">
                  <span>Total</span>
                  <strong>{currency(cartTotal)}</strong>
                </div>
                <button className="pos-submit" disabled={placingOrder || !orderCustomer.trim() || (orderType === 'dine-in' && !orderTable.trim())} onClick={handlePlaceOrder}>
                  {placingOrder
                    ? 'Placing order'
                    : user.role === 'Customer'
                      ? <><Icon name="card" /> Place Order &amp; Pay with Maya</>
                      : <><Icon name="check" /> Place Order</>}
                </button>
              </div>
            ) : (
              <div className="pos-cart-empty">
                <Icon name="bag" size={22} />
                <p>Tap a dish to add it to the cart</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );

  const renderOrders = () => (
    <div className="page-content">
      <div className="page-hero">
        <div>
          <h2 className="page-title">Orders</h2>
          <p className="page-sub">Monitor and manage all order tickets</p>
        </div>
        {user.role === 'Admin' && (
          <button className="hero-btn hero-btn--outline" onClick={() => exportOrdersCSV(orders)}><Icon name="download" /> Export CSV</button>
        )}
      </div>

      <div className="card">
        <div className="status-tabs">
          {['all', ...ORDER_STATUSES].map(s => (
            <button key={s} className={`status-tab ${filterStatus === s ? 'active' : ''}`} onClick={() => setFilterStatus(s)}>
              {s === 'all' ? 'All' : s.charAt(0).toUpperCase() + s.slice(1)}
              <span className="tab-count">{statusCounts[s] ?? 0}</span>
            </button>
          ))}
        </div>

        <table className="orders-table">
          <thead>
            <tr><th>Order</th><th>Customer</th><th className="num">Items</th><th className="num">Total</th><th>Status</th><th className="num">Time</th><th /></tr>
          </thead>
          <tbody>
            {filteredOrders.length === 0
              ? <tr><td colSpan={7} className="table-empty">No orders in this state.</td></tr>
              : filteredOrders.map(order => (
                  <tr key={order.id} className={selectedOrder?.id === order.id ? 'row-selected' : ''} onClick={() => setSelectedOrder(selectedOrder?.id === order.id ? null : order)}>
                    <td className="order-num">{order.orderNumber || `#${order.id.slice(-6).toUpperCase()}`}</td>
                    <td>{order.customerName || 'Guest'}</td>
                    <td className="num">{(order.items || []).length}</td>
                    <td className="num order-total">{currency(order.totalAmount)}</td>
                    <td><span className={`tag tag--${safeStatus(order.status)}`}>{order.status || 'pending'}</span></td>
                    <td className="num order-time">{fmtTime(order.createdAt)}</td>
                    <td onClick={e => e.stopPropagation()}>
                      {(['Admin', 'Management', 'Cashier', 'Staff'].includes(user.role)) && order.status === 'ready' && (
                        <button className="tbl-btn tbl-btn--green" disabled={statusUpdatingId === order.id}
                          onClick={() => handleStatusChange(order.id, 'served')}>Mark served</button>
                      )}
                      {['Admin','Management','Cashier','Staff'].includes(user.role) && order.status==='served' && order.paymentStatus==='paid' && <button className="tbl-btn tbl-btn--green" disabled={statusUpdatingId===order.id} onClick={()=>handleStatusChange(order.id,'completed')}>Complete</button>}
                      {['Admin','Management','Staff'].includes(user.role) && ['confirmed','preparing'].includes(order.status) && order.paymentStatus==='unpaid' && <button className="tbl-btn" disabled={statusUpdatingId===order.id} onClick={()=>handleStatusChange(order.id,'cancelled')}>Cancel</button>}
                      <button className="tbl-btn" onClick={()=>setReceiptOrder(order)}>View bill</button>
                    </td>
                  </tr>
                ))
            }
          </tbody>
        </table>

        {selectedOrder && (
          <div className="order-detail">
            <h4>Items in {selectedOrder.orderNumber}</h4>
            <ul className="detail-items">
              {(selectedOrder.items || []).map((it, idx) => (
                <li key={idx}>
                  <span>{it.name} <span className="di-qty">×{it.quantity || 1}</span></span>
                  <span className="di-qty">{currency((it.price || 0) * (it.quantity || 1))}</span>
                </li>
              ))}
            </ul>
            {selectedOrder.notes && <p className="detail-note"><Icon name="note" /> {selectedOrder.notes}</p>}
            {['Admin','Management','Cashier','Staff'].includes(user.role) && <BillingControls key={selectedOrder.id} order={orders.find(order=>order.id===selectedOrder.id)||selectedOrder}/>}
          </div>
        )}
      </div>
    </div>
  );

  const renderMenu = () => (
    <div className="page-content">
      <div className="page-hero">
        <div>
          <h2 className="page-title">Menu Items</h2>
          <p className="page-sub">Manage your menu — toggle availability, add or edit dishes</p>
        </div>
        {canManageMenu && (
          <div className="hero-actions">
            {user.role === 'Admin' && <button className="hero-btn hero-btn--outline" onClick={handleSeed} disabled={seeding}><Icon name="sprout" /> Verify Seed</button>}
            {user.role === 'Admin' && <button className="hero-btn hero-btn--outline" onClick={handleReseed} disabled={seeding}><Icon name="refresh" /> Restore Stock</button>}
            <button className="hero-btn" onClick={() => { setShowAddForm(p => !p); setEditingItem(null); }}>
              {showAddForm ? <><Icon name="x" /> Cancel</> : <><Icon name="plus" /> Add Item</>}
            </button>
          </div>
        )}
      </div>

      {(showAddForm || editingItem) && canManageMenu && (
        <div className="card">
          <div className="card-head"><h3 className="card-title">{editingItem ? 'Edit Item' : 'New Item'}</h3></div>
          <form onSubmit={editingItem ? handleUpdateMenuItem : handleAddMenuItem}>
            <div className="form-grid">
              <div className="form-field">
                <label className="pos-label" htmlFor="mf-name">Dish name</label>
                <input id="mf-name" className="form-input" placeholder="e.g. Chicken Adobo" value={menuForm.name} required onChange={e => setMenuForm(p => ({ ...p, name: e.target.value }))} />
              </div>
              <div className="form-field">
                <label className="pos-label" htmlFor="mf-desc">Description</label>
                <input id="mf-desc" className="form-input" placeholder="Short description" value={menuForm.description} onChange={e => setMenuForm(p => ({ ...p, description: e.target.value }))} />
              </div>
              <div className="form-field">
                <label className="pos-label" htmlFor="mf-cat">Category</label>
                <input id="mf-cat" className="form-input" list="menu-category-options" required maxLength={60} value={menuForm.category} onChange={e => setMenuForm(p => ({ ...p, category: e.target.value }))}/>
                <datalist id="menu-category-options">{[...new Set([...menuCategories.filter(c => c !== 'All'), ...CATEGORIES.filter(c => c !== 'All')])].map(c => <option key={c} value={c}/>)}</datalist>
              </div>
              <div className="form-field">
                <label className="pos-label" htmlFor="mf-price">Price</label>
                <input id="mf-price" className="form-input" type="number" min="0" step="0.5" placeholder="0.00" value={menuForm.price} required onChange={e => setMenuForm(p => ({ ...p, price: e.target.value }))} />
              </div>
              <div className="form-field">
                <label className="pos-label" htmlFor="mf-stock">Stock quantity</label>
                <input id="mf-stock" className="form-input" type="number" min="0" placeholder="0" value={menuForm.stock} onChange={e => setMenuForm(p => ({ ...p, stock: e.target.value }))} />
              </div>
              <div className="form-field">
                <label className="pos-label" htmlFor="mf-img">Image URL</label>
                <input id="mf-img" className="form-input" placeholder="https://" value={menuForm.image} onChange={e => setMenuForm(p => ({ ...p, image: e.target.value }))} />
                <label className="pos-label" htmlFor="mf-upload">Or upload a dish photo</label>
                <input id="mf-upload" className="form-input" type="file" accept="image/jpeg,image/png,image/webp" disabled={uploadingImage} onChange={async e=>{const file=e.target.files?.[0];if(!file)return;setUploadingImage(true);try{const image=await uploadDishImage(file);setMenuForm(p=>({...p,image}));}catch(error){toast.error(error.message);}finally{setUploadingImage(false);}}}/>
              </div>
              <div className="form-field">
                <label className="pos-label" htmlFor="mf-serving">Serving size</label>
                <input id="mf-serving" className="form-input" placeholder="e.g. 1 bowl" value={menuForm.servingSize} onChange={e => setMenuForm(p => ({ ...p, servingSize: e.target.value }))} />
              </div>
              <div className="form-field">
                <label className="pos-label" htmlFor="mf-prep">Prep estimate (minutes)</label>
                <input id="mf-prep" className="form-input" type="number" min="1" value={menuForm.prepMinutes} onChange={e => setMenuForm(p => ({ ...p, prepMinutes: e.target.value }))} />
              </div>
              <div className="form-field">
                <label className="pos-label" htmlFor="mf-spice">Spice level</label>
                <select id="mf-spice" className="form-input" value={menuForm.spiceLevel} onChange={e => setMenuForm(p => ({ ...p, spiceLevel: e.target.value }))}><option value="none">Not spicy</option><option value="mild">Mild</option><option value="medium">Medium</option><option value="hot">Hot</option></select>
              </div>
              <div className="form-field form-field--wide">
                <label className="pos-label" htmlFor="mf-ingredients">Ingredients</label>
                <input id="mf-ingredients" className="form-input" placeholder="Comma-separated" value={menuForm.ingredients} onChange={e => setMenuForm(p => ({ ...p, ingredients: e.target.value }))} />
              </div>
              <div className="form-field form-field--wide">
                <label className="pos-label" htmlFor="mf-allergens">Allergens</label>
                <input id="mf-allergens" className="form-input" placeholder="e.g. soy, egg, dairy" value={menuForm.allergens} onChange={e => setMenuForm(p => ({ ...p, allergens: e.target.value }))} />
              </div>
            </div>
            <div className="form-actions">
              <button type="submit" className="hero-btn" disabled={uploadingImage}>{uploadingImage?'Uploading photo…':editingItem ? 'Save Changes' : 'Add Item'}</button>
              <button type="button" className="hero-btn hero-btn--outline" onClick={() => { setEditingItem(null); setShowAddForm(false); }}>Cancel</button>
            </div>
          </form>
        </div>
      )}

      <div className="card">
        <div className="menu-toolbar">
          <div className="pos-search-wrap">
            <Icon name="search" />
            <input className="pos-search" placeholder="Search menu" value={menuSearch} onChange={e => setMenuSearch(e.target.value)} />
          </div>
          <div className="cat-strip">
            {menuCategories.map(c => (
              <button key={c} className={`cat-pill ${menuCategory === c ? 'active' : ''}`} onClick={() => setMenuCategory(c)}>{c}</button>
            ))}
          </div>
        </div>

        <table className="orders-table">
          <thead>
            <tr><th /><th>Name</th><th>Category</th><th className="num">Price</th><th className="num">Stock</th><th>Status</th>{canManageMenu && <th />}</tr>
          </thead>
          <tbody>
            {displayedMenu.map(item => (
              <tr key={item.id} className={!item.available ? 'row-dim' : ''}>
                <td>
                  {item.image
                    ? <img src={item.image} alt="" loading="lazy" className="tbl-thumb" onError={e => { e.target.style.display = 'none'; }} />
                    : <div className="tbl-thumb-ph">{item.name[0]}</div>
                  }
                </td>
                <td><span className="tbl-name">{item.name}</span>{item.description && <p className="tbl-desc">{item.description}</p>}</td>
                <td><span className="tag tag--cat">{item.category}</span></td>
                <td className="num order-total">{currency(item.price)}</td>
                <td className="num">{item.stock ?? '—'}</td>
                <td>
                  <button disabled={!canManageMenu} className={`tag tag--${item.available ? 'completed' : 'cancelled'}`}
                    onClick={() => toggleAvailability(item.id, !item.available)}>
                    {item.available ? 'Available' : 'Sold Out'}
                  </button>
                </td>
                {canManageMenu && (
                  <td>
                    <div className="tbl-actions">
                      <button className="tbl-btn" onClick={() => startEdit(item)}><Icon name="pencil" size={13} /> Edit</button>
                      <button className="tbl-btn tbl-btn--red" onClick={() => handleDeleteMenuItem(item.id)}><Icon name="trash" size={13} /> Delete</button>
                    </div>
                  </td>
                )}
              </tr>
            ))}
            {displayedMenu.length === 0 && <tr><td colSpan={7} className="table-empty">No items match this filter.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );

  const renderKitchen = () => (
    <div className="page-content">
      <div className="kitchen-shell">
        <div className="page-hero">
          <div>
            <h2 className="page-title">Kitchen Queue</h2>
            <p className="page-sub">Live production queue · {kitchenQueue.length} active orders</p>
          </div>
        </div>

        {kitchenQueue.length === 0
          ? <div className="kitchen-empty">Kitchen is caught up.</div>
          : (
            <div className="kitchen-grid">
              {kitchenQueue.map(order => {
                const mins = ticketAge(order.createdAt);
                return (
                  <div key={order.id} className={`kitchen-card ${timingClass(mins)}`}>
                    <div className="kitchen-card__head">
                      <div>
                        <p className="kitchen-card__num">{order.orderNumber || `#${order.id.slice(-6).toUpperCase()}`}</p>
                        <h4 className="kitchen-card__name">{order.customerName || 'Guest'}</h4>
                      </div>
                      <span className="kitchen-card__type">
                        {order.orderType === 'dine-in' ? `Table ${order.tableNumber || '—'}` : 'Takeout'} · {mins}m
                      </span>
                    </div>
                    <ul className="kitchen-card__items">
                      {(order.items || []).map((item, idx) => (
                        <li key={idx}>
                          <span className="k-qty">{item.quantity || 1}×</span>
                          <span>{item.name || item.itemName}{item.remarks && <small className="k-item-remark">{item.remarks}</small>}</span>
                        </li>
                      ))}
                    </ul>
                    {order.notes && <p className="kitchen-card__note"><Icon name="note" /> {order.notes}</p>}
                    <div className="kitchen-card__actions">
                      {order.status === 'confirmed' && (
                        <button className="kbtn kbtn--primary" disabled={statusUpdatingId === order.id}
                          onClick={() => handleStatusChange(order.id, 'preparing')}><Icon name="play" /> Start Preparing</button>
                      )}
                      {order.status === 'preparing' && (
                        <button className="kbtn kbtn--primary" disabled={statusUpdatingId === order.id}
                          onClick={() => handleStatusChange(order.id, 'ready')}><Icon name="check" /> Mark Ready</button>
                      )}
                      {['Admin','Management'].includes(user.role) && order.paymentStatus==='unpaid' && (order.status === 'confirmed' || order.status === 'preparing') && (
                        <button className="kbtn kbtn--red" disabled={statusUpdatingId === order.id}
                          onClick={() => handleStatusChange(order.id, 'cancelled')}><Icon name="x" /> Cancel</button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )
        }
      </div>
    </div>
  );

  const renderMyOrders = () => (
    <div className="page-content">
      <div className="page-hero">
        <div>
          <h2 className="page-title">My Orders</h2>
          <p className="page-sub">Track your order status in real-time</p>
        </div>
      </div>
      <div className="card">
        {myOrders.length === 0
          ? <div className="card-empty"><Icon name="package" size={22} /><p>You haven&apos;t placed any orders yet.</p></div>
          : (
            <table className="orders-table">
              <thead>
                <tr><th>Order</th><th className="num">Items</th><th className="num">Total</th><th>Type</th><th>Payment</th><th>Status</th><th className="num">Time</th><th /></tr>
              </thead>
              <tbody>
                {myOrders.map(order => (
                  <tr key={order.id}>
                    <td className="order-num">{order.orderNumber || `#${order.id.slice(-6).toUpperCase()}`}</td>
                    <td className="num">{(order.items || []).length}</td>
                    <td className="num order-total">{currency(order.totalAmount)}</td>
                    <td>{order.orderType}</td>
                    <td><span className={`tag tag--${order.paymentStatus === 'paid' ? 'completed' : 'pending'}`}>{order.paymentStatus}</span></td>
                    <td><span className={`tag tag--${safeStatus(order.status)}`}>{order.status || 'pending'}</span></td>
                    <td className="num order-time">{fmtTime(order.createdAt)}</td>
                    <td><div className="tbl-actions">{order.paymentStatus === 'unpaid' && !['cancelled','completed'].includes(order.status) && (hostedMayaEnabled?<HostedMaya orderId={order.id}/>:<button className="tbl-btn tbl-btn--green" onClick={() => retryPayment(order)}>Sandbox simulation</button>)}<button className="tbl-btn" onClick={() => setReceiptOrder(order)}>View bill</button></div></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )
        }
      </div>
    </div>
  );

  const renderReports = () => (
    <div className="page-content">
      <div className="page-hero">
        <div>
          <h2 className="page-title">Reports</h2>
          <p className="page-sub">Sales data and analytics</p>
        </div>
        <button className="hero-btn hero-btn--outline" onClick={() => exportOrdersCSV(orders)}><Icon name="download" /> Export CSV</button>
      </div>

      <div className="dash-cards">
        {[
          { label: "Today's Orders",  val: dailyStats?.totalOrders ?? orders.length },
          { label: 'Completed',       val: dailyStats?.completedOrders ?? completedOrders.length },
          { label: 'Cancelled',       val: dailyStats?.cancelledOrders ?? orders.filter(o => o.status === 'cancelled').length },
          { label: 'Revenue',         val: currency(dailyStats?.totalRevenue ?? revenue) },
          { label: 'Avg. Order Value', val: currency(dailyStats?.averageOrderValue ?? 0) },
        ].map(s => (
          <div key={s.label} className="dash-card">
            <div className="dash-card__label">{s.label}</div>
            <div className="dash-card__val">{s.val}</div>
          </div>
        ))}
      </div>

      <div className="card report-comparison">
        <div><p className="dash-card__label">7-day comparison</p><h3>{periodComparison?.changePercent == null ? 'Collecting a baseline' : `${periodComparison.changePercent >= 0 ? '+' : ''}${periodComparison.changePercent.toFixed(1)}%`}</h3><p>Current {currency(periodComparison?.currentRevenue)} · Previous {currency(periodComparison?.previousRevenue)}</p></div>
        <p>{createSalesInsight({ dailyStats, bestSellers, comparison: periodComparison })}</p>
      </div>

      {bestSellers.length > 0 && (
        <div className="card">
          <div className="card-head">
            <h3 className="card-title">Top Sellers</h3>
          </div>
          <ol className="top-sellers">
            {bestSellers.map((item, i) => (
              <li key={i}>
                <span className="ts-rank">{i + 1}</span>
                <span className="ts-name">{item.name}</span>
                <span className="ts-val">{item.quantity} sold · {currency(item.revenue)}</span>
              </li>
            ))}
          </ol>
        </div>
      )}
    </div>
  );

  const renderPage = () => {
    switch (activePage) {
      case 'dashboard': return renderDashboard();
      case 'pos':       return renderPOS();
      case 'orders':    return renderOrders();
      case 'menu':      return renderMenu();
      case 'kitchen':   return renderKitchen();
      case 'myorders':  return renderMyOrders();
      case 'reports':   return <ResearchReports />;
      case 'tables':    return <TableSessions orders={orders} />;
      case 'settings':  return <AdminSettings user={user} />;
      case 'requests':  return <StaffRequests />;
      default:          return renderDashboard();
    }
  };

  // ── Main UI ──────────────────────────────────────────────────
  return (
    <div className="app-shell">
      <Toaster position="top-right" toastOptions={{ className: 'df-toast' }} />

      <MayaCheckout
        open={mayaOpen}
        onClose={() => setMayaOpen(false)}
        orderId={pendingOrderId}
        total={pendingOrderTotal}
        onPaymentComplete={({ method = 'CARD', settled = true } = {}) => {
          toast.success(settled ? 'Payment recorded.' : 'Order placed — pay at the counter.');
          if (pendingReceipt) {
            setReceiptOrder({
              ...pendingReceipt,
              paymentStatus: settled ? 'paid' : 'unpaid',
              paymentMethod: method,
            });
          }
          setMayaOpen(false);
        }}
      />

      <DishDetails item={selectedDish} onClose={() => setSelectedDish(null)} onAdd={addToCart} />
      <ReceiptPanel order={orders.find(order=>order.id===receiptOrder?.id)||receiptOrder} onClose={() => setReceiptOrder(null)} />

      {/* ── Sidebar ── */}
      <aside className="sidebar">
        <div className="sidebar__brand">
          <div className="sidebar__logo"><Icon name="utensils" size={20} /></div>
          <span className="sidebar__name">DineFlow</span>
        </div>

        <nav className="sidebar__nav">
          <p className="sidebar__section">Main</p>
          {navItems.filter(n => ['dashboard','pos','orders'].includes(n.id)).map(n => (
            <button key={n.id} className={`nav-item ${activePage === n.id ? 'nav-item--active' : ''}`} onClick={() => setActivePage(n.id)}>
              <span className="nav-item__icon"><Icon name={n.icon} /></span>
              <span>{n.label}</span>
            </button>
          ))}

          {navItems.some(n => ['menu','kitchen','myorders','reports','requests','tables','settings'].includes(n.id)) && (
            <p className="sidebar__section">Management</p>
          )}
          {navItems.filter(n => ['menu','kitchen','myorders','reports','requests','tables','settings'].includes(n.id)).map(n => (
            <button key={n.id} className={`nav-item ${activePage === n.id ? 'nav-item--active' : ''}`} onClick={() => setActivePage(n.id)}>
              <span className="nav-item__icon"><Icon name={n.icon} /></span>
              <span>{n.label}</span>
            </button>
          ))}
        </nav>

        <div className="sidebar__user">
          <div className="sidebar__avatar">{roleInitial}</div>
          <div className="sidebar__user-info">
            <span className="sidebar__user-name">{user.name}</span>
            <span className={`sidebar__role-badge role--${(user.role || '').toLowerCase()}`}>{user.role}</span>
          </div>
          <button className="sidebar__logout" title="Sign out" aria-label="Sign out" onClick={handleSecureLogout}><Icon name="logout" /></button>
        </div>
      </aside>

      {/* ── Main area ── */}
      <main className="main-area">
        {renderPage()}
      </main>
      {user.role !== 'Kitchen' && <AssistantPanel key={user.id} menu={menu} orders={orders.filter(order=>order.customerId===user.id)} user={user} />}
    </div>
  );
}

export default App;

