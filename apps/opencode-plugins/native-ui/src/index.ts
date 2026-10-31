export { createHost, type Host } from "./host"
export { TabCloseButton, stopPress, type TabCloseButtonProps } from "./tab-close-button"
export { TabRowAction, attachTabRowAction, tabRowActionCss, type TabRowActionProps } from "./tab-row-action"
export { SessionTabRow, SessionTabList, hasSidebarRepos, sessionTabRowClass, type SessionTabRowProps } from "./session-tab-row"
export { MenuContent, MenuItem, MenuSeparator, MenuChevron, highlight, nextItem, type MenuContentProps, type MenuItemProps } from "./menu"
export { Popover, popoverCss, type PopoverProps } from "./popover"
export { SummaryCard, SummaryHeading, SummaryRows, SummaryRow, type SummaryRowProps } from "./summary"
export { ProjectAvatar, getProjectAvatarVariant, displayName, first, PROJECT_AVATAR_VARIANTS, type ProjectAvatarProps, type ProjectAvatarStyle, type ProjectAvatarVariant } from "./project-avatar"
export { ProgressSpinner } from "./spinner"
export { HeaderIconButton, type HeaderIconButtonProps } from "./header-icon-button"
export { ClockIcon, clockIcon, drawnIconCss, CLOCK_PATH } from "./icons"

import { tabRowActionCss } from "./tab-row-action"
import { popoverCss } from "./popover"
import { drawnIconCss } from "./icons"

/** Everything the library needs beyond the host's own CSS. Register once: `ctx.add(Style, nativeUiCss)`. */
export const nativeUiCss = [tabRowActionCss, popoverCss, drawnIconCss].join("\n")
