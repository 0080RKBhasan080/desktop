import * as React from 'react'
import { List } from '../list'
import { IAutocompletionProvider } from './index'
import { fatalError } from '../../lib/fatal-error'

interface IPosition {
  readonly top: number
  readonly left: number
}

interface IRange {
  readonly start: number
  readonly length: number
}

const getCaretCoordinates: (element: HTMLElement, position: number) => IPosition = require('textarea-caret')

interface IAutocompletingTextInputProps<ElementType> {
  readonly className?: string
  readonly placeholder?: string
  readonly value?: string
  readonly onChange?: (event: React.FormEvent<ElementType>) => void
  readonly onKeyDown?: (event: React.KeyboardEvent<ElementType>) => void
  readonly autocompletionProviders: ReadonlyArray<IAutocompletionProvider<any>>
}

interface IAutocompletionState<T> {
  readonly provider: IAutocompletionProvider<T>
  readonly items: ReadonlyArray<T>
  readonly range: IRange
  readonly rangeText: string
  readonly selectedItem: T | null
}

/**
 * The height of the autocompletion result rows.
 *
 * We're rendering emojis at 20x20px and each row
 * has a 1px border at the bottom, making 31 the
 * ideal height for fitting the emoji images.
 */
const RowHeight = 31

/**
 * The amount to offset on the Y axis so that the popup is displayed below the
 * current line.
 */
const YOffset = 20

/**
 * The default height for the popup. Note that the actual height may be
 * smaller in order to fit the popup within the window.
 */
const DefaultPopupHeight = 100

interface IAutocompletingTextInputState<T> {
  /**
   * All of the state about autocompletion. Will be null if there are no
   * matching autocompletion providers.
   */
  readonly autocompletionState: IAutocompletionState<T> | null
}

/** A text area which provides autocompletions as the user types. */
export abstract class AutocompletingTextInput<ElementType extends HTMLInputElement | HTMLTextAreaElement> extends React.Component<IAutocompletingTextInputProps<ElementType>, IAutocompletingTextInputState<any>> {
  private element: ElementType | null = null
  private autocompletionList: List | null = null

  /** The row to scroll to. -1 means the list shouldn't scroll. */
  private scrollToRow = -1

  /** The identifier for each autocompletion request. */
  private autocompletionRequestID = 0

  public constructor(props: IAutocompletingTextInputProps<ElementType>) {
    super(props)

    this.state = { autocompletionState: null }
  }

  private renderItem<T>(state: IAutocompletionState<T>, row: number) {
    const item = state.items[row]
    const selected = item === state.selectedItem ? 'selected' : ''
    return (
      <div className={`autocompletion-item ${selected}`}>
        {state.provider.renderItem(item)}
      </div>
    )
  }

  private renderAutocompletions() {
    const state = this.state.autocompletionState
    if (!state) { return null }

    const items = state.items
    if (!items.length) { return null }

    const scrollToRow = this.scrollToRow
    this.scrollToRow = -1

    const element = this.element!
    let coordinates = getCaretCoordinates(element, state.range.start)
    coordinates = { top: coordinates.top - element.scrollTop, left: coordinates.left - element.scrollLeft }

    const left = coordinates.left
    const top = coordinates.top + YOffset
    const selectedRow = items.indexOf(state.selectedItem)
    const rect = element.getBoundingClientRect()
    const popupAbsoluteTop = rect.top + coordinates.top
    const windowHeight = element.ownerDocument.defaultView.innerHeight
    const spaceToBottomOfWindow = windowHeight - popupAbsoluteTop - YOffset

    // The maximum height we can use for the popup without it extending beyond
    // the Window bounds.
    const maxHeight = Math.min(DefaultPopupHeight, spaceToBottomOfWindow)

    // The height needed to accomodate all the matched items without overflowing
    //
    // Magic number warning! The autocompletion-popup container adds a border
    // which we have to account for in case we want to show N number of items
    // without overflowing and triggering the scrollbar.
    const noOverflowItemHeight = (RowHeight * items.length) + 2

    const height = Math.min(noOverflowItemHeight, maxHeight)

    // Use the completion text as invalidation props so that highlighting
    // will update as you type even though the number of items matched
    // remains the same. Additionally we need to be aware that different
    // providers can use different sorting behaviors which also might affect
    // rendering.
    const searchText = this.state.autocompletionState
      ? this.state.autocompletionState.rangeText
      : undefined

    return (
      <div className='autocompletion-popup' style={{ top, left, height }}>
        <List ref={ref => this.autocompletionList = ref}
              rowCount={items.length}
              rowHeight={RowHeight}
              selectedRow={selectedRow}
              rowRenderer={row => this.renderItem(state, row)}
              scrollToRow={scrollToRow}
              onRowSelected={row => this.insertCompletionOnClick(items[row])}
              invalidationProps={searchText}/>
      </div>
    )
  }

