# V3 glowup todo

Braindump of small-to-medium changes still needed for V3. Grouped by topic, not
prioritized. Not a plan, just a capture.

## Mobile/small viewport

- [ ] double-cover selection animation should not play on mobile (the
      double-cover flip/animation is weird on touch)
- [ ] easier multi-select on mobile. desktop flow (hover card -> press the
      little circle) does not work on touch. likely solution: an ellipsis menu
      on the card (hover-only on desktop, always visible on mobile) that spawns
      the card actions menu, and add a `select` action (plus a `deselect`
      action) that enters select mode
- [ ] shift-click range selection on desktop: select a card, hold shift, select
      another -> selects the range between them. maybe some equivalent on mobile
      but not critical (no serious data management on mobile)
- [ ] auto-select-first-facet breaks mobile. library/tags/shell/etc pages
      default to selecting the first facet. intended mobile flow is: facet list
      -> tap a facet -> book list -> back to facet list. auto-select skips
      straight to the book list and you cannot get back to the facet view. fix
      this
  - [ ] also: do not auto-select a "no X" facet first (e.g. "no narrators")
        since those can be huge and you land in a giant list
  - [ ] desktop auto-select is probably correct but the implementation
        overfetches, clean that up
- [ ] find a better place / different idea for the toggle-sidebar header on
      mobile. it takes up too much space. options: put it in each page header
      (but every header is space-specific, so that means implementing per page),
      or a global header (simplest but disliked). probably wants a
      mobile-specific solution

## Command / search menu

- [ ] redo the command/search menu, make it a real power tool (also on mobile).
      show a bunch of actions you can perform: create a new shelf, edit the
      current book, etc. (discussed in some earlier plan)

## Statuses

- [ ] let users edit statuses (db technically supports it already)
- [ ] add a `kind` enum to statuses: read, unread, in-progress, custom. keep the
      kind stable while allowing all labels to be edited
- [ ] some code branches on status _name_ ("if status is read ..."). move those
      checks to `kind`, since name becomes user-editable
- [ ] migration must be careful: some users already customized statuses. do not
      blindly map name->kind. instead ensure there is a status with the right
      kind: find the one currently named "read" and set its kind, or create one
      if none exists. same for the others

## Sidebar

- [ ] hidden sidebar items (collections, etc) are too hard to get back to once
      hidden. want some way to surface / navigate to hidden things, e.g. a
      collapsible "hidden" list at the bottom or a dropdown. a plain hidden tab
      is not the right approach
- [ ] add quick edit/hide for the facet sidebar items (we already have quick
      hide/edit for shelves/collections, but not for the facet sidebar). e.g. on
      the collection page be able to hide the collection facet sidebar, and also
      quickly create one from there

## Book details drawer

- [ ] reorder sections to: Review, Description, Book Details (with added /
      updated moved into Files), Tags, Collections, Downloads, Alignment, Files.
      push Alignment much further down
- [ ] sections should be collapsible. collapsed state is drawer state, not
      per-book state
- [ ] better display for downloads, they look bad. surface more of it in the
      header section. should be an action (probably not a bulk action)
- [ ] book actions menu should intelligently hide/show available actions. e.g.
      it always says "process book" even when the book is not processable
- [ ] "process book" action should offer restart/options like V2 did

## Processing / transcription / alignment

- [ ] processing section looks bad and is unfunctional. you cannot quickly
      restart transcription. alignment data should live in this section
- [ ] move the processing UI into a toast (bottom right), always visible while
      processing. minimizable but not fully dismissable
- [ ] make the processing visualization cute. concept:
  - start as a straight progress bar
  - transcode / split-tracks phase: bar breaks into little tilted chunks (each
    ~tenth) to represent breaking it into pieces
  - transcription phase: chunks get "burned" / bar turns orange
  - alignment phase: sections re-align one at a time to signify alignment
  - celebratory done state
- [ ] show a processing/transcribing/aligning indicator on book grid cards (V2
      had this)
- [ ] transcription/processing queue somewhere (probably settings): cancel,
      reorder, and pause jobs
- [ ] expose "last aligned at" in filtering and sorting options

