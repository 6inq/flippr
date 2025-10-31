// Flippr - GE Flipping Helper for Alt1
// v1.3.0 - Chatbox monitoring for automatic order updates, real-time completion tracking

const el = id => document.getElementById(id);
const fmtGP = gp => gp.toLocaleString('en-US') + ' gp';
const GE_TAX_RATE = 0.01; // 1% tax on sales

// ---------- State ----------
let a1ready = false, inAlt1 = false;
let selectedBuyId = null, selectedSellId = null;

const buyOrders = [];
const sellOrders = [];
const completedFlips = [];
const watchlist = [];
const itemTracking = {}; // item name -> {buyPrice, sellPrice, profitPerItem, geLimit, lastSeen, history: []}
let geLimitsDB = {}; // Cache for GE limits database

// Statistics
const stats = {
  totalProfit: 0,
  totalInvested: 0,
  totalRevenue: 0,
  totalFlips: 0,
  profitableFlips: 0,
  bestFlip: 0,
  worstFlip: 0,
  startDate: Date.now()
};

// ---------- Load from storage ----------
function loadData() {
  try {
    const savedBuy = localStorage.getItem('flippr_buyOrders');
    const savedSell = localStorage.getItem('flippr_sellOrders');
    const savedCompleted = localStorage.getItem('flippr_completedFlips');
    const savedWatchlist = localStorage.getItem('flippr_watchlist');
    const savedStats = localStorage.getItem('flippr_stats');
    const savedItems = localStorage.getItem('flippr_itemTracking');

    if (savedBuy) Object.assign(buyOrders, JSON.parse(savedBuy));
    if (savedSell) Object.assign(sellOrders, JSON.parse(savedSell));
    if (savedCompleted) Object.assign(completedFlips, JSON.parse(savedCompleted));
    if (savedWatchlist) Object.assign(watchlist, JSON.parse(savedWatchlist));
    if (savedStats) Object.assign(stats, JSON.parse(savedStats));
    if (savedItems) Object.assign(itemTracking, JSON.parse(savedItems));
  } catch (e) {
    console.error('Failed to load data:', e);
  }
}

// ---------- Save to storage ----------
function saveData() {
  try {
    localStorage.setItem('flippr_buyOrders', JSON.stringify(buyOrders));
    localStorage.setItem('flippr_sellOrders', JSON.stringify(sellOrders));
    localStorage.setItem('flippr_completedFlips', JSON.stringify(completedFlips));
    localStorage.setItem('flippr_watchlist', JSON.stringify(watchlist));
    localStorage.setItem('flippr_stats', JSON.stringify(stats));
    localStorage.setItem('flippr_itemTracking', JSON.stringify(itemTracking));
  } catch (e) {
    console.error('Failed to save data:', e);
  }
}

// ---------- Generate IDs ----------
function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).substr(2);
}

// ---------- Tab Switching ----------
function setupTabs() {
  const tabs = document.querySelectorAll('.tab');
  console.log('Setting up tabs, found:', tabs.length);
  
  tabs.forEach(tab => {
    tab.addEventListener('click', function(e) {
      e.preventDefault();
      e.stopPropagation();
      
      const targetTab = this.dataset.tab;
      console.log('Tab clicked:', targetTab);
      
      if (!targetTab) {
        console.error('No data-tab attribute found on tab');
        return;
      }
      
      // Remove active from all tabs and hide all content
      document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.tab-content').forEach(c => {
        c.classList.remove('active');
        c.style.display = 'none'; // Force hide with inline style
      });
      
      // Activate clicked tab and show its content
      this.classList.add('active');
      const targetContent = el(`tab-${targetTab}`);
      console.log('Target content element:', targetContent);
      
      if (targetContent) {
        targetContent.classList.add('active');
        targetContent.style.display = 'block'; // Force show with inline style
      } else {
        console.error('Could not find tab-content element:', `tab-${targetTab}`);
      }
      
      renderLists();
      if (targetTab === 'items') renderItemTracking();
      if (targetTab === 'stats') {
        updateStats(); // Refresh stats when viewing stats tab
      }
    });
  });
}

// ---------- Add Buy Order ----------
el('addBuyOrder').addEventListener('click', () => {
  const item = el('buyItem').value.trim();
  const price = parseInt(el('buyPrice').value);
  const qty = parseInt(el('buyQty').value) || 1;

  if (!item || !price || price < 1) {
    alert('Please enter item name and valid buy price');
    return;
  }

  const order = {
    id: generateId(),
    item: item,
    price: price,
    qty: qty,
    bought: 0, // Track how many have been bought
    total: price * qty,
    timestamp: Date.now(),
    linkedSellId: null,
    completed: false
  };

  buyOrders.push(order);
  el('buyItem').value = '';
  el('buyPrice').value = '';
  el('buyQty').value = '1';
  saveData();
  renderLists();
  updateStats();
});

// ---------- Add Sell Order ----------
el('addSellOrder').addEventListener('click', () => {
  const item = el('sellItem').value.trim();
  const price = parseInt(el('sellPrice').value);
  const qty = parseInt(el('sellQty').value) || 1;

  if (!item || !price || price < 1) {
    alert('Please enter item name and valid sell price');
    return;
  }

  const order = {
    id: generateId(),
    item: item,
    price: price,
    qty: qty,
    sold: 0, // Track how many have been sold
    total: price * qty,
    timestamp: Date.now(),
    linkedBuyId: null,
    completed: false
  };

  sellOrders.push(order);
  el('sellItem').value = '';
  el('sellPrice').value = '';
  el('sellQty').value = '1';
  saveData();
  renderLists();
  updateStats();
});

// ---------- Calculate Profit ----------
function calculateProfit(buyOrder, sellOrder) {
  if (!buyOrder || !sellOrder) return null;

  const buyCost = buyOrder.total;
  const sellRevenue = sellOrder.total;
  const tax = Math.floor(sellRevenue * GE_TAX_RATE);
  const netRevenue = sellRevenue - tax;
  const profit = netRevenue - buyCost;
  const margin = buyCost > 0 ? (profit / buyCost) * 100 : 0;
  const roi = buyCost > 0 ? (profit / buyCost) * 100 : 0;

  return {
    buyCost,
    sellRevenue,
    tax,
    netRevenue,
    profit,
    margin,
    roi
  };
}

// ---------- Link Buy to Sell ----------
el('linkOrder').addEventListener('click', () => {
  if (!selectedBuyId || !selectedSellId) {
    alert('Please select both a buy order and a sell order');
    return;
  }

  const buyOrder = buyOrders.find(o => o.id === selectedBuyId);
  const sellOrder = sellOrders.find(o => o.id === selectedSellId);

  if (!buyOrder || !sellOrder) {
    alert('Selected orders not found');
    return;
  }

  buyOrder.linkedSellId = selectedSellId;
  sellOrder.linkedBuyId = selectedBuyId;

  selectedBuyId = null;
  selectedSellId = null;
  saveData();
  renderLists();
  safeOverlay('Orders linked!', 1500);
});

