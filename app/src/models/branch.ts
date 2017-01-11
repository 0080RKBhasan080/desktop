import { Commit } from './commit'

export enum BranchType {
  Local,
  Remote,
}

export enum BranchState {
  Unborn,
  Detached,
  Valid
}

export interface IUnbornRepository {
   readonly kind: BranchState.Unborn
}

export interface IDetachedHead {
   readonly kind: BranchState.Detached
   readonly currentSha: string
}

export interface IValidBranch {
   readonly kind: BranchState.Valid
   readonly branch: Branch
}

export type Tip =
  IUnbornRepository |
  IDetachedHead |
  IValidBranch

/** A branch as loaded from Git. */
export class Branch {
  /** The short name of the branch. E.g., `master`. */
  public readonly name: string

  /** The remote-prefixed upstream name. E.g., `origin/master`. */
  public readonly upstream: string | null

  /** The type of branch, e.g., local or remote. */
  public readonly type: BranchType

  /** The commit associated with this branch */
  public readonly tip: Commit

  public constructor(name: string, upstream: string | null, tip: Commit, type: BranchType) {
    this.name = name
    this.upstream = upstream
    this.tip = tip
    this.type = type
  }

  /** The name of the upstream's remote. */
  public get remote(): string | null {
    const upstream = this.upstream
    if (!upstream) { return null }

    const pieces = upstream.match(/(.*?)\/.*/)
    if (!pieces || pieces.length < 2) { return null }

    return pieces[1]
  }

  /**
   * The name of the branch without the remote prefix. If the branch is a local
   * branch, this is the same as its `name`.
   */
  public get nameWithoutRemote(): string {
    if (this.type === BranchType.Local) {
      return this.name
    } else {
      const pieces = this.name.match(/.*?\/(.*)/)
      if (!pieces || pieces.length < 2) {
         return this.name
      }

      return pieces[1]
    }
  }
}
