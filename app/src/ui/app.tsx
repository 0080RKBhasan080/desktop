import * as React from 'react'
import * as classNames from 'classnames'
import { ipcRenderer, remote } from 'electron'

import { RepositoriesList } from './repositories-list'
import { RepositoryView } from './repository'
import { WindowControls } from './window/window-controls'
import { Dispatcher, AppStore, CloningRepository } from '../lib/dispatcher'
import { Repository } from '../models/repository'
import { MenuEvent } from '../main-process/menu'
import { assertNever } from '../lib/fatal-error'
import { IAppState, RepositorySection, PopupType, FoldoutType, SelectionType } from '../lib/app-state'
import { Popuppy } from './popuppy'
import { CreateBranch } from './create-branch'
import { Branches } from './branches'
import { AddRepository } from './add-repository'
import { RenameBranch } from './rename-branch'
import { DeleteBranch } from './delete-branch'
import { PublishRepository } from './publish-repository'
import { CloningRepositoryView } from './cloning-repository'
import { Toolbar, ToolbarDropdown, DropdownState, PushPullButton } from './toolbar'
import { OcticonSymbol } from './octicons'
import { setMenuEnabled, setMenuVisible } from './main-process-proxy'
import { DiscardChanges } from './discard-changes'
import { updateStore, UpdateState } from './lib/update-store'
import { getDotComAPIEndpoint } from '../lib/api'
import { MenuIDs } from '../main-process/menu'
import { StatsStore, ILaunchStats } from '../lib/stats'
import { Welcome } from './welcome'
import { AppMenu } from './app-menu'
import { UpdateAvailable } from './updates'
import { shouldRenderApplicationMenu } from './lib/features'

/** The interval at which we should check for updates. */
const UpdateCheckInterval = 1000 * 60 * 60 * 4

const SendStatsInterval = 1000 * 60 * 60 * 4

interface IAppProps {
  readonly dispatcher: Dispatcher
  readonly appStore: AppStore
  readonly statsStore: StatsStore
}

export class App extends React.Component<IAppProps, IAppState> {

  private altKeyPressed = false

  public constructor(props: IAppProps) {
    super(props)

    this.state = props.appStore.getState()
    props.appStore.onDidUpdate(state => {
      this.setState(state)

      const selectedState = state.selectedState
      let haveBranch = false
      if (selectedState && selectedState.type === SelectionType.Repository) {
        const currentBranch = selectedState.state.branchesState.currentBranch
        const defaultBranch = selectedState.state.branchesState.defaultBranch
        // If we are:
        //  1. on the default branch, or
        //  2. on an unborn branch, or
        //  3. on a detached HEAD
        // there's not much we can do.
        if (!currentBranch || !defaultBranch || currentBranch.name === defaultBranch.name) {
          haveBranch = false
        } else {
          haveBranch = true
        }
      }

      setMenuEnabled('rename-branch', haveBranch)
      setMenuEnabled('delete-branch', haveBranch)
    })

    ipcRenderer.on('menu-event', (event: Electron.IpcRendererEvent, { name }: { name: MenuEvent }) => {
      this.onMenuEvent(name)
    })

    updateStore.onDidChange(state => {
      const visibleItem = (function () {
        switch (state) {
          case UpdateState.CheckingForUpdates: return 'checking-for-updates'
          case UpdateState.UpdateReady: return 'quit-and-install-update'
          case UpdateState.UpdateNotAvailable: return 'check-for-updates'
          case UpdateState.UpdateAvailable: return 'downloading-update'
        }

        return assertNever(state, `Unknown update state: ${state}`)
      })() as MenuIDs

      const menuItems = new Set([
        'checking-for-updates',
        'downloading-update',
        'check-for-updates',
        'quit-and-install-update',
      ]) as Set<MenuIDs>

      menuItems.delete(visibleItem)
      for (const item of menuItems) {
        setMenuVisible(item, false)
      }

      setMenuVisible(visibleItem, true)

      if (state === UpdateState.UpdateReady) {
        this.props.dispatcher.showPopup({ type: PopupType.UpdateAvailable })
      }
    })

    updateStore.onError(error => {
      console.log(`Error checking for updates:`)
      console.error(error)

      this.props.dispatcher.postError(error)
    })

    setInterval(() => this.checkForUpdates(), UpdateCheckInterval)
    this.checkForUpdates()

    ipcRenderer.on('launch-timing-stats', (event: Electron.IpcRendererEvent, { stats }: { stats: ILaunchStats }) => {
      console.info(`App ready time: ${stats.mainReadyTime}ms`)
      console.info(`Load time: ${stats.loadTime}ms`)
      console.info(`Renderer ready time: ${stats.rendererReadyTime}ms`)

      this.props.statsStore.recordLaunchStats(stats)
      this.props.statsStore.reportStats()

      setInterval(() => this.props.statsStore.reportStats(), SendStatsInterval)
    })
  }

