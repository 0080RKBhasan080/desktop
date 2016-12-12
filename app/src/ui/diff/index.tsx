import * as React from 'react'
import * as ReactDOM from 'react-dom'
import { Disposable } from 'event-kit'

import { NewImageDiff } from './new-image-diff'
import { ModifiedImageDiff } from './modified-image-diff'
import { DeletedImageDiff } from './deleted-image-diff'
import { BinaryFile } from './binary-file'

import { Editor } from 'codemirror'
import { CodeMirrorHost } from './code-mirror-host'
import { Repository } from '../../models/repository'

import { FileChange, WorkingDirectoryFileChange, FileStatus } from '../../models/status'
import { Diff as DiffModel, DiffSelection, ImageDiff } from '../../models/diff'
import { Dispatcher } from '../../lib/dispatcher/dispatcher'

import { DiffLineGutter } from './diff-line-gutter'
import { IEditorConfigurationExtra } from './editor-configuration-extra'
import { getDiffMode } from './diff-mode'
import { ISelectionStrategy } from './selection/selection-strategy'
import { DragDropSelection } from './selection/drag-drop-selection-strategy'
import { RangeSelection } from './selection/range-selection-strategy'

import { fatalError } from '../../lib/fatal-error'

if (__DARWIN__) {
  // This has to be required to support the `simple` scrollbar style.
  require('codemirror/addon/scroll/simplescrollbars')
}

/**
 * normalize the line endings in the diff so that the CodeMirror editor
 * will display the unified diff correctly
 */
function formatLineEnding(text: string): string {
  if (text.endsWith('\n')) {
    return text
  } else if (text.endsWith('\r')) {
    return text + '\n'
  } else {
    return text + '\r\n'
  }
}

/** use a range of pixels near the edge to indicate whether a range selection should fire */
const RangeSelectionEdgeSize = 10

/** The props for the Diff component. */
interface IDiffProps {
  readonly repository: Repository

  /**
   * Whether the diff is readonly, e.g., displaying a historical diff, or the
   * diff's lines can be selected, e.g., displaying a change in the working
   * directory.
   */
  readonly readOnly: boolean

  /** The file whose diff should be displayed. */
  readonly file: FileChange

  /** Called when the includedness of lines or hunks has changed. */
  readonly onIncludeChanged?: (diffSelection: DiffSelection) => void

  /** The diff that should be rendered */
  readonly diff: DiffModel

  /** propagate errors up to the main application */
  readonly dispatcher: Dispatcher
}

/** A component which renders a diff for a file. */
export class Diff extends React.Component<IDiffProps, void> {
  private codeMirror: Editor | null

  /**
   * We store the scroll position before reloading the same diff so that we can
   * restore it when we're done. If we're not reloading the same diff, this'll
   * be null.
   */
  private scrollPositionToRestore: { left: number, top: number } | null = null

  /**
   * A mapping from CodeMirror line handles to disposables which, when disposed
   * cleans up any line gutter components and events associated with that line.
   * See renderLine for more information.
   */
  private readonly lineCleanup = new Map<any, Disposable>()

  /**
   * Maintain the current state of the user interacting with the diff gutter
   */
  private selection: ISelectionStrategy | null = null

  /**
   *  a local cache of gutter elements, keyed by the row in the diff
   */
  private cachedGutterElements = new Map<number, DiffLineGutter>()

  public componentWillReceiveProps(nextProps: IDiffProps) {
    // If we're reloading the same file, we want to save the current scroll
    // position and restore it after the diff's been updated.
    const sameFile = nextProps.file && this.props.file && nextProps.file.id === this.props.file.id

    // Happy path, if the text hasn't changed we won't re-render
    // and subsequently won't have to restore the scroll position.
    const textHasChanged = nextProps.diff !== this.props.diff

    const codeMirror = this.codeMirror
    if (codeMirror && sameFile && textHasChanged) {
      const scrollInfo = codeMirror.getScrollInfo()
      this.scrollPositionToRestore = { left: scrollInfo.left, top: scrollInfo.top }
    } else {
      this.scrollPositionToRestore = null
    }

    // HACK: This entire section is a hack. Whenever we receive
    // props we update all currently visible gutter elements with
    // the selection state from the file.
    if (nextProps.file instanceof WorkingDirectoryFileChange) {
      const selection = nextProps.file.selection
      const oldSelection = this.props.file instanceof WorkingDirectoryFileChange
        ? this.props.file.selection
        : null

      // Nothing has changed
      if (oldSelection === selection) { return }

      const diff = nextProps.diff
      this.cachedGutterElements.forEach((element, index) => {
        if (!element) {
          console.error('expected DOM element for diff gutter not found')
          return
        }

        const line = diff.diffLineForIndex(index)
        const isIncludable = line ? line.isIncludeableLine() : false
        const isSelected = selection.isSelected(index) && isIncludable
        element.setSelected(isSelected)
      })
    }
  }

  public componentWillUnmount() {
    this.dispose()
  }

