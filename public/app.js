// Initialize Telegram WebApp SDK
const tg = window.Telegram?.WebApp;
if (tg) {
  tg.ready();
  tg.expand();
  // Set header color to match app background
  tg.setHeaderColor('#090c10');
}

// Global State
let allCards = [];
let filteredCards = [];
let activeFilters = {
  search: '',
  domain: 'All',
  type: 'All',
  rarity: 'All'
};

// DOM Elements
const searchInput = document.getElementById('searchInput');
const clearSearch = document.getElementById('clearSearch');
const domainPills = document.getElementById('domainPills');
const typeFilter = document.getElementById('typeFilter');
const rarityFilter = document.getElementById('rarityFilter');
const resetFilters = document.getElementById('resetFilters');
const cardsGrid = document.getElementById('cardsGrid');
const loadingState = document.getElementById('loadingState');
const emptyState = document.getElementById('emptyState');
const emptyResetBtn = document.getElementById('emptyResetBtn');
const cardCount = document.getElementById('cardCount');
const cardModal = document.getElementById('cardModal');
const modalClose = document.getElementById('modalClose');
const modalBody = document.getElementById('modalBody');

// --- Domain SVGs (Abstract designs) ---
function getDomainCrestSVG(domain) {
  const baseClass = `domain-crest-icon domain-crest-${domain.toLowerCase()}`;
  switch (domain) {
    case 'Fury': // Flame / Spark
      return `<svg class="${baseClass}" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
        <path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 3.5z"/>
      </svg>`;
    case 'Calm': // Shield / Leaf
      return `<svg class="${baseClass}" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
        <path d="M12 8a3 3 0 0 0-3 3c0 2 3 5 3 5s3-3 3-5a3 3 0 0 0-3-3z"/>
      </svg>`;
    case 'Mind': // Eye / Portal
      return `<svg class="${baseClass}" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
        <circle cx="12" cy="12" r="3"/>
        <path d="M12 5a7 7 0 0 1 0 14"/>
      </svg>`;
    case 'Body': // Fist / Stone
      return `<svg class="${baseClass}" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
        <path d="M12 3a9 9 0 0 0-9 9v7a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7a9 9 0 0 0-9-9z"/>
        <path d="M8 10h8v4H8z"/>
        <path d="M12 10v8"/>
      </svg>`;
    case 'Chaos': // Swirl / Lightning
      return `<svg class="${baseClass}" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
        <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/>
      </svg>`;
    case 'Order': // Crown / Scales
      return `<svg class="${baseClass}" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
        <path d="M2 4l3 12h14l3-12-6 7-4-7-4 7-6-7z"/>
        <path d="M3 20h18"/>
      </svg>`;
    default:
      return `<svg class="${baseClass}" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="12" cy="12" r="10"/></svg>`;
  }
}

// --- Initialize App ---
document.addEventListener('DOMContentLoaded', () => {
  setupEventListeners();
  fetchCards();
});

// --- Fetch Card Data ---
async function fetchCards() {
  try {
    const response = await fetch('/api/cards');
    if (!response.ok) throw new Error('API request failed');
    allCards = await response.json();
    
    // Hide spinner
    loadingState.style.display = 'none';
    
    // Render and Filter
    applyFilters();
    
    // Check if deep linked card ID in URL parameters
    checkDeepLink();
  } catch (error) {
    console.error('Error fetching cards:', error);
    loadingState.innerHTML = `<p class="error-text">❌ Failed to load cards. Please pull down to refresh.</p>`;
  }
}

// --- Setup Event Listeners ---
function setupEventListeners() {
  // Search Search input
  searchInput.addEventListener('input', (e) => {
    activeFilters.search = e.target.value;
    clearSearch.style.display = activeFilters.search ? 'block' : 'none';
    applyFilters();
  });

  // Clear search input button
  clearSearch.addEventListener('click', () => {
    searchInput.value = '';
    activeFilters.search = '';
    clearSearch.style.display = 'none';
    applyFilters();
    searchInput.focus();
  });

  // Domain Pill selection clicks
  domainPills.addEventListener('click', (e) => {
    const pill = e.target.closest('.domain-pill');
    if (!pill) return;
    
    // Update active pill UI
    document.querySelectorAll('.domain-pill').forEach(btn => btn.classList.remove('active'));
    pill.classList.add('active');
    
    // Filter
    activeFilters.domain = pill.dataset.domain;
    applyFilters();
  });

  // Filters select dropdowns
  typeFilter.addEventListener('change', (e) => {
    activeFilters.type = e.target.value;
    applyFilters();
  });

  rarityFilter.addEventListener('change', (e) => {
    activeFilters.rarity = e.target.value;
    applyFilters();
  });

  // Reset filter buttons
  resetFilters.addEventListener('click', resetAllFilters);
  emptyResetBtn.addEventListener('click', resetAllFilters);

  // Close card details modal
  modalClose.addEventListener('click', closeModal);
  cardModal.addEventListener('click', (e) => {
    if (e.target === cardModal) closeModal();
  });

  // Telegram BackButton integration
  if (tg) {
    tg.BackButton.onClick(() => {
      closeModal();
    });
  }
}

