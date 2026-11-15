/**
 * FutureSchool - Language Toggle (English <-> Telugu)
 * `onDark`: for coloured headers (the parent app's blue header).
 */
import React from 'react';
import { useTranslation } from 'react-i18next';
import { Globe } from 'lucide-react';

export function LanguageToggle({ onDark = false }: { onDark?: boolean }) {
  const { i18n } = useTranslation();

  const toggleLanguage = () => {
    const next = i18n.language === 'te' ? 'en' : 'te';
    i18n.changeLanguage(next);
  };

  const look = onDark
    ? 'text-white bg-white/15 hover:bg-white/25 border border-white/30'
    : 'text-blue-900 bg-white hover:bg-blue-50 border border-blue-200';

  return (
    <button
      onClick={toggleLanguage}
      type="button"
      title={i18n.language === 'te' ? 'Switch to English' : 'Switch to Telugu (తెలుగు)'}
      className={`min-h-10 flex items-center gap-1.5 px-3 rounded-full text-sm font-semibold transition-colors ${look}`}
    >
      <Globe className={`w-4 h-4 ${onDark ? 'text-white' : 'text-blue-700'}`} />
      <span>{i18n.language === 'te' ? 'తెలుగు' : 'English'}</span>
    </button>
  );
}