// ---------- Complete Buy Order ----------
el('markBuyComplete').addEventListener('click', () => {
  if (!selectedBuyId) {
    alert('Please select a buy order');
    return;
  }

  const buyOrder = buyOrders.find(o => o.id === selectedBuyId);
  if (!buyOrder) return;

  // Mark as complete and set bought to full quantity if not already set
  buyOrder.completed = true;
  if (buyOrder.bought === 0) {
    buyOrder.bought = buyOrder.qty;
  }
  selectedBuyId = null;
  
  // Check if linked sell order is also complete
  if (buyOrder.linkedSellId) {
    const sellOrder = sellOrders.find(o => o.id === buyOrder.linkedSellId);
    if (sellOrder && sellOrder.completed) {
      finalizeFlip(buyOrder, sellOrder);
      return;
    }
  }
  
  saveData();
  renderLists();
  updateStats();
  safeOverlay('Buy order marked complete', 1500);
});

// ---------- Complete Sell Order ----------
el('markSellComplete').addEventListener('click', () => {
  if (!selectedSellId) {
    alert('Please select a sell order');
    return;
  }

  const sellOrder = sellOrders.find(o => o.id === selectedSellId);
  if (!sellOrder) return;

  // Mark as complete and set sold to full quantity if not already set
  sellOrder.completed = true;
  if (sellOrder.sold === 0) {
    sellOrder.sold = sellOrder.qty;
  }

  // If linked to buy order, check if both are complete
  if (sellOrder.linkedBuyId) {
    const buyOrder = buyOrders.find(o => o.id === sellOrder.linkedBuyId);
    if (buyOrder && buyOrder.completed) {
      finalizeFlip(buyOrder, sellOrder);
      return;
    }
  }

  selectedSellId = null;
  saveData();
  renderLists();
  updateStats();
  safeOverlay('Sell order marked complete', 1500);
});

// ---------- Watchlist ----------
el('addWatchItem').addEventListener('click', () => {
  const item = el('watchItem').value.trim();
  if (!item) {
    alert('Please enter an item name');
    return;
  }

  if (watchlist.includes(item)) {
    alert('Item already in watchlist');
    return;
  }

  watchlist.push(item);
  el('watchItem').value = '';
  saveData();
  renderLists();
});

function removeWatchItem(item) {
  const idx = watchlist.indexOf(item);
  if (idx >= 0) {
    watchlist.splice(idx, 1);
    saveData();
    renderLists();
  }
}

// ---------- Render Lists ----------
function renderBuyOrders() {
  const container = el('buyOrdersList');
  const active = buyOrders.filter(o => !o.completed);
  const completed = buyOrders.filter(o => o.completed);

  if (active.length === 0 && completed.length === 0) {
    container.innerHTML = '<div class="empty-state">No buy orders</div>';
    return;
  }

  let html = '';
  
  if (active.length > 0) {
    html += active.map(order => {
      const linked = order.linkedSellId ? '🔗 Linked' : '';
      const progress = order.bought > 0 ? ` (${order.bought.toLocaleString()}/${order.qty.toLocaleString()})` : '';
      const progressClass = order.bought >= order.qty ? 'profit' : '';
      return `
        <div class="order-item ${selectedBuyId === order.id ? 'selected' : ''}" onclick="selectBuyOrder('${order.id}')">
          <div class="order-info">
            <div class="order-name">${order.item}</div>
            <div class="order-details">
              <span>Qty: ${order.qty.toLocaleString()}${progress}</span>
              <span>Price: ${fmtGP(order.price)}</span>
              <span>Total: ${fmtGP(order.total)}</span>
              ${order.bought > 0 ? `<span class="order-price ${progressClass}" style="font-weight:600;">Bought: ${order.bought.toLocaleString()}</span>` : ''}
              ${linked ? `<span style="color:var(--accent2)">${linked}</span>` : ''}
            </div>
          </div>
          <div class="order-actions">
            <button class="order-btn" onclick="event.stopPropagation(); deleteBuyOrder('${order.id}')">Delete</button>
          </div>
        </div>
      `;
    }).join('');
  }
  
  if (completed.length > 0) {
    html += '<div style="margin-top:16px; padding-top:16px; border-top:1px solid #2a3450;"><small style="color:var(--mut);">Completed (will auto-remove when linked sell completes):</small></div>';
    html += completed.map(order => {
      return `
        <div class="order-item completed">
          <div class="order-info">
            <div class="order-name">${order.item} ✓</div>
            <div class="order-details">
              <span>Bought: ${(order.bought || order.qty).toLocaleString()}/${order.qty.toLocaleString()}</span>
              <span>Price: ${fmtGP(order.price)}</span>
            </div>
          </div>
        </div>
      `;
    }).join('');
  }
  
  container.innerHTML = html;
}

function renderSellOrders() {
  const container = el('sellOrdersList');
  const active = sellOrders.filter(o => !o.completed);
  const completed = sellOrders.filter(o => o.completed);

  if (active.length === 0 && completed.length === 0) {
    container.innerHTML = '<div class="empty-state">No sell orders</div>';
    return;
  }

  let html = '';
  
  if (active.length > 0) {
    html += active.map(order => {
      const linked = order.linkedBuyId ? '🔗 Linked' : '';
      const tax = Math.floor(order.total * GE_TAX_RATE);
      const afterTax = order.total - tax;
      const progress = order.sold > 0 ? ` (${order.sold.toLocaleString()}/${order.qty.toLocaleString()})` : '';
      const progressClass = order.sold >= order.qty ? 'profit' : '';
      return `
        <div class="order-item ${selectedSellId === order.id ? 'selected' : ''}" onclick="selectSellOrder('${order.id}')">
          <div class="order-info">
            <div class="order-name">${order.item}</div>
            <div class="order-details">
              <span>Qty: ${order.qty.toLocaleString()}${progress}</span>
              <span>Price: ${fmtGP(order.price)}</span>
              <span>Total: ${fmtGP(order.total)}</span>
              <span>After Tax: ${fmtGP(afterTax)}</span>
              ${order.sold > 0 ? `<span class="order-price ${progressClass}" style="font-weight:600;">Sold: ${order.sold.toLocaleString()}</span>` : ''}
              ${linked ? `<span style="color:var(--accent2)">${linked}</span>` : ''}
            </div>
          </div>
          <div class="order-actions">
            <button class="order-btn" onclick="event.stopPropagation(); deleteSellOrder('${order.id}')">Delete</button>
          </div>
        </div>
      `;
    }).join('');
  }
  
  if (completed.length > 0) {
    html += '<div style="margin-top:16px; padding-top:16px; border-top:1px solid #2a3450;"><small style="color:var(--mut);">Completed (will auto-calculate profit if linked):</small></div>';
    html += completed.map(order => {
      const tax = Math.floor(order.total * GE_TAX_RATE);
      return `
        <div class="order-item completed">
          <div class="order-info">
            <div class="order-name">${order.item} ✓</div>
            <div class="order-details">
              <span>Sold: ${(order.sold || order.qty).toLocaleString()}/${order.qty.toLocaleString()}</span>
              <span>Price: ${fmtGP(order.price)}</span>
              <span>After Tax: ${fmtGP(order.total - tax)}</span>
            </div>
          </div>
        </div>
      `;
    }).join('');
  }
  
  container.innerHTML = html;
}

