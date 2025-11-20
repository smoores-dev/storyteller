// src/theme/theme.ts
"use client"

import {
  AppShellHeader,
  AppShellMain,
  AppShellNavbar,
  Burger,
  Fieldset,
  type MantineColorsTuple,
  type MantineThemeOverride,
  NativeSelect,
  NavLink,
  PasswordInput,
  TextInput,
  createTheme,
} from "@mantine/core"

const stOrange: MantineColorsTuple = [
  "#fff1e7",
  "#fbe2d3",
  "#f6c2a5",
  "#f1a173",
  "#ed8449",
  "#eb722f",
  "#ea6920",
  "#d15815",
  "#ba4d0f",
  "#a34106",
]

export const theme: MantineThemeOverride = createTheme({
  primaryColor: "st-orange",
  fontFamily: "var(--font-inter)",
  headings: {
    fontFamily: "var(--font-young-serif)",
  },
  colors: {
    "st-orange": stOrange,
  },
  components: {
    NavLink: NavLink.extend({
      classNames: {
        label: "text-base",
        root: "p-2 rounded-md",
      },
    }),
    AppShellMain: AppShellMain.extend({
      defaultProps: {
        className: "max-w-[1200px]",
      },
    }),
    AppShellHeader: AppShellHeader.extend({
      defaultProps: {
        className: "text-st-orange-50 py-4",
      },
    }),
    AppShellNavbar: AppShellNavbar.extend({
      defaultProps: {
        className:
          "group/navbar border-r-st-orange-100 overflow-x-hidden border-r-2 md:w-10 md:transition-[width] md:hover:w-[200px]",
      },
    }),
    Burger: Burger.extend({
      defaultProps: {
        className: "pb-[0.625rem]",
      },
    }),
    Fieldset: Fieldset.extend({
      defaultProps: {
        className: "my-8",
        variant: "filled",
        classNames: {
          legend: "text-xl",
        },
      },
    }),
    TextInput: TextInput.extend({
      defaultProps: {
        className: "my-4",
      },
      classNames: {
        // otherwise mobile devices will zoom in on the input
        input: "text-base md:text-sm",
        description: "text-sm",
      },
    }),
    PasswordInput: PasswordInput.extend({
      defaultProps: {
        className: "my-4",
      },
      classNames: {
        // otherwise mobile devices will zoom in on the input
        input: "text-base md:text-sm",
        description: "text-sm",
      },
    }),
    NativeSelect: NativeSelect.extend({
      classNames: {
        description: "text-sm",
      },
    }),
  },
})
