# Storyteller NodeKit

The Storyteller NodeKit is a library that provides a Node.js interface to the
Storyteller SDK.

Currently only supports metadata search and download.

## Usage

```javascript
import { StorytellerNodeKit } from "@storyteller/nodekit"

const storyteller = new StorytellerNodeKit()

const metadata = await storyteller.metadataSearch({
  query: "The Great Gatsby",
  provider: "audnexus", // or "hardcover"
})

console.log(metadata)
```

For hardcover, you need to provide an API key first

```javascript
await storyteller.configure({
  apiKey: "your-api-key",
})
```