// --- Apply Filters and Render ---
function applyFilters() {
  filteredCards = allCards.filter(card => {
    // Search filter
    const matchesSearch = !activeFilters.search || 
      card.name.toLowerCase().includes(activeFilters.search.toLowerCase()) ||
      card.ability.toLowerCase().includes(activeFilters.search.toLowerCase()) ||
      card.id.toLowerCase().includes(activeFilters.search.toLowerCase());
      
    // Domain filter
    const matchesDomain = activeFilters.domain === 'All' || card.domain.split(' / ').includes(activeFilters.domain);
    
    // Type filter
    const matchesType = activeFilters.type === 'All' || card.type === activeFilters.type;
    
    // Rarity filter
    const matchesRarity = activeFilters.rarity === 'All' || card.rarity === activeFilters.rarity;

    return matchesSearch && matchesDomain && matchesType && matchesRarity;
  });

  renderCards();
}

// --- Reset Filters ---
function resetAllFilters() {
  searchInput.value = '';
  clearSearch.style.display = 'none';
  
  // Reset Domain Pill selector
  document.querySelectorAll('.domain-pill').forEach(btn => btn.classList.remove('active'));
  document.querySelector('.domain-pill[data-domain="All"]').classList.add('active');
  
  typeFilter.value = 'All';
  rarityFilter.value = 'All';
  
  activeFilters = {
    search: '',
    domain: 'All',
    type: 'All',
    rarity: 'All'
  };
  
  applyFilters();
}

// --- Render Cards Grid ---
// Helper: Builds fallback CSS layout for a card if the image fails or doesn't exist
function getFallbackCardHtml(card) {
  const primaryDomain = card.domain.split(' / ')[0];
  let mightHtml = '';
  if (card.might !== null && card.might !== undefined) {
    mightHtml = `
      <div class="card-footer-row">
        <span class="might-badge">✊ ${card.might}</span>
      </div>
    `;
  }
  return `
    <div class="card-header-row">
      <span class="card-id-badge">${card.id}</span>
      <span class="card-rarity-badge ${card.rarity.toLowerCase()}">${card.rarity}</span>
    </div>
    
    <div class="card-art-box">
      <div class="energy-gem">${card.energyCost}</div>
      <div class="card-art-fallback">
        ${getDomainCrestSVG(primaryDomain)}
      </div>
    </div>

    <div class="card-meta-info">
      <h3 class="card-name">${card.name}</h3>
      <div class="card-type-row">
        <span class="card-type-text">${card.type}</span>
        <span class="card-domain-tag">${card.domain}</span>
      </div>
      <p class="card-ability-preview">${card.ability}</p>
    </div>
    ${mightHtml}
  `;
}

// --- Render Cards Grid ---
function renderCards() {
  cardsGrid.innerHTML = '';
  
  // Set count
  cardCount.textContent = `${filteredCards.length} Card${filteredCards.length === 1 ? '' : 's'}`;
  
  if (filteredCards.length === 0) {
    emptyState.style.display = 'block';
    cardsGrid.style.display = 'none';
    return;
  }
  
  emptyState.style.display = 'none';
  cardsGrid.style.display = 'grid';

  filteredCards.forEach((card, index) => {
    const cardEl = document.createElement('div');
    cardEl.className = 'card-wrapper';
    // Staggered fade in animation
    cardEl.style.animationDelay = `${index * 0.03}s`;

    const primaryDomain = card.domain.split(' / ')[0];
    const hasImage = card.image && card.image.startsWith('http');
    if (hasImage) {
      cardEl.innerHTML = `
        <div class="card-item image-card" data-domain="${primaryDomain}" data-id="${card.id}">
          <img src="${card.image}" alt="${card.name}" class="card-img-portrait" loading="lazy" onerror="this.style.display='none'; this.parentElement.classList.remove('image-card'); this.parentElement.innerHTML=getFallbackCardHtml(JSON.parse(this.dataset.card))">
        </div>
      `;
      cardEl.querySelector('.card-item').dataset.card = JSON.stringify(card);
    } else {
      cardEl.innerHTML = `
        <div class="card-item" data-domain="${primaryDomain}" data-id="${card.id}">
          ${getFallbackCardHtml(card)}
        </div>
      `;
    }

    // Click handler to open card details modal
    cardEl.querySelector('.card-item').addEventListener('click', () => {
      openModal(card);
    });

    cardsGrid.appendChild(cardEl);
  });
}

