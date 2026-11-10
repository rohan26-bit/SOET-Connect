const GALLERY_IMAGE_PATH = /^\/api\/gallery\/[A-Za-z0-9_-]{1,128}\/image$/;

export function getSafePlacementPhotoUrl(value?: string | null): string | null {
  const raw = value?.trim();
  if (!raw || raw.length > 2048 || /[\s\u0000-\u001f\u007f\\]/.test(raw)) {
    return null;
  }

  if (raw.startsWith('/')) {
    return GALLERY_IMAGE_PATH.test(raw) ? raw : null;
  }

  try {
    const parsed = new URL(raw);
    const authority = raw.split('://', 2)[1]?.split(/[/?#]/, 1)[0] ?? '';
    if (
      parsed.protocol !== 'https:' ||
      !parsed.hostname ||
      authority.includes('@') ||
      parsed.username ||
      parsed.password
    ) {
      return null;
    }
    return parsed.toString();
  } catch {
    return null;
  }
}
