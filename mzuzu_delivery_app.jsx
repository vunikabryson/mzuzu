import { useState, useEffect } from "react";

// Backend integration settings
const savedApiBase = typeof window !== 'undefined' ? localStorage.getItem('mz_api_base') : null;
const API_BASE = (savedApiBase !== null ? savedApiBase : (typeof window !== 'undefined' ? window.location.origin : '')) .replace(/\/$/, '');
const BACKEND_MODE = true; // set to true to attempt backend connectivity (falls back if calls fail)

let _token = typeof window !== 'undefined' ? localStorage.getItem('mz_token') : null;
function setToken(t){ _token = t; if(typeof window !== 'undefined'){ if(t) localStorage.setItem('mz_token',t); else localStorage.removeItem('mz_token'); } }

async function apiCall(method, path, body, isForm=false){
  if(!BACKEND_MODE) throw new Error('Backend mode disabled');
  const headers = { 'Accept': 'application/json' };
  if(_token) headers['Authorization'] = 'Bearer ' + _token;
  if(!isForm) headers['Content-Type'] = 'application/json';
  const opts = { method, headers };
  if(body) opts.body = isForm ? body : JSON.stringify(body);
  const url = (path.startsWith('http') ? path : API_BASE + path);
  const res = await fetch(url, opts);
  const text = await res.text().catch(()=>null);
  let data = null;
  try{ data = text ? JSON.parse(text) : null; }catch(e){ data = null; }
  if(!res.ok){ const msg = (data && (data.error||data.message)) || `HTTP ${res.status} ${res.statusText}`; throw new Error(msg); }
  return data !== null ? data : { text };
}

const API = {
  async login(email, pw){ const d = await apiCall('POST','/api/auth/login',{ email, password: pw }); if(d?.token) setToken(d.token); return d; },
  async register(payload){ const d = await apiCall('POST','/api/auth/register', payload); if(d?.token) setToken(d.token); return d; },
  async me(){ return apiCall('GET','/api/auth/me'); },
  async orders(){ return apiCall('GET','/api/orders'); },
  async clientOrders(){ return apiCall('GET','/api/orders/my'); },
  async availableOrders(){ return apiCall('GET','/api/orders/available'); },
  async adminOrders(){ return apiCall('GET','/api/admin/orders'); },
  async placeOrder(payload){ return apiCall('POST','/api/orders', payload); },
  async acceptOrder(id){ return apiCall('POST',`/api/orders/${id}/accept`); },
  async updateOrderStatus(id, status){ return apiCall('PUT',`/api/orders/${id}/status`, { status }); },
  async adminUpdateOrderStatus(id, status){ return apiCall('PUT',`/api/admin/orders/${id}/status`, { status }); },
  async adminUsers(){ return apiCall('GET','/api/admin/users'); },
};

function normalizeOrder(o){
  if(!o) return o;
  return {
    id: o.id || o.order_id || o.orderId,
    clientId: o.client_id || o.clientId || o.clientId,
    clientName: o.client_name || o.clientName || o.client_name,
    riderId: o.rider_id || o.riderId || o.rider_id,
    riderName: o.rider_name || o.riderName || o.rider_name,
    pickup: o.pickup,
    dropoff: o.dropoff,
    items: o.items,
    status: o.status,
    price: o.total_price || o.price || o.fare || 0,
    distance: (o.distance || o.dist || '') + (typeof o.distance === 'number' ? ' km' : ''),
    createdAt: o.created_at || o.createdAt || new Date().toLocaleString(),
    updatedAt: o.updated_at || o.updatedAt || new Date().toLocaleString(),
    raw: o,
  };
}

const initialUsers = [
  { id: 1, name: "Admin User", email: "admin@mzuzudelivery.mw", password: "admin123", role: "admin", phone: "+265 999 000 001", createdAt: "2024-01-01" },
  { id: 2, name: "Chisomo Banda", email: "chisomo@gmail.com", password: "pass123", role: "client", phone: "+265 888 123 456", createdAt: "2024-03-10" },
  { id: 3, name: "Kondwani Phiri", email: "kondwani@gmail.com", password: "pass123", role: "rider", phone: "+265 888 654 321", createdAt: "2024-02-15", status: "active", bike: "Honda CG 125", rating: 4.8, deliveries: 142 },
  { id: 4, name: "Tadala Mwale", email: "tadala@gmail.com", password: "pass123", role: "rider", phone: "+265 888 111 222", createdAt: "2024-04-01", status: "active", bike: "Yamaha YBR", rating: 4.6, deliveries: 89 },
];

const initialOrders = [
  { id: "MZZ001", clientId: 2, clientName: "Chisomo Banda", riderId: 3, riderName: "Kondwani Phiri", pickup: "Shoprite Mzuzu", dropoff: "Katoto Area", items: "Groceries", status: "delivered", price: 2500, distance: "3.2 km", createdAt: "2024-05-20 09:30", updatedAt: "2024-05-20 10:15" },
  { id: "MZZ002", clientId: 2, clientName: "Chisomo Banda", riderId: null, riderName: null, pickup: "Mzuzu Market", dropoff: "Luwinga", items: "Food package", status: "pending", price: 1800, distance: "2.1 km", createdAt: "2024-05-28 11:00", updatedAt: "2024-05-28 11:00" },
];