  private onMenuEvent(name: MenuEvent): any {
    switch (name) {
      case 'push': return this.push()
      case 'pull': return this.pull()
      case 'select-changes': return this.selectChanges()
      case 'select-history': return this.selectHistory()
      case 'add-local-repository': return this.showFileBrowser()
      case 'create-branch': return this.createBranch()
      case 'show-branches': return this.showBranches()
      case 'remove-repository': return this.removeRepository()
      case 'add-repository': return this.addRepository()
      case 'rename-branch': return this.renameBranch()
      case 'delete-branch': return this.deleteBranch()
      case 'check-for-updates': return this.checkForUpdates()
      case 'quit-and-install-update': return updateStore.quitAndInstallUpdate()
    }

    return assertNever(name, `Unknown menu event name: ${name}`)
  }

  private checkForUpdates() {
    if (__RELEASE_ENV__ === 'development' || __RELEASE_ENV__ === 'test') { return }

    const dotComUsers = this.props.appStore.getState().users.filter(u => u.endpoint === getDotComAPIEndpoint())
    const login = dotComUsers.length ? dotComUsers[0].login : ''
    updateStore.checkForUpdates(login)
  }

  private renameBranch() {
    const state = this.state.selectedState
    if (!state || state.type !== SelectionType.Repository) { return }

    const branch = state.state.branchesState.currentBranch
    if (!branch) { return }

    this.props.dispatcher.showPopup({
      type: PopupType.RenameBranch,
      repository: state.repository,
      branch,
    })
  }

  private deleteBranch() {
    const state = this.state.selectedState
    if (!state || state.type !== SelectionType.Repository) { return }

    const branch = state.state.branchesState.currentBranch
    if (!branch) { return }

    this.props.dispatcher.showPopup({
      type: PopupType.DeleteBranch,
      repository: state.repository,
      branch,
    })
  }

  private addRepository() {
    this.props.dispatcher.showPopup({
      type: PopupType.AddRepository,
    })
  }

  private createBranch() {
    const state = this.state.selectedState
    if (!state || state.type !== SelectionType.Repository) { return }

    this.props.dispatcher.showPopup({
      type: PopupType.CreateBranch,
      repository: state.repository,
    })
  }

  private showBranches() {
    const state = this.state.selectedState
    if (!state || state.type !== SelectionType.Repository) { return }

    this.props.dispatcher.showFoldout({ type: FoldoutType.Branch })
  }

  private selectChanges() {
    const state = this.state.selectedState
    if (!state || state.type !== SelectionType.Repository) { return }

    this.props.dispatcher.changeRepositorySection(state.repository, RepositorySection.Changes)
  }

  private selectHistory() {
    const state = this.state.selectedState
    if (!state || state.type !== SelectionType.Repository) { return }

    this.props.dispatcher.changeRepositorySection(state.repository, RepositorySection.History)
  }

  private push() {
    const state = this.state.selectedState
    if (!state || state.type !== SelectionType.Repository) { return }

    this.props.dispatcher.push(state.repository)
  }

  private async pull() {
    const state = this.state.selectedState
    if (!state || state.type !== SelectionType.Repository) { return }

    this.props.dispatcher.pull(state.repository)
  }

  public componentDidMount() {
    document.ondragover = document.ondrop = (e) => {
      e.preventDefault()
    }

    document.body.ondrop = (e) => {
      const files = e.dataTransfer.files
      this.handleDragAndDrop(files)
      e.preventDefault()
    }

    if (shouldRenderApplicationMenu()) {
      window.addEventListener('keydown', this.onWindowKeyDown)
      window.addEventListener('keyup', this.onWindowKeyUp)
    }
  }

