export interface Config {
  /**
   * Use full-page redirects instead of popups for OAuth sign-in.
   * Needed in embedded browsers that block popups.
   * @visibility frontend
   */
  enableExperimentalRedirectFlow?: boolean;
}