## Ratings

- [ ] allow overriding the aggregate rating independently of the
      multi-dimensional rating (e.g. bars average to 4.6 but you want to force a
      5 for a favorite). overriding lower also allowed
- [ ] add an apply step. ratings currently update immediately on every change,
      they should be staged and applied

## Authors / narrators

- [ ] cap displayed authors/narrators to ~5 with a "..." that expands. some
      books have 20+ authors or full-cast audiobooks with 30+ narrators
- [ ] inline editing for narrators and authors (almost everything else is
      inline-editable, these are not)

## Book hero / page count + duration

- [ ] show page count and duration in the hero section, not only the Files
      section
- [ ] allow editing/overriding book page count and duration from there (e.g. to
      match the page count of your physical copy). this override must never be
      written back to the actual book

## Book grid / list views

- [ ] add a List view (grid view already exists). not interested in a table view
- [ ] List view should let you pick which fields to show
- [ ] the "show for"/dynamic field feature is weak. selecting a field should
      make every card show it and hide the default. e.g. sorting by rating
      should show all books' ratings instead of the default (author). currently
      it only shows the field for books that have a value, which looks bad
- [ ] virtualize the long facet/tag lists. ~1500 tags visibly lags on open
- [ ] share a single instance of the book-card ellipsis/actions menu instead of
      one per card (per-card instances blow up render cost)
- [ ] unify the add-tag / add-collection / add-series menus in the actions menu
      with the relationship/series/collection editor version. the editor version
      is nicer: searchable, and can add-new when nothing matches. the actions
      menu version can only add-new, cannot search. one implementation for both
- [ ] (maybe) bring back the V2 alphabetical jump list on the right when sorting
      by title/author. unclear if worth it now that the list is server-paginated
      and infinite-scroll. would need prefetch-to-letter. fine to skip

## Library views / facets / site header

- [ ] selecting two facets: their outlines overlap, looks bad. space them out
- [ ] clicking the ellipsis on a facet hides the trigger and the popup menu
      jumps to the top-left. fix positioning
- [ ] the site header for library views looks bad. implement the better designs
      we already have
- [ ] remove the breadcrumb (maybe keep only on mobile). it currently does
      nothing since you are already on the page. alternative: make the
      breadcrumb menu actually do something
- [ ] series/collection pages: the only way to browse all of them is the one big
      left list, which is not nice. want a standalone series/collection view
      that renders all the covers in a row. clicking one takes you to the
      library page with the sidebar. optionally always show the sidebar (user
      setting)

## Series ordering

- [ ] series default sort order is wrong: it is descending position, should be
      ascending position
- [ ] add an editor for series positions (currently not editable). maybe
      drag-and-drop, maybe increment/decrement, undecided
- [ ] remove the V2 cascade behavior (decrementing one book shifts others).
      allow multiple books to share the same series position/number

## Homepage

- [ ] hero button should say "Read aloud", not "Read along"
- [ ] add a social section: show the last N (configurable count and time range)
      ratings/reviews by other users on the server
- [ ] a dedicated social page somewhere to browse everyone's ratings/reviews
- [ ] global privacy config: let other users on the server see your ratings, and
      separately whether they can see your progress (must be able to opt out).
      note: not truly private, the server admin can inspect the db, so there
      should be an id they can correlate
- [ ] recently added: should show date added instead of author. also should have
      a "completed" row that would show your rating or date completed if no
      rating present

## Themes

- [ ] user-selectable themes beyond just dark/light. start with two:
  - "classic"/"cozy" (the current theme)
  - a "minimal" stripped-down theme, basic shadcn look
  - both share the primary color and the same set of switches; the rest differs
- [ ] let users supply their own theme: expose the list of globals CSS vars and
      let them override from the top
- [ ] pick a primary color value. each theme is leading, but there is also a
      theme primary color value
- [ ] improve the book card previews in theme settings, they look too
      AI-generated

## new

- [ ] add a 403 page
- [ ] collectioins dont paginate? are library pages not paginated?
- [ ] nonadmin users get new version notifs
- [ ] stop loading images on navigate away, its blocking nav
