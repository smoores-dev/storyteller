# The Colibrio Reader Framework FOSS EPUB CFI implementation

**Vendored from https://bitbucket.org/colibrio/colibrio-web-epubcfi/**.

A spec. compliant EPUB CFI parser that also performs validation and error reporting.

In addition to the CFI parser, the library also contains classes to resolve CFIs to Elements and DOMRanges, build CFIs
from XML documents, and serialize CFI node trees to string.

This library should have everything you need to make your reading system EPUB CFI compliant and interoperable!

## Usage

The library can be imported using both ES module syntax and CommonJS syntax.

### Node / Deno / Bun support

To run the `EpubCfiResolver` and the `EpubCfiBuilder` you will need to use some library to parse the XHTML documents,
such as JSDOM (https://github.com/jsdom/jsdom).

### Requirements

Node version 20 and above

### Installation

Run ``npm install`` to install all dependencies.

#### Building

This library is built with the Typescript compiler.

Build artifacts (Javascript code and Typescript definitions) output to the ``./build`` folder.

```
npm run build
```

#### Running the tests

```
npm run test
```

The unit test spec files are located together with their corresponding class.
In other words, you will find the `EpubCfiBuilder.spec.ts` test file side by side with the `EpubCfiBuilder.ts` file.

Tests are written using Vitest (https://vitest.dev/).

### The Playground

```
npm run playground
```

A small app that can be used to create, parse, and resolve EPUB CFIs.
Sources are available in the `playground` folder.

### Getting started

Parse your CFI and get back a tree of nodes, each representing a part of the CFI.

````
1  const epubCfiRootNode = EpubCfiParser.parse("epubcfi(/6/4[chap01ref]!/4[body01]/10[para05])");
````

The `EpubCfiResolver` will now be used to resolve the target Element or DOMRange that the CFI addresses.

````
2  const resolver = new EpubCfiResolver(epubCfiRootNode);
````

The process of resolving has a minimum of two steps depending on the number of so-called indirections that the CFI
contains.

An indirection is an instruction (signified by an `!`) in the EPUB CFI that redirects to a new XHTML or SVG document.

````
epubcfi(/6/4[chap01ref]!/4[body01]/10[para05])
        ^---- OPF ----^ ^---- XHTML Doc ----^
````

As the resolver encounters an indirection, it will return an `IEpubCfiIndirectionResult` object. This object contains
the DOM Element that represents the "link" to the other document context. Using this result data you
will then load the appropriate target Document and instruct the resolver to continue resolving by
again calling `continueResolving` with the new Document as a parameter.

The process starts out in the EPUB's OPF XML document, so this is the first document instance we provide to the resolver.

````
const opfIndirectionResult = resolver.continueResolving(opfXmlDocument, pathToOpfDocumentAsString);

  if(opfIndirectionResult === null) {
     throw new Error('The EPUB OPF does not contain an <itemref> element matching the CFI.');
}
````

We can assume that there is only one indirection (`!`) in the CFI. This will be the one redirecting us from the OPF XML,
to the EPUB Content Document.
You get a reference to the element that references the new document context through the `EpubCfiIndirectionResult.element`
property. This will be of type `Element` (more specifically an `itemref` element). Using this data, we now load the new XHTML
document and pass that in to the next call to `resolver.continueResolving()`.

````
const manifestItem = opfXmlDocument.getElementById(opfIndirectionResult.element.getAttribute('idref'));
const contentDocument = await myEpubLib.fetchManifestItemResource(manifestItem.getAttribute('href'));
resolver.continueResolving(contentDocument, manifestItem.href);
const resolvedTarget = resolver.getResolvedTarget();

if(resolvedTarget.hasErrors()) {
   console.warn('The resolving process produced errors.', resolvedTarget.getResolverErrors());
}
````
When resolving has been completed, if no irreparable errors have occurred, we have a resolved target. The target will
either be a position or a range in the DOM.

````
if(resolvedTarget.isDomRange()) {
    const targetDomRange = resolvedTarget.createDomRange();
    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.setBaseAndExtent(targetDomRange.startContainer, targetDomRange.startOffset, targetDomRange.endContainer, targetDomRange.endOffset);
} else if(resolvedTarget.isTargetingElement()) {
   resolvedTarget.getTargetElement().focus();
}
````

## About the EPUB CFI specification

Link to specification:

- https://idpf.org/epub/linking/cfi/
- https://w3c.github.io/epub-specs/epub33/epubcfi/

### Purpose

From the specification Abstract:

_This specification, EPUB Canonical Fragment Identifier (epubcfi), defines a standardized method for referencing
arbitrary content within an EPUB® Publication through the use of fragment identifiers._

_The web has proven that the concept of hyperlinking is tremendously powerful, but EPUB publications have been denied
much of the benefit that hyperlinking makes possible because of the lack of a standardized scheme to link into them._

#### Features

- Enables lossless interchange of location between EPUB3 compatible reading systems.
- Powerful, deterministic addressing of content, regardless of publication complexity.
- Serializable to URI fragment selector.
- Supports so-called assertions to make CFIs less sensitive to underlying changes to content structure.
- Sortable without needing to be resolved.
- Extendable to vendor-specific processing instructions for assertions.

### Syntax

The syntax is somewhat similar to XPointer when using position indexes to address element nodes. EPUB CFI has a very
important addition to its syntax, however. It uses odd / even rule to its position index syntax to make it possible to
differentiate between element nodes and text nodes. In XPointer you can only address element nodes using positions.

#### The odd / even rule

At the heart of the EPUB CFI's addressing scheme is the rule that even numbers point to element nodes (`<body>`, `<p>`,
`<span>` etc) whereas odd numbers point to text nodes (\<p> `This is a text node` \</p>).

This feature, combined with the support for offsets and ranges, makes it possible to create CFIs that target any
position within an EPUB in a unified, succinct way.

Here's a minimal HTML document.

````
<html>
    <head>
        <title>
            Chapter 1
        </title>
    </head>
    <body>
        Hello there!
    </body>
</html>
````

From a CFI syntax perspective this is how we would address each element.

````
 <html>
    <head>                                  => /2
        <title>                             => /2/2
            Chapter 1                       => /2/2/1
        </title>
    </head>
    <body>                                  => /4
        Hello there!                        => /4/1
    </body>
</html>
````

#### Resolving starts from the root of the EPUB

To simplify explanation, the previous examples the CFI path started at the root of the XHTML content document. In
reality a spec compliant CFI always start in the EPUB's entry point: the OPF file.

The way we address the target `<itemref>` node should be familiar now. But, see if you can spot something different with
the path.

````
<opf>
    <metadata></metadata>                        => /2
    <manifest>                                   => /4
        <item id="chapter1" href="c1.xhtml"/>
    </manifest>
    <spine>                                      => /6
        <itemref idref="chapter1">               => /6/2!
    </spine>
</opf>
````

That's right, the path to the `<itemref>` node ends with an exclamation mark `!`. This special character is called an
`indirection` token. It tells the resolver that it should load a new XML document and continue the resolving in the new
document context. In the example above the new document to be loaded is `c1.xhtml`.

So, let's combine this OPF path component with the XHTML document path component from the previous examples:

`/6/2!/4/1`

The CFI above addresses the text within the `<body>` of the `c1.xhtml` content document.


### Examples

#### Addressing of text range

> ℹ️ Note that to resolve Text Assertions, you need to provide an `IEpubCfiResolverOptions` object with `processTextAssertions` set to `true`.
> Read more about this in the Resolver section below.

If we want to address the text range "Bruno jumped up next to him" in the document below:
`/4/4/1:39,:66`

````
<html>
    <head>
        <title>
            Addressing of text range
        </title>
    </head>
    <body>
        <h1>
            Chapter 1.
        </h1>
        <p>
            Ben sat down on the bench. Bruno jumped up next to him and put his paw on Bens lap.
|------------------------------------>^---------------------------^
````
> ℹ️ Note that CFI takes into account all white spaces in the HTML.
````
         </p>
    </body>
</html>
````

#### Addressing using id assertion

If we want to address the second number in the addition below, we could use the full path to the element:

`/4/4/2/6`.

Another, shorter way to express this is to use the id attribute of the element.

`/0[mn2]`

````
<html>
    <head>
        <title>
            Addressing using id assertion
        </title>
    </head>
    <body>
        <h1>
            ID Assertion
        </h1>
        <p>
            <math>
                <mn>1</mn>
                <mo>+</mo>
                <mn id="mn2">2</mn>
            </math>
         </p>
    </body>
</html>
````

#### Addressing using text assertion

If we want to address the text range "Ben sat down on the bench. Bruno jumped up next to him" in the document below, with an added text assertion:

`/4/4/1:27[Chapter 1.,Ben sat down],:54[next to him, and put his paw]`

The text assertion is an extra fallback that will be used to try to resolve the location, even if the document has
been structurally modified.

````
<html>
    <head>
        <title>
            Addressing of text range
        </title>
    </head>
    <body>
        <h1>
            Chapter 1.
        </h1>
        <p>
            Ben sat down on the bench. Bruno jumped up next to him and put his paw on Bens lap.
         </p>
    </body>
</html>
````


## Implementation notes

This implementation uses common steps and concepts that you will be familiar with if you have ever built
a language parser. Firstly, it breaks down the source into tokens using lexical analysis. The parser
consumes these tokens to build a so-called Abstract Syntax Tree (AST) which in turn can be used by an
interpreter.

In this implementation these steps map to the following components:

- **Lexer**
- **Parser**
- **Resolver**

In addition to parsing and resolving EPUB CFIs, this library also lets you build CFIs programmatically
using XML nodes.

### Components

#### Lexer

The `EpubCfiLexer` class performs a so-called lexical analysis of the CFI string and creates a stream of tokens for the
parser to use.
Characters and strings that the `EpubCfiLexer` recognize as `IEpubCfiToken`s include `epubcfi(`, `/`, `!`, `[`, `:`,
`]`,  `)`.
The lexer does not perform any validation of syntax. This is up to the parser.

#### Parser

The `EpubCfiParser` utilizes the output stream of tokens from the lexer to build what is commonly referred to as a
"Abstract Syntax Tree". This tree contains the actual semantic structure that you expect from a parser, meaning that you
have nodes such as `IEpubCfiPathNode`, `IEpubCfiStepNode`, `IEpubCfiAssertionNode` etc.
The parser does enforce syntactical rules but is forgiving and will recover from many types of common errors.
All encountered errors are available in the `errors` property of the `IEpubCfiRootNode` returned from the `parse`
method.

#### Resolver

The `EpubCfiResolver` is a utility class that takes either a `IEpubCfiRootNode` or a CFI string and exposes an API to
resolve the CFI to an `Element` or a `DOMRange`. Because EPUB is a format composed of inter-linked
documents, resolving is procedural. The process involves calling `continueResolving` multiple times,
providing the XML document to be used for continued resolving. Each time `continueResolving`
returns it serves as a request for a new XML document to be provided according to the CFI data.
The initial call to `continueResolving` passes a reference to the EPUB OPF XML file.

In 99% of cases your EPUB CFI will contain only one so-called "indirection" to a new document context. This will be the
redirection from the OPF XML file to the Content Document referenced by the spine items `itemref` attribute.
Indirections can point into IFrame elements within Content Documents.

When the `continueResolving` method call returns `null` this means that the resolving has finished and that the target
will be available in the `EpubCfiResolvedTarget` object returned from the `getResolvedTarget` method.

This `EpubCfiResolvedTarget` object has a range of methods to perform DOM API operations according to the instructions
specified by the target CFI node. Methods include for example, `createDomRange` which creates a DOMRange based on the
CFI node's range path component, and
`getTargetElement` which retrieves the targeted Element if the CFI targets a single node.
It also has methods to interrogate the error state of the resolving process and much, much more.

> ℹ️ Note that to resolve Text Assertions you must provide `IEpubCfiResolverOptions` to the `EpubCfiResolver` constructor.
> Example:
> ```
>    const epubCfiResolver = new EpubCfiResolver(epubCfiRootNode, {
>        processTextAssertions: true,
>        textAssertionSearchDistance: 10000,
>        customTextAssertionMatcher: (params: IEpubCfiCustomTextAssertionMatcherParams): number => {
>           ...
>       }
>    });
> ```





##### Handling EPUB CFI vendor-specific extensions in the EpubCfiResolver

Vendor-specific parameters (https://w3c.github.io/epub-specs/epub33/epubcfi/#sec-extensions) is an extension mechanism
that lets users add custom data to the fragment selector.

From the specification:

> "This specification encourages the development of custom functions to assist with CFI correction where the intrinsic functionality is insufficient. Refer to Extending EPUB CFIs for more information on how to develop such functionality."

The Parser supports all these nodes and they are represented in the AST (Abstract Syntax Tree).
and so it is just a matter of implementing the resolving of the DOM position.

Why not do it and send a pull request! 🤓

#### Builder

The `EpubCfiBuilder` is a utility class that helps you build CFIs from an XML content document and a reference to a
target Element in the same document.

The code example below creates a CFI from the current user selection.

````
const selectionRange = window.getSelection().getRangeAt(0);

const cfiBuilder = new EpubCfi.EpubCfiBuilder();
cfiBuilder.appendLocalPath(appState.activeOpfSpineItemRefElement)
cfiBuilder.appendTerminalDomRange(selectionRange);
const serializedCfi = cfiBuilder.toString();

// Now save this in your CFI in your storage service of choice 🙂
````

> ℹ️ Note that to include Text Assertions you must set the `IEpubCfiBuilderTextAssertionOptions` by calling the `EpubCfiBuilder.setTextAssertionOptions()` method.
> ````
> epubCfiBuilder.setTextAssertionOptions({
>        preLength: 10,
>        postLength: 10,
>        snapToWordBoundaries: true,
>        wordBoundaryMaxExpansion: 16,
>    });
> ````



## License

**MIT License**

Copyright (c) 2025, Andreas Duchen, Colibrio Software AB

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE, AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES, OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT, OR OTHERWISE, ARISING FROM,
OUT OF, OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
