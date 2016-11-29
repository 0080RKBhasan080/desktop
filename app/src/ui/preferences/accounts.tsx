import * as React from 'react'
import { User } from '../../models/user'
import { Dispatcher } from '../../lib/dispatcher'
import { Button } from '../lib/button'
import { SignIn } from '../lib/sign-in'
import { assertNever } from '../../lib/fatal-error'
import { getDotComAPIEndpoint } from '../../lib/api'

interface IAccountsProps {
  readonly dispatcher: Dispatcher
  readonly dotComUser: User | null
  readonly enterpriseUser: User | null
}

enum SignInType {
  DotCom,
  Enterprise,
}

export class Accounts extends React.Component<IAccountsProps, void> {
  public render() {
    return (
      <div>
        <h2>GitHub.com</h2>
        {this.props.dotComUser ? this.renderUser(this.props.dotComUser) : this.renderSignIn(SignInType.DotCom)}

        <h2>Enterprise</h2>
        {this.props.enterpriseUser ? this.renderUser(this.props.enterpriseUser) : this.renderSignIn(SignInType.Enterprise)}
      </div>
    )
  }

  private renderUser(user: User) {
    return (
      <div>
        <img className='avatar' src={user.avatarURL}/>
        <span>{user.login}</span>
        <Button onClick={this.logout(user)}>Log Out</Button>
      </div>
    )
  }

  private renderSignIn(type: SignInType) {
    switch (type) {
      case SignInType.DotCom: {
        return <SignIn
          endpoint={getDotComAPIEndpoint()}
          onDidSignIn={this.onDidSignIn}/>
      }
      case SignInType.Enterprise: return <SignIn onDidSignIn={this.onDidSignIn}/>
      default: return assertNever(type, `Unknown sign in type: ${type}`)
    }
  }

  private logout = (user: User) => {
    return () => {
      this.props.dispatcher.removeUser(user)
    }
  }

  private onDidSignIn = async (user: User) => {
    await this.props.dispatcher.addUser(user)
  }
}