function renderCompleted() {
  const container = el('completedList');
  const sorted = [...completedFlips].sort((a, b) => b.timestamp - a.timestamp);

  if (sorted.length === 0) {
    container.innerHTML = '<div class="empty-state">No completed flips yet</div>';
    return;
  }

  container.innerHTML = sorted.map(flip => {
    const profitClass = flip.profit >= 0 ? 'profit' : 'loss';
    return `
      <div class="order-item completed">
        <div class="order-info">
          <div class="order-name">${flip.item}</div>
          <div class="order-details">
            <span>Qty: ${flip.qty.toLocaleString()}</span>
            <span>Buy: ${fmtGP(flip.buyPrice)}</span>
            <span>Sell: ${fmtGP(flip.sellPrice)}</span>
            <span>Tax: ${fmtGP(flip.tax)}</span>
            <span>Margin: ${flip.margin.toFixed(2)}%</span>
            <span class="order-price ${profitClass}">Profit: ${fmtGP(flip.profit)}</span>
            <span style="color:var(--mut); font-size:11px;">${flip.date}</span>
          </div>
        </div>
      </div>
    `;
  }).join('');
}

function renderLists() {
  renderBuyOrders();
  renderSellOrders();
  renderCompleted();
  renderItemTracking();
  renderWatchlist();
}

function renderWatchlist() {
  const container = el('watchlistItems');

  if (watchlist.length === 0) {
    container.innerHTML = '<div class="empty-state">Watchlist is empty</div>';
    return;
  }

  container.innerHTML = watchlist.map(item => `
    <div class="order-item">
      <div class="order-info">
        <div class="order-name">${item}</div>
      </div>
      <div class="order-actions">
        <button class="order-btn btn-danger" onclick="removeWatchItem('${item}')">Remove</button>
      </div>
    </div>
  `).join('');
}

// ---------- Campaign Functions ----------
function selectBuyOrder(id) {
  selectedBuyId = selectedBuyId === id ? null : id;
  renderLists();
}

function selectSellOrder(id) {
  selectedSellId = selectedSellId === id ? null : id;
  renderLists();
}

function deleteBuyOrder(id) {
  if (confirm('Delete this buy order?')) {
    const idx = buyOrders.findIndex(o => o.id === id);
    if (idx >= 0) {
      buyOrders.splice(idx, 1);
      if (selectedBuyId === id) selectedBuyId = null;
      saveData();
      renderLists();
      updateStats();
    }
  }
}

function deleteSellOrder(id) {
  if (confirm('Delete this sell order?')) {
      const idx = sellOrders.findIndex(o => o.id === id);
      if (idx >= 0) {
        sellOrders.splice(idx, 1);
      if (selectedSellId === id) selectedSellId = null;
      saveData();
      renderLists();
      updateStats();
    }
  }
}

// ---------- Update Statistics ----------
function updateStats() {
  const activeCount = buyOrders.filter(o => !o.completed).length + sellOrders.filter(o => !o.completed).length;
  
  const avgProfit = stats.totalFlips > 0 ? stats.totalProfit / stats.totalFlips : 0;
  const successRate = stats.totalFlips > 0 ? (stats.profitableFlips / stats.totalFlips) * 100 : 0;
  const roi = stats.totalInvested > 0 ? (stats.totalProfit / stats.totalInvested) * 100 : 0;
  const profitMargin = stats.totalRevenue > 0 ? ((stats.totalProfit / stats.totalRevenue) * 100) : 0;

  el('totalProfit').textContent = fmtGP(stats.totalProfit);
  el('totalProfit').className = 'stat-value ' + (stats.totalProfit >= 0 ? 'profit' : 'loss');
  el('totalFlips').textContent = stats.totalFlips.toLocaleString();
  el('activeOrders').textContent = activeCount;
  el('totalInvested').textContent = fmtGP(stats.totalInvested);
  el('avgProfit').textContent = fmtGP(Math.round(avgProfit));
  el('successRate').textContent = successRate.toFixed(1) + '%';
  el('bestFlip').textContent = fmtGP(stats.bestFlip);
  el('worstFlip').textContent = fmtGP(stats.worstFlip);
  el('roi').textContent = roi.toFixed(2) + '%';
  el('itemsTracked').textContent = Object.keys(itemTracking).length;
  el('totalRevenue').textContent = fmtGP(stats.totalRevenue);
  el('profitMargin').textContent = profitMargin.toFixed(2) + '%';
  
  // Render top items and recent activity
  renderTopItems();
  renderRecentActivity();
}

function renderTopItems() {
  const container = el('topItemsList');
  if (!container) return;
  
  // Get items from tracking sorted by profit per item
  const items = Object.entries(itemTracking)
    .map(([name, data]) => ({ name, ...data }))
    .filter(item => item.profitPerItem > 0)
    .sort((a, b) => b.profitPerItem - a.profitPerItem)
    .slice(0, 10); // Top 10
  
  if (items.length === 0) {
    container.innerHTML = '<div class="empty-state">No profitable items tracked yet</div>';
    return;
  }
  
  container.innerHTML = items.map((item, idx) => {
    return `
      <div class="order-item">
        <div class="order-info" style="flex:1;">
          <div class="order-name">${idx + 1}. ${item.name}</div>
          <div class="order-details">
            <span>Buy: ${fmtGP(item.buyPrice)}</span>
            <span>Sell: ${fmtGP(item.sellPrice)}</span>
            <span class="order-price profit">Profit: ${fmtGP(item.profitPerItem)}</span>
            <span style="color:var(--accent2);">Margin: ${item.margin >= 0 ? '+' : ''}${item.margin.toFixed(2)}%</span>
            ${item.geLimit ? `<span style="color:var(--accent);">Limit: ${item.geLimit.toLocaleString()}</span>` : ''}
            ${item.totalProfitAtLimit ? `<span class="order-price profit" style="font-weight:700;">Total: ${fmtGP(item.totalProfitAtLimit)}</span>` : ''}
            <span style="color:var(--mut); font-size:11px;">Checked ${item.totalChecked || 1}x</span>
          </div>
        </div>
      </div>
    `;
  }).join('');
}

function renderRecentActivity() {
  const container = el('recentActivity');
  if (!container) return;
  
  // Get recent completed flips and recent item checks
  const recentFlips = [...completedFlips].sort((a, b) => b.timestamp - a.timestamp).slice(0, 5);
  const recentItems = Object.entries(itemTracking)
    .map(([name, data]) => ({ name, ...data }))
    .sort((a, b) => b.lastSeen - a.lastSeen)
    .slice(0, 3);
  
  if (recentFlips.length === 0 && recentItems.length === 0) {
    container.innerHTML = '<div class="empty-state">No recent activity</div>';
    return;
  }
  
  let html = '';
  
  if (recentFlips.length > 0) {
    html += recentFlips.map(flip => {
      const profitClass = flip.profit >= 0 ? 'profit' : 'loss';
      return `
        <div class="order-item completed" style="margin-bottom:8px;">
          <div class="order-info">
            <div class="order-name">${flip.item}</div>
            <div class="order-details">
              <span>Qty: ${flip.qty.toLocaleString()}</span>
              <span class="order-price ${profitClass}">Profit: ${fmtGP(flip.profit)}</span>
              <span style="color:var(--mut); font-size:11px;">${flip.date}</span>
            </div>
          </div>
        </div>
      `;
    }).join('');
  }
  
  if (recentItems.length > 0 && recentFlips.length === 0) {
    html += recentItems.map(item => {
      const profitClass = item.profitPerItem >= 0 ? 'profit' : 'loss';
      return `
        <div class="order-item" style="margin-bottom:8px;">
          <div class="order-info">
            <div class="order-name">${item.name}</div>
            <div class="order-details">
              <span class="order-price ${profitClass}">Profit/Item: ${fmtGP(item.profitPerItem)}</span>
              <span style="color:var(--mut); font-size:11px;">${formatTimeAgo(item.lastSeen)}</span>
            </div>
          </div>
        </div>
      `;
    }).join('');
  }
  
  container.innerHTML = html || '<div class="empty-state">No recent activity</div>';
}

