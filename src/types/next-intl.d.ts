import type { AppMessages } from "@/src/i18n/messages";
import type { formats } from "@/src/i18n/request";
import type { routing } from "@/src/i18n/routing";

declare module "next-intl" {
  interface AppConfig {
    Locale: (typeof routing.locales)[number];
    Messages: AppMessages;
    Formats: typeof formats;
  }
}
