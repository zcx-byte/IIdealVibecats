/**
 * Тропы России — логика главной страницы
 * Связь с Supabase через API-ключ (anon key)
 */
/** Читает config.txt (ключ=значение), подставляет URL и anon key */
async function loadConfigFromFile(path) {
  path = path || 'config.txt';
  try {
    const res = await fetch(path, { cache: 'no-store' });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const text = await res.text();
    const cfg = {};
    text.split(/\r?\n/).forEach((line) => {
      const t = line.trim();
      if (!t || t.startsWith('#') || t.startsWith(';')) return;
      const eq = t.indexOf('=');
      if (eq === -1) return;
      const key = t.slice(0, eq).trim();
      const val = t.slice(eq + 1).trim().replace(/^["']|["']$/g, '');
      if (key) cfg[key] = val;
    });
    if (cfg.SUPABASE_URL) SUPABASE_URL = cfg.SUPABASE_URL;
    if (cfg.SUPABASE_ANON_KEY) SUPABASE_ANON_KEY = cfg.SUPABASE_ANON_KEY;
    // алиасы
    if (cfg.URL) SUPABASE_URL = cfg.URL;
    if (cfg.ANON_KEY) SUPABASE_ANON_KEY = cfg.ANON_KEY;
    if (cfg.API_KEY) SUPABASE_ANON_KEY = cfg.API_KEY;
    console.info('[Тропы] config.txt загружен:', path);
    return cfg;
  } catch (err) {
    console.warn('[Тропы] config.txt не прочитан (' + path + '):', err.message,
      '— используются значения по умолчанию из app.js. Откройте сайт через локальный сервер (не file://).');
    return null;
  }
}

// ========== СОСТОЯНИЕ ==========
const PAGE_SIZE = 4;
let allRoutes = [];
let filteredRoutes = [];
let visibleCount = PAGE_SIZE;
let activeTags = new Set();
let activeDifficulty = null;

const ICONS = {
  distance: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>`,
  time: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>`,
  elevation: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M8 18L12 9l4 9"/><path d="M4 18h16"/></svg>`
};

// ========== УТИЛИТЫ ДЛЯ ТЕГОВ ==========
/** Приводит tags из БД (text[] или строка) к массиву строк в нижнем регистре */
function normalizeTags(tags) {
  if (tags == null || tags === '') return [];
  if (Array.isArray(tags)) {
    return tags.map((t) => String(t).trim().toLowerCase()).filter(Boolean);
  }
  // строка "a, b, c" или Postgres array literal
  return String(tags)
    .replace(/^\{|\}$/g, '')
    .split(',')
    .map((t) => t.trim().replace(/^"|"$/g, '').toLowerCase())
    .filter(Boolean);
}

// ========== ЗАГРУЗКА ==========
async function loadRoutes() {
  await loadConfigFromFile('config.txt');
  // Нормализуем URL: убираем /rest/v1 и хвостовой слэш
  let baseUrl = (SUPABASE_URL || '').trim().replace(/\/+$/, '');
  baseUrl = baseUrl.replace(/\/rest\/v1$/i, '');

  if (
    !baseUrl ||
    !SUPABASE_ANON_KEY ||
    baseUrl.includes('YOUR_PROJECT') ||
    SUPABASE_ANON_KEY === 'YOUR_ANON_KEY'
  ) {
    const msg = 'Укажите SUPABASE_URL (без /rest/v1) и SUPABASE_ANON_KEY в js/app.js';
    console.error('[Тропы]', msg);
    showLoadError(msg);
    return [];
  }

  console.info('[Тропы] Base URL:', baseUrl);

  try {
    if (!window.supabase) {
      await loadScript('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2');
    }

    const client = window.supabase.createClient(baseUrl, SUPABASE_ANON_KEY);

    // Сначала простой запрос — все колонки
    const { data: routes, error: routesError } = await client
      .from('routes')
      .select('*')
      .order('id');

    if (routesError) {
      console.error('[Supabase] routes:', routesError);
      showLoadError(routesError.message || JSON.stringify(routesError));
      return [];
    }

    if (!routes || routes.length === 0) {
      const msg =
        'Маршруты не найдены. Проверьте таблицу routes и RLS (policy SELECT для anon).';
      console.warn('[Supabase]', msg);
      showLoadError(msg);
      return [];
    }

    let regionMap = {};
    const { data: regions, error: regError } = await client
      .from('regions')
      .select('id, name');

    if (!regError && regions) {
      regions.forEach((reg) => {
        regionMap[reg.id] = reg.name;
      });
    } else if (regError) {
      console.warn('[Supabase] regions (не критично):', regError.message);
    }

    const result = routes.map((r) => ({
      ...r,
      region_name: regionMap[r.region_id] || 'Россия',
      tags: normalizeTags(r.tags)
    }));

    console.info('[Тропы] Загружено из БД:', result.length, result.map((r) => r.title));
    return result;
  } catch (err) {
    console.error('[Тропы]', err);
    showLoadError(String(err.message || err));
    return [];
  }
}

function showLoadError(msg) {
  const el = document.getElementById('load-status');
  if (el) {
    el.style.display = 'block';
    el.textContent = 'Ошибка загрузки данных: ' + msg;
  }
}

function loadScript(src) {
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = src;
    s.onload = resolve;
    s.onerror = () => reject(new Error('Не удалось загрузить supabase-js'));
    document.head.appendChild(s);
  });
}

