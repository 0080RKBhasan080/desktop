import * as React from 'react'
import { Dispatcher, AppStore } from '../../lib/dispatcher'
import { assertNever } from '../../lib/fatal-error'
import { Start } from './start'
import { SignInDotCom } from './sign-in-dot-com'
import { SignInEnterprise } from './sign-in-enterprise'
import { ConfigureGit } from './configure-git'
import { UiView } from '../ui-view'

/** The steps along the Welcome flow. */
export enum WelcomeStep {
  Start,
  SignInToDotCom,
  SignInToEnterprise,
  ConfigureGit,
}

interface IWelcomeProps {
  readonly dispatcher: Dispatcher
  readonly appStore: AppStore
}

interface IWelcomeState {
  readonly currentStep: WelcomeStep
}

/** The Welcome flow. */
export class Welcome extends React.Component<IWelcomeProps, IWelcomeState> {
  public constructor(props: IWelcomeProps) {
    super(props)

    this.state = { currentStep: WelcomeStep.Start }
  }

  private getComponentForCurrentStep() {
    const step = this.state.currentStep
    const advance = (step: WelcomeStep) => this.advanceToStep(step)
    const done = () => this.done()
    const props = { dispatcher: this.props.dispatcher, advance, done }

    switch (step) {
      case WelcomeStep.Start: return <Start {...props}/>
      case WelcomeStep.SignInToDotCom: return <SignInDotCom {...props}/>
      case WelcomeStep.SignInToEnterprise: return <SignInEnterprise {...props}/>
      case WelcomeStep.ConfigureGit: return <ConfigureGit {...props} users={this.props.appStore.getState().users}/>
      default: return assertNever(step, `Unknown welcome step: ${step}`)
    }
  }

  private advanceToStep(step: WelcomeStep) {
    this.setState({ currentStep: step })
  }

  private done() {
    this.props.dispatcher.endWelcomeFlow()
  }

  public render() {
    return (
      <UiView id='welcome'>
        {this.getComponentForCurrentStep()}
      </UiView>
    )
  }
}
