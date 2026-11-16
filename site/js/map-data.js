/**
 * Карты маршрутов: GPX из папки tracks/ + запасные точки.
 * Имена файлов: tracks/{key}.gpx  (см. tracks/README.txt)
 */
window.TRAIL_MAP_KEYS = ["bolshaya-baykalskaya-tropa", "dvuglavaya-sopka-taganay", "visyachiy-kamen-ergaki", "avachinskiy-vulkan", "tropa-golitsyna", "marshrut-30", "vottovaara", "multinskie-ozera"];
window.TRAIL_MAP_FALLBACKS = {"bolshaya-baykalskaya-tropa": {"center": [51.93, 105.12], "zoom": 10, "points": [{"lat": 51.8564, "lng": 104.8908, "label": "Старт: Листвянка"}, {"lat": 52.0099, "lng": 105.3626, "label": "Финиш: Большое Голоустное"}]}, "dvuglavaya-sopka-taganay": {"center": [55.271, 59.776], "zoom": 13, "points": [{"lat": 55.255, "lng": 59.785, "label": "Центральная усадьба"}, {"lat": 55.271, "lng": 59.776, "label": "Двуглавая сопка"}]}, "visyachiy-kamen-ergaki": {"center": [52.837, 93.35], "zoom": 12, "points": [{"lat": 52.837, "lng": 93.35, "label": "Старт / визит-центр"}, {"lat": 52.845, "lng": 93.38, "label": "Висячий камень"}]}, "avachinskiy-vulkan": {"center": [53.255, 158.836], "zoom": 12, "points": [{"lat": 53.255, "lng": 158.836, "label": "Кордон Авачинский"}]}, "tropa-golitsyna": {"center": [44.825, 34.911], "zoom": 14, "points": [{"lat": 44.825, "lng": 34.911, "label": "Старт (Новый Свет)"}, {"lat": 44.821, "lng": 34.905, "label": "Мыс Капчик"}]}, "marshrut-30": {"center": [44.08, 39.92], "zoom": 10, "points": [{"lat": 44.08, "lng": 39.92, "label": "Старт (Лаго-Наки)"}, {"lat": 43.68, "lng": 39.65, "label": "Финиш (Дагомыс)"}]}, "vottovaara": {"center": [63.074, 32.625], "zoom": 13, "points": [{"lat": 63.074, "lng": 32.625, "label": "Воттоваара"}]}, "multinskie-ozera": {"center": [50.16, 85.92], "zoom": 12, "points": [{"lat": 50.16, "lng": 85.92, "label": "Нижнее Мультинское"}, {"lat": 50.17, "lng": 85.93, "label": "Шумы"}]}};
window.TRAIL_MAP_RULES = [["bolshaya-baykalskaya-tropa", "bajkal|baikal|байкал|ббт|listvyank|листвян|goloustn|голоустн"], ["dvuglavaya-sopka-taganay", "tagan|таганай|dvuglav|двуглав"], ["visyachiy-kamen-ergaki", "ergak|ергак|visyach|висяч"], ["avachinskiy-vulkan", "avach|авач"], ["tropa-golitsyna", "golits|голицын|kapchik|капчик"], ["marshrut-30", "marshrut.?30|маршрут.?30|через горы|фишт|лаго.?наки"], ["vottovaara", "vottov|воттоваар"], ["multinskie-ozera", "multin|мультин|shumy|шумы"]];

window.matchTrailKey = function (route) {
  if (!route) return null;
  var slug = String(route.slug || '').toLowerCase().trim();
  var title = String(route.title || '').toLowerCase();
  var keys = window.TRAIL_MAP_KEYS || [];
  if (slug && keys.indexOf(slug) !== -1) return slug;
  var hay = slug + ' ' + title;
  var rules = window.TRAIL_MAP_RULES || [];
  for (var i = 0; i < rules.length; i++) {
    try {
      if (new RegExp(rules[i][1], 'i').test(hay)) return rules[i][0];
    } catch (e) {}
  }
  return null;
};

/**
 * Возвращает map_data:
 * 1) из БД, если map_data заполнен
 * 2) иначе { type:'url', url:'tracks/KEY.gpx' } — код сам скачает GPX
 * 3) если GPX ещё нет — запасные точки из TRAIL_MAP_FALLBACKS
 *
 * Для (2)/(3) renderTrailMap сначала пробует URL; при ошибке рисует points.
 */
window.resolveTrailMapData = function (route) {
  if (!route) return null;
  var fromDb = route.map_data;
  if (fromDb != null && String(fromDb).trim() !== '') return fromDb;

  var key = window.matchTrailKey(route);
  if (!key) return null;

  var fb = (window.TRAIL_MAP_FALLBACKS || {})[key] || {};
  return {
    type: 'url',
    url: 'tracks/' + key + '.gpx',
    center: fb.center || null,
    zoom: fb.zoom || 12,
    points: fb.points || []
  };
};