// ========== ТЕГИ ==========
function collectAllTags(routes) {
  const set = new Set();
  routes.forEach((r) => {
    normalizeTags(r.tags).forEach((t) => set.add(t));
  });
  return Array.from(set).sort();
}

function renderTagChips(tags) {
  const container = document.getElementById('tag-chips');
  if (!container) return;

  if (!tags.length) {
    container.innerHTML =
      '<span style="color:var(--text-muted);font-size:0.9rem">Нет тегов в данных</span>';
    return;
  }

  container.innerHTML = tags
    .map((tag) => `<button type="button" class="chip" data-tag="${escapeHtml(tag)}">${escapeHtml(tag)}</button>`)
    .join('');

  container.querySelectorAll('.chip').forEach((chip) => {
    chip.addEventListener('click', () => {
      const tag = chip.dataset.tag;
      if (activeTags.has(tag)) {
        activeTags.delete(tag);
        chip.classList.remove('active');
      } else {
        activeTags.add(tag);
        chip.classList.add('active');
      }
      applyFilters();
    });
  });
}

// ========== ФИЛЬТРАЦИЯ ==========
function applyFilters() {
  const region = document.getElementById('filter-region')?.value || '';
  const distance = document.getElementById('filter-distance')?.value || '';
  const type = document.getElementById('filter-type')?.value || '';
  const search = (document.getElementById('filter-search')?.value || '').toLowerCase().trim();
  const sort = document.getElementById('sort-select')?.value || 'default';

  filteredRoutes = allRoutes.filter((r) => {
    if (region && !(r.region_name || '').includes(region)) return false;

    if (activeDifficulty) {
      const d = (r.difficulty || '').toLowerCase().replace(/ё/g, 'е');
      // activeDifficulty: easy | medium | hard
      if (activeDifficulty === 'easy' && !d.includes('легк')) return false;
      if (activeDifficulty === 'medium' && !d.includes('средн')) return false;
      if (activeDifficulty === 'hard' && !d.includes('сложн')) return false;
    }

    if (type) {
      const rt = (r.route_type || '').toLowerCase().replace(/ё/g, 'е');
      if (!rt.includes(type.toLowerCase().replace(/ё/g, 'е'))) return false;
    }

    if (search) {
      const hay = `${r.title || ''} ${r.short_announcement || ''} ${normalizeTags(r.tags).join(' ')}`.toLowerCase();
      if (!hay.includes(search)) return false;
    }

    if (distance) {
      const km = Number(r.distance_km) || 0;
      if (distance === '0-20' && km > 20) return false;
      if (distance === '20-50' && (km < 20 || km > 50)) return false;
      if (distance === '50+' && km < 50) return false;
    }

    // Теги: маршрут должен содержать ВСЕ выбранные теги
    if (activeTags.size > 0) {
      const routeTags = normalizeTags(r.tags);
      for (const tag of activeTags) {
        if (!routeTags.includes(tag)) return false;
      }
    }

    return true;
  });

  if (sort === 'distance-asc') {
    filteredRoutes.sort((a, b) => (Number(a.distance_km) || 0) - (Number(b.distance_km) || 0));
  } else if (sort === 'distance-desc') {
    filteredRoutes.sort((a, b) => (Number(b.distance_km) || 0) - (Number(a.distance_km) || 0));
  } else if (sort === 'elevation-desc') {
    filteredRoutes.sort((a, b) => (Number(b.elevation_m) || 0) - (Number(a.elevation_m) || 0));
  }

  visibleCount = PAGE_SIZE;
  renderRoutes();
}

// ========== РЕНДЕР ==========
function getDifficultyClass(diff) {
  if (!diff) return 'medium';
  const d = String(diff).toLowerCase().replace(/ё/g, 'е');
  // Лёгкий / Лёгкая / легкий
  if (d.includes('легк')) return 'easy';
  // Сложный / Сложная
  if (d.includes('сложн')) return 'hard';
  // Средний / Средняя
  return 'medium';
}

