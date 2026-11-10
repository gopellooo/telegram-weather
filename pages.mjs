import { findCity, forecast } from './weather.mjs';

const frame = document.getElementById('frame');
const notice = document.getElementById('notice');
const cityInput = document.getElementById('city');
const settings = document.getElementById('settings');
const listeners = new Map();
let activePlace;
let requestId = 0;
let revision = 0;

function showNotice(message) {
  const sampleLabel = !activePlace && bridge.publicData ? 'Демо · вымышленные данные' : '';
  notice.textContent = [sampleLabel, message].filter(Boolean).join(' · ');
  notice.hidden = !notice.textContent;
}

const bridge = {
  publicData: null,
  onEvent(name, listener) {
    listeners.set(name, listener);
  },
  async request() {
    if (!activePlace) throw { code: 'NOT_ALLOWED' };
    const place = activePlace;
    const result = await forecast(place);
    if (place !== activePlace) throw { code: 'FAILED' };
    return { result: JSON.stringify({ ...result, rev: ++revision }) };
  }
};

function showWeather(state) {
  bridge.publicData = JSON.stringify({ ...state, rev: ++revision });
  listeners.get('publicDataChanged')?.();
}

async function chooseCity(name) {
  const id = ++requestId;
  showNotice('Загружаем погоду…');
  try {
    const place = await findCity(name);
    const state = await forecast(place);
    if (id !== requestId) return;
    activePlace = place;
    showWeather(state);
    showNotice('');
  } catch (error) {
    if (id !== requestId) return;
    settings.open = true;
    showNotice(error.message.startsWith('Город не найден') ? error.message : 'Не удалось загрузить погоду. Попробуйте ещё раз.');
  }
}

async function start() {
  const response = await fetch('./widget.html');
  if (!response.ok) throw new Error('Виджет недоступен.');
  const widget = await response.text();
  window.weatherPreviewBridge = bridge;
  const shim = '<script>window.TelegramWidget = parent.weatherPreviewBridge;</script>';
  frame.srcdoc = widget.replace('<script>', shim + '<script>');

  document.getElementById('form').addEventListener('submit', event => {
    event.preventDefault();
    if (cityInput.value.trim()) void chooseCity(cityInput.value);
  });

  document.getElementById('demo').addEventListener('click', async () => {
    const id = ++requestId;
    try {
      const response = await fetch('./demo.json');
      if (!response.ok) throw new Error();
      const sample = await response.json();
      if (id !== requestId) return;
      activePlace = undefined;
      showWeather(sample);
      showNotice('');
    } catch {
      if (id === requestId) showNotice('Не удалось загрузить демо.');
    }
  });

  void chooseCity(cityInput.value);
}

start().catch(() => showNotice('Не удалось открыть виджет. Обновите страницу.'));
