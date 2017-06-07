import * as FS from 'fs'
import { remote } from 'electron'
import * as React from 'react'

import { Dispatcher } from '../../lib/dispatcher'
import { isGitRepository } from '../../lib/git'
import { Button } from '../lib/button'
import { ButtonGroup } from '../lib/button-group'
import { TextBox } from '../lib/text-box'
import { Row } from '../lib/row'
import { Dialog, DialogContent, DialogFooter } from '../dialog'
import { Octicon, OcticonSymbol } from '../octicons'
import { LinkButton } from '../lib/link-button'
import { PopupType } from '../../lib/app-state'
import * as Path from 'path'

const untildify: (str: string) => string = require('untildify')

interface IAddExistingRepositoryProps {
  readonly dispatcher: Dispatcher
  readonly onDismissed: () => void
}

interface IAddExistingRepositoryState {
  readonly path: string
  readonly gitRepository: boolean
  readonly showNonGitRepositoryWarning: boolean
}

/** The component for adding a new local repository. */
export class AddExistingRepository extends React.Component<IAddExistingRepositoryProps, IAddExistingRepositoryState> {
  private checkGitRepositoryToken = 0

  public constructor(props: IAddExistingRepositoryProps) {
    super(props)

    this.state = {
      path: '',
      gitRepository: false,
      showNonGitRepositoryWarning: false,
    }
  }

  private renderWarning() {
    if (!this.state.path.length || !this.state.showNonGitRepositoryWarning) {
      return null
    }

    return (
      <Row className='warning-helper-text'>
        <Octicon symbol={OcticonSymbol.alert} />
        <p>
          This directory does not appear to be a git repository. Would you like to <LinkButton onClick={this.onCreateRepositoryClicked}>create a repository</LinkButton> here instead?
        </p>
      </Row>
    )
  }

  public render() {
    const disabled = this.state.path.length === 0 || this.state.gitRepository === null || !this.state.gitRepository

    return (
      <Dialog
        id='add-existing-repository'
        title={__DARWIN__ ? 'Add Local Repository' : 'Add local repository'}
        onSubmit={this.addRepository}
        onDismissed={this.props.onDismissed}>

        <DialogContent>
          <Row>
            <TextBox
              value={this.state.path}
              label={__DARWIN__ ? 'Local Path' : 'Local path'}
              placeholder='repository path'
              onChange={this.onPathChanged}
              autoFocus/>
            <Button onClick={this.showFilePicker}>Choose…</Button>
          </Row>
          {this.renderWarning()}
        </DialogContent>

        <DialogFooter>
          <ButtonGroup>
            <Button disabled={disabled} type='submit'>
              {__DARWIN__ ? 'Add Repository' : 'Add repository'}
            </Button>
            <Button onClick={this.props.onDismissed}>Cancel</Button>
          </ButtonGroup>
        </DialogFooter>
      </Dialog>
    )
  }

  private onPathChanged = (event: React.FormEvent<HTMLInputElement>) => {
    const path = event.currentTarget.value
    this.checkIfPathIsRepository(path)
  }

  private showFilePicker = () => {
    const directory: string[] | null = remote.dialog.showOpenDialog({ properties: [ 'createDirectory', 'openDirectory' ] })
    if (!directory) { return }

    const path = directory[0]
    this.checkIfPathIsRepository(path)
  }

  private pathExists(directory: string): Promise<FS.Stats> {
    return new Promise<FS.Stats>((resolve, reject) => {
        FS.stat(directory, (err, exists) => {
          if (err) {
            reject(err)
          }

          resolve(exists)
        })
    })
  }

  private async checkIfPathIsRepository(path: string) {
    this.setState({ path })

    const token = ++this.checkGitRepositoryToken
    const pathExists = await this.pathExists(path)

    let isRepo = false

    if (pathExists) {
      isRepo = await isGitRepository(this.resolvedPath(path))
    }

    // Another path check was requested so don't update state based on the old
    // path.
    if (token !== this.checkGitRepositoryToken) { return }

    this.setState({ gitRepository: isRepo, showNonGitRepositoryWarning: !isRepo })
  }

  private resolvedPath(path: string): string {
    return Path.resolve('/', untildify(path))
  }

  private addRepository = async () => {
    const resolvedPath = this.resolvedPath(this.state.path)
    const repositories = await this.props.dispatcher.addRepositories([ resolvedPath ])

    if (repositories && repositories.length) {
      const repository = repositories[0]
      this.props.dispatcher.selectRepository(repository)
    }

    this.props.onDismissed()
  }

  private onCreateRepositoryClicked = () => {
    const resolvedPath = this.resolvedPath(this.state.path)

    return this.props.dispatcher.showPopup({
      type: PopupType.CreateRepository,
      path: resolvedPath,
    })
  }
}
