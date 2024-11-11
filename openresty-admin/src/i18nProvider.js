import polyglotI18nProvider from 'ra-i18n-polyglot';
import englishMessages from './i18n/en'

export const i18nProvider = polyglotI18nProvider(
    locale => {
        // if (locale === 'fr') {
        //     return import('./i18n/fr').then(messages => messages.default);
        // }

        // Always fallback on english
        return englishMessages;
    },
    'en',
    [
        { locale: 'en', name: 'English' },
    ]
);