  private dispose() {
    this.codeMirror = null

    this.lineCleanup.forEach(disposable => disposable.dispose())
    this.lineCleanup.clear()
  }

  private updateRangeHoverState = (start: number, end: number, show: boolean) => {
    for (let i = start; i <= end; i++) {
      this.hoverLine(i, show)
    }
  }

  private hoverLine = (row: number, include: boolean) => {
    const element = this.cachedGutterElements.get(row)

    if (!element) {
      // element not currently cached by the editor, don't try and update it
      return
    }

    element.setHover(include)
  }

  private startSelection = (file: WorkingDirectoryFileChange, index: number, isHunkSelection: boolean) => {

    const snapshot = file.selection
    const selected = snapshot.isSelected(index)
    const desiredSelection = !selected

    if (isHunkSelection) {
      const range = this.props.diff.findInteractiveDiffRange(index)
      if (!range) {
        console.error('unable to find range for given line in diff')
        return
      }

      this.selection = new RangeSelection(range.start, range.end, desiredSelection, snapshot)
    } else {
      this.selection = new DragDropSelection(index, desiredSelection, snapshot)
    }

    this.selection.paint(this.cachedGutterElements)
  }

  private endSelection = () => {
    if (!this.props.onIncludeChanged) {
      return
    }

    if (!this.selection) {
      return
    }

    this.props.onIncludeChanged(this.selection.done())

    // operation is completed, clean this up
    this.selection = null
  }

  private onMouseUp = () => {
    this.endSelection()
  }

  private onMouseDown = (index: number, isHunkSelection: boolean) => {
    if (!(this.props.file instanceof WorkingDirectoryFileChange)) {
      fatalError('must not start selection when selected file is not a WorkingDirectoryFileChange')
      return
    }

    this.startSelection(this.props.file, index, isHunkSelection)
  }

  private onMouseMove = (index: number) => {
    if (this.selection) {
      this.selection.update(index)
      this.selection.paint(this.cachedGutterElements)
    }
  }

  private showHoverStatus = (index: number, active: boolean) => {
    const diffLine = this.props.diff.diffLineForIndex(index)
    if (!diffLine) {
      return
    }

    const range = this.props.diff.findInteractiveDiffRange(index)
    if (!range) {
      console.error('unable to find range for given index in diff')
      return
    }

    if (!diffLine.isIncludeableLine()) {
      // TODO: clear hover selection for current hunk
      // TODO: oh no how to do this?
      return
    }

    this.updateRangeHoverState(range.start, range.end, active)
  }

  private onDiffTextMouseMove = (ev: MouseEvent, index: number) => {
    const isActive = this.isMouseCursorNearGutter(ev)
    if (isActive === null) {
      return
    }

    this.showHoverStatus(index, isActive)
  }

  private onDiffTextMouseDown = (ev: MouseEvent, index: number) => {
    const isActive = this.isMouseCursorNearGutter(ev)

    if (isActive) {
      if (!(this.props.file instanceof WorkingDirectoryFileChange)) {
        fatalError('must not start selection when selected file is not a WorkingDirectoryFileChange')
        return
      }

      this.startSelection(this.props.file, index, true)
    }
  }

  private onDiffTextMouseUp = (ev: MouseEvent, index: number) => {
    this.endSelection()
  }

  private isMouseCursorNearGutter = (ev: MouseEvent): boolean | null =>  {
    const elements = Array.from(this.cachedGutterElements.values())
    const first = elements[0]

    if (first) {
      // HACK: come back to this, `this` is trolling me
      const width = 130
      const deltaX = ev.layerX - width
      return deltaX >= 0 && deltaX <= RangeSelectionEdgeSize
    }

    return false
  }