const AREAS = ["Katoto", "Luwinga", "Chibanja", "Mapelera", "Mzuzu City Centre", "Mzimu wa Anthu", "Zolozolo", "Lupaso", "Nkhorongo", "Chiputula"];
const PICKUP_POINTS = ["Shoprite Mzuzu", "Mzuzu Market", "Mzuzu Hotel", "Peoples Supermarket", "Shoppers Mall", "Mzuzu Bus Depot", "Cityview Mall", "Mzuzu Airport Road"];

function App() {
  const [users, setUsers] = useState(initialUsers);
  const [orders, setOrders] = useState(initialOrders);
  const [currentUser, setCurrentUser] = useState(null);
  const [page, setPage] = useState("login");
  const [authMode, setAuthMode] = useState("login");
  const [notification, setNotification] = useState(null);

  useEffect(()=>{
    // try restoring session and loading server data
    let mounted = true;
    (async ()=>{
      if(!_token) return;
      try{
        const me = await API.me();
        if(me?.user && mounted){ setCurrentUser(me.user); setPage(me.user.role || 'login'); }
        // load orders based on role
        if(me?.user){
          let od = null;
          if(me.user.role === 'client') od = await API.clientOrders().catch(()=>null);
          else if(me.user.role === 'rider') od = await API.availableOrders().catch(()=>null);
          else if(me.user.role === 'admin') od = await API.adminOrders().catch(()=>null);
          if(od?.orders && mounted) setOrders(od.orders.map(normalizeOrder));
        } else {
          const od = await API.orders().catch(()=>null);
          if(od?.orders && mounted) setOrders(od.orders.map(normalizeOrder));
        }
        const ud = await API.adminUsers().catch(()=>null);
        if(ud?.users && mounted) setUsers(ud.users);
      }catch(e){ console.warn('session restore failed',e.message||e); }
    })();
    return ()=>{ mounted=false; };
  }, []);

  function notify(msg, type = "success") {
    setNotification({ msg, type });
    setTimeout(() => setNotification(null), 3000);
  }

  async function login(email, password) {
    if(!email || !password) return notify('Enter email and password','error');
    if(BACKEND_MODE){
      try{
        const data = await API.login(email, password);
        const u = data?.user || (data?.token ? (await API.me()).user : null);
        if(!u) return notify('Login failed: no user returned','error');
        setCurrentUser(u);
        setPage(u.role);
        // refresh server data (role-aware)
        try{
          let od = null;
          if(u.role === 'client') od = await API.clientOrders().catch(()=>null);
          else if(u.role === 'rider') od = await API.availableOrders().catch(()=>null);
          else if(u.role === 'admin') od = await API.adminOrders().catch(()=>null);
          if(od?.orders) setOrders(od.orders.map(normalizeOrder));
        }catch(e){ /* ignore */ }
        const ud = await API.adminUsers().catch(()=>null);
        if(ud?.users) setUsers(ud.users);
        notify(`Welcome back, ${u.name.split(" ")[0]}!`);
      }catch(err){ notify(err.message||'Login failed','error'); }
      return;
    }
    const user = users.find(u => u.email === email && u.password === password);
    if (!user) return notify("Invalid email or password", "error");
    setCurrentUser(user);
    setPage(user.role);
    notify(`Welcome back, ${user.name.split(" ")[0]}!`);
  }

  async function register(data) {
    if(BACKEND_MODE){
      try{
        const d = await API.register(data);
        const u = d?.user || null;
        if(u){ setCurrentUser(u); setPage(u.role); notify('Account created! Awaiting admin approval'); }
        else notify('Registration succeeded but no profile returned','success');
      }catch(err){ notify(err.message||'Registration failed','error'); }
      return;
    }
    if (users.find(u => u.email === data.email)) return notify("Email already registered", "error");
    const newUser = { ...data, id: Date.now(), createdAt: new Date().toISOString().split("T")[0], ...(data.role === "rider" ? { status: "pending", deliveries: 0, rating: 0 } : {}) };
    setUsers(prev => [...prev, newUser]);
    setCurrentUser(newUser);
    setPage(newUser.role);
    notify(`Account created! Welcome, ${newUser.name.split(" ")[0]}!`);
  }

  function logout() {
    setCurrentUser(null);
    setPage("login");
    setToken(null);
    notify("Logged out successfully");
  }

  function placeOrder(orderData) {
    if(BACKEND_MODE){
      (async ()=>{
        try{
          const d = await API.placeOrder({ ...orderData });
          if(d?.order){ setOrders(prev=>[...prev,normalizeOrder(d.order)]); notify('Order placed!'); }
          else notify('Order placed (no server order returned)','success');
        }catch(err){ notify(err.message||'Place order failed','error'); }
      })();
      return;
    }
    const newOrder = {
      id: "MZZ" + String(orders.length + 1).padStart(3, "0"),
      clientId: currentUser.id,
      clientName: currentUser.name,
      riderId: null,
      riderName: null,
      status: "pending",
      createdAt: new Date().toLocaleString("en-GB"),
      updatedAt: new Date().toLocaleString("en-GB"),
      ...orderData,
    };
    setOrders(prev => [...prev, newOrder]);
    notify("Order placed! Riders will be notified.");
  }

  function acceptOrder(orderId) {
    if(BACKEND_MODE){
      (async ()=>{
        try{
          const d = await API.acceptOrder(orderId);
          if(d?.order) setOrders(prev=>prev.map(o=>o.id===orderId?normalizeOrder(d.order):o));
          else setOrders(prev => prev.map(o => o.id === orderId ? { ...o, riderId: currentUser.id, riderName: currentUser.name, status: "accepted", updatedAt: new Date().toLocaleString("en-GB") } : o));
          notify('Order accepted!');
        }catch(err){ notify(err.message||'Accept failed','error'); }
      })();
      return;
    }
    setOrders(prev => prev.map(o => o.id === orderId ? { ...o, riderId: currentUser.id, riderName: currentUser.name, status: "accepted", updatedAt: new Date().toLocaleString("en-GB") } : o));
    notify("Order accepted!");
  }

  function updateOrderStatus(orderId, status) {
    if(BACKEND_MODE){
      (async ()=>{
        try{
          const d = (currentUser?.role === 'admin') ? await API.adminUpdateOrderStatus(orderId, status) : await API.updateOrderStatus(orderId, status);
          if(d?.order) setOrders(prev=>prev.map(o=>o.id===orderId?normalizeOrder(d.order):o));
          else setOrders(prev => prev.map(o => o.id === orderId ? { ...o, status, updatedAt: new Date().toLocaleString("en-GB") } : o));
          notify(`Order marked as ${status}`);
        }catch(err){ notify(err.message||`Update failed: ${status}`,'error'); }
      })();
      return;
    }
    setOrders(prev => prev.map(o => o.id === orderId ? { ...o, status, updatedAt: new Date().toLocaleString("en-GB") } : o));
    notify(`Order marked as ${status}`);
  }

  function deleteOrder(orderId) {
    setOrders(prev => prev.filter(o => o.id !== orderId));
    notify("Order removed");
  }

  function updateUserStatus(userId, status) {
    setUsers(prev => prev.map(u => u.id === userId ? { ...u, status } : u));
    notify("Rider status updated");
  }

  return (
    <div style={{ minHeight: "100vh", background: "var(--color-background-tertiary)", fontFamily: "'Sora', sans-serif" }}>
      <link href="https://fonts.googleapis.com/css2?family=Sora:wght@400;500;600;700&display=swap" rel="stylesheet" />
      {notification && (
        <div style={{ position: "fixed", top: 20, right: 20, zIndex: 9999, background: notification.type === "error" ? "#A32D2D" : "#0F6E56", color: "#fff", padding: "12px 20px", borderRadius: 10, fontSize: 14, fontWeight: 500, boxShadow: "0 4px 20px rgba(0,0,0,0.15)", maxWidth: 300 }}>
          {notification.msg}
        </div>
      )}
      {!currentUser && <AuthPage authMode={authMode} setAuthMode={setAuthMode} onLogin={login} onRegister={register} />}
      {currentUser?.role === "client" && <ClientDashboard user={currentUser} orders={orders.filter(o => o.clientId === currentUser.id)} onPlaceOrder={placeOrder} onLogout={logout} />}
      {currentUser?.role === "rider" && <RiderDashboard user={currentUser} orders={orders} onAccept={acceptOrder} onUpdateStatus={updateOrderStatus} onLogout={logout} />}
      {currentUser?.role === "admin" && <AdminDashboard users={users} orders={orders} onUpdateUserStatus={updateUserStatus} onDeleteOrder={deleteOrder} onUpdateOrderStatus={updateOrderStatus} onLogout={logout} />}
    </div>
  );
}

