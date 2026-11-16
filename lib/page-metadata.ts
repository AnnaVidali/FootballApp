import type { Metadata } from "next";
import { getServerT } from "@/lib/server-i18n";

/**
 * A page's `<title>`. The root layout supplies the "%s · Squad HQ" template,
 * so each page only names itself. The key is looked up in the request's
 * locale, which is what makes the tab title follow the language switcher.
 */
export async function pageMetadata(key: string): Promise<Metadata> {
  const t = await getServerT();
  return { title: t(key) };
}
