import * as React from 'react'
import * as ReactDOM from 'react-dom'
import * as classNames from 'classnames'
import { Grid, AutoSizer } from 'react-virtualized'

/**
 * Describe the first argument given to the cellRenderer,
 * See
 *  https://github.com/bvaughn/react-virtualized/issues/386
 *  https://github.com/bvaughn/react-virtualized/blob/8.0.11/source/Grid/defaultCellRangeRenderer.js#L38-L44
 */
export interface IRowRendererParams {
  /** Horizontal (column) index of cell */
  readonly columnIndex: number

  /** The Grid is currently being scrolled */
  readonly isScrolling: boolean

  /** Unique key within array of cells */
  readonly key: React.Key

  /** Vertical (row) index of cell */
  readonly rowIndex: number

  /** Style object to be applied to cell */
  readonly style: React.CSSProperties
}

/**
 * Interface describing a user initiated selection change event
 * originating from a pointer device clicking or pressing on an item.
 */
export interface IMouseClickSource {
  readonly kind: 'mouseclick',
  readonly event: React.MouseEvent<any>
}

/**
 * Interface describing a user initiated selection change event
 * originating from a pointer device hovering over an item.
 * Only applicable when selectedOnHover is set.
 */
export interface IHoverSource {
  readonly kind: 'hover',
  readonly event: React.MouseEvent<any>
}

/**
 * Interface describing a user initiated selection change event
 * originating from a keyboard
 */
export interface IKeyboardSource {
  readonly kind: 'keyboard',
  readonly event: React.KeyboardEvent<any>
}

/** A type union of possible sources of a selection changed event */
export type SelectionSource =
  IMouseClickSource |
  IHoverSource |
  IKeyboardSource


export type ClickSource =
  IMouseClickSource |
  IKeyboardSource

interface IListProps {
  /**
   * Mandatory callback for rendering the contents of a particular
   * row. The callback is not responsible for the outer wrapper
   * of the row, only its contents and may return null although
   * that will result in an empty list item.
   */
  readonly rowRenderer: (row: number) => JSX.Element | null

  /**
   * The total number of rows in the list. This is used for
   * scroll virtualization purposes when calculating the theoretical
   * height of the list.
   */
  readonly rowCount: number

  /**
   * The height of each individual row in the list. This height
   * is enforced for each row container and attempting to render a row
   * which does not fit inside that height is forbidden.
   */
  readonly rowHeight: number

  /**
   * The currently selected row index. Used to attach a special
   * selection class on that row container as well as being used
   * for keyboard selection.
   */
  readonly selectedRow: number

  /**
   * This function will be called when a pointer device is pressed and then
   * released on a selectable row. Note that this follows the conventions
   * of button elements such that pressing Enter or Space on a keyboard
   * while focused on a particular row will also trigger this event. Consumers
   * can differentiate between the two using the source parameter.
   *
   * Note that this event handler will not be called for keyboard events
   * if event.preventDefault was called in the onRowKeyDown event handler.
   *
   * Consumers of this event do _not_ have to call event.preventDefault,
   * when this event is subscribed to the list will automatically call it.
   */
  readonly onRowClick?: (row: number, soure: ClickSource) => void

  /**
   * This function will be called when the selection changes as a result of a
   * user keyboard or mouse action (i.e. not when props change). Note that this
   * differs from `onRowSelected`. For example, it won't be called if an already
   * selected row is clicked on.
   *
   * @param row    - The index of the row that was just selected
   * @param source - The kind of user action that provoced the change, either
   *                 a pointer device press, hover (if selectOnHover is set) or
   *                 a keyboard event (arrow up/down)
   */
  readonly onSelectionChanged?: (row: number, source: SelectionSource) => void

  /**
   * A handler called whenever a key down event is received on the
   * row container element. Due to the way the container is currently
   * implemented the element produced by the rowRendered will never
   * see keyboard events without stealing focus away from the container.
   *
   * Primary use case for this is to allow items to react to the space
   * bar in order to toggle selection. This function is responsible
   * for calling event.preventDefault() when acting on a key press.
   */
  readonly onRowKeyDown?: (row: number, event: React.KeyboardEvent<any>) => void

  /**
   * An optional handler called to determine whether a given row is
   * selectable or not. Reasons for why a row might not be selectable
   * includes it being a group header or the item being disabled.
   */
  readonly canSelectRow?: (row: number) => boolean
  readonly onScroll?: (scrollTop: number, clientHeight: number) => void

  /**
   * List's underlying implementation acts as a pure component based on the
   * above props. So if there are any other properties that also determine
   * whether the list should re-render, List must know about them.
   */
  readonly invalidationProps?: any

  /** The unique identifier for the outer element of the component (optional, defaults to null) */
  readonly id?: string

  /** The row that should be scrolled to when the list is rendered. */
  readonly scrollToRow?: number

  /** Whether or not selection should follow pointer device */
  readonly selectOnHover?: boolean
}

export class List extends React.Component<IListProps, void> {
  private focusItem: HTMLDivElement | null = null
  private fakeScroll: HTMLDivElement | null = null

