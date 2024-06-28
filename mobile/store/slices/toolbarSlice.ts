import { PayloadAction, createSlice } from "@reduxjs/toolkit"
import { bookshelfSlice } from "./bookshelfSlice"

export enum ToolbarDialog {
  TABLE_OF_CONTENTS = "TABLE_OF_CONTENTS",
  SPEED = "SPEED",
  SETTINGS = "SETTINGS",
}

type ToolbarState = {
  openDialog: ToolbarDialog | null
}

export const toolbarSlice = createSlice({
  name: "toolbar",
  initialState: { openDialog: null } as ToolbarState,
  reducers: {
    dialogToggled(state, action: PayloadAction<{ dialog: ToolbarDialog }>) {
      if (state.openDialog === action.payload.dialog) {
        state.openDialog = null
      } else {
        state.openDialog = action.payload.dialog
      }
    },
    dialogClosed(state) {
      state.openDialog = null
    },
  },
  extraReducers(builder) {
    builder.addCase(bookshelfSlice.actions.navItemTapped, (state) => {
      state.openDialog = null
    })
    builder.addCase(bookshelfSlice.actions.bookmarkTapped, (state) => {
      state.openDialog = null
    })
  },
})
