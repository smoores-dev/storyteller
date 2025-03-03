import { View, Pressable } from "react-native"
import { ScrollView } from "react-native-gesture-handler"
import { UIText } from "./UIText"
import { useRef } from "react"
import { useAppDispatch } from "../store/appState"
import { playerTrackChanged } from "../store/slices/bookshelfSlice"
import { activeBackgroundColor } from "../design"
import { useAudioBook } from "../hooks/useAudioBook"

export function TrackLisk() {
  const ref = useRef<null | ScrollView>(null)
  const currentItemRef = useRef<null | View>(null)

  const dispatch = useAppDispatch()

  const { track, total } = useAudioBook()

  return (
    <ScrollView
      ref={ref}
      onLayout={() => {
        if (!ref.current) return
        // @ts-expect-error ScrollView is a perfectly valid component, not sure what
        // exactly the issue is here
        currentItemRef.current?.measureLayout(ref.current, (_x, y) => {
          ref.current?.scrollTo({
            y: y - 40,
            animated: false,
          })
        })
      }}
    >
      {Array.from({ length: total.trackCount }).map((_, index) => (
        <View
          collapsable={false}
          key={index}
          {...(index === track.index && {
            ref: currentItemRef,
          })}
          style={{ paddingHorizontal: 8 }}
        >
          <Pressable
            onPress={async () => {
              dispatch(playerTrackChanged({ index }))
            }}
            style={{
              borderBottomWidth: 1,
              borderBottomColor: "#CCC",
              paddingVertical: 16,
              paddingHorizontal: 16,
              ...(index === track.index && {
                backgroundColor: activeBackgroundColor,
              }),
            }}
          >
            <UIText
              style={{
                fontSize: 14,
                fontWeight: "bold",
              }}
            >
              Track {index + 1}
            </UIText>
          </Pressable>
        </View>
      ))}
    </ScrollView>
  )
}
