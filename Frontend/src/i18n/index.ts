/**
 * FutureSchool - i18n Initialisation
 * Languages: English (en) and Telugu (te)
 * Default: English. Persisted as a device preference via the storage adapter.
 */
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import en from './en.json';
import te from './te.json';
import { storage, storageKeys } from '../services/storage';

const LANG_KEY = storageKeys.device('language');

const saved = storage.get<string>(LANG_KEY, 'en');
const savedLang = saved === 'te' ? 'te' : 'en';

i18n
  .use(initReactI18next)
  .init({
    resources: {
      en: { translation: en },
      te: { translation: te },
    },
    lng: savedLang,
    fallbackLng: 'en',
    interpolation: { escapeValue: false },
  });

// Persist language selection
i18n.on('languageChanged', (lng: string) => {
  storage.set(LANG_KEY, lng);
});

export default i18n;