function renderCard(route) {
  const diffClass = getDifficultyClass(route.difficulty);
  const img = route.photo_url
    ? `<img src="${escapeHtml(route.photo_url)}" alt="${escapeHtml(route.title)}" loading="lazy" />`
    : `<div class="placeholder">🏞</div>`;

  return `
    <article class="route-card" data-slug="${escapeHtml(route.slug)}" role="link" tabindex="0">
      <div class="route-card-img">
        ${img}
        <span class="route-card-badge">${escapeHtml(route.route_type || 'маршрут')}</span>
      </div>
      <div class="route-card-body">
        <div class="route-card-region">${escapeHtml(route.region_name || 'Россия')}</div>
        <h3>${escapeHtml(route.title)}</h3>
        <p class="short">${escapeHtml(route.short_announcement || '')}</p>
        <div class="route-card-meta">
          <span class="difficulty ${diffClass}">${escapeHtml(route.difficulty || '—')}</span>
          <span class="meta-item">${ICONS.distance} ${route.distance_km ?? '—'} км</span>
          <span class="meta-item">${ICONS.time} ${escapeHtml(route.duration_text || '—')}</span>
          <span class="meta-item">${ICONS.elevation} ${route.elevation_m ?? '—'} м</span>
        </div>
      </div>
    </article>
  `;
}

function renderRoutes() {
  const grid = document.getElementById('routes-grid');
  const countEl = document.getElementById('routes-count');
  const loadMoreWrap = document.getElementById('load-more-wrap');
  if (!grid) return;

  const visible = filteredRoutes.slice(0, visibleCount);
  if (countEl) countEl.textContent = filteredRoutes.length;

  if (!filteredRoutes.length) {
    grid.innerHTML = `
      <div class="empty-state">
        <h3>Ничего не найдено</h3>
        <p>Попробуйте сбросить фильтры или проверьте загрузку данных (консоль браузера F12)</p>
      </div>`;
    if (loadMoreWrap) loadMoreWrap.style.display = 'none';
    return;
  }

  grid.innerHTML = visible.map(renderCard).join('');

  grid.querySelectorAll('.route-card').forEach((card) => {
    const go = () => {
      window.location.href = `route.html?slug=${encodeURIComponent(card.dataset.slug)}`;
    };
    card.addEventListener('click', go);
    card.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        go();
      }
    });
  });

  if (loadMoreWrap) {
    loadMoreWrap.style.display = visibleCount >= filteredRoutes.length ? 'none' : 'flex';
  }
}

function escapeHtml(str) {
  if (str == null) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function fillRegionSelect(routes) {
  const select = document.getElementById('filter-region');
  if (!select) return;
  const regions = [...new Set(routes.map((r) => r.region_name).filter(Boolean))].sort();
  const current = select.value;
  select.innerHTML =
    '<option value="">Все регионы</option>' +
    regions.map((r) => `<option value="${escapeHtml(r)}">${escapeHtml(r)}</option>`).join('');
  if (current) select.value = current;
}

// ========== INIT ==========
document.addEventListener('DOMContentLoaded', async () => {
  const statusEl = document.getElementById('load-status');
  if (statusEl) {
    statusEl.style.display = 'block';
    statusEl.textContent = 'Загрузка маршрутов из Supabase...';
  }

  allRoutes = await loadRoutes();
  filteredRoutes = [...allRoutes];

  if (statusEl && allRoutes.length) {
    statusEl.style.display = 'none';
  }

  renderTagChips(collectAllTags(allRoutes));
  fillRegionSelect(allRoutes);
  renderRoutes();

  document.querySelectorAll('#difficulty-chips .chip').forEach((chip) => {
    chip.addEventListener('click', () => {
      const val = chip.dataset.value;
      if (activeDifficulty === val) {
        activeDifficulty = null;
        chip.classList.remove('active');
      } else {
        activeDifficulty = val;
        document.querySelectorAll('#difficulty-chips .chip').forEach((c) => c.classList.remove('active'));
        chip.classList.add('active');
      }
      applyFilters();
    });
  });

  document.getElementById('btn-apply')?.addEventListener('click', applyFilters);

  document.getElementById('btn-reset')?.addEventListener('click', () => {
    const ids = ['filter-region', 'filter-distance', 'filter-type', 'filter-search', 'sort-select'];
    ids.forEach((id) => {
      const el = document.getElementById(id);
      if (el) el.value = id === 'sort-select' ? 'default' : '';
    });
    activeDifficulty = null;
    activeTags.clear();
    document.querySelectorAll('#difficulty-chips .chip, #tag-chips .chip').forEach((c) => c.classList.remove('active'));
    applyFilters();
  });

  ['filter-search', 'filter-region', 'filter-distance', 'filter-type', 'sort-select'].forEach((id) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.addEventListener(id === 'filter-search' ? 'input' : 'change', applyFilters);
  });

  document.getElementById('btn-load-more')?.addEventListener('click', () => {
    visibleCount += PAGE_SIZE;
    renderRoutes();
  });
});

window.loadConfigFromFile = loadConfigFromFile;
window.getSupabaseConfig = () => ({ url: SUPABASE_URL, key: SUPABASE_ANON_KEY });
