// src/app.js
// Клиент Open-Meteo (погода + геокодинг), без API-ключа.
// fetch + async/await, состояние загрузки/ошибки, поиск с параметром,
// детальный просмотр по координатам, Promise.all.

const GEO_BASE = 'https://geocoding-api.open-meteo.com/v1';
const WEATHER_BASE = 'https://api.open-meteo.com/v1';

// Коды погоды по стандарту WMO (упрощённый словарь для отображения)
const WEATHER_CODES = {
  0: 'Ясно', 1: 'Преим. ясно', 2: 'Переменная облачность', 3: 'Пасмурно',
  45: 'Туман', 48: 'Изморозь',
  51: 'Морось слабая', 53: 'Морось', 55: 'Морось сильная',
  61: 'Дождь слабый', 63: 'Дождь', 65: 'Дождь сильный',
  71: 'Снег слабый', 73: 'Снег', 75: 'Снег сильный',
  80: 'Ливень', 81: 'Ливень сильный', 82: 'Ливень очень сильный',
  95: 'Гроза', 96: 'Гроза с градом',
};

const listStatus = document.querySelector('#list-status');
const cityList = document.querySelector('#city-list');

const searchForm = document.querySelector('#search-form');
const searchInput = document.querySelector('#search-input');
const searchStatus = document.querySelector('#search-status');
const searchResults = document.querySelector('#search-results');

const detailPanel = document.querySelector('#detail-panel');
const detailStatus = document.querySelector('#detail-status');
const detailContent = document.querySelector('#detail-content');
const detailBackBtn = document.querySelector('#detail-back-btn');

const compareForm = document.querySelector('#compare-form');
const compareStatus = document.querySelector('#compare-status');
const compareResult = document.querySelector('#compare-result');

