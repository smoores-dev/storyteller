import {
  type ReactNode,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react"

function useIntersectionObserverRegistry(options?: IntersectionObserverInit) {
  const callbacksRef = useRef<
    Map<Element, (entry: IntersectionObserverEntry) => void>
  >(new Map())

  const callback = useCallback((entries: IntersectionObserverEntry[]) => {
    for (const entry of entries) {
      const callback = callbacksRef.current.get(entry.target)
      if (!callback) continue
      callback(entry)
    }
  }, [])

  const observerRef = useRef<IntersectionObserver | null>(null)
  if (observerRef.current === null && typeof window !== "undefined") {
    observerRef.current = new IntersectionObserver(callback, options)
  }

  const register = useCallback(
    (target: Element, callback: (entry: IntersectionObserverEntry) => void) => {
      observerRef.current?.observe(target)
      callbacksRef.current.set(target, callback)
      return () => {
        observerRef.current?.unobserve(target)
        callbacksRef.current.delete(target)
      }
    },
    [],
  )

  return register
}

const IntersectionObserverContext = createContext(
  (_target: Element, _callback: (entry: IntersectionObserverEntry) => void) =>
    () => {},
)

interface Props {
  options?: IntersectionObserverInit
  children: ReactNode
}

/**
 * Provide an Intersection Observer that child components can
 * register observe callbacks with.
 *
 * The Intersection Observer root defaults to the viewport, regardless
 * of where in the React tree this provider is placed. To set the root
 * to a DOM element, pass it as the `options.root` prop to this component.
 */
export function IntersectionObserverProvider({ children, options }: Props) {
  const register = useIntersectionObserverRegistry(options)
  return (
    <IntersectionObserverContext.Provider value={register}>
      {children}
    </IntersectionObserverContext.Provider>
  )
}

/**
 * Register a callback with an Intersection Observer.
 *
 * The callback will only be called with entries whose
 * target match the `targetRef`.
 *
 * The callback must be memoized. Passing an unmemoized
 * callback will result in thrashing the observer (calling
 * .observe and .unobserve every render cycle).
 *
 * Must be used on a child of IntersectionObserverProvider.
 */
export function useIntersectionObserver(
  callback: (entry: IntersectionObserverEntry) => void,
) {
  const [element, setElement] = useState<Element | null>(null)
  const register = useContext(IntersectionObserverContext)

  useEffect(() => {
    if (!element) return

    const unregister = register(element, callback)

    return () => {
      unregister()
    }
  }, [callback, register, element])

  return setElement
}
