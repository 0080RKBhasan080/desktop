import * as React from 'react'
import { Commit } from '../../models/commit'
import { getGlobalConfigValue, setGlobalConfigValue } from '../../lib/git/config'
import { CommitListItem } from '../history/commit-list-item'
import { User } from '../../models/user'
import { CommitIdentity } from '../../models/commit-identity'

interface IConfigureGitUserProps {
  /** The logged-in users. */
  readonly users: ReadonlyArray<User>

  /** Called after the user has chosen to save their config. */
  readonly onDidSave?: () => void

  /** The label for the button which saves config changes. */
  readonly saveLabel?: string

  /** Additional elements that are rendered below the form. */
  readonly children?: ReadonlyArray<JSX.Element>
}

interface IConfigureGitUserState {
  readonly name: string
  readonly email: string
  readonly avatarURL: string | null
}

/** A component which allows the user to configure their Git user. */
export class ConfigureGitUser extends React.Component<IConfigureGitUserProps, IConfigureGitUserState> {
  public constructor(props: IConfigureGitUserProps) {
    super(props)

    this.state = { name: '', email: '', avatarURL: null }
  }

  public async componentWillMount() {
    let name = await getGlobalConfigValue('user.name')
    let email = await getGlobalConfigValue('user.email')

    const user = this.props.users[0]
    if ((!name || !name.length) && user) {
      name = user.login
    }

    if ((!email || !email.length) && user) {
      email = user.emails[0]
    }

    const avatarURL = email ? this.avatarURLForEmail(email) : null
    this.setState({ name: name || '', email: email || '', avatarURL })
  }

  private dateWithMinuteOffset(date: Date, minuteOffset: number): Date {
    const copy = new Date(date.getTime())
    copy.setTime(copy.getTime() + (minuteOffset * 60 * 1000))
    return copy
  }

  public render() {
    const now = new Date()
    const dummyAuthor1 = new CommitIdentity('Hubot', this.state.email, this.dateWithMinuteOffset(now, -2))
    const dummyCommit1 = new Commit('', 'Do more things', '', dummyAuthor1, [])

    const dummyAuthor3 = new CommitIdentity('Hubot', this.state.email, this.dateWithMinuteOffset(now, -60))
    const dummyCommit3 = new Commit('', 'Add some things', '', dummyAuthor3, [])

    // NB: We're using the name as the commit SHA:
    //  1. `Commit` is referentially transparent wrt the SHA. So in order to get
    //     it to update when we name changes, we need to change the SHA.
    //  2. We don't display the SHA so the user won't ever know our secret.
    const dummyAuthor2 = new CommitIdentity(this.state.name, this.state.email, this.dateWithMinuteOffset(now, -30))
    const dummyCommit2 = new Commit(this.state.name, 'Fix all the things', '', dummyAuthor2, [])
    const emoji = new Map()
    return (
      <div id='configure-git-user'>
        <form className='sign-in-form' onSubmit={this.save}>
          <div className='field-group'>
            <label htmlFor='git-name'>Name</label>
            <input id='git-name' className='sign-in-field text-field' placeholder='Hubot' value={this.state.name} onChange={this.onNameChange}/>
          </div>

          <div className='field-group'>
            <label htmlFor='git-email'>Email</label>
            <input id='git-email' className='sign-in-field text-field' placeholder='hubot@github.com' value={this.state.email} onChange={this.onEmailChange}/>
          </div>

          <div className='actions'>
            <button type='submit'>{this.props.saveLabel || 'Save'}</button>
            {this.props.children}
          </div>
        </form>

        <div id='commit-list' className='commit-list-example'>
          <CommitListItem commit={dummyCommit1} emoji={emoji} avatarURL={null}/>
          <CommitListItem commit={dummyCommit2} emoji={emoji} avatarURL={this.state.avatarURL}/>
          <CommitListItem commit={dummyCommit3} emoji={emoji} avatarURL={null}/>
        </div>
      </div>
    )
  }

  private onNameChange = (event: React.FormEvent<HTMLInputElement>) => {
    this.setState({
      name: event.currentTarget.value,
      email: this.state.email,
      avatarURL: this.state.avatarURL,
    })
  }

  private onEmailChange = (event: React.FormEvent<HTMLInputElement>) => {
    const email = event.currentTarget.value
    const avatarURL = this.avatarURLForEmail(email)

    this.setState({
      name: this.state.name,
      email,
      avatarURL,
    })
  }

  private avatarURLForEmail(email: string): string | null {
    const matchingUser = this.props.users.find(u => u.emails.indexOf(email) > -1)
    return matchingUser ? matchingUser.avatarURL : null
  }

  private save = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    if (this.props.onDidSave) {
      this.props.onDidSave()
    }

    const name = this.state.name
    if (name.length) {
      await setGlobalConfigValue('user.name', name)
    }

    const email = this.state.email
    if (email.length) {
      await setGlobalConfigValue('user.email', email)
    }
  }
}
