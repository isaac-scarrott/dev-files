// The model picker (a dialog whose search box reads "Search models") lists a "Recent" section above the provider
// sections. 2.2.5 has no setting or registry for it, so the section is hidden by its header text. Every recent model
// is also listed under its own provider, so nothing becomes unreachable.
export const SEARCH = 'input[placeholder="Search models"]'
const HEADER = "div.h-8"

export function hideRecent(root: ParentNode, label = "Recent") {
  let hidden = 0
  for (const search of root.querySelectorAll<HTMLElement>(SEARCH)) {
    const dialog = search.closest<HTMLElement>('[role="dialog"]')
    if (!dialog) continue
    for (const header of dialog.querySelectorAll<HTMLElement>(HEADER)) {
      if (header.textContent?.trim() !== label) continue
      const section = header.parentElement
      if (!section || section.hasAttribute("data-mp-hidden")) continue
      section.setAttribute("data-mp-hidden", "")
      section.hidden = true
      section.inert = true
      hidden++
    }
  }
  return hidden
}