// ---------- Export/Import ----------
el('exportData').addEventListener('click', () => {
  const data = {
    version: '1.0.0',
    buyOrders,
    sellOrders,
    completedFlips,
    watchlist,
    stats,
    timestamp: Date.now()
  };

  const json = JSON.stringify(data, null, 2);
  const blob = new Blob([json], {type: 'application/json'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `flippr-backup-${new Date().toISOString().split('T')[0]}.json`;
  a.click();
  URL.revokeObjectURL(url);
  safeOverlay('Data exported', 1500);
});

el('exportCompleted').addEventListener('click', () => {
  el('exportData').click();
});

el('importData').addEventListener('click', () => {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'application/json';
  input.onchange = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const data = JSON.parse(ev.target.result);
        if (data.buyOrders) Object.assign(buyOrders, data.buyOrders);
        if (data.sellOrders) Object.assign(sellOrders, data.sellOrders);
        if (data.completedFlips) Object.assign(completedFlips, data.completedFlips);
        if (data.watchlist) Object.assign(watchlist, data.watchlist);
        if (data.stats) Object.assign(stats, data.stats);
        saveData();
        renderLists();
        updateStats();
        safeOverlay('Data imported', 1500);
      } catch (err) {
        alert('Failed to import: ' + err.message);
      }
    };
    reader.readAsText(file);
  };
  input.click();
});

// ---------- Clear & Reset ----------
el('clearCompleted').addEventListener('click', () => {
  if (confirm('Clear all completed flip history? This cannot be undone.')) {
    completedFlips.length = 0;
    saveData();
    renderLists();
    safeOverlay('History cleared', 1500);
  }
});

el('resetAll').addEventListener('click', () => {
  if (confirm('Reset everything? This will delete all orders, history, and stats. This cannot be undone!')) {
    buyOrders.length = 0;
    sellOrders.length = 0;
    completedFlips.length = 0;
    watchlist.length = 0;
    Object.assign(stats, {
      totalProfit: 0,
      totalInvested: 0,
      totalRevenue: 0,
      totalFlips: 0,
      profitableFlips: 0,
      bestFlip: 0,
      worstFlip: 0,
      startDate: Date.now()
    });
    selectedBuyId = null;
    selectedSellId = null;
    saveData();
    renderLists();
    updateStats();
    safeOverlay('Everything reset', 1500);
  }
});

// ---------- GE Price Check Detection ----------
let lastGECheck = null;
let autoDetectEnabled = true;
let debugMode = false;

// Detection regions (configurable)
let detectionRegions = [
  { x: 400, y: 150, width: 400, height: 300 },
  { x: 380, y: 200, width: 420, height: 250 }
];

// Load settings
function loadSettings() {
  const savedAuto = localStorage.getItem('flippr_autoDetect');
  const savedDebug = localStorage.getItem('flippr_debugMode');
  const savedRegions = localStorage.getItem('flippr_regions');
  
  autoDetectEnabled = savedAuto !== '0';
  debugMode = savedDebug === '1';
  
  if (savedRegions) {
    try {
      detectionRegions = JSON.parse(savedRegions);
    } catch (e) {
      console.error('Failed to load regions:', e);
    }
  }
  
  // Update UI
  const autoDetectCheck = el('autoDetectGE');
  if (autoDetectCheck) {
    autoDetectCheck.checked = autoDetectEnabled;
    autoDetectCheck.addEventListener('change', (e) => {
      autoDetectEnabled = e.target.checked;
      localStorage.setItem('flippr_autoDetect', autoDetectEnabled ? '1' : '0');
    });
  }
  
  const debugCheck = el('debugMode');
  if (debugCheck) {
    debugCheck.checked = debugMode;
    debugCheck.addEventListener('change', (e) => {
      debugMode = e.target.checked;
      localStorage.setItem('flippr_debugMode', debugMode ? '1' : '0');
      el('debugOutput').style.display = debugMode ? 'block' : 'none';
    });
  }
  
  // Update region inputs
  updateRegionInputs();
}

function updateRegionInputs() {
  if (detectionRegions[0]) {
    el('region1X').value = detectionRegions[0].x;
    el('region1Y').value = detectionRegions[0].y;
    el('region1W').value = detectionRegions[0].width;
    el('region1H').value = detectionRegions[0].height;
  }
  if (detectionRegions[1]) {
    el('region2X').value = detectionRegions[1].x;
    el('region2Y').value = detectionRegions[1].y;
    el('region2W').value = detectionRegions[1].width;
    el('region2H').value = detectionRegions[1].height;
  }
}

function saveRegionSettings() {
  detectionRegions[0] = {
    x: parseInt(el('region1X').value) || 400,
    y: parseInt(el('region1Y').value) || 150,
    width: parseInt(el('region1W').value) || 400,
    height: parseInt(el('region1H').value) || 300
  };
  detectionRegions[1] = {
    x: parseInt(el('region2X').value) || 380,
    y: parseInt(el('region2Y').value) || 200,
    width: parseInt(el('region2W').value) || 420,
    height: parseInt(el('region2H').value) || 250
  };
  localStorage.setItem('flippr_regions', JSON.stringify(detectionRegions));
  safeOverlay('Settings saved', 1500);
}

el('saveSettings').addEventListener('click', saveRegionSettings);
el('resetRegions').addEventListener('click', () => {
  detectionRegions = [
    { x: 400, y: 150, width: 400, height: 300 },
    { x: 380, y: 200, width: 420, height: 250 }
  ];
  updateRegionInputs();
  saveRegionSettings();
});

el('testDetection').addEventListener('click', async () => {
  if (!inAlt1) {
    alert('Alt1 must be connected to test detection');
    return;
  }
  await detectGEPriceCheck(true); // Force detection
});

