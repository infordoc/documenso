import type { I18n, MessageDescriptor } from '@lingui/core';
import { i18n } from '@lingui/core';
import type { MacroMessageDescriptor } from '@lingui/core/macro';

import type { I18nLocaleData, SupportedLanguageCodes } from '../constants/i18n';
import { APP_I18N_OPTIONS } from '../constants/i18n';
import { env } from './env';

export async function getTranslations(locale: string) {
  const extension = env('NODE_ENV') === 'development' ? 'po' : 'mjs';

  const { messages } = await import(`../translations/${locale}/web.${extension}`);

  return messages;
}

export async function dynamicActivate(locale: string) {
  const messages = await getTranslations(locale);

  i18n.loadAndActivate({ locale, messages });
}

const parseLanguageFromLocale = (locale: string): SupportedLanguageCodes | null => {
  // Remove quality values (e.g., "pt-BR;q=0.9" -> "pt-BR")
  const cleanLocale = locale.split(';')[0].trim();

  // First, try to find an exact match (e.g., "pt-BR")
  const exactMatch = APP_I18N_OPTIONS.supportedLangs.find(
    (lang): lang is SupportedLanguageCodes => lang === cleanLocale,
  );

  if (exactMatch) {
    return exactMatch;
  }

  // If no exact match, try to match by base language (e.g., "pt" from "pt-BR" or "pt-PT")
  const [baseLanguage] = cleanLocale.split('-');
  const baseLanguageMatch = APP_I18N_OPTIONS.supportedLangs.find(
    (lang): lang is SupportedLanguageCodes => lang === baseLanguage,
  );

  return baseLanguageMatch || null;
};

/**
 * Extracts the language from the `accept-language` header.
 */
export const extractLocaleDataFromHeaders = (
  headers: Headers,
): { lang: SupportedLanguageCodes | null; locales: string[] } => {
  const headerLocales = (headers.get('accept-language') ?? '')
    .split(',')
    .map((locale) => locale.trim());

  // Try to find the first supported language from the list
  for (const locale of headerLocales) {
    const language = parseLanguageFromLocale(locale);
    if (language) {
      return {
        lang: language,
        locales: headerLocales,
      };
    }
  }

  return {
    lang: null,
    locales: headerLocales,
  };
};

type ExtractLocaleDataOptions = {
  headers: Headers;
};

/**
 * Extract the supported language from the header.
 *
 * Will return the default fallback language if not found.
 */
export const extractLocaleData = ({ headers }: ExtractLocaleDataOptions): I18nLocaleData => {
  const headerLocales = (headers.get('accept-language') ?? '')
    .split(',')
    .map((locale) => locale.trim());

  // Parse all locales and filter out unsupported ones
  const supportedLanguages = headerLocales
    .map((locale) => parseLanguageFromLocale(locale))
    .filter((value): value is SupportedLanguageCodes => value !== null);

  // Validate that the language code is a valid locale
  const validLanguages = supportedLanguages.filter((language) => {
    try {
      new Intl.Locale(language);
      return true;
    } catch {
      return false;
    }
  });

  return {
    lang: validLanguages[0] || APP_I18N_OPTIONS.sourceLang,
    locales: headerLocales,
  };
};

export const parseMessageDescriptor = (_: I18n['_'], value: string | MessageDescriptor) => {
  return typeof value === 'string' ? value : _(value);
};

export const parseMessageDescriptorMacro = (
  t: (descriptor: MacroMessageDescriptor) => string,
  value: string | MessageDescriptor,
) => {
  return typeof value === 'string' ? value : t(value);
};
