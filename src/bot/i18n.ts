import { I18n, type TranslationVariables } from "@grammyjs/i18n";

export const i18n = new I18n({
	directory: "locales",
	defaultLocale: "en",
	fluentBundleOptions: { useIsolating: false },
});

export function text(key: string, data?: TranslationVariables): string {
	return i18n.t("en", key, data);
}
