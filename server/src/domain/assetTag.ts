/** BR-12: tags are compared and stored trimmed and upper-cased, so uniqueness is case-insensitive. */
export const normalizeAssetTag = (tag: string) => tag.trim().toUpperCase()

export const isAssetTag = (tag: string) => /^[A-Z]{2,5}-\d{3,5}$/.test(tag)

export const ASSET_TAG_MESSAGE = "Asset tag must look like CPE-0042: 2 to 5 letters, a hyphen and 3 to 5 digits."
