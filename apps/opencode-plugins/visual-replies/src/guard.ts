/** The part of Electron's `will-frame-navigate` event the decision needs. */
export interface FrameNavigation {
  readonly url: string
  readonly isMainFrame: boolean
  /** The frame's current document, `about:srcdoc` for our pages. */
  readonly frameUrl: string | undefined
}

export const srcdoc = "about:srcdoc"

/**
 * True when a navigation must be stopped: a subframe whose document is one of our srcdoc pages going anywhere but a
 * new srcdoc (our own reload). This covers every route a page has to navigate itself, `<meta refresh>` included,
 * which the page-side Navigation API guard does not see. Subframes the app itself loads (file previews) are never
 * srcdoc documents, and the main frame and other windows' frames are not touched.
 */
export function vetoNavigation(navigation: FrameNavigation) {
  if (navigation.isMainFrame) return false
  if (navigation.frameUrl !== srcdoc) return false
  return navigation.url !== srcdoc
}