// --- Modal Handlers ---
function openModal(card) {
  // Populate content
  let mightMeta = '';
  if (card.might !== null && card.might !== undefined) {
    mightMeta = `
      <div class="modal-meta-item">
        <span class="meta-label">Might</span>
        <span class="meta-value">✊ ${card.might}</span>
      </div>
    `;
  }

  let powerMeta = '';
  if (card.powerCost !== null && card.powerCost !== undefined) {
    powerMeta = `
      <div class="modal-meta-item">
        <span class="meta-label">Power Cost</span>
        <span class="meta-value">🔮 ${card.powerCost} ${card.domain}</span>
      </div>
    `;
  }

  const primaryDomain = card.domain.split(' / ')[0];
  const hasImage = card.image && card.image.startsWith('http');
  const modalArtHtml = hasImage 
    ? `<img src="${card.image}" alt="${card.name}" class="modal-art-image" style="width: 100%; height: 100%; object-fit: contain; border-radius: 8px;" onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';">
       <div class="card-art-fallback" style="display:none;">
         ${getDomainCrestSVG(primaryDomain).replace('domain-crest-icon', 'domain-crest-icon modal-crest-icon')}
       </div>`
    : `<div class="card-art-fallback">
         ${getDomainCrestSVG(primaryDomain).replace('domain-crest-icon', 'domain-crest-icon modal-crest-icon')}
       </div>`;

  modalBody.innerHTML = `
    <div class="modal-detail-card" data-domain="${primaryDomain}">
      <div class="modal-art-box">
        <div class="energy-gem modal-energy-gem">${card.energyCost}</div>
        ${modalArtHtml}
      </div>

      <div class="modal-title-row">
        <h2 class="modal-card-name">${card.name}</h2>
        <span class="card-id-badge">${card.id}</span>
      </div>

      <div class="modal-meta-grid">
        <div class="modal-meta-item">
          <span class="meta-label">Domain</span>
          <span class="meta-value" style="color: hsl(var(--color-${primaryDomain.toLowerCase()}))">${card.domain}</span>
        </div>
        <div class="modal-meta-item">
          <span class="meta-label">Rarity</span>
          <span class="meta-value ${card.rarity.toLowerCase()}">${card.rarity}</span>
        </div>
        <div class="modal-meta-item">
          <span class="meta-label">Card Type</span>
          <span class="meta-value">${card.type}</span>
        </div>
        ${mightMeta || powerMeta ? (mightMeta + powerMeta) : `
          <div class="modal-meta-item">
            <span class="meta-label">Energy Cost</span>
            <span class="meta-value">⚡ ${card.energyCost} Energy</span>
          </div>
        `}
      </div>

      <div class="modal-ability-box">
        <h4 class="modal-ability-label">Ability / Text</h4>
        <p class="modal-ability-text">${card.ability}</p>
      </div>

      <div class="modal-actions">
        <button class="modal-btn share-btn" id="shareCardBtn">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"></path><polyline points="16 6 12 2 8 6"></polyline><line x1="12" y1="2" x2="12" y2="15"></line></svg>
          Share Card
        </button>
        <button class="modal-btn close-action-btn" id="modalCloseActionBtn">Close</button>
      </div>
    </div>
  `;

  // Show Modal
  cardModal.classList.add('active');
  
  // Set Back Button on Telegram
  if (tg) {
    tg.BackButton.show();
  }

  // Deep Link URL update
  setURLParam('card', card.id);

  // Setup button handlers inside modal
  document.getElementById('modalCloseActionBtn').addEventListener('click', closeModal);
  document.getElementById('shareCardBtn').addEventListener('click', () => {
    shareCard(card);
  });
}

function closeModal() {
  cardModal.classList.remove('active');
  
  // Hide Back Button on Telegram
  if (tg) {
    tg.BackButton.hide();
  }

  // Clear deep link URL param
  removeURLParam('card');
}

// --- Share Card Logic ---
function shareCard(card) {
  const shareText = `Check out ${card.name} (${card.id}) in the Riftbound Card Explorer!\n\n` +
    `🧬 Type: ${card.type}\n` +
    `🌀 Domain: ${card.domain}\n` +
    `⚡ Cost: ${card.energyCost}\n` +
    `✊ Might: ${card.might || 'N/A'}\n` +
    `📖 Effect: ${card.ability}`;

  const currentUrl = window.location.origin + window.location.pathname + `?card=${card.id}`;

  if (navigator.share) {
    navigator.share({
      title: `${card.name} - Riftbound`,
      text: shareText,
      url: currentUrl,
    }).catch(console.error);
  } else {
    // Fallback: Copy link to clipboard
    navigator.clipboard.writeText(currentUrl).then(() => {
      // Trigger native TG alert or browser alert
      if (tg) {
        tg.showAlert('📋 Card link copied to clipboard!');
      } else {
        alert('📋 Card link copied to clipboard!');
      }
    }).catch(err => {
      console.error('Could not copy link:', err);
    });
  }
}

// --- URL Parameter Utilities ---
function checkDeepLink() {
  const urlParams = new URLSearchParams(window.location.search);
  const cardId = urlParams.get('card');
  if (cardId) {
    const card = allCards.find(c => c.id.toLowerCase() === cardId.toLowerCase());
    if (card) {
      openModal(card);
    }
  }
}

function setURLParam(key, value) {
  const url = new URL(window.location.href);
  url.searchParams.set(key, value);
  window.history.replaceState({}, '', url.toString());
}

function removeURLParam(key) {
  const url = new URL(window.location.href);
  url.searchParams.delete(key);
  window.history.replaceState({}, '', url.toString());
}