  private renderLine = (instance: any, line: any, element: HTMLElement) => {

    const existingLineDisposable = this.lineCleanup.get(line)

    // If we can find the line in our cleanup list that means the line is
    // being re-rendered. Agains, CodeMirror doesn't fire the 'delete' event
    // when this happens.
    if (existingLineDisposable) {
      existingLineDisposable.dispose()
      this.lineCleanup.delete(line)
    }

    const index = instance.getLineNumber(line) as number

    const diffLine = this.props.diff.diffLineForIndex(index)
    if (diffLine) {
      const diffLineElement = element.children[0] as HTMLSpanElement

      const reactContainer = document.createElement('span')

      let isIncluded = false
      if (this.props.file instanceof WorkingDirectoryFileChange) {
        isIncluded = this.props.file.selection.isSelected(index)
      }

      const cache = this.cachedGutterElements

      ReactDOM.render(
        <DiffLineGutter
          line={diffLine}
          isIncluded={isIncluded}
          index={index}
          readOnly={this.props.readOnly}
          diff={this.props.diff}
          updateRangeHoverState={this.updateRangeHoverState}
          isSelectionEnabled={this.isSelectionEnabled}
          onMouseUp={this.onMouseUp}
          onMouseDown={this.onMouseDown}
          onMouseMove={this.onMouseMove} />,
        reactContainer,
        function (this: DiffLineGutter) {
          if (this !== undefined) {
            cache.set(index, this)
          }
        }
      )

      const onMouseMoveLine: (ev: MouseEvent) => void = (ev) => {
        this.onDiffTextMouseMove(ev, index)
      }

      const onMouseDownLine: (ev: MouseEvent) => void = (ev) => {
        this.onDiffTextMouseDown(ev, index)
      }

      const onMouseUpLine: (ev: MouseEvent) => void = (ev) => {
        this.onDiffTextMouseUp(ev, index)
      }

      if (!this.props.readOnly) {
        diffLineElement.addEventListener('mousemove', onMouseMoveLine)
        diffLineElement.addEventListener('mousedown', onMouseDownLine)
        diffLineElement.addEventListener('mouseup', onMouseUpLine)
      }

      element.insertBefore(reactContainer, diffLineElement)

      // Hack(ish?). In order to be a real good citizen we need to unsubscribe from
      // the line delete event once we've been called once or the component has been
      // unmounted. In the latter case it's _probably_ not strictly necessary since
      // the only thing gc rooted by the event should be isolated and eligble for
      // collection. But let's be extra cautious I guess.
      //
      // The only way to unsubscribe is to pass the exact same function given to the
      // 'on' function to the 'off' so we need a reference to ourselves, basically.
      let deleteHandler: () => void

      // Since we manually render a react component we have to take care of unmounting
      // it or else we'll leak memory. This disposable will unmount the component.
      //
      // See https://facebook.github.io/react/blog/2015/10/01/react-render-and-top-level-api.html
      const gutterCleanup = new Disposable(() => {
        this.cachedGutterElements.delete(index)

        ReactDOM.unmountComponentAtNode(reactContainer)

        if (!this.props.readOnly) {
          diffLineElement.removeEventListener('mousemove', onMouseMoveLine)
          diffLineElement.removeEventListener('mousedown', onMouseDownLine)
          diffLineElement.removeEventListener('mouseup', onMouseUpLine)
        }

        line.off('delete', deleteHandler)
      })

      // Add the cleanup disposable to our list of disposables so that we clean up when
      // this component is unmounted or when the line is re-rendered. When either of that
      // happens the line 'delete' event doesn't  fire.
      this.lineCleanup.set(line, gutterCleanup)

      // If the line delete event fires we dispose of the disposable (disposing is
      // idempotent)
      deleteHandler = () => {
        const disp = this.lineCleanup.get(line)
        if (disp) {
          this.lineCleanup.delete(line)
          disp.dispose()
        }
      }
      line.on('delete', deleteHandler)
    }
  }

  private isSelectionEnabled = () => {
    return this.selection == null
  }

  private restoreScrollPosition(cm: Editor) {
    const scrollPosition = this.scrollPositionToRestore
    if (cm && scrollPosition) {
      cm.scrollTo(scrollPosition.left, scrollPosition.top)
    }
  }

  private onChanges = (cm: Editor) => {
    this.restoreScrollPosition(cm)
  }

  private renderImage(imageDiff: ImageDiff) {
    if (imageDiff.current && imageDiff.previous) {
      return <ModifiedImageDiff
                current={imageDiff.current}
                previous={imageDiff.previous} />
    }

    if (imageDiff.current && this.props.file.status === FileStatus.New) {
      return <NewImageDiff current={imageDiff.current} />
    }

    if (imageDiff.previous && this.props.file.status === FileStatus.Deleted) {
      return <DeletedImageDiff previous={imageDiff.previous} />
    }

    return null
  }

  private getAndStoreCodeMirrorInstance = (cmh: CodeMirrorHost) => {
    this.codeMirror = cmh === null ? null : cmh.getEditor()
  }

  public render() {

    if (this.props.diff.imageDiff) {
      return this.renderImage(this.props.diff.imageDiff)
    }

    if (this.props.diff.isBinary) {
      return <BinaryFile path={this.props.file.path}
                         repository={this.props.repository}
                         dispatcher={this.props.dispatcher} />
    }

    let diffText = ''

    this.props.diff.hunks.forEach(hunk => {
      hunk.lines.forEach(l => diffText += formatLineEnding(l.text))
    })

    const options: IEditorConfigurationExtra = {
      lineNumbers: false,
      readOnly: true,
      showCursorWhenSelecting: false,
      cursorBlinkRate: -1,
      lineWrapping: localStorage.getItem('soft-wrap-is-best-wrap') ? true : false,
      // Make sure CodeMirror doesn't capture Tab and thus destroy tab navigation
      extraKeys: { Tab: false },
      scrollbarStyle: __DARWIN__ ? 'simple' : 'native',
      mode: getDiffMode(),
    }

    return (
      <CodeMirrorHost
        className='diff-code-mirror'
        value={diffText}
        options={options}
        isSelectionEnabled={this.isSelectionEnabled}
        onChanges={this.onChanges}
        onRenderLine={this.renderLine}
        ref={this.getAndStoreCodeMirrorInstance}
      />
    )
  }
}
