import { ipcRenderer } from 'electron'
import { MenuIDs } from '../main-process/menu'
import { ExecutableMenuItem } from '../models/app-menu'

/** Set the menu item's enabledness. */
export function setMenuEnabled(id: MenuIDs, enabled: boolean) {
  ipcRenderer.send('set-menu-enabled', { id, enabled })
}

/** Set the menu item's visibility. */
export function setMenuVisible(id: MenuIDs, visible: boolean) {
  ipcRenderer.send('set-menu-visible', { id, visible })
}

/** Tell the main process that the renderer is ready. */
export function sendReady(time: number) {
  ipcRenderer.send('renderer-ready', time)
}

/** Tell the main process to execute (i.e. simulate a click of) the menu item. */
export function executeMenuItem(item: ExecutableMenuItem) {
  ipcRenderer.send('execute-menu-item', { id: item.id })
}

/**
 * Ask the main-process to send over a copy of the application menu.
 * The response will be send as a separate event with the name 'app-menu' and
 * will be received by the dispatcher.
 */
export function getAppMenu() {
  ipcRenderer.send('get-app-menu')
}

export interface IMenuItem {
  readonly label: string
  readonly action: () => void
}

/** Show the given menu items in a contextual menu. */
export function showContextualMenu(items: ReadonlyArray<IMenuItem>) {
  ipcRenderer.once('contextual-menu-action', (event: Electron.IpcRendererEvent, index: number) => {
    const item = items[index]
    item.action()
  })

  ipcRenderer.send('show-contextual-menu', items)
}
