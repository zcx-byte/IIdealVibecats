/**
 * Конфигурация карт маршрутов.
 * Храним данные в одном объекте для удобства поддержки и избежания глобальных переменных.
 */
const TrailMapConfig = {
  fallbacks: {
    "bolshaya-baykalskaya-tropa": {
      center: [51.93, 105.12], zoom: 10,
      points: [{ lat: 51.8564, lng: 104.8908, label: "Старт: Листвянка" }, { lat: 52.0099, lng: 105.3626, label: "Финиш: Большое Голоустное" }]
    },
    "dvuglavaya-sopka-taganay": {
      center: [55.271, 59.776], zoom: 13,
      points: [{ lat: 55.255, lng: 59.785, label: "Центральная усадьба" }, { lat: 55.271, lng: 59.776, label: "Двуглавая сопка" }]
    },
    "visyachiy-kamen-ergaki": {
      center: [52.837, 93.35], zoom: 12,
      points: [{ lat: 52.837, lng: 93.35, label: "Старт / визит-центр" }, { lat: 52.845, lng: 93.38, label: "Висячий камень" }]
    },
    "avachinskiy-vulkan": {
      center: [53.255, 158.836], zoom: 12,
      points: [{ lat: 53.255, lng: 158.836, label: "Кордон Авачинский" }]
    },
    "tropa-golitsyna": {
      center: [44.825, 34.911], zoom: 14,
      points: [{ lat: 44.825, lng: 34.911, label: "Старт (Новый Свет)" }, { lat: 44.821, lng: 34.905, label: "Мыс Капчик" }]
    },
    "marshrut-30": {
      center: [44.08, 39.92], zoom: 10,
      points: [{ lat: 44.08, lng: 39.92, label: "Старт (Лаго-Наки)" }, { lat: 43.68, lng: 39.65, label: "Финиш (Дагомыс)" }]
    },
    "vottovaara": {
      center: [63.074, 32.625], zoom: 13,
      points: [{ lat: 63.074, lng: 32.625, label: "Воттоваара" }]
    },
    "multinskie-ozera": {
      center: [50.16, 85.92], zoom: 12,
      points: [{ lat: 50.16, lng: 85.92, label: "Нижнее Мультинское" }, { lat: 50.17, lng: 85.93, label: "Шумы" }]
    }
  },
  
  // Регулярные выражения для сопоставления slug/title с ключом файла
  rules: [
    { key: "bolshaya-baykalskaya-tropa", pattern: /bajkal|baikal|байкал|ббт|listvyank|листвян|goloustn|голоустн/i },
    { key: "dvuglavaya-sopka-taganay", pattern: /tagan|таганай|dvuglav|двуглав/i },
    { key: "visyachiy-kamen-ergaki", pattern: /ergak|ергак|visyach|висяч/i },
    { key: "avachinskiy-vulkan", pattern: /avach|авач/i },
    { key: "tropa-golitsyna", pattern: /golits|голицын|kapchik|капчик/i },
    { key: "marshrut-30", pattern: /marshrut\.?30|маршрут\.?30|через горы|фишт|лаго\.?наки/i },
    { key: "vottovaara", pattern: /vottov|воттоваар/i },
    { key: "multinskie-ozera", pattern: /multin|мультин|shumy|шумы/i }
  ]
};

/**
 * Находит ключ файла карты по данным маршрута.
 * Сначала проверяет точное совпадение slug, затем использует регулярные выражения.
 */
function findTrailMapKey(route) {
  if (!route) return null;
  
  const slug = String(route.slug || "").toLowerCase().trim();
  const title = String(route.title || "").toLowerCase();
  const searchContext = `${slug} ${title}`;

  // 1. Точное совпадение slug (самый надежный способ)
  if (TrailMapConfig.fallbacks[slug]) {
    return slug;
  }

  // 2. Поиск по ключевым словам
  for (const rule of TrailMapConfig.rules) {
    if (rule.pattern.test(searchContext)) {
      return rule.key;
    }
  }

  return null;
}

/**
 * Определяет источник данных для карты.
 * Приоритет: 1. Поле map_data из БД -> 2. Локальный GPX файл -> 3. Запасные координаты.
 */
function resolveTrailMapData(route) {
  if (!route) return null;

  // Если в БД уже есть данные, используем их без изменений
  if (route.map_data != null && String(route.map_data).trim() !== "") {
    return route.map_data;
  }

  const key = findTrailMapKey(route);
  if (!key) return null;

  const fallback = TrailMapConfig.fallbacks[key] || {};
  
  // Возвращаем инструкцию для загрузчика карт
  return {
    type: "url",
    url: `tracks/${key}.gpx`,
    center: fallback.center || null,
    zoom: fallback.zoom || 12,
    points: fallback.points || []
  };
}