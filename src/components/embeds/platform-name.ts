/** Platform names are the same in every language. */
const PLATFORMS: Record<string, string> = {
  instagram: "Instagram",
  facebook: "Facebook",
  threads: "Threads",
  youtube: "YouTube",
  tiktok: "TikTok",
  x: "X",
  google_maps: "Google Maps",
};

/** The service a post is on, by name; a plain web page has none. */
export function platformName(platform: string | undefined): string | undefined {
  return platform === undefined ? undefined : PLATFORMS[platform];
}