  private scrollToRow = -1
  private focusRow = -1

  /**
   * On Win32 we use a fake scroll bar. This variable keeps track of
   * which of the actual scroll container and the fake scroll container
   * received the scroll event first to avoid bouncing back and forth
   * causing jerky scroll bars and more importantly making the mouse
   * wheel scroll speed appear different when scrolling over the
   * fake scroll bar and the actual one.
   */
  private lastScroll: 'grid' | 'fake' | null = null

  private grid: React.Component<any, any> | null

  private handleKeyDown = (event: React.KeyboardEvent<any>) => {
    if (event.key === 'ArrowDown') {
      this.moveSelection('down', event)
      event.preventDefault()
    } else if (event.key === 'ArrowUp') {
      this.moveSelection('up', event)
      event.preventDefault()
    }
  }

  private handleRowKeyDown(rowIndex: number, event: React.KeyboardEvent<any>) {
    if (this.props.onRowKeyDown) {
      this.props.onRowKeyDown(rowIndex, event)
    }

    // We give consumers the power to prevent the onRowClick event by subscribing
    // to the onRowKeyDown event and calling event.preventDefault. This lets
    // consumers add their own semantics for keyboard presses.
    if (!event.defaultPrevented && this.props.onRowClick) {
      if (event.key === 'Enter' || event.key === ' ') {
        this.props.onRowClick(rowIndex, { kind: 'keyboard', event })
        event.preventDefault()
      }
    }
  }

  private onRowMouseOver = (row: number, event: React.MouseEvent<any>) => {
    if (this.props.selectOnHover && this.canSelectRow(row)) {
      if (row !== this.props.selectedRow && this.props.onSelectionChanged) {
        this.props.onSelectionChanged(row, { kind: 'hover', event })
        this.scrollRowToVisible(row)
      }
    }
  }

  /**
   * Determine the next selectable row, given the direction and row. This will
   * take `canSelectRow` into account.
   */
  public nextSelectableRow(direction: 'up' | 'down', row: number): number {
    let newRow = row
    if (direction === 'up') {
      newRow = row - 1
      if (newRow < 0) {
        newRow = this.props.rowCount - 1
      }
    } else {
      newRow = row + 1
      if (newRow > this.props.rowCount - 1) {
        newRow = 0
      }
    }

    if (this.canSelectRow(newRow)) {
      return newRow
    } else {
      return this.nextSelectableRow(direction, newRow)
    }
  }

  /** Convenience method for invoking canSelectRow callback when it exists */
  private canSelectRow(rowIndex: number) {
    return this.props.canSelectRow
      ? this.props.canSelectRow(rowIndex)
      : true
  }

  private moveSelection(direction: 'up' | 'down', event: React.KeyboardEvent<any>) {
    const newRow = this.nextSelectableRow(direction, this.props.selectedRow)

    if (this.props.onSelectionChanged) {
      this.props.onSelectionChanged(newRow, { kind: 'keyboard', event })
    }

    this.scrollRowToVisible(newRow)
  }

  private scrollRowToVisible(row: number) {
    this.scrollToRow = row
    this.focusRow = row
    this.forceUpdate()
  }

  public componentDidUpdate() {
    // If this state is set it means that someone just used arrow keys (or pgup/down)
    // to change the selected row. When this happens we need to explcitly shift
    // keyboard focus to the newly selected item. If focusItem is null then
    // we're probably just loading more items and we'll catch it on the next
    // render pass.
    if (this.focusRow >= 0 && this.focusItem) {
      this.focusItem.focus()
      this.focusRow = -1
      this.forceUpdate()
    }
  }

  private renderRow = (params: IRowRendererParams) => {
    const rowIndex = params.rowIndex
    const selectable = this.canSelectRow(rowIndex)
    const selected = rowIndex === this.props.selectedRow
    const focused = rowIndex === this.focusRow
    const className = classNames('list-item', { selected })

    // An unselectable row shouldn't have any tabIndex (as -1 means
    // it's given focus by clicking).
    let tabIndex: number | undefined = undefined
    if (selectable) {
      tabIndex = selected ? 0 : -1
    }

    // We only need to keep a reference to the focused element
    const ref = focused
      ? (c: HTMLDivElement) => { this.focusItem = c }
      : undefined

    const element = this.props.rowRenderer(params.rowIndex)
    const role = selectable ? 'button' : undefined

    return (
      <div key={params.key}
           role={role}
           className={className}
           tabIndex={tabIndex}
           ref={ref}
           onMouseOver={(e) => this.onRowMouseOver(rowIndex, e)}
           onMouseDown={(e) => this.handleMouseDown(rowIndex, e)}
           onClick={(e) => this.onRowClick(rowIndex, e)}
           onKeyDown={(e) => this.handleRowKeyDown(rowIndex, e)}
           style={params.style}>
        {element}
      </div>
    )
  }

  public render() {
    return (
      <div id={this.props.id}
           className='list'
           onKeyDown={this.handleKeyDown}>
        <AutoSizer disableWidth disableHeight>
          {({ width, height }: { width: number, height: number }) => this.renderContents(width, height)}
        </AutoSizer>
      </div>
    )
  }