function AuthPage({ authMode, setAuthMode, onLogin, onRegister }) {
  const [form, setForm] = useState({ name: "", email: "", password: "", phone: "", role: "client", bike: "" });
  const [showPass, setShowPass] = useState(false);
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  function handleSubmit() {
    if (authMode === "login") {
      if (!form.email || !form.password) return;
      onLogin(form.email, form.password);
    } else {
      if (!form.name || !form.email || !form.password || !form.phone) return;
      onRegister(form);
    }
  }

  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "stretch" }}>
      <div style={{ flex: 1, background: "#0F6E56", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 40, position: "relative", overflow: "hidden" }}>
        <div style={{ position: "absolute", top: -80, left: -80, width: 300, height: 300, borderRadius: "50%", border: "60px solid rgba(255,255,255,0.07)" }} />
        <div style={{ position: "absolute", bottom: -60, right: -60, width: 250, height: 250, borderRadius: "50%", border: "50px solid rgba(255,255,255,0.07)" }} />
        <div style={{ textAlign: "center", color: "#fff", position: "relative", zIndex: 1 }}>
          <div style={{ fontSize: 64, marginBottom: 16 }}>🚴</div>
          <h1 style={{ fontSize: 32, fontWeight: 700, margin: "0 0 8px", letterSpacing: -1 }}>Mzuzu Delivery</h1>
          <p style={{ fontSize: 16, opacity: 0.8, margin: "0 0 40px" }}>Fast. Reliable. Local.</p>
          <div style={{ display: "flex", flexDirection: "column", gap: 16, textAlign: "left" }}>
            {[["🏙️", "Serving all Mzuzu areas"], ["⚡", "Deliveries in under 45 mins"], ["💳", "Pay via Airtel Money or Cash"]].map(([icon, text]) => (
              <div key={text} style={{ display: "flex", alignItems: "center", gap: 12, background: "rgba(255,255,255,0.1)", padding: "12px 16px", borderRadius: 10 }}>
                <span style={{ fontSize: 20 }}>{icon}</span>
                <span style={{ fontSize: 14, opacity: 0.9 }}>{text}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", padding: 40, background: "var(--color-background-primary)" }}>
        <div style={{ width: "100%", maxWidth: 400 }}>
          <h2 style={{ fontSize: 26, fontWeight: 700, marginBottom: 6, color: "var(--color-text-primary)" }}>{authMode === "login" ? "Sign In" : "Create Account"}</h2>
          <p style={{ fontSize: 14, color: "var(--color-text-secondary)", marginBottom: 28 }}>
            {authMode === "login" ? "Don't have an account? " : "Already have an account? "}
            <button onClick={() => setAuthMode(authMode === "login" ? "register" : "login")} style={{ background: "none", border: "none", color: "#0F6E56", fontWeight: 600, cursor: "pointer", padding: 0, fontSize: 14 }}>
              {authMode === "login" ? "Register" : "Sign In"}
            </button>
          </p>

          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {authMode === "register" && (
              <Input label="Full Name" value={form.name} onChange={v => set("name", v)} placeholder="e.g. Chisomo Banda" />
            )}
            <Input label="Email Address" value={form.email} onChange={v => set("email", v)} placeholder="you@gmail.com" type="email" />
            {authMode === "register" && (
              <Input label="Phone Number" value={form.phone} onChange={v => set("phone", v)} placeholder="+265 888 000 000" />
            )}
            <div>
              <label style={{ display: "block", fontSize: 13, fontWeight: 500, marginBottom: 6, color: "var(--color-text-secondary)" }}>Password</label>
              <div style={{ position: "relative" }}>
                <input type={showPass ? "text" : "password"} value={form.password} onChange={e => set("password", e.target.value)} placeholder="••••••••" style={{ width: "100%", boxSizing: "border-box", padding: "10px 40px 10px 14px", border: "1px solid var(--color-border-secondary)", borderRadius: 8, fontSize: 14, background: "var(--color-background-secondary)", color: "var(--color-text-primary)" }} />
                <button onClick={() => setShowPass(p => !p)} style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", color: "var(--color-text-secondary)", fontSize: 16 }}>{showPass ? "🙈" : "👁️"}</button>
              </div>
            </div>

            {authMode === "register" && (
              <>
                <div>
                  <label style={{ display: "block", fontSize: 13, fontWeight: 500, marginBottom: 6, color: "var(--color-text-secondary)" }}>I am registering as</label>
                  <div style={{ display: "flex", gap: 10 }}>
                    {["client", "rider"].map(r => (
                      <button key={r} onClick={() => set("role", r)} style={{ flex: 1, padding: "10px 0", border: `2px solid ${form.role === r ? "#0F6E56" : "var(--color-border-tertiary)"}`, borderRadius: 8, background: form.role === r ? "#E1F5EE" : "transparent", color: form.role === r ? "#0F6E56" : "var(--color-text-secondary)", fontWeight: 600, cursor: "pointer", fontSize: 13, textTransform: "capitalize" }}>
                        {r === "client" ? "📦 Client" : "🚴 Rider"}
                      </button>
                    ))}
                  </div>
                </div>
                {form.role === "rider" && (
                  <Input label="Bike Model" value={form.bike} onChange={v => set("bike", v)} placeholder="e.g. Honda CG 125" />
                )}
              </>
            )}

            {authMode === "login" && (
              <div style={{ background: "#E1F5EE", borderRadius: 8, padding: "10px 14px", fontSize: 12, color: "#0F6E56" }}>
                <strong>Demo logins:</strong> admin@mzuzudelivery.mw / chisomo@gmail.com / kondwani@gmail.com — all use password <strong>pass123</strong> (admin uses <strong>admin123</strong>)
              </div>
            )}

            <button onClick={handleSubmit} style={{ background: "#0F6E56", color: "#fff", border: "none", borderRadius: 10, padding: "14px 0", fontWeight: 700, fontSize: 15, cursor: "pointer", marginTop: 4, fontFamily: "inherit" }}>
              {authMode === "login" ? "Sign In →" : "Create Account →"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function Input({ label, value, onChange, placeholder, type = "text" }) {
  return (
    <div>
      <label style={{ display: "block", fontSize: 13, fontWeight: 500, marginBottom: 6, color: "var(--color-text-secondary)" }}>{label}</label>
      <input type={type} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} style={{ width: "100%", boxSizing: "border-box", padding: "10px 14px", border: "1px solid var(--color-border-secondary)", borderRadius: 8, fontSize: 14, background: "var(--color-background-secondary)", color: "var(--color-text-primary)" }} />
    </div>
  );
}

function NavBar({ user, onLogout, tabs, activeTab, setActiveTab, color = "#0F6E56" }) {
  const roleLabel = { client: "📦 Client", rider: "🚴 Rider", admin: "🛡️ Admin" };
  return (
    <header style={{ background: color, color: "#fff", padding: "0 24px", display: "flex", alignItems: "center", justifyContent: "space-between", height: 60, position: "sticky", top: 0, zIndex: 100 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
        <span style={{ fontWeight: 700, fontSize: 17 }}>🚴 Mzuzu Delivery</span>
        <nav style={{ display: "flex", gap: 4 }}>
          {tabs.map(t => (
            <button key={t} onClick={() => setActiveTab(t)} style={{ background: activeTab === t ? "rgba(255,255,255,0.2)" : "none", border: "none", color: "#fff", padding: "6px 14px", borderRadius: 8, cursor: "pointer", fontSize: 13, fontWeight: activeTab === t ? 600 : 400, fontFamily: "inherit" }}>{t}</button>
          ))}
        </nav>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontSize: 13, fontWeight: 600 }}>{user.name}</div>
          <div style={{ fontSize: 11, opacity: 0.75 }}>{roleLabel[user.role]}</div>
        </div>
        <button onClick={onLogout} style={{ background: "rgba(255,255,255,0.15)", border: "none", color: "#fff", padding: "6px 14px", borderRadius: 8, cursor: "pointer", fontSize: 12, fontFamily: "inherit" }}>Logout</button>
      </div>
    </header>
  );
}

const statusColor = { pending: "#BA7517", accepted: "#185FA5", "in-transit": "#533AB7", delivered: "#0F6E56", cancelled: "#A32D2D" };
const statusBg = { pending: "#FAEEDA", accepted: "#E6F1FB", "in-transit": "#EEEDFE", delivered: "#E1F5EE", cancelled: "#FCEBEB" };

function StatusBadge({ status }) {
  return <span style={{ background: statusBg[status] || "#F1EFE8", color: statusColor[status] || "#444", padding: "3px 10px", borderRadius: 20, fontSize: 12, fontWeight: 600 }}>{status}</span>;
}

function OrderCard({ order, actions }) {
  return (
    <div style={{ background: "var(--color-background-primary)", border: "0.5px solid var(--color-border-tertiary)", borderRadius: 12, padding: "16px 20px", marginBottom: 12 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
        <div>
          <span style={{ fontWeight: 700, fontSize: 15 }}>{order.id}</span>
          <div style={{ fontSize: 12, color: "var(--color-text-secondary)", marginTop: 2 }}>{order.createdAt}</div>
        </div>
        <StatusBadge status={order.status} />
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, fontSize: 13, marginBottom: 12 }}>
        <div><span style={{ color: "var(--color-text-secondary)" }}>📍 From:</span> <strong>{order.pickup}</strong></div>
        <div><span style={{ color: "var(--color-text-secondary)" }}>🏁 To:</span> <strong>{order.dropoff}</strong></div>
        <div><span style={{ color: "var(--color-text-secondary)" }}>📦 Items:</span> {order.items}</div>
        <div><span style={{ color: "var(--color-text-secondary)" }}>📏 Distance:</span> {order.distance}</div>
        {order.riderName && <div><span style={{ color: "var(--color-text-secondary)" }}>🚴 Rider:</span> {order.riderName}</div>}
        <div><span style={{ color: "var(--color-text-secondary)" }}>💰 Price:</span> <strong style={{ color: "#0F6E56" }}>MWK {order.price.toLocaleString()}</strong></div>
      </div>
      {actions && <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>{actions}</div>}
    </div>
  );
}

function Btn({ label, onClick, color = "#0F6E56", outline }) {
  return (
    <button onClick={onClick} style={{ padding: "7px 16px", borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit", background: outline ? "transparent" : color, color: outline ? color : "#fff", border: `1.5px solid ${color}` }}>
      {label}
    </button>
  );
}

function ClientDashboard({ user, orders, onPlaceOrder, onLogout }) {
  const [tab, setTab] = useState("My Orders");
  const tabs = ["My Orders", "New Order"];
  const [form, setForm] = useState({ pickup: "", dropoff: "", items: "", price: 1500, distance: "2.0 km" });
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const prices = { "1.0 km": 1200, "2.0 km": 1800, "3.0 km": 2500, "4.0 km": 3200, "5.0 km": 4000, "6+ km": 5000 };

  function submit() {
    if (!form.pickup || !form.dropoff || !form.items) return alert("Please fill all fields");
    onPlaceOrder({ ...form, price: prices[form.distance] || 1500 });
    setForm({ pickup: "", dropoff: "", items: "", price: 1500, distance: "2.0 km" });
    setTab("My Orders");
  }

  const stats = [
    { label: "Total Orders", value: orders.length },
    { label: "Delivered", value: orders.filter(o => o.status === "delivered").length },
    { label: "Pending", value: orders.filter(o => o.status === "pending").length },
    { label: "Total Spent", value: `MWK ${orders.reduce((s, o) => s + o.price, 0).toLocaleString()}` },
  ];

  return (
    <div>
      <NavBar user={user} onLogout={onLogout} tabs={tabs} activeTab={tab} setActiveTab={setTab} color="#0F6E56" />
      <div style={{ maxWidth: 820, margin: "0 auto", padding: "24px 16px" }}>
        {tab === "My Orders" && (
          <>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 12, marginBottom: 24 }}>
              {stats.map(s => (
                <div key={s.label} style={{ background: "var(--color-background-primary)", borderRadius: 10, padding: "14px 16px", border: "0.5px solid var(--color-border-tertiary)", textAlign: "center" }}>
                  <div style={{ fontSize: 22, fontWeight: 700, color: "#0F6E56" }}>{s.value}</div>
                  <div style={{ fontSize: 12, color: "var(--color-text-secondary)", marginTop: 4 }}>{s.label}</div>
                </div>
              ))}
            </div>
            <h3 style={{ fontWeight: 600, marginBottom: 14 }}>Your Orders</h3>
            {orders.length === 0 ? <Empty msg="No orders yet. Place your first delivery!" /> : orders.map(o => <OrderCard key={o.id} order={o} />)}
            <div style={{ textAlign: "center", marginTop: 20 }}>
              <Btn label="+ Place New Order" onClick={() => setTab("New Order")} />
            </div>
          </>
        )}
        {tab === "New Order" && (
          <div style={{ background: "var(--color-background-primary)", borderRadius: 14, border: "0.5px solid var(--color-border-tertiary)", padding: "28px 32px", maxWidth: 520, margin: "0 auto" }}>
            <h2 style={{ margin: "0 0 20px", fontWeight: 700 }}>📦 Place a Delivery Order</h2>
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <div>
                <label style={{ fontSize: 13, fontWeight: 500, color: "var(--color-text-secondary)", marginBottom: 6, display: "block" }}>Pickup Location</label>
                <select value={form.pickup} onChange={e => set("pickup", e.target.value)} style={{ width: "100%", padding: "10px 14px", border: "1px solid var(--color-border-secondary)", borderRadius: 8, fontSize: 14, background: "var(--color-background-secondary)", color: "var(--color-text-primary)" }}>
                  <option value="">Select pickup point…</option>
                  {PICKUP_POINTS.map(p => <option key={p}>{p}</option>)}
                </select>
              </div>
              <div>
                <label style={{ fontSize: 13, fontWeight: 500, color: "var(--color-text-secondary)", marginBottom: 6, display: "block" }}>Dropoff Area</label>
                <select value={form.dropoff} onChange={e => set("dropoff", e.target.value)} style={{ width: "100%", padding: "10px 14px", border: "1px solid var(--color-border-secondary)", borderRadius: 8, fontSize: 14, background: "var(--color-background-secondary)", color: "var(--color-text-primary)" }}>
                  <option value="">Select area…</option>
                  {AREAS.map(a => <option key={a}>{a}</option>)}
                </select>
              </div>
              <Input label="What are you sending?" value={form.items} onChange={v => set("items", v)} placeholder="e.g. Food, documents, parcel…" />
              <div>
                <label style={{ fontSize: 13, fontWeight: 500, color: "var(--color-text-secondary)", marginBottom: 6, display: "block" }}>Estimated Distance</label>
                <select value={form.distance} onChange={e => set("distance", e.target.value)} style={{ width: "100%", padding: "10px 14px", border: "1px solid var(--color-border-secondary)", borderRadius: 8, fontSize: 14, background: "var(--color-background-secondary)", color: "var(--color-text-primary)" }}>
                  {Object.keys(prices).map(d => <option key={d}>{d}</option>)}
                </select>
              </div>
              <div style={{ background: "#E1F5EE", borderRadius: 10, padding: "16px 20px", textAlign: "center" }}>
                <div style={{ fontSize: 13, color: "#0F6E56", marginBottom: 4 }}>Delivery Fee</div>
                <div style={{ fontSize: 28, fontWeight: 700, color: "#0F6E56" }}>MWK {(prices[form.distance] || 1500).toLocaleString()}</div>
                <div style={{ fontSize: 12, color: "#0F6E56", opacity: 0.7, marginTop: 4 }}>Pay cash or Airtel Money on delivery</div>
              </div>
              <button onClick={submit} style={{ background: "#0F6E56", color: "#fff", border: "none", borderRadius: 10, padding: "14px 0", fontWeight: 700, fontSize: 15, cursor: "pointer", fontFamily: "inherit" }}>
                Confirm Order →
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function RiderDashboard({ user, orders, onAccept, onUpdateStatus, onLogout }) {
  const [tab, setTab] = useState("Available");
  const tabs = ["Available", "My Deliveries", "Profile"];

  const available = orders.filter(o => o.status === "pending");
  const mine = orders.filter(o => o.riderId === user.id);
  const active = mine.filter(o => !["delivered", "cancelled"].includes(o.status));
  const done = mine.filter(o => o.status === "delivered");

  return (
    <div>
      <NavBar user={user} onLogout={onLogout} tabs={tabs} activeTab={tab} setActiveTab={setTab} color="#185FA5" />
      <div style={{ maxWidth: 820, margin: "0 auto", padding: "24px 16px" }}>
        {tab === "Available" && (
          <>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, marginBottom: 24 }}>
              {[{ label: "Available Orders", value: available.length }, { label: "Active Rides", value: active.length }, { label: "Completed", value: done.length }].map(s => (
                <div key={s.label} style={{ background: "var(--color-background-primary)", borderRadius: 10, padding: "14px 16px", border: "0.5px solid var(--color-border-tertiary)", textAlign: "center" }}>
                  <div style={{ fontSize: 24, fontWeight: 700, color: "#185FA5" }}>{s.value}</div>
                  <div style={{ fontSize: 12, color: "var(--color-text-secondary)", marginTop: 4 }}>{s.label}</div>
                </div>
              ))}
            </div>
            <h3 style={{ fontWeight: 600, marginBottom: 14 }}>Orders Waiting for a Rider</h3>
            {available.length === 0 ? <Empty msg="No available orders right now. Check back soon!" /> : available.map(o => (
              <OrderCard key={o.id} order={o} actions={[<Btn key="a" label="Accept Order" onClick={() => { onAccept(o.id); setTab("My Deliveries"); }} />]} />
            ))}
          </>
        )}
        {tab === "My Deliveries" && (
          <>
            {active.length > 0 && <><h3 style={{ fontWeight: 600, marginBottom: 14 }}>🔵 Active Deliveries</h3>{active.map(o => <OrderCard key={o.id} order={o} actions={[
              o.status === "accepted" && <Btn key="t" label="Mark In-Transit" onClick={() => onUpdateStatus(o.id, "in-transit")} color="#533AB7" />,
              o.status === "in-transit" && <Btn key="d" label="Mark Delivered ✓" onClick={() => onUpdateStatus(o.id, "delivered")} />,
            ].filter(Boolean)} />)}</>}
            {done.length > 0 && <><h3 style={{ fontWeight: 600, margin: "20px 0 14px" }}>✅ Completed Deliveries</h3>{done.map(o => <OrderCard key={o.id} order={o} />)}</>}
            {mine.length === 0 && <Empty msg="You haven't accepted any orders yet." />}
          </>
        )}
        {tab === "Profile" && (
          <div style={{ background: "var(--color-background-primary)", borderRadius: 14, border: "0.5px solid var(--color-border-tertiary)", padding: "28px 32px", maxWidth: 480, margin: "0 auto" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 24 }}>
              <div style={{ width: 60, height: 60, borderRadius: "50%", background: "#E6F1FB", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 24 }}>🚴</div>
              <div>
                <div style={{ fontWeight: 700, fontSize: 18 }}>{user.name}</div>
                <div style={{ fontSize: 13, color: "var(--color-text-secondary)" }}>{user.email}</div>
                <span style={{ background: "#E1F5EE", color: "#0F6E56", padding: "2px 10px", borderRadius: 20, fontSize: 12, fontWeight: 600 }}>{user.status || "active"}</span>
              </div>
            </div>
            {[["📞 Phone", user.phone], ["🚲 Bike", user.bike || "Not specified"], ["⭐ Rating", user.rating ? `${user.rating} / 5.0` : "New rider"], ["📦 Deliveries", (user.deliveries || 0) + " completed"], ["📅 Joined", user.createdAt]].map(([k, v]) => (
              <div key={k} style={{ display: "flex", justifyContent: "space-between", padding: "10px 0", borderBottom: "0.5px solid var(--color-border-tertiary)", fontSize: 14 }}>
                <span style={{ color: "var(--color-text-secondary)" }}>{k}</span>
                <span style={{ fontWeight: 500 }}>{v}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function AdminDashboard({ users, orders, onUpdateUserStatus, onDeleteOrder, onUpdateOrderStatus, onLogout }) {
  const [tab, setTab] = useState("Overview");
  const tabs = ["Overview", "Orders", "Riders", "Clients"];

  const riders = users.filter(u => u.role === "rider");
  const clients = users.filter(u => u.role === "client");
  const revenue = orders.filter(o => o.status === "delivered").reduce((s, o) => s + o.price, 0);

  const statCards = [
    { label: "Total Orders", value: orders.length, color: "#185FA5" },
    { label: "Delivered", value: orders.filter(o => o.status === "delivered").length, color: "#0F6E56" },
    { label: "Pending", value: orders.filter(o => o.status === "pending").length, color: "#BA7517" },
    { label: "Revenue (MWK)", value: revenue.toLocaleString(), color: "#533AB7" },
    { label: "Riders", value: riders.length, color: "#0F6E56" },
    { label: "Clients", value: clients.length, color: "#185FA5" },
  ];

  return (
    <div>
      <NavBar user={{ name: "Admin User", role: "admin" }} onLogout={onLogout} tabs={tabs} activeTab={tab} setActiveTab={setTab} color="#2C2C2A" />
      <div style={{ maxWidth: 960, margin: "0 auto", padding: "24px 16px" }}>
        {tab === "Overview" && (
          <>
            <h2 style={{ fontWeight: 700, marginBottom: 20 }}>🛡️ Admin Dashboard — Mzuzu Delivery</h2>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 12, marginBottom: 28 }}>
              {statCards.map(s => (
                <div key={s.label} style={{ background: "var(--color-background-primary)", borderRadius: 10, padding: "18px 20px", border: "0.5px solid var(--color-border-tertiary)" }}>
                  <div style={{ fontSize: 26, fontWeight: 700, color: s.color }}>{s.value}</div>
                  <div style={{ fontSize: 13, color: "var(--color-text-secondary)", marginTop: 4 }}>{s.label}</div>
                </div>
              ))}
            </div>
            <h3 style={{ fontWeight: 600, marginBottom: 14 }}>Recent Orders</h3>
            {orders.slice(-5).reverse().map(o => <OrderCard key={o.id} order={o} />)}
          </>
        )}

        {tab === "Orders" && (
          <>
            <h2 style={{ fontWeight: 700, marginBottom: 20 }}>All Orders</h2>
            {orders.length === 0 ? <Empty msg="No orders yet." /> : [...orders].reverse().map(o => (
              <OrderCard key={o.id} order={o} actions={[
                o.status !== "delivered" && o.status !== "cancelled" && <Btn key="d" label="Mark Delivered" onClick={() => onUpdateOrderStatus(o.id, "delivered")} />,
                o.status !== "cancelled" && <Btn key="c" label="Cancel" onClick={() => onUpdateOrderStatus(o.id, "cancelled")} color="#A32D2D" outline />,
                <Btn key="x" label="Delete" onClick={() => onDeleteOrder(o.id)} color="#A32D2D" />,
              ].filter(Boolean)} />
            ))}
          </>
        )}

        {tab === "Riders" && (
          <>
            <h2 style={{ fontWeight: 700, marginBottom: 20 }}>Registered Riders ({riders.length})</h2>
            {riders.length === 0 ? <Empty msg="No riders registered." /> : riders.map(r => (
              <div key={r.id} style={{ background: "var(--color-background-primary)", border: "0.5px solid var(--color-border-tertiary)", borderRadius: 12, padding: "16px 20px", marginBottom: 12, display: "flex", alignItems: "center", gap: 16 }}>
                <div style={{ width: 48, height: 48, borderRadius: "50%", background: "#E6F1FB", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20, flexShrink: 0 }}>🚴</div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 700, fontSize: 15 }}>{r.name}</div>
                  <div style={{ fontSize: 12, color: "var(--color-text-secondary)" }}>{r.email} · {r.phone}</div>
                  <div style={{ fontSize: 12, color: "var(--color-text-secondary)", marginTop: 2 }}>{r.bike || "Bike not set"} · {r.deliveries || 0} deliveries · ⭐ {r.rating || "N/A"}</div>
                </div>
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <StatusBadge status={r.status || "pending"} />
                  {r.status !== "active" && <Btn label="Approve" onClick={() => onUpdateUserStatus(r.id, "active")} />}
                  {r.status === "active" && <Btn label="Suspend" onClick={() => onUpdateUserStatus(r.id, "suspended")} color="#A32D2D" outline />}
                </div>
              </div>
            ))}
          </>
        )}

        {tab === "Clients" && (
          <>
            <h2 style={{ fontWeight: 700, marginBottom: 20 }}>Registered Clients ({clients.length})</h2>
            {clients.length === 0 ? <Empty msg="No clients registered." /> : clients.map(c => {
              const cOrders = orders.filter(o => o.clientId === c.id);
              return (
                <div key={c.id} style={{ background: "var(--color-background-primary)", border: "0.5px solid var(--color-border-tertiary)", borderRadius: 12, padding: "16px 20px", marginBottom: 12, display: "flex", alignItems: "center", gap: 16 }}>
                  <div style={{ width: 48, height: 48, borderRadius: "50%", background: "#E1F5EE", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: 16, color: "#0F6E56", flexShrink: 0 }}>
                    {c.name.split(" ").map(n => n[0]).join("")}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 700, fontSize: 15 }}>{c.name}</div>
                    <div style={{ fontSize: 12, color: "var(--color-text-secondary)" }}>{c.email} · {c.phone}</div>
                    <div style={{ fontSize: 12, color: "var(--color-text-secondary)", marginTop: 2 }}>Joined {c.createdAt} · {cOrders.length} orders · MWK {cOrders.reduce((s, o) => s + o.price, 0).toLocaleString()} spent</div>
                  </div>
                </div>
              );
            })}
          </>
        )}
      </div>
    </div>
  );
}

function Empty({ msg }) {
  return (
    <div style={{ textAlign: "center", padding: "60px 20px", color: "var(--color-text-secondary)" }}>
      <div style={{ fontSize: 48, marginBottom: 12 }}>📭</div>
      <div style={{ fontSize: 15 }}>{msg}</div>
    </div>
  );
}

export default App;