  /**
   * On Windows pressing the Alt key and holding it down should
   * highlight the application menu.
   *
   * It really should show the menu
   * and highlight the access keys for the menu items but we're not
   * quite there yet so this will have to suffice in the meantime.
   *
   * This method in conjunction with the onWindowKeyUp sets the
   * appMenuToolbarHighlight state when the Alt key (and only the
   * Alt key) is pressed.
   */
  private onWindowKeyDown = (event: KeyboardEvent) => {
    if (event.defaultPrevented) { return }

    if (event.key === 'Alt' && shouldRenderApplicationMenu()) {
      this.altKeyPressed = true
      this.props.dispatcher.setAppMenuToolbarButtonHighlightState(true)
    } else if (this.altKeyPressed) {
      this.props.dispatcher.setAppMenuToolbarButtonHighlightState(false)
      this.altKeyPressed = false
    }
  }

  /**
   * Open the application menu foldout when the Alt key is pressed.
   *
   * See onWindowKeyDown for more information.
   */
  private onWindowKeyUp = (event: KeyboardEvent) => {
    if (event.defaultPrevented) { return }

    if (event.key === 'Alt' && this.altKeyPressed && shouldRenderApplicationMenu()) {
      this.altKeyPressed = false
      this.props.dispatcher.setAppMenuToolbarButtonHighlightState(false)

      if (this.state.currentFoldout && this.state.currentFoldout.type === FoldoutType.AppMenu) {
        this.props.dispatcher.closeFoldout()
      } else {
        this.props.dispatcher.showFoldout({ type: FoldoutType.AppMenu })
      }
      event.preventDefault()
    }
  }

  private handleDragAndDrop(fileList: FileList) {
    const paths: string[] = []
    for (let i = 0; i < fileList.length; i++) {
      const path = fileList[i]
      paths.push(path.path)
    }

    this.addRepositories(paths)
  }

  private showFileBrowser() {
    const directories = remote.dialog.
        showOpenDialog({ properties: [ 'openDirectory', 'multiSelections' ] })
    if (directories && directories.length > 0) {
      this.addRepositories(directories)
    }
  }

  private removeRepository() {
    const state = this.state.selectedState
    if (!state) { return }

    this.props.dispatcher.removeRepositories([ state.repository ])
  }

  private async addRepositories(paths: ReadonlyArray<string>) {
    const repositories = await this.props.dispatcher.addRepositories(paths)
    if (repositories.length) {
      this.props.dispatcher.selectRepository(repositories[0])
    }
  }

  private renderTitlebar() {
    const winControls = __WIN32__
      ? <WindowControls />
      : null

    const titleBarClass = this.state.titleBarStyle === 'light' ? 'light-title-bar' : ''

    return (
      <div className={titleBarClass} id='desktop-app-title-bar'>
        <span className='app-title'>GitHub Desktop</span>
        {winControls}
      </div>
    )
  }

  private currentPopupContent(): JSX.Element | null {
    const popup = this.state.currentPopup
    if (!popup) { return null }

    if (popup.type === PopupType.CreateBranch) {
      const repository = popup.repository
      const state = this.props.appStore.getRepositoryState(repository)
      return <CreateBranch repository={repository}
                           dispatcher={this.props.dispatcher}
                           branches={state.branchesState.allBranches}
                           currentBranch={state.branchesState.currentBranch}/>
    } else if (popup.type === PopupType.AddRepository) {
      return <AddRepository dispatcher={this.props.dispatcher}/>
    } else if (popup.type === PopupType.RenameBranch) {
      return <RenameBranch dispatcher={this.props.dispatcher}
                           repository={popup.repository}
                           branch={popup.branch}/>
    } else if (popup.type === PopupType.DeleteBranch) {
      return <DeleteBranch dispatcher={this.props.dispatcher}
                           repository={popup.repository}
                           branch={popup.branch}/>
    } else if (popup.type === PopupType.PublishRepository) {
      return <PublishRepository repository={popup.repository}
                                dispatcher={this.props.dispatcher}
                                users={this.state.users}/>
    } else if (popup.type === PopupType.ConfirmDiscardChanges) {
      return <DiscardChanges repository={popup.repository}
                             dispatcher={this.props.dispatcher}
                             files={popup.files}/>
    } else if (popup.type === PopupType.UpdateAvailable) {
      return <UpdateAvailable dispatcher={this.props.dispatcher}/>
    }

    return assertNever(popup, `Unknown popup type: ${popup}`)
  }

  private onPopupOverlayClick = () => { this.props.dispatcher.closePopup() }

