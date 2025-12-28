import { type TriggerRef } from "@rn-primitives/popover"
import { TableOfContentsIcon } from "lucide-react-native"
import { useRef, useState } from "react"

import { Button } from "@/components/ui/button"
import { Icon } from "@/components/ui/icon"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Text } from "@/components/ui/text"

import { Bookmarks } from "./navigation/Bookmarks"
import { Highlights } from "./navigation/Highlights"
import { TableOfContents } from "./navigation/TableOfContents"
import { TrackLisk } from "./navigation/TrackList"

interface Props {
  mode: "text" | "audio"
}

export function NavigationItem({ mode }: Props) {
  const [tab, setTab] = useState<string>("toc")
  const popoverRef = useRef<null | TriggerRef>(null)

  return (
    <Popover>
      <PopoverTrigger ref={popoverRef} className="items-center" asChild>
        <Button variant="ghost" size="icon">
          <Icon as={TableOfContentsIcon} size={24} />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="-max-h-screen-safe-offset-20">
        <Tabs value={tab} onValueChange={setTab}>
          <TabsList>
            <TabsTrigger value="toc">
              <Text maxFontSizeMultiplier={1}>Contents</Text>
            </TabsTrigger>
            <TabsTrigger value="bookmarks">
              <Text maxFontSizeMultiplier={1}>Bookmarks</Text>
            </TabsTrigger>
            <TabsTrigger value="highlights">
              <Text maxFontSizeMultiplier={1}>Highlights</Text>
            </TabsTrigger>
          </TabsList>
          <TabsContent value="toc">
            {mode === "text" ? (
              <TableOfContents
                onClose={() => {
                  popoverRef.current?.close()
                }}
              />
            ) : (
              <TrackLisk
                onClose={() => {
                  popoverRef.current?.close()
                }}
              />
            )}
          </TabsContent>
          <TabsContent value="bookmarks">
            <Bookmarks />
          </TabsContent>
          <TabsContent value="highlights">
            <Highlights />
          </TabsContent>
        </Tabs>
      </PopoverContent>
    </Popover>
  )
}
