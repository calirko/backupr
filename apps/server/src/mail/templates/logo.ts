import { readLogoBase64 } from "./logo.macro" with { type: "macro" };

/**
 * The logo travels inside the message as an inline (cid:) attachment: mail
 * clients only load remote images over public HTTP(S), so an APP_URL pointing
 * to an internal host would never render.
 *
 * Source: apps/web/public/icon.png (same file the web app serves), inlined at
 * build time.
 */
export const LOGO_CID = "backupr-logo";

export const LOGO_BASE64: string = await readLogoBase64();