  private renderPopup(): JSX.Element | null {
    const content = this.currentPopupContent()
    if (!content) { return null }

    return (
      <div className='fill-window'>
        <div className='fill-window popup-overlay' onClick={this.onPopupOverlayClick}></div>
        <Popuppy>{content}</Popuppy>
      </div>
    )
  }

  private clearErrors = () => {
    const errors = this.state.errors

    for (const error of errors) {
      this.props.dispatcher.clearError(error)
    }
  }

  private renderErrors() {
    const errors = this.state.errors
    if (!errors.length) { return null }

    const msgs = errors.map(e => e.message)
    return (
      <Popuppy>
        {msgs.map((msg, i) => <pre className='popup-error-output' key={i}>{msg}</pre>)}

        <div className='popup-actions'>
          <button onClick={this.clearErrors}>OK</button>
        </div>
      </Popuppy>
    )
  }

  private renderApp() {
    return (
      <div id='desktop-app-contents'>
        {this.renderToolbar()}
        {this.renderRepository()}
        {this.renderPopup()}
        {this.renderErrors()}
      </div>
    )
  }

  private iconForRepository(repository: Repository | CloningRepository) {
    if (repository instanceof CloningRepository) {
      return OcticonSymbol.desktopDownload
    } else {
      const gitHubRepo = repository.gitHubRepository
      if (!gitHubRepo) { return OcticonSymbol.repo }

      if (gitHubRepo.private) { return OcticonSymbol.lock }
      if (gitHubRepo.fork) { return OcticonSymbol.repoForked }

      return OcticonSymbol.repo
    }
  }

  private closeAppMenu = () => {
    this.props.dispatcher.closeFoldout()
  }

  private renderAppMenu = (): JSX.Element | null => {
    if (!this.state.appMenuState || !shouldRenderApplicationMenu()) {
      return null
    }

    return (
      <AppMenu
        state={this.state.appMenuState}
        dispatcher={this.props.dispatcher}
        onClose={this.closeAppMenu}
      />
    )
  }

  private onAppMenuDropdownStateChanged = (newState: DropdownState) => {
    if (newState === 'open') {
      this.props.dispatcher.setAppMenuState(menu => menu.withReset())
      this.props.dispatcher.showFoldout({ type: FoldoutType.AppMenu })
    } else {
      this.props.dispatcher.closeFoldout()
    }
  }

  private renderAppMenuToolbarButton() {
    if (!this.state.appMenuState || !shouldRenderApplicationMenu()) {
      return null
    }

    const isOpen = this.state.currentFoldout
      && this.state.currentFoldout.type === FoldoutType.AppMenu

    const currentState: DropdownState = isOpen ? 'open' : 'closed'
    const className = classNames(
      'app-menu',
      { 'highlight': this.state.highlightAppMenuToolbarButton },
    )

    return <ToolbarDropdown
      className={className}
      icon={OcticonSymbol.threeBars}
      title='Menu'
      onDropdownStateChanged={this.onAppMenuDropdownStateChanged}
      dropdownContentRenderer={this.renderAppMenu}
      dropdownState={currentState} />
  }

  private renderRepositoryList = (): JSX.Element => {
    const selectedRepository = this.state.selectedState ? this.state.selectedState.repository : null

    return <RepositoriesList
      selectedRepository={selectedRepository}
      onSelectionChanged={this.onSelectionChanged}
      dispatcher={this.props.dispatcher}
      repositories={this.state.repositories}
      loading={this.state.loading}
    />
  }

  private onRepositoryDropdownStateChanged = (newState: DropdownState) => {
    newState === 'open'
      ? this.props.dispatcher.showFoldout({ type: FoldoutType.Repository })
      : this.props.dispatcher.closeFoldout()
  }

  private renderRepositoryToolbarButton() {
    const selection = this.state.selectedState

    const repository = selection ? selection.repository : null

    let icon: OcticonSymbol
    let title: string
    if (repository) {
      icon = this.iconForRepository(repository)
      title = repository.name
    } else {
      icon = OcticonSymbol.repo
      title = 'Select a repository'
    }

    const isOpen = this.state.currentFoldout
      && this.state.currentFoldout.type === FoldoutType.Repository

    const currentState: DropdownState = isOpen ? 'open' : 'closed'

    return <ToolbarDropdown
      icon={icon}
      title={title}
      description='Current repository'
      onDropdownStateChanged={this.onRepositoryDropdownStateChanged}
      dropdownContentRenderer={this.renderRepositoryList}
      dropdownState={currentState} />
  }

