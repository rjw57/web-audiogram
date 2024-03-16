import { createTheme as muiCreateTheme } from "@mui/material/styles";

const createTheme = (prefersDarkMode: boolean) =>
  muiCreateTheme({
    palette: {
      mode: prefersDarkMode ? "dark" : "light",
    },
  });

export default createTheme;
