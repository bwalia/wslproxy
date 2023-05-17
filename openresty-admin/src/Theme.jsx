import React from "react";
import { defaultTheme } from "react-admin";
const Theme = () => {
  return {
    ...defaultTheme,
    palette: {
      primary: indigo,
      secondary: pink,
      error: red,
      contrastThreshold: 3,
      tonalOffset: 0.2,
    },
    typography: {
      // Use the system font instead of the default Roboto font.
      fontFamily: [
        "-apple-system",
        "BlinkMacSystemFont",
        '"Segoe UI"',
        "Arial",
        "sans-serif",
      ].join(","),
    },
  };
};

export default Theme;