async function detectGEPriceCheck(force = false) {
  if ((!inAlt1 || !autoDetectEnabled) && !force) return;
  
  try {
    const rs = a1lib.getRuneScapeRect && a1lib.getRuneScapeRect();
    if (!rs) {
      if (debugMode) el('debugText').textContent = 'RS window not found';
      return;
    }

    let debugText = '';
    let foundMatch = false;

    // Use configured regions
    for (let i = 0; i < detectionRegions.length; i++) {
      const region = detectionRegions[i];
      const checkRect = {
        x: rs.x + region.x,
        y: rs.y + region.y,
        width: region.width,
        height: region.height
      };

      const img = a1lib.capture(checkRect);
      if (!img) {
        debugText += `Region ${i + 1}: No image captured\n`;
        continue;
      }
      
      const ocr = await a1lib.ocrRead(img);
      const text = (ocr?.text || '').trim();
      const textLower = text.toLowerCase();
      
      if (debugMode) {
        debugText += `Region ${i + 1} (${region.x}, ${region.y}, ${region.width}x${region.height}):\n${text}\n\n`;
      }
      
      // Look for GE price check indicators - improved patterns
      const hasGEIndicator = /grand exchange|price check|buy.*price|sell.*price|ge.*price|guide price|market price/i.test(textLower) ||
                            textLower.includes('buy') && textLower.includes('sell') ||
                            textLower.match(/\d+.*gp.*\d+.*gp/i); // Two prices with "gp"
      
      if (hasGEIndicator || force) {
        // Try multiple extraction methods
        const itemMatch = extractGEData(text, ocr) || 
                         extractGEDataImproved(text, ocr) ||
                         extractGEDataPattern(text);
        
        if (itemMatch && itemMatch.itemName && itemMatch.buyPrice && itemMatch.sellPrice) {
          const { itemName, buyPrice, sellPrice } = itemMatch;
          
          // Try to extract buy limit from OCR, then fetch from wiki if not found
          let buyLimit = extractBuyLimit(text);
          if (!buyLimit) {
            buyLimit = await getGELimit(itemName);
          }
          
          // Check if this is a new/different price check
          const checkKey = `${itemName}-${buyPrice}-${sellPrice}-${buyLimit}`;
          if (checkKey !== lastGECheck || force) {
            lastGECheck = checkKey;
            addItemFromGECheck(itemName, buyPrice, sellPrice, buyLimit);
            foundMatch = true;
            if (debugMode) debugText += `✓ Found: ${itemName} - Buy: ${buyPrice}, Sell: ${sellPrice}, Limit: ${buyLimit}\n`;
            break;
          }
        } else if (debugMode) {
          debugText += `✗ Could not extract item data from region ${i + 1}\n`;
        }
      }
    }

    if (debugMode) {
      el('debugOutput').style.display = 'block';
      el('debugText').textContent = debugText || 'No matches found. Try adjusting detection regions or check if GE interface is visible.';
    }
  } catch (e) {
    if (debugMode) {
      el('debugOutput').style.display = 'block';
      el('debugText').textContent = `Error: ${e.message}\n${e.stack}`;
    }
    console.error('GE detection error:', e);
  }
}

// Improved price parsing - handles various formats
function parsePrice(priceStr) {
  if (!priceStr) return null;
  
  // Remove common OCR artifacts
  priceStr = priceStr.replace(/[^\d.,\s]/g, '').trim();
  
  // Handle "1.5M" format
  if (/[\d.]+[km]?b?$/i.test(priceStr)) {
    const num = parseFloat(priceStr.match(/[\d.]+/)[0]);
    const suffix = priceStr.match(/[km]?b?$/i)[0].toLowerCase();
    if (suffix === 'k' || suffix === 'm') return Math.floor(num * (suffix === 'k' ? 1000 : 1000000));
    if (suffix === 'b') return Math.floor(num * 1000000000);
  }
  
  // Remove commas and spaces, parse as integer
  const cleaned = priceStr.replace(/[,|\s]/g, '');
  const parsed = parseInt(cleaned);
  return isNaN(parsed) || parsed <= 0 ? null : parsed;
}