  private renderPushPullToolbarButton() {
    const selection = this.state.selectedState
    if (!selection || selection.type === SelectionType.CloningRepository) {
      return null
    }

    const state = selection.state
    return <PushPullButton
      dispatcher={this.props.dispatcher}
      repository={selection.repository}
      aheadBehind={state.aheadBehind}
      remoteName={state.remoteName}
      lastFetched={state.lastFetched}
      networkActionInProgress={state.pushPullInProgress}/>
  }

  private renderBranchFoldout = (): JSX.Element | null => {
    const selection = this.state.selectedState

    // NB: This should never happen but in the case someone
    // manages to delete the last repository while the drop down is
    // open we'll just bail here.
    if (!selection || selection.type !== SelectionType.Repository) {
      return null
    }
    const repository = selection.repository

    const state = this.props.appStore.getRepositoryState(repository)
    return <Branches
      allBranches={state.branchesState.allBranches}
      recentBranches={state.branchesState.recentBranches}
      currentBranch={state.branchesState.currentBranch}
      defaultBranch={state.branchesState.defaultBranch}
      dispatcher={this.props.dispatcher}
      repository={repository}
    />
  }

  private onBranchDropdownStateChanged = (newState: DropdownState) => {
    newState === 'open'
      ? this.props.dispatcher.showFoldout({ type: FoldoutType.Branch })
      : this.props.dispatcher.closeFoldout()
  }

  private renderBranchToolbarButton(): JSX.Element | null {
    const selection = this.state.selectedState

    if (!selection || selection.type !== SelectionType.Repository) {
      return null
    }
    const branch = selection.state.branchesState.currentBranch

    // TODO: This is in all likelihood wrong, need to look into
    // what null means here
    if (!branch) {
      return null
    }

    const title = branch.name

    const isOpen = this.state.currentFoldout
      && this.state.currentFoldout.type === FoldoutType.Branch

    const currentState: DropdownState = isOpen ? 'open' : 'closed'

    return <ToolbarDropdown
      className='branch-button'
      icon={OcticonSymbol.gitBranch}
      title={title}
      description='Current branch'
      onDropdownStateChanged={this.onBranchDropdownStateChanged}
      dropdownContentRenderer={this.renderBranchFoldout}
      dropdownState={currentState} />
  }

  private renderToolbar() {
    return (
      <Toolbar id='desktop-app-toolbar'>
        <div
          className='sidebar-section'
          style={{ width: this.state.sidebarWidth }}>
          {this.renderAppMenuToolbarButton()}
          {this.renderRepositoryToolbarButton()}
        </div>
        {this.renderBranchToolbarButton()}
        {this.renderPushPullToolbarButton()}
      </Toolbar>
    )
  }

  private renderRepository() {
    const selectedState = this.state.selectedState
    if (!selectedState) {
      return <NoRepositorySelected/>
    }

    if (selectedState.type === SelectionType.Repository) {
      return (
        <RepositoryView repository={selectedState.repository}
                        state={selectedState.state}
                        dispatcher={this.props.dispatcher}
                        emoji={this.state.emoji}
                        sidebarWidth={this.state.sidebarWidth}
                        issuesStore={this.props.appStore.issuesStore}/>
      )
    } else if (selectedState.type === SelectionType.CloningRepository) {
      return <CloningRepositoryView repository={selectedState.repository}
                                    state={selectedState.state}/>
    } else {
      return assertNever(selectedState, `Unknown state: ${selectedState}`)
    }
  }

  private renderWelcomeFlow() {
    return (
      <Welcome dispatcher={this.props.dispatcher} appStore={this.props.appStore}/>
    )
  }

  public render() {
    return (
      <div id='desktop-app-chrome'>
        {this.renderTitlebar()}
        {this.state.showWelcomeFlow ? this.renderWelcomeFlow() : this.renderApp()}
      </div>
    )
  }

  private onSelectionChanged = (repository: Repository | CloningRepository) => {
    this.props.dispatcher.selectRepository(repository)

    if (repository instanceof Repository) {
      this.props.dispatcher.refreshGitHubRepositoryInfo(repository)
    }
  }
}

function NoRepositorySelected() {
  return (
    <div className='panel blankslate'>
      No repository selected
    </div>
  )
}
