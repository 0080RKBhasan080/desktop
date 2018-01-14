import { Emitter, Disposable } from 'event-kit'

export abstract class BaseStore {
  protected readonly _emitter = new Emitter()

  protected emitUpdate(data?: any) {
    this._emitter.emit('did-update', data || {})
  }

  protected emitError(error: Error) {
    this._emitter.emit('did-error', error)
  }

  /** Register a function to be called when the store updates. */
  public onDidUpdate(fn: () => void): Disposable {
    return this._emitter.on('did-update', fn)
  }

  /**
   * Register an even handler which will be invoked whenever
   * an unexpected error occurs during the sign-in process. Note
   * that some error are handled in the flow and passed along in
   * the sign in state for inline presentation to the user.
   */
  public onDidError(fn: (e: Error) => void): Disposable {
    return this._emitter.on('did-error', fn)
  }
}
