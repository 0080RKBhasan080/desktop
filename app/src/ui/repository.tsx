/* tslint:disable:react-this-binding-issue */

import * as React from 'react'
import { Repository as Repo } from '../models/repository'
import { UiView } from './ui-view'
import { Changes, ChangesSidebar } from './changes'
import { History, HistorySidebar } from './history'
import { Resizable } from './resizable'
import { TabBar } from './tab-bar'
import { IRepositoryState as IRepositoryModelState, RepositorySection } from '../lib/app-state'
import { Dispatcher, IssuesStore } from '../lib/dispatcher'
import { assertNever } from '../lib/fatal-error'

interface IRepositoryProps {
  readonly repository: Repo
  readonly state: IRepositoryModelState
  readonly dispatcher: Dispatcher
  readonly emoji: Map<string, string>
  readonly sidebarWidth: number
  readonly issuesStore: IssuesStore
}

const enum Tab {
  Changes = 0,
  History = 1,
}

export class RepositoryView extends React.Component<IRepositoryProps, void> {

  private renderTabs(): JSX.Element {
    const hasChanges = this.props.state.changesState.workingDirectory.files.length > 0
    const selectedTab = this.props.state.selectedSection === RepositorySection.Changes
      ? Tab.Changes
      : Tab.History

    return (
      <TabBar selectedIndex={selectedTab} onTabClicked={index => this.onTabClicked(index)}>
        <span>
          <span>Changes</span>
          {hasChanges ? <span className='indicator'/> : null}
        </span>
        <span>History</span>
      </TabBar>
    )
  }

  private renderChangesSidebar(): JSX.Element {
    const branch = this.props.state.branchesState.currentBranch
    const localCommitSHAs = this.props.state.localCommitSHAs
    const mostRecentLocalCommitSHA = localCommitSHAs.length > 0 ? localCommitSHAs[0] : null
    const mostRecentLocalCommit = (mostRecentLocalCommitSHA ? this.props.state.commits.get(mostRecentLocalCommitSHA) : null) || null

    return (
      <ChangesSidebar
        repository={this.props.repository}
        dispatcher={this.props.dispatcher}
        changes={this.props.state.changesState}
        branch={branch ? branch.name : null}
        commitAuthor={this.props.state.commitAuthor}
        gitHubUsers={this.props.state.gitHubUsers}
        emoji={this.props.emoji}
        mostRecentLocalCommit={mostRecentLocalCommit}
        issuesStore={this.props.issuesStore}/>
    )
  }

  private renderHistorySidebar(): JSX.Element {
    return (
      <HistorySidebar
        repository={this.props.repository}
        dispatcher={this.props.dispatcher}
        history={this.props.state.historyState}
        gitHubUsers={this.props.state.gitHubUsers}
        emoji={this.props.emoji}
        commits={this.props.state.commits}/>
    )
  }

  private renderSidebarContents(): JSX.Element {
    const selectedSection = this.props.state.selectedSection

    if (selectedSection === RepositorySection.Changes) {
      return this.renderChangesSidebar()
    } else if (selectedSection === RepositorySection.History) {
      return this.renderHistorySidebar()
    } else {
      return assertNever(selectedSection, 'Unknown repository section')
    }
  }

  private renderSidebar(): JSX.Element {
    return (
      <Resizable
        id='repository-sidebar'
        width={this.props.sidebarWidth}
        onReset={() => this.props.dispatcher.resetSidebarWidth()}
        onResize={(w) => this.props.dispatcher.setSidebarWidth(w)}>
        {this.renderTabs()}
        {this.renderSidebarContents()}
      </Resizable>
    )
  }

  private renderContent(): JSX.Element {
    const selectedSection = this.props.state.selectedSection

    if (selectedSection === RepositorySection.Changes) {
      return <Changes repository={this.props.repository}
                      dispatcher={this.props.dispatcher}
                      changes={this.props.state.changesState} />
    } else if (selectedSection === RepositorySection.History) {
      return <History repository={this.props.repository}
                      dispatcher={this.props.dispatcher}
                      history={this.props.state.historyState}
                      emoji={this.props.emoji}
                      commits={this.props.state.commits}/>
    } else {
      return assertNever(selectedSection, 'Unknown repository section')
    }
  }

  public render() {
    return (
      <UiView id='repository' onKeyDown={(e) => this.onKeyDown(e)}>
        {this.renderSidebar()}
        {this.renderContent()}
      </UiView>
    )
  }

  private onKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    // Toggle tab selection on Ctrl+Tab. Note that we don't care
    // about the shift key here, we can get away with that as long
    // as there's only two tabs.
    if (e.ctrlKey && e.key === 'Tab') {

      const section = this.props.state.selectedSection === RepositorySection.History
        ? RepositorySection.Changes
        : RepositorySection.History

      this.props.dispatcher.changeRepositorySection(this.props.repository, section)
      e.preventDefault()
    }
  }

  private onTabClicked(tab: Tab) {
    const section = tab === Tab.History ? RepositorySection.History : RepositorySection.Changes
    this.props.dispatcher.changeRepositorySection(this.props.repository, section)
  }
}