  private insertCompletionOnClick(item: string) {
    this.insertCompletion(item)

    // This is pretty gross. Clicking on the list moves focus off the text area.
    // Immediately moving focus back doesn't work. Gotta wait a runloop I guess?
    setTimeout(() => {
      const element = this.element
      if (element) {
        element.focus()
      }
    }, 0)
  }

  /**
   * To be implemented by subclasses. It must return the element tag name which
   * should correspond to the ElementType over which it is parameterized.
   */
  protected abstract getElementTagName(): 'textarea' | 'input'

  private renderTextInput() {
    return React.createElement<any, any>(this.getElementTagName(), {
      ref: (ref: ElementType) => this.element = ref,
      type: 'text',
      placeholder: this.props.placeholder,
      value: this.props.value,
      onChange: (event: React.FormEvent<ElementType>) => this.onChange(event),
      onKeyDown: (event: React.KeyboardEvent<ElementType>) => this.onKeyDown(event),
    })
  }

  public render() {
    return (
      <div className={`autocompletion-container ${this.props.className || ''}`}>
        {this.renderAutocompletions()}

        {this.renderTextInput()}
      </div>
    )
  }

  private insertCompletion(item: any) {
    const element = this.element!
    const autocompletionState = this.state.autocompletionState!
    const originalText = element.value
    const range = autocompletionState.range
    const autoCompleteText = autocompletionState.provider.getCompletionText(item)
    const newText = originalText.substr(0, range.start - 1) + autoCompleteText + originalText.substr(range.start + range.length) + ' '
    element.value = newText

    if (this.props.onChange) {
      // This is gross, I feel gross, etc.
      this.props.onChange({
          bubbles: false,
          currentTarget: element,
          cancelable: false,
          defaultPrevented: true,
          eventPhase: 1,
          isTrusted: true,
          nativeEvent: new KeyboardEvent('keydown'),
          preventDefault: () => {},
          isDefaultPrevented: () => true,
          stopPropagation: () => {},
          isPropagationStopped: () => true,
          persist: () => {},
          target: element,
          timeStamp: new Date(),
          type: 'keydown',
      })
    }

    this.setState({ autocompletionState: null })
  }

  private getMovementDirection(event: React.KeyboardEvent<any>): 'up' | 'down' | null {
    switch (event.key) {
      case 'ArrowUp': return 'up'
      case 'ArrowDown': return 'down'
    }

    return null
  }

  private onKeyDown(event: React.KeyboardEvent<ElementType>) {
    if (this.props.onKeyDown) {
      this.props.onKeyDown(event)
    }

    const state = this.state.autocompletionState
    if (!state) { return }

    const selectedRow = state.items.indexOf(state.selectedItem)
    const direction = this.getMovementDirection(event)
    if (direction) {
      event.preventDefault()

      const nextRow = this.autocompletionList!.nextSelectableRow(direction, selectedRow)
      this.scrollToRow = nextRow
      this.setState({ autocompletionState: {
        provider: state.provider,
        items: state.items,
        range: state.range,
        selectedItem: state.items[nextRow],
        rangeText: state.rangeText,
      } })
    } else if (event.key === 'Enter' || event.key === 'Tab') {
      event.preventDefault()

      this.insertCompletion(state.selectedItem)
    } else if (event.key === 'Escape') {
      this.setState({ autocompletionState: null })
    }
  }

  private async attemptAutocompletion(str: string, caretPosition: number): Promise<IAutocompletionState<any> | null> {
    for (const provider of this.props.autocompletionProviders) {
      // NB: RegExps are stateful (AAAAAAAAAAAAAAAAAA) so defensively copy the
      // regex we're given.
      const regex = new RegExp(provider.getRegExp())
      if (!regex.global) {
        fatalError(`The regex (${regex}) returned from ${provider} isn't global, but it should be!`)
        continue
      }

      let result: RegExpExecArray | null = null
      while (result = regex.exec(str)) {
        const index = regex.lastIndex
        const text = result[1] || ''
        if (index === caretPosition) {
          const range = { start: index - text.length, length: text.length }
          const items = await provider.getAutocompletionItems(text)

          const selectedItem = items[0]
          return { provider, items, range, selectedItem, rangeText: text }
        }
      }
    }

    return null
  }

  private async onChange(event: React.FormEvent<ElementType>) {
    if (this.props.onChange) {
      this.props.onChange(event)
    }

    const str = event.currentTarget.value
    const caretPosition = this.element!.selectionStart
    const requestID = this.autocompletionRequestID++
    const autocompletionState = await this.attemptAutocompletion(str, caretPosition)

    // If another autocompletion request is in flight, then ignore these
    // results.
    if (requestID !== this.autocompletionRequestID) { return }

    this.setState({ autocompletionState })
  }
}