/** Обёртка над fetch: достаёт JSON и явно проверяет response.ok. */
async function fetchJSON(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Запрос не удался: ${response.status} ${response.statusText}`);
  }
  return response.json();
}

function setStatus(el, text, type) {
  el.textContent = text;
  el.className = 'status' + (type ? ' ' + type : '');
}

function clearStatus(el) {
  el.textContent = '';
  el.className = 'status';
}

/** 1-й запрос: превращает название города в координаты (id для погоды). */
async function geocodeCity(name) {
  const url = `${GEO_BASE}/search?name=${encodeURIComponent(name)}&count=5&language=ru&format=json`;
  const data = await fetchJSON(url);
  if (!data.results || data.results.length === 0) {
    throw new Error(`Город «${name}» не найден`);
  }
  return data.results;
}

/** 2-й запрос: погода по координатам. */
async function fetchWeather(lat, lon) {
  const url = `${WEATHER_BASE}/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,relative_humidity_2m,wind_speed_10m,weather_code&timezone=auto`;
  const data = await fetchJSON(url);
  return data.current;
}

function cityCardHtml(place, current) {
  const desc = WEATHER_CODES[current.weather_code] ?? `код ${current.weather_code}`;
  return `
    <article class="city-card" data-lat="${place.latitude}" data-lon="${place.longitude}" data-name="${place.name}">
      <h3>${place.name}${place.country ? ', ' + place.country : ''}</h3>
      <div class="temp">${Math.round(current.temperature_2m)}°C</div>
      <p>${desc}</p>
      <p>Ветер: ${current.wind_speed_10m} км/ч</p>
    </article>`;
}

/** Загружает погоду для фиксированного набора городов по умолчанию. */
async function loadDefaultCities() {
  const defaultCities = [
    { name: 'Алматы', latitude: 43.2389, longitude: 76.8897, country: 'Казахстан' },
    { name: 'Астана', latitude: 51.1801, longitude: 71.446, country: 'Казахстан' },
    { name: 'Шымкент', latitude: 42.3417, longitude: 69.59, country: 'Казахстан' },
  ];

  setStatus(listStatus, 'Загрузка погоды…', 'loading');
  cityList.innerHTML = '';

  try {
    let html = '';
    for (const place of defaultCities) {
      const current = await fetchWeather(place.latitude, place.longitude);
      html += cityCardHtml(place, current);
    }
    cityList.innerHTML = html;
    clearStatus(listStatus);
  } catch (err) {
    setStatus(listStatus, `Не удалось загрузить погоду: ${err.message}`, 'error');
  }
}

// Клик по карточке города по умолчанию — тоже открывает детальный просмотр
cityList.addEventListener('click', (event) => {
  const card = event.target.closest('.city-card');
  if (!card) return;
  showDetail(card.dataset.name, card.dataset.lat, card.dataset.lon);
});

/** 3. Поиск — отдельный запрос (геокодинг) с параметром name. */
searchForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const query = searchInput.value.trim();
  if (!query) return;

  setStatus(searchStatus, `Ищу «${query}»…`, 'loading');
  searchResults.innerHTML = '';

  try {
    const places = await geocodeCity(query);
    clearStatus(searchStatus);
    searchResults.innerHTML = places
      .map(
        (p) => `
        <li data-lat="${p.latitude}" data-lon="${p.longitude}" data-name="${p.name}">
          ${p.name}${p.admin1 ? ', ' + p.admin1 : ''}${p.country ? ', ' + p.country : ''}
        </li>`
      )
      .join('');
  } catch (err) {
    setStatus(searchStatus, err.message, 'error');
  }
});

// Делегирование: один слушатель на список результатов поиска
searchResults.addEventListener('click', (event) => {
  const li = event.target.closest('li');
  if (!li) return;
  showDetail(li.dataset.name, li.dataset.lat, li.dataset.lon);
});

/** 4. Детальный просмотр: второй запрос по координатам (id места). */
async function showDetail(name, lat, lon) {
  detailPanel.classList.remove('hidden');
  detailContent.innerHTML = '';
  setStatus(detailStatus, 'Загрузка погоды…', 'loading');
  detailPanel.scrollIntoView({ behavior: 'smooth', block: 'start' });

  try {
    const current = await fetchWeather(lat, lon);
    clearStatus(detailStatus);
    const desc = WEATHER_CODES[current.weather_code] ?? `код ${current.weather_code}`;

    detailContent.innerHTML = `
      <div class="detail-content-inner">
        <dl>
          <dt>Город</dt><dd>${name}</dd>
          <dt>Температура</dt><dd>${current.temperature_2m}°C</dd>
          <dt>Погода</dt><dd>${desc}</dd>
          <dt>Влажность</dt><dd>${current.relative_humidity_2m}%</dd>
          <dt>Ветер</dt><dd>${current.wind_speed_10m} км/ч</dd>
          <dt>Время замера</dt><dd>${current.time}</dd>
        </dl>
      </div>`;
  } catch (err) {
    setStatus(detailStatus, `Не удалось загрузить погоду: ${err.message}`, 'error');
  }
}

detailBackBtn.addEventListener('click', () => {
  detailPanel.classList.add('hidden');
});

/** Геокодинг + погода одной цепочкой — используется в Promise.all ниже. */
async function getCityWeather(name) {
  const [place] = await geocodeCity(name);
  const current = await fetchWeather(place.latitude, place.longitude);
  return { place, current };
}

/** 5. Promise.all — два параллельных запроса (точнее, два параллельных конвейера запросов). */
compareForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const cityA = document.querySelector('#compare-a').value.trim();
  const cityB = document.querySelector('#compare-b').value.trim();

  if (!cityA || !cityB) {
    setStatus(compareStatus, 'Укажи оба города.', 'error');
    return;
  }

  setStatus(compareStatus, 'Загружаю оба города параллельно…', 'loading');
  compareResult.innerHTML = '';

  try {
    // Обе цепочки (геокодинг + погода) стартуют одновременно —
    // Promise.all ждёт, пока ОБЕ не завершатся успешно.
    const [resultA, resultB] = await Promise.all([getCityWeather(cityA), getCityWeather(cityB)]);

    clearStatus(compareStatus);
    compareResult.innerHTML =
      cityCardHtml(resultA.place, resultA.current) + cityCardHtml(resultB.place, resultB.current);
  } catch (err) {
    setStatus(compareStatus, `Не удалось сравнить города: ${err.message}`, 'error');
  }
});

// Стартовая загрузка при открытии страницы
loadDefaultCities();