  /**
   * Renders the react-virtualized Grid component and optionally
   * a fake scroll bar component if running on Windows.
   *
   * @param {width} - The width of the Grid as given by AutoSizer
   * @param {height} - The height of the Grid as given by AutoSizer
   *
   */
  private renderContents(width: number, height: number) {
    if (__WIN32__) {
      return (
        <div>
          {this.renderGrid(width, height)}
          {this.renderFakeScroll(height)}
        </div>
      )
    }

    return this.renderGrid(width, height)
  }

  private onGridRef = (ref: React.Component<any, any>) => {
    this.grid = ref
  }

  private onFakeScrollRef = (ref: HTMLDivElement) => {
    this.fakeScroll = ref
  }

  /**
   * Renders the react-virtualized Grid component
   *
   * @param {width} - The width of the Grid as given by AutoSizer
   * @param {height} - The height of the Grid as given by AutoSizer
   */
  private renderGrid(width: number, height: number) {
    let scrollToRow = this.props.scrollToRow
    if (scrollToRow === undefined) {
      scrollToRow = this.scrollToRow
    }
    this.scrollToRow = -1

    // The currently selected list item is focusable but if
    // there's no focused item (and there's items to switch between)
    // the list itself needs to be focusable so that you can reach
    // it with keyboard navigation and select an item.
    const tabIndex = (this.props.selectedRow < 0 && this.props.rowCount > 0) ? 0 : null

    return (
      <Grid
        ref={this.onGridRef}
        autoContainerWidth
        width={width}
        height={height}
        columnWidth={width}
        columnCount={1}
        rowCount={this.props.rowCount}
        rowHeight={this.props.rowHeight}
        cellRenderer={this.renderRow}
        onScroll={this.onScroll}
        scrollToRow={scrollToRow}
        overscanRowCount={4}
        // Grid doesn't actually _do_ anything with
        // `selectedRow`. We're just passing it through so that
        // Grid will re-render when it changes.
        selectedRow={this.props.selectedRow}
        tabIndex={tabIndex}
        invalidationProps={this.props.invalidationProps}/>
    )
  }

  /**
   * Renders a fake scroll container which sits on top of the
   * react-virtualized Grid component in order for us to be
   * able to have nice looking scrollbars on Windows.
   *
   * The fake scroll bar syncronizes its position
   *
   * NB: Should only be used on win32 platforms and needs to
   * be coupled with styling that hides scroll bars on Grid
   * and accurately positions the fake scroll bar.
   *
   * @param {height} - The height of the Grid as given by AutoSizer
   *
   */
  private renderFakeScroll(height: number) {
    return (
      <div
        className='fake-scroll'
        ref={this.onFakeScrollRef}
        style={{ height }}
        onScroll={this.onFakeScroll}>
        <div style={{ height: this.props.rowHeight * this.props.rowCount, pointerEvents: 'none' }}></div>
      </div>
    )
  }

  // Set the scroll position of the actual Grid to that
  // of the fake scroll bar. This is for mousewheel/touchpad
  // scrolling on top of the fake Grid or actual dragging of
  // the scroll thumb.
  private onFakeScroll = (e: React.UIEvent<HTMLDivElement>) => {

    // We're getting this event in reaction to the Grid
    // having been scrolled and subsequently updating the
    // fake scrollTop, ignore it
    if (this.lastScroll === 'grid') {
      this.lastScroll = null
      return
    }

    this.lastScroll = 'fake'

    if (this.grid) {

      const element = ReactDOM.findDOMNode(this.grid)
      if (element) {
        element.scrollTop = e.currentTarget.scrollTop
      }
    }
  }

  private handleMouseDown = (row: number, event: React.MouseEvent<any>) => {
    if (this.canSelectRow(row)) {
      if (row !== this.props.selectedRow && this.props.onSelectionChanged) {
        this.props.onSelectionChanged(row, { kind: 'mouseclick', event })
      }
    }
  }

  private onRowClick = (row: number, event: React.MouseEvent<any>) => {
    if (this.canSelectRow(row) && this.props.onRowClick) {
      this.props.onRowClick(row, { kind: 'mouseclick', event })
    }
  }

  private onScroll = ({ scrollTop, clientHeight }: { scrollTop: number, clientHeight: number }) => {
    if (this.props.onScroll) {
      this.props.onScroll(scrollTop, clientHeight)
    }

    // Set the scroll position of the fake scroll bar to that
    // of the actual Grid. This is for mousewheel/touchpad scrolling
    // on top of the Grid.
    if (__WIN32__ && this.fakeScroll) {

      // We're getting this event in reaction to the fake scroll
      // having been scrolled and subsequently updating the
      // Grid scrollTop, ignore it.
      if (this.lastScroll === 'fake') {
        this.lastScroll = null
        return
      }

      this.lastScroll = 'grid'

      this.fakeScroll.scrollTop = scrollTop
    }
  }

  public forceUpdate(callback?: () => any) {
    super.forceUpdate(callback)

    const grid = this.grid
    if (grid) {
      grid.forceUpdate()
    }
  }
}