function extractGEData(text, ocr) {
  // Method 1: Look for explicit "Buy:" and "Sell:" labels
  const buyMatch = text.match(/(?:buy|purchase|guide price|market price)[:\s]*([\d,\s.]+(?:[km]?b?)?)\s*(?:gp|coins?|each)?/i);
  const sellMatch = text.match(/(?:sell|offer|guide price|market price)[:\s]*([\d,\s.]+(?:[km]?b?)?)\s*(?:gp|coins?|each)?/i);
  
  // Extract item name - improved logic
  let itemName = null;
  const lines = text.split('\n').filter(l => l.trim());
  
  // Look for item name in first few lines, skip price-looking lines
  for (let i = 0; i < Math.min(5, lines.length); i++) {
    const line = lines[i].trim();
    // Skip if it's mostly numbers or looks like a price
    if (!/^[\d,\s.]+(?:[km]?b?)?\s*(?:gp|coins?)?$/i.test(line) && 
        !/^(buy|sell|price|gp|coins?)$/i.test(line) &&
        line.length > 2 && line.length < 60) {
      // Clean up item name
      itemName = line.replace(/[^\w\s'\-]/g, ' ').replace(/\s+/g, ' ').trim();
      if (itemName && itemName.length > 2 && !itemName.match(/^\d+$/)) break;
    }
  }
  
  if (buyMatch && sellMatch && itemName) {
    const buyPrice = parsePrice(buyMatch[1]);
    const sellPrice = parsePrice(sellMatch[1]);
    
    if (buyPrice && sellPrice && buyPrice > 0 && sellPrice > 0 && itemName.length > 2) {
      return { itemName, buyPrice, sellPrice };
    }
  }
  
  return null;
}

function extractGEDataImproved(text, ocr) {
  // Method 2: Look for price patterns with numbers and "gp"
  const pricePattern = /([\d,\s.]+(?:[km]?b?)?)\s*gp/gi;
  const prices = [];
  let match;
  while ((match = pricePattern.exec(text)) !== null && prices.length < 4) {
    const price = parsePrice(match[1]);
    if (price && price > 0) prices.push(price);
  }
  
  // If we found 2 prices, assume first is buy, second is sell
  if (prices.length >= 2) {
    // Extract item name - look for text before prices
    const beforePrices = text.substring(0, text.indexOf(prices[0].toString()));
    const lines = beforePrices.split('\n').filter(l => l.trim());
    let itemName = null;
    
    for (let i = lines.length - 1; i >= Math.max(0, lines.length - 3); i--) {
      const line = lines[i].trim();
      if (line.length > 2 && line.length < 60 && !/^\d+/.test(line)) {
        itemName = line.replace(/[^\w\s'\-]/g, ' ').replace(/\s+/g, ' ').trim();
        if (itemName && itemName.length > 2) break;
      }
    }
    
    if (itemName && itemName.length > 2) {
      return { itemName, buyPrice: prices[0], sellPrice: prices[1] };
    }
  }
  
  return null;
}

function extractGEDataPattern(text) {
  // Method 3: Look for common GE patterns like "Item Name\nBuy: X\nSell: Y"
  const lines = text.split('\n').filter(l => l.trim());
  
  if (lines.length < 3) return null;
  
  let itemName = null;
  let buyPrice = null;
  let sellPrice = null;
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    
    // Check for item name (not a price, reasonable length)
    if (!itemName && line.length > 2 && line.length < 60 && !/^\d+/.test(line) && 
        !/^(buy|sell|price|gp)/i.test(line)) {
      itemName = line.replace(/[^\w\s'\-]/g, ' ').replace(/\s+/g, ' ').trim();
    }
    
    // Check for buy price
    if (!buyPrice && /buy/i.test(line)) {
      const priceMatch = line.match(/([\d,\s.]+(?:[km]?b?)?)/);
      if (priceMatch) buyPrice = parsePrice(priceMatch[1]);
    }
    
    // Check for sell price
    if (!sellPrice && /sell/i.test(line)) {
      const priceMatch = line.match(/([\d,\s.]+(?:[km]?b?)?)/);
      if (priceMatch) sellPrice = parsePrice(priceMatch[1]);
    }
  }
  
  if (itemName && buyPrice && sellPrice && buyPrice > 0 && sellPrice > 0 && itemName.length > 2) {
    return { itemName, buyPrice, sellPrice };
  }
  
  return null;
}

function extractBuyLimit(text) {
  // Look for buy limit patterns: "Buy limit: 10,000" or "Limit: 10000" or "10,000 / 4h"
  const patterns = [
    /buy limit[:\s]+([\d,\s]+)/i,
    /limit[:\s]+([\d,\s]+)/i,
    /([\d,\s]+)\s*\/\s*4h/i,
    /([\d,\s]+)\s*per\s*4\s*hours/i
  ];
  
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) {
      const limit = parseInt(match[1].replace(/[,|\s]/g, ''));
      if (limit > 0 && limit <= 100000) { // Sanity check
        return limit;
      }
    }
  }
  
  return null;
}

async function addItemFromGECheck(itemName, buyPrice, sellPrice, buyLimit = null) {
  const tax = Math.floor(sellPrice * GE_TAX_RATE);
  const netSell = sellPrice - tax;
  const profitPerItem = netSell - buyPrice;
  const margin = buyPrice > 0 ? ((profitPerItem / buyPrice) * 100).toFixed(2) : 0;
  
  // Get buy limit if not provided (async)
  if (!buyLimit) {
    buyLimit = await getGELimit(itemName);
  }
  
  const totalProfitAtLimit = profitPerItem * buyLimit;
  
  if (!itemTracking[itemName]) {
    itemTracking[itemName] = {
      buyPrice: buyPrice,
      sellPrice: sellPrice,
      profitPerItem: profitPerItem,
      margin: parseFloat(margin),
      geLimit: buyLimit,
      totalProfitAtLimit: totalProfitAtLimit,
      lastSeen: Date.now(),
      history: [],
      totalChecked: 1
    };
  } else {
    // Update prices and add to history
    const oldEntry = itemTracking[itemName];
    oldEntry.history.push({
      buyPrice: oldEntry.buyPrice,
      sellPrice: oldEntry.sellPrice,
      profitPerItem: oldEntry.profitPerItem,
      timestamp: oldEntry.lastSeen
    });
    
    // Keep only last 50 history entries
    if (oldEntry.history.length > 50) oldEntry.history.shift();
    
    oldEntry.buyPrice = buyPrice;
    oldEntry.sellPrice = sellPrice;
    oldEntry.profitPerItem = profitPerItem;
    oldEntry.margin = parseFloat(margin);
    if (buyLimit) {
      oldEntry.geLimit = buyLimit;
      oldEntry.totalProfitAtLimit = profitPerItem * buyLimit;
    }
    oldEntry.lastSeen = Date.now();
    oldEntry.totalChecked = (oldEntry.totalChecked || 1) + 1;
  }
  
  saveData();
  renderItemTracking();
  updateStats();
  
  const limitText = buyLimit ? ` (Limit: ${buyLimit.toLocaleString()}, Total: ${fmtGP(totalProfitAtLimit)})` : '';
  safeOverlay(`Tracked: ${itemName} (${profitPerItem >= 0 ? '+' : ''}${fmtGP(profitPerItem)} per item${limitText})`, 2500);
}

function renderItemTracking() {
  const container = el('itemsList');
  const items = Object.entries(itemTracking).sort((a, b) => b[1].lastSeen - a[1].lastSeen);
  
  if (items.length === 0) {
    container.innerHTML = '<div class="empty-state">No items tracked yet. Price check items in GE to track them automatically.</div>';
    return;
  }
  
  container.innerHTML = items.map(([itemName, data]) => {
    const profitClass = data.profitPerItem >= 0 ? 'profit' : 'loss';
    const timeAgo = formatTimeAgo(data.lastSeen);
    const profitTotal = fmtGP(data.profitPerItem);
    
    return `
      <div class="order-item">
        <div class="order-info">
          <div class="order-name">${itemName}</div>
          <div class="order-details">
            <span>Buy: ${fmtGP(data.buyPrice)}</span>
            <span>Sell: ${fmtGP(data.sellPrice)}</span>
            <span>After Tax: ${fmtGP(data.sellPrice - Math.floor(data.sellPrice * GE_TAX_RATE))}</span>
            <span class="order-price ${profitClass}">Profit/Item: ${profitTotal}</span>
            <span style="color:${profitClass === 'profit' ? 'var(--accent2)' : 'var(--danger)'};">Margin: ${data.margin >= 0 ? '+' : ''}${data.margin}%</span>
            ${data.geLimit ? `<span style="color:var(--accent); font-weight:600;">GE Limit: ${data.geLimit.toLocaleString()}</span>` : ''}
            ${data.totalProfitAtLimit ? `<span class="order-price profit" style="font-size:16px; font-weight:700;">Total at Limit: ${fmtGP(data.totalProfitAtLimit)}</span>` : ''}
            <span style="color:var(--mut); font-size:11px;">Checked ${data.totalChecked || 1}x • ${timeAgo}</span>
          </div>
          ${data.history.length > 0 ? `<small style="color:var(--mut); margin-top:4px;">Price history: ${data.history.length} entries</small>` : ''}
        </div>
        <div class="order-actions">
          <button class="order-btn btn-primary" onclick="createOrderFromItem('${itemName.replace(/'/g, "\\'")}')">Create Order</button>
          <button class="order-btn" onclick="removeItem('${itemName.replace(/'/g, "\\'")}')">Remove</button>
        </div>
      </div>
    `;
  }).join('');
}

function formatTimeAgo(timestamp) {
  const seconds = Math.floor((Date.now() - timestamp) / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function createOrderFromItem(itemName) {
  const data = itemTracking[itemName];
  if (!data) return;
  
  // Switch to buy tab and populate
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
  document.querySelector('[data-tab="buy"]').classList.add('active');
  el('tab-buy').classList.add('active');
  
  el('buyItem').value = itemName;
  el('buyPrice').value = data.buyPrice;
  
  safeOverlay('Item data filled in buy order form', 1500);
}

function removeItem(itemName) {
  if (confirm(`Remove ${itemName} from tracking?`)) {
    delete itemTracking[itemName];
    saveData();
    renderItemTracking();
  }
}

el('clearItems').addEventListener('click', () => {
  if (confirm('Clear all tracked items? This cannot be undone.')) {
    Object.keys(itemTracking).forEach(k => delete itemTracking[k]);
    saveData();
    renderItemTracking();
    safeOverlay('All items cleared', 1500);
  }
});

// Manual item entry
el('addManualItem').addEventListener('click', async () => {
  const item = el('manualItem').value.trim();
  const buyPrice = parseInt(el('manualBuy').value);
  const sellPrice = parseInt(el('manualSell').value);

  if (!item || !buyPrice || !sellPrice || buyPrice < 1 || sellPrice < 1) {
    alert('Please enter item name, buy price, and sell price');
    return;
  }

  // Fetch GE limit from wiki
  const buyLimit = await getGELimit(item);
  await addItemFromGECheck(item, buyPrice, sellPrice, buyLimit);
  
  el('manualItem').value = '';
  el('manualBuy').value = '';
  el('manualSell').value = '';
  
  // Switch to items tab to show the new entry
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
  document.querySelector('[data-tab="items"]').classList.add('active');
  el('tab-items').classList.add('active');
});

// ---------- Chatbox Monitoring for GE Orders ----------
let chatReader = null;
let lastChatLine = '';

function initChatReader() {
  if (!inAlt1) return;
  try {
    chatReader = new ChatboxReader();
    chatReader.find();
    setInterval(pollChat, 400); // Poll chat every 400ms
  } catch (e) {
    console.error('Failed to initialize chat reader:', e);
  }
}

function pollChat() {
  if (!chatReader) return;
  
  try {
    const res = chatReader.read();
    if (!res || !res.success) return;
    
    const all = res.text ?? res.lines?.map(l => l.text).join('\n') ?? '';
    if (!all) return;
    
    const lines = all.split('\n').filter(Boolean);
    const line = lines[lines.length - 1];
    if (!line || line === lastChatLine) return;
    lastChatLine = line;
    
    // Check for GE completion messages
    handleGEChatMessage(line);
  } catch (e) {
    // Silent fail
  }
}

function handleGEChatMessage(line) {
  const lowerLine = line.toLowerCase();
  
  // Pattern 1: "Your offer to buy X of [item] has finished buying."
  const buyFinishedMatch = line.match(/your offer to buy (\d+(?:,\d{3})*)\s+of\s+(.+?)\s+has finished buying/i);
  if (buyFinishedMatch) {
    const qty = parseInt(buyFinishedMatch[1].replace(/,/g, ''));
    const item = buyFinishedMatch[2].replace(/\.$/, '').trim();
    updateBuyOrder(item, qty, qty, true);
    return;
  }
  
  // Pattern 2: "Your offer to sell X of [item] has finished selling."
  const sellFinishedMatch = line.match(/your offer to sell (\d+(?:,\d{3})*)\s+of\s+(.+?)\s+has finished selling/i);
  if (sellFinishedMatch) {
    const qty = parseInt(sellFinishedMatch[1].replace(/,/g, ''));
    const item = sellFinishedMatch[2].replace(/\.$/, '').trim();
    updateSellOrder(item, qty, qty, true);
    return;
  }
  
  // Pattern 3: "Your offer to buy X of [item] has partially completed. Y of X have been bought."
  const buyPartialMatch = line.match(/your offer to buy (\d+(?:,\d{3})*)\s+of\s+(.+?)\s+has partially completed[\.:]?\s*(\d+(?:,\d{3})*)\s+have been bought/i);
  if (buyPartialMatch) {
    const totalQty = parseInt(buyPartialMatch[1].replace(/,/g, ''));
    const item = buyPartialMatch[2].trim();
    const boughtQty = parseInt(buyPartialMatch[3].replace(/,/g, ''));
    updateBuyOrder(item, totalQty, boughtQty, false);
    return;
  }
  
  // Pattern 4: "Your offer to sell X of [item] has partially completed. Y of X have been sold."
  const sellPartialMatch = line.match(/your offer to sell (\d+(?:,\d{3})*)\s+of\s+(.+?)\s+has partially completed[\.:]?\s*(\d+(?:,\d{3})*)\s+have been sold/i);
  if (sellPartialMatch) {
    const totalQty = parseInt(sellPartialMatch[1].replace(/,/g, ''));
    const item = sellPartialMatch[2].trim();
    const soldQty = parseInt(sellPartialMatch[3].replace(/,/g, ''));
    updateSellOrder(item, totalQty, soldQty, false);
    return;
  }
  
  // Alternative patterns (different message formats)
  // "You have successfully bought X [item]."
  const boughtSimpleMatch = line.match(/you have successfully bought (\d+(?:,\d{3})*)\s+(.+?)\./i);
  if (boughtSimpleMatch) {
    const qty = parseInt(boughtSimpleMatch[1].replace(/,/g, ''));
    const item = boughtSimpleMatch[2].trim();
    updateBuyOrder(item, qty, qty, false, true); // May be partial, but update what we can
    return;
  }
  
  // "You have successfully sold X [item]."
  const soldSimpleMatch = line.match(/you have successfully sold (\d+(?:,\d{3})*)\s+(.+?)\./i);
  if (soldSimpleMatch) {
    const qty = parseInt(soldSimpleMatch[1].replace(/,/g, ''));
    const item = soldSimpleMatch[2].trim();
    updateSellOrder(item, qty, qty, false, true);
    return;
  }
}

function updateBuyOrder(itemName, totalQty, boughtQty, isComplete, isSimple = false) {
  // Find matching buy order (fuzzy match item name)
  // Try exact match first, then partial match
  let matchedOrder = buyOrders.find(order => 
    !order.completed && 
    order.item.toLowerCase() === itemName.toLowerCase()
  );
  
  if (!matchedOrder) {
    // Try partial match
    matchedOrder = buyOrders.find(order => 
      !order.completed && 
      (itemName.toLowerCase().includes(order.item.toLowerCase()) ||
       order.item.toLowerCase().includes(itemName.toLowerCase()))
    );
  }
  
  if (matchedOrder) {
    // For simple messages, we might only get quantity, so add to existing
    if (isSimple && matchedOrder.bought > 0) {
      matchedOrder.bought = Math.min(matchedOrder.bought + boughtQty, matchedOrder.qty);
    } else {
      matchedOrder.bought = Math.min(boughtQty, matchedOrder.qty);
    }
    
    if (isComplete || matchedOrder.bought >= matchedOrder.qty) {
      matchedOrder.completed = true;
      matchedOrder.bought = matchedOrder.qty;
      safeOverlay(`✓ Buy complete: ${itemName} (${matchedOrder.bought.toLocaleString()})`, 2000);
    } else {
      safeOverlay(`Buy update: ${itemName} (${matchedOrder.bought.toLocaleString()}/${matchedOrder.qty.toLocaleString()})`, 1500);
    }
    
    // If linked to sell order and both complete, calculate profit
    if (matchedOrder.linkedSellId) {
      const sellOrder = sellOrders.find(o => o.id === matchedOrder.linkedSellId);
      if (sellOrder && matchedOrder.completed && sellOrder.completed) {
        finalizeFlip(matchedOrder, sellOrder);
        return; // finalizeFlip already saves and renders
      }
    }
    
    saveData();
    renderLists();
    updateStats();
  }
}

function updateSellOrder(itemName, totalQty, soldQty, isComplete, isSimple = false) {
  // Find matching sell order
  // Try exact match first, then partial match
  let matchedOrder = sellOrders.find(order => 
    !order.completed && 
    order.item.toLowerCase() === itemName.toLowerCase()
  );
  
  if (!matchedOrder) {
    // Try partial match
    matchedOrder = sellOrders.find(order => 
      !order.completed && 
      (itemName.toLowerCase().includes(order.item.toLowerCase()) ||
       order.item.toLowerCase().includes(itemName.toLowerCase()))
    );
  }
  
  if (matchedOrder) {
    // For simple messages, we might only get quantity, so add to existing
    if (isSimple && matchedOrder.sold > 0) {
      matchedOrder.sold = Math.min(matchedOrder.sold + soldQty, matchedOrder.qty);
    } else {
      matchedOrder.sold = Math.min(soldQty, matchedOrder.qty);
    }
    
    if (isComplete || matchedOrder.sold >= matchedOrder.qty) {
      matchedOrder.completed = true;
      matchedOrder.sold = matchedOrder.qty;
      safeOverlay(`✓ Sell complete: ${itemName} (${matchedOrder.sold.toLocaleString()})`, 2000);
    } else {
      safeOverlay(`Sell update: ${itemName} (${matchedOrder.sold.toLocaleString()}/${matchedOrder.qty.toLocaleString()})`, 1500);
    }
    
    // If linked to buy order and both complete, calculate profit
    if (matchedOrder.linkedBuyId) {
      const buyOrder = buyOrders.find(o => o.id === matchedOrder.linkedBuyId);
      if (buyOrder && buyOrder.completed && matchedOrder.completed) {
        finalizeFlip(buyOrder, matchedOrder);
        return; // finalizeFlip already saves and renders
      }
    }
    
    saveData();
    renderLists();
    updateStats();
  }
}

function finalizeFlip(buyOrder, sellOrder) {
  // Calculate profit for the completed flip
  const actualQty = Math.min(buyOrder.bought, sellOrder.sold);
  const buyCost = buyOrder.price * actualQty;
  const sellRevenue = sellOrder.price * actualQty;
  const tax = Math.floor(sellRevenue * GE_TAX_RATE);
  const netRevenue = sellRevenue - tax;
  const profit = netRevenue - buyCost;
  const margin = buyCost > 0 ? (profit / buyCost) * 100 : 0;
  const roi = buyCost > 0 ? (profit / buyCost) * 100 : 0;
  
  const flip = {
    id: generateId(),
    item: buyOrder.item,
    buyPrice: buyOrder.price,
    sellPrice: sellOrder.price,
    qty: actualQty,
    buyTotal: buyCost,
    sellTotal: sellRevenue,
    tax: tax,
    profit: profit,
    margin: margin,
    roi: roi,
    timestamp: Date.now(),
    date: new Date().toLocaleDateString()
  };
  
  completedFlips.push(flip);
  stats.totalFlips++;
  stats.totalProfit += profit;
  stats.totalInvested += buyCost;
  stats.totalRevenue += netRevenue;
  
  if (profit > 0) stats.profitableFlips++;
  if (profit > stats.bestFlip) stats.bestFlip = profit;
  if (profit < stats.worstFlip) stats.worstFlip = profit;
  
  // Remove completed orders
  const buyIdx = buyOrders.findIndex(o => o.id === buyOrder.id);
  const sellIdx = sellOrders.findIndex(o => o.id === sellOrder.id);
  if (buyIdx >= 0) buyOrders.splice(buyIdx, 1);
  if (sellIdx >= 0) sellOrders.splice(sellIdx, 1);
  
  safeOverlay(`Flip complete! ${buyOrder.item}: ${fmtGP(profit)} profit`, 3000);
  saveData();
  renderLists();
  updateStats();
}

// ---------- Alt1 Setup ----------
a1lib.onready(() => {
  a1ready = true;
  inAlt1 = a1lib.detectAppMode && a1lib.detectAppMode() === 'alt1';
  el('a1status').textContent = inAlt1 ? 'Alt1 connected' : 'Open in Alt1';
  
  if (inAlt1) {
    // Start GE detection polling
    setInterval(detectGEPriceCheck, 2000); // Check every 2 seconds
    // Start chat monitoring
    initChatReader();
  }
});

setTimeout(() => {
  if (!a1ready) el('a1status').textContent = 'Alt1 library not found';
}, 2000);

function safeOverlay(msg, ms) {
  if (!inAlt1) return;
  try {
    a1lib.overlay && a1lib.overlay.text(msg, {color: '#7dd3fc', width: 2}, ms || 1200);
  } catch (_) {}
}

// Make functions globally accessible for onclick handlers
window.createOrderFromItem = createOrderFromItem;
window.removeItem = removeItem;

// ---------- Load GE Limits Database ----------
async function loadGELimitsDB() {
  try {
    // First try to load local fallback database
    const response = await fetch('./ge-limits.json');
    if (response.ok) {
      const data = await response.json();
      geLimitsDB = data.limits || {};
      console.log('GE limits database loaded:', Object.keys(geLimitsDB).length, 'items');
    }
  } catch (e) {
    console.warn('Local GE limits database not found');
  }
}

// Fetch GE limit from RuneScape Wiki API
async function fetchGELimitFromWiki(itemName) {
  if (!itemName) return null;
  
  try {
    // Use Wiki API to get item info
    // Format: https://runescape.wiki/api.php?action=query&prop=revisions&rvprop=content&format=json&titles=Exchange:ItemName
    const wikiItemName = itemName.replace(/\s+/g, '_');
    const apiUrl = `https://runescape.wiki/api.php?action=query&prop=revisions&rvprop=content&format=json&titles=Exchange:${encodeURIComponent(wikiItemName)}&rvslots=main`;
    
    const response = await fetch(apiUrl);
    if (!response.ok) return null;
    
    const data = await response.json();
    const pages = data.query?.pages;
    if (!pages) return null;
    
    // Get the page content
    const pageId = Object.keys(pages)[0];
    const content = pages[pageId]?.revisions?.[0]?.slots?.main?.content;
    
    if (!content) return null;
    
    // Extract buy limit from wiki markup
    // Look for "buy limit" or "Buy limit" followed by number
    const buyLimitMatch = content.match(/[Bb]uy\s*limit[:\s]*(\d+)/);
    if (buyLimitMatch) {
      const limit = parseInt(buyLimitMatch[1]);
      if (limit > 0 && limit <= 100000) {
        // Cache it in local database
        geLimitsDB[itemName.toLowerCase()] = limit;
        return limit;
      }
    }
    
    // Also try looking for "limit" or "Limit" field
    const limitMatch = content.match(/[Ll]imit[:\s]*(\d+)/);
    if (limitMatch) {
      const limit = parseInt(limitMatch[1]);
      if (limit > 0 && limit <= 100000) {
        geLimitsDB[itemName.toLowerCase()] = limit;
        return limit;
      }
    }
  } catch (e) {
    console.error('Failed to fetch GE limit from wiki:', e);
  }
  
  return null;
}

async function getGELimit(itemName) {
  if (!itemName) return 10000; // Default
  
  // Normalize item name for lookup
  const normalized = itemName.toLowerCase().trim();
  
  // Check cache first
  if (geLimitsDB[normalized]) {
    return geLimitsDB[normalized];
  }
  
  // Try to fetch from wiki
  const wikiLimit = await fetchGELimitFromWiki(itemName);
  if (wikiLimit) {
    return wikiLimit;
  }
  
  // Try partial match in cache
  for (const [key, limit] of Object.entries(geLimitsDB)) {
    if (normalized.includes(key) || key.includes(normalized)) {
      return limit;
    }
  }
  
  // Check for common patterns
  if (normalized.includes('godsword') || normalized.includes('whip') || 
      normalized.includes('drygore') || normalized.includes('noxious') ||
      normalized.includes('title scroll')) {
    return 10; // Very rare items
  }
  
  if (normalized.includes('rune full') || normalized.includes('rune plate') || 
      normalized.includes('bandos') || normalized.includes('armadyl')) {
    return 100; // Rare items
  }
  
  if (normalized.includes('ore') || normalized.includes('logs') || 
      normalized.includes('grimy') || normalized.includes('rune')) {
    return 10000; // Common items
  }
  
  // Default fallback
  return 10000;
}

// ---------- Initialize ----------
function init() {
  console.log('Initializing Flippr...');
  
  // Load data first
  loadData();
  loadSettings();
  loadGELimitsDB();
  
  // Setup tab switching - must be done before hiding tabs
  setupTabs();
  
  // Ensure only the active tab is visible on load
  document.querySelectorAll('.tab-content').forEach(c => {
    c.classList.remove('active');
    c.style.display = 'none';
  });
  
  // Show only the stats tab (default active)
  const statsTab = el('tab-stats');
  if (statsTab) {
    statsTab.classList.add('active');
    statsTab.style.display = 'block';
    console.log('Stats tab shown');
  } else {
    console.error('Could not find tab-stats element');
  }
  
  // Ensure only the stats tab button is active
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  const statsTabBtn = document.querySelector('[data-tab="stats"]');
  if (statsTabBtn) {
    statsTabBtn.classList.add('active');
    console.log('Stats tab button activated');
  } else {
    console.error('Could not find stats tab button');
  }
  
  renderLists();
  updateStats();
  console.log('Initialization complete');
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  // DOM is already ready
  init();
}

