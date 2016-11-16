import * as React from 'react'
import * as  ReactCSSTransitionGroup from 'react-addons-css-transition-group'
import { ChangesList } from './changes-list'
import { DiffSelectionType } from '../../models/diff'
import { IChangesState, PopupType } from '../../lib/app-state'
import { Repository } from '../../models/repository'
import { Dispatcher, IGitHubUser, IssuesStore } from '../../lib/dispatcher'
import { CommitIdentity } from '../../models/commit-identity'
import { Commit } from '../../models/commit'
import { UndoCommit } from './undo-commit'
import { IAutocompletionProvider, EmojiAutocompletionProvider, IssuesAutocompletionProvider } from '../autocompletion'
import { ICommitMessage } from '../../lib/app-state'

/**
 * The timeout for the animation of the enter/leave animation for Undo.
 *
 * Note that this *must* match the duration specified for the `undo` transitions
 * in `_changes-list.scss`.
 */
const UndoCommitAnimationTimeout = 500

interface IChangesSidebarProps {
  readonly repository: Repository
  readonly changes: IChangesState
  readonly dispatcher: Dispatcher
  readonly commitAuthor: CommitIdentity | null
  readonly branch: string | null
  readonly gitHubUsers: Map<string, IGitHubUser>
  readonly emoji: Map<string, string>
  readonly mostRecentLocalCommit: Commit | null
  readonly issuesStore: IssuesStore
}

export class ChangesSidebar extends React.Component<IChangesSidebarProps, void> {

  private autocompletionProviders: ReadonlyArray<IAutocompletionProvider<any>> | null

  public constructor(props: IChangesSidebarProps) {
    super(props)

    this.receiveProps(props)
  }

  public componentWillReceiveProps(nextProps: IChangesSidebarProps) {
    this.receiveProps(nextProps)
  }

  private receiveProps(props: IChangesSidebarProps) {
    if (props.repository.id !== this.props.repository.id || !this.autocompletionProviders) {
      const autocompletionProviders: IAutocompletionProvider<any>[] = [
        new EmojiAutocompletionProvider(this.props.emoji),
      ]

      // Issues autocompletion is only available for GitHub repositories.
      const gitHubRepository = props.repository.gitHubRepository
      if (gitHubRepository) {
        autocompletionProviders.push(new IssuesAutocompletionProvider(props.issuesStore, gitHubRepository, props.dispatcher))
      }

      this.autocompletionProviders = autocompletionProviders
    }
  }

  private onCreateCommit = (message: ICommitMessage) => {
    this.props.dispatcher.commitIncludedChanges(this.props.repository, message)
  }

  private onFileSelectionChanged = (row: number) => {
    const file = this.props.changes.workingDirectory.files[row]
    this.props.dispatcher.changeChangesSelection(this.props.repository, file)
  }

  private onIncludeChanged = (path: string, include: boolean) => {
    const workingDirectory = this.props.changes.workingDirectory
    const file = workingDirectory.files.find(f => f.path === path)
    if (!file) {
      console.error('unable to find working directory file to apply included change: ' + path)
      return
    }

    this.props.dispatcher.changeFileIncluded(this.props.repository, file, include)
  }

  private onSelectAll = (selectAll: boolean) => {
    this.props.dispatcher.changeIncludeAllFiles(this.props.repository, selectAll)
  }

  private onDiscardChanges = (path: string) => {
    const workingDirectory = this.props.changes.workingDirectory
    const file = workingDirectory.files.find(f => f.path === path)

    if (!file) {
      console.error('unable to find working directory file to discard ' + path)
      return
    }

    this.props.dispatcher.showPopup({
      type: PopupType.ConfirmDiscardChanges,
      repository: this.props.repository,
      files: [ file ],
    })
  }

  /**
   * Toggles the selection of a given working directory file.
   * If the file is partially selected it the selection is cleared
   * in order to match the behavior of clicking on an indeterminate
   * checkbox.
   */
  private onToggleInclude(row: number) {
    const workingDirectory = this.props.changes.workingDirectory
    const file = workingDirectory.files[row]

    if (!file) {
      console.error('keyboard selection toggle despite no file - what?')
      return
    }

    const currentSelection = file.selection.getSelectionType()

    this.props.dispatcher.changeFileIncluded(this.props.repository, file, currentSelection === DiffSelectionType.None)
  }

  /**
   * Handles keyboard events from the List item container, note that this is
   * Not the same thing as the element returned by the row renderer in ChangesList
   */
  private onChangedItemKeyDown = (row: number, event: React.KeyboardEvent<any>) => {
    // Toggle selection when user presses the spacebar while focused on a list item
    if (event.key === ' ') {
      event.preventDefault()
      this.onToggleInclude(row)
    }
  }

  private onUndo = () => {
    const commit = this.props.mostRecentLocalCommit

    if (commit) {
      this.props.dispatcher.undoCommit(this.props.repository, commit)
    }
  }

  private renderMostRecentLocalCommit() {
    const commit = this.props.mostRecentLocalCommit
    let child: JSX.Element | null = null
    if (commit) {
      child = <UndoCommit
        commit={commit}
        onUndo={this.onUndo}
        emoji={this.props.emoji}/>
    }

    return (
      <ReactCSSTransitionGroup
        transitionName='undo'
        transitionAppear={true}
        transitionAppearTimeout={UndoCommitAnimationTimeout}
        transitionEnterTimeout={UndoCommitAnimationTimeout}
        transitionLeaveTimeout={UndoCommitAnimationTimeout}>
        {child}
      </ReactCSSTransitionGroup>
    )
  }

  public render() {
    const changesState = this.props.changes
    const selectedFile = changesState.selectedFile
    const selectedPath = selectedFile ? selectedFile.path : null

    // TODO: I think user will expect the avatar to match that which
    // they have configured in GitHub.com as well as GHE so when we add
    // support for GHE we should revisit this and try to update the logic
    // to look up based on email _and_ host.
    const email = this.props.commitAuthor ? this.props.commitAuthor.email : null
    let user: IGitHubUser | null = null
    if (email) {
      user = this.props.gitHubUsers.get(email.toLowerCase()) || null
    }

    const avatarURL = user ? user.avatarURL : 'https://github.com/hubot.png'
    return (
      <div id='changes-sidebar-contents'>
        <ChangesList
          dispatcher={this.props.dispatcher}
          repository={this.props.repository}
          workingDirectory={changesState.workingDirectory}
          selectedPath={selectedPath}
          onFileSelectionChanged={this.onFileSelectionChanged}
          onCreateCommit={this.onCreateCommit}
          onIncludeChanged={this.onIncludeChanged}
          onSelectAll={this.onSelectAll}
          onDiscardChanges={this.onDiscardChanges}
          onRowKeyDown={this.onChangedItemKeyDown}
          commitAuthor={this.props.commitAuthor}
          branch={this.props.branch}
          avatarURL={avatarURL}
          commitMessage={this.props.changes.commitMessage}
          contextualCommitMessage={this.props.changes.contextualCommitMessage}
          autocompletionProviders={this.autocompletionProviders!}
        />
          {this.renderMostRecentLocalCommit()}
      </div>
    )
  }
}
