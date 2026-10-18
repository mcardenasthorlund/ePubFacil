import './index.css';
import { EpubFacilApp } from './App';

function init() {
  const rootElement = document.getElementById('root');
  if (rootElement) {
    rootElement.innerHTML = '';
    new EpubFacilApp(rootElement);
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
