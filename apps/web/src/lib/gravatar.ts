import md5 from "crypto-js/md5";

export function getGravatarImageUrl(
	email: string | null | undefined,
	size = 80,
): string | null {
	if (!email || typeof email !== "string") return null;

	const emailLower = email.trim().toLowerCase();
	const hash = md5(emailLower).toString();

	return `https://www.gravatar.com/avatar/${hash}?s=${size}&d=404`;
}
