import React from "react";
import { defaultTheme } from "react-admin";
import { red, teal, indigo, green } from '@mui/material/colors';
const Theme = {
  ...defaultTheme,
  palette: {
    background: {
      main: indigo[500]
    },
    primary: {
      main: green[500],
    },
    secondary: {
      main: teal['A100']
    },
    error: red,
    contrastThreshold: 3,
    tonalOffset: 0.2,
},
  components: {
      ...defaultTheme.components,
      RaDatagrid: {
          styleOverrides: {
            root: {
                backgroundColor: "Lavender",
                "& .RaDatagrid-headerCell": {
                    backgroundColor: "MistyRose",
                },
            }
         }
      }
  }

};

export default Theme;